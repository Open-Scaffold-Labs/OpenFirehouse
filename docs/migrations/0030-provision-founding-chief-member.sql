-- 0030-provision-founding-chief-member.sql — P2.1 of the identity-link gameplan
-- (v2). Close provisioning Gap A: self-serve signup created a department + chief
-- mapping but NO member (roster) row, so the founding chief was unrostered and
-- not cert-scoreable. This makes of_provision_department ALSO create the founding
-- chief's member row — linked (user_id) + rank-verified — atomically in the same
-- SECURITY DEFINER transaction (no orphan possible).
--
-- Decision D4 (Dale-greenlit 2026-06-18): the founding chief is ALWAYS rostered.
-- A chief who provisions a department is, by definition, a member of it, and
-- should appear on the staffing board from day one. New departments are therefore
-- fully linked from the first write and never see the "Unlinked members" card
-- (that card exists only for legacy/migrated data — P5).
--
-- DALE-GATED surface (SECURITY DEFINER, legal-adjacent). Greenlit. Signature is
-- UNCHANGED (callers in routes/auth.js need no edit) — the chief's name is read
-- from public.users inside the fn. The member INSERT runs on the SAME connection
-- as signup's open txn (max:1-safe — no nested pool checkout). department_id is
-- written explicitly (= v_dept) so the of_sync_department_id trigger, which only
-- fires on NULL department_id, does not override it (mirrors of_register_pending_
-- member's proven pattern). Idempotent: re-provisioning won't duplicate the member
-- (guarded by the user_id+department_id existence check; backed by 0028's partial
-- unique idx_members_user_dept).
--
-- Verified live 2026-06-18: members NOT NULL cols = memberNumber/name/rank/role/
-- joined/rank_verified; status/station_id/department_id/user_id nullable. Apply
-- local → prod (Supabase apply_migration) → stamp ledger. NOT mirrored in db.js
-- (same convention as 0012 — the DEFINER provisioning fns live in migrations).

CREATE OR REPLACE FUNCTION public.of_provision_department(
  p_chief_user_id int,
  p_name          text,
  p_fdid          text,
  p_dept_type     text,
  p_tier          text,
  p_mirror_station_id int
) RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dept       int;
  v_chief_name text;
  v_member_no  text;
BEGIN
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'of_provision_department: department name is required';
  END IF;
  IF p_chief_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_chief_user_id) THEN
    RAISE EXCEPTION 'of_provision_department: chief user % does not exist', p_chief_user_id;
  END IF;

  INSERT INTO public.departments (name, fdid, dept_type, plan_tier)
    VALUES (btrim(p_name), COALESCE(p_fdid, ''), COALESCE(p_dept_type, ''), COALESCE(p_tier, ''))
    RETURNING id INTO v_dept;

  INSERT INTO public.of_user_departments (user_id, department_id, role)
    VALUES (p_chief_user_id, v_dept, 'chief')
  ON CONFLICT (user_id, department_id) DO UPDATE SET role = 'chief';

  -- P2.1: roster the founding chief as a LINKED, rank-verified member (D4).
  -- Idempotent guard so a re-provision can't duplicate the row.
  IF NOT EXISTS (
    SELECT 1 FROM public.members
    WHERE user_id = p_chief_user_id AND department_id = v_dept
  ) THEN
    SELECT name INTO v_chief_name FROM public.users WHERE id = p_chief_user_id;
    SELECT 'M-' || lpad(((COALESCE(max((regexp_match("memberNumber", '^M-([0-9]+)$'))[1]::int), 0)) + 1)::text, 3, '0')
      INTO v_member_no FROM public.members WHERE department_id = v_dept;
    INSERT INTO public.members
      ("memberNumber", name, rank, role, status, joined, rank_verified, user_id, station_id, department_id)
      VALUES (
        v_member_no,
        COALESCE(NULLIF(btrim(v_chief_name), ''), 'Chief'),
        'Chief', 'Chief', 'Active',
        to_char(now(), 'YYYY-MM-DD'),
        true,                       -- founding chief is self-attested + provisioning owner
        p_chief_user_id,
        COALESCE(p_mirror_station_id, (SELECT min(id) FROM public.stations WHERE department_id = v_dept)),
        v_dept
      );
  END IF;

  RETURN v_dept;
END;
$$;

-- Re-assert the grant posture (Supabase auto-grants EXECUTE on a re-created public
-- function to anon/authenticated/service_role; strip them, keep of_app only).
DO $$
DECLARE r text; f text := 'public.of_provision_department(int,text,text,text,text,int)';
BEGIN
  IF to_regprocedure(f) IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO of_app', f);
    END IF;
  END IF;
END $$;

-- ROLLBACK: re-apply the 0012 body of of_provision_department (without the member
-- INSERT). The member row, if created, is a normal roster row (deactivate, never
-- delete).
