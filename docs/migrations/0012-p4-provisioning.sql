-- 0012-p4-provisioning.sql — P4.1: provisioning schema + the controlled
-- SECURITY DEFINER mapping-write surface, and CLOSE the of_user_departments
-- privilege-escalation hole.
--
-- WHY THE REVOKE (audit 2026-06-14): of_user_departments' dept_isolation policy
-- WITH CHECK constrains ONLY user_id (not department_id/role), and of_app held
-- direct INSERT/UPDATE/DELETE. So an authed user (app.user_id = their id) could
-- self-bind to ANY department as 'chief'. Proven by provisioningIsolation.test.js.
-- Fix: of_app loses direct write on of_user_departments; ALL mapping writes go
-- through the two SECURITY DEFINER fns below (run as owner, authz'd inside).
-- of_app keeps SELECT (login / of_resolve_department fallback read it).
--
-- Pre-flight (verified 2026-06-14): no RUNTIME of_app path writes
-- of_user_departments — only the owner-side initDb backfill + demo seed, both
-- gated off when P5_TXN=on. The REVOKE breaks nothing live.
--
-- Style matches 0006-0008 (plain statements + DO blocks, no explicit BEGIN/COMMIT
-- — the migration runner / Supabase apply_migration wraps the transaction).
-- Idempotent. Mirror into db.js for fresh installs; stamp of_schema_migrations.

-- ── 1. members ↔ users identity link + chief rank-verification ────────────────
-- ON DELETE SET NULL: deleting a user must NOT delete the member (legal records).
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS user_id integer REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS rank_verified boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_members_user_id ON public.members(user_id);

-- ── 2. of_provision_department — create a department + its founding-chief mapping
--      atomically. No-context (signup): the chief has no GUC yet. Runs as owner
--      (DEFINER) so the founding of_user_departments row is writable.
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
  v_dept int;
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

  RETURN v_dept;
END;
$$;

-- ── 3. of_link_member — the ONLY cross-user mapping write. A chief cannot write
--      another member's of_user_departments row under the user_id-keyed policy,
--      so this runs as owner and authorizes the CALLER inside the body. The
--      caller id MUST come from the server session (req.user.id), never the client.
CREATE OR REPLACE FUNCTION public.of_link_member(
  p_caller_user_id int,
  p_target_user_id int,
  p_department_id  int,
  p_role           text
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.of_user_departments
    WHERE user_id = p_caller_user_id
      AND department_id = p_department_id
      AND role IN ('chief', 'admin')
  ) THEN
    RAISE EXCEPTION 'of_link_member: caller % is not a chief/admin of department %',
      p_caller_user_id, p_department_id;
  END IF;
  IF p_target_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'of_link_member: target user % does not exist', p_target_user_id;
  END IF;

  INSERT INTO public.of_user_departments (user_id, department_id, role)
    VALUES (p_target_user_id, p_department_id, COALESCE(NULLIF(btrim(p_role), ''), 'member'))
  ON CONFLICT (user_id, department_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;

-- ── 4. Grants: EXECUTE to of_app ONLY. CRITICAL: Supabase auto-grants EXECUTE on
--      new public functions to anon/authenticated/service_role via DEFAULT
--      PRIVILEGES, and `REVOKE ... FROM PUBLIC` does NOT strip those. Without this,
--      the public anon key (shipped in the client for realtime) could call these
--      SECURITY DEFINER writes via PostgREST RPC. Strip every non-of_app grantee.
--      Also hardens the pre-existing of_resolve_department (0008) — same exposure
--      (found in the 2026-06-14 P4.1 audit; an anon user→department enumeration).
DO $$
DECLARE
  r text;
  f text;
  fns text[] := ARRAY[
    'public.of_provision_department(int,text,text,text,text,int)',
    'public.of_link_member(int,int,int,text)',
    'public.of_resolve_department(int)'
  ];
BEGIN
  FOREACH f IN ARRAY fns LOOP
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
  END LOOP;
END $$;

-- ── 5. CLOSE THE HOLE: of_app may no longer write of_user_departments directly.
--      All mapping writes now go through the DEFINER fns above (owner-side).
--      SELECT is retained (login + of_resolve_department fallback). ────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.of_user_departments FROM of_app';
  END IF;
END $$;
