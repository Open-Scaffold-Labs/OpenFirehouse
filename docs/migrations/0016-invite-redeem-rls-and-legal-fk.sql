-- 0016-invite-redeem-rls-and-legal-fk.sql
-- Two independent hardening changes, both audit-driven (2026-06-15):
--
--  A) of_member_invites was the ONE tenant table still RLS-off. It had to be,
--     because the public/unauthenticated accept-invite redeem runs as of_app
--     with NO app.department_id GUC, so a dept_isolation policy would block the
--     redeem's own SELECT/UPDATE. The fix is the same DEFINER pattern as the
--     three P4 mapping fns: of_redeem_member_invite runs owner-side (bypasses
--     RLS), is authorized by the single-use token hash itself, and is the ONLY
--     path that touches the table without a dept GUC. With that in place we can
--     turn RLS ON + add the standard dept_isolation policy. Chief-side invite
--     CREATION is unaffected — it runs authenticated with the dept GUC set and
--     inserts its own department_id (policy WITH CHECK passes).
--
--  B) exposure_records.member_id and personnel_actions.member_id were ON DELETE
--     CASCADE to members. Those are subpoenable legal records (carcinogen-
--     exposure history, disciplinary actions). The app never hard-deletes a
--     member (removal = status flip), so today nothing protects them at the DB
--     layer — a single stray DELETE on a members row would cascade-wipe them.
--     Flip both to ON DELETE RESTRICT: the DB now refuses to delete a member
--     who still has legal records, making the protection defense-in-depth
--     instead of app-layer-only. (grievances.filed_by is already SET NULL.)
--
-- Apply by hand to prod (Supabase MCP apply_migration) AND mirror in db.js for
-- fresh installs; stamp of_schema_migrations.

-- ════════════════════════════════════════════════════════════════════════════
-- PART A — of_member_invites: DEFINER redeem fn + RLS
-- ════════════════════════════════════════════════════════════════════════════

-- A1. of_redeem_member_invite — owner-side, single-use, atomic.
-- Claims the invite (marks used) ONLY if unused + unexpired, then sets the
-- member's password. Authorized by the token hash (192 bits of CSPRNG entropy),
-- NOT by a dept GUC — which is exactly why it must be DEFINER. Returns the ids
-- the route needs to finish login. DROP first: new return type can't go through
-- CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.of_redeem_member_invite(text, text);
CREATE OR REPLACE FUNCTION public.of_redeem_member_invite(
  p_token_hash    text,
  p_password_hash text
) RETURNS TABLE (redeemed_invite_id int, redeemed_user_id int, redeemed_member_id int, redeemed_department_id int)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite  int;
  v_user    int;
  v_member  int;
  v_dept    int;
BEGIN
  IF p_password_hash IS NULL OR length(p_password_hash) < 20 THEN
    RAISE EXCEPTION 'of_redeem_member_invite: password hash required';
  END IF;

  -- Atomic single-use claim (race-safe in one statement).
  UPDATE of_member_invites
     SET used_at = now()
   WHERE token_hash = p_token_hash
     AND used_at IS NULL
     AND expires_at > now()
  RETURNING id, user_id, member_id, department_id
    INTO v_invite, v_user, v_member, v_dept;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'of_redeem_member_invite: invalid, used, or expired invite';
  END IF;

  UPDATE users SET "passwordHash" = p_password_hash WHERE id = v_user;

  RETURN QUERY SELECT v_invite, v_user, v_member, v_dept;
END;
$$;

-- A2. Grants: strip Supabase auto-grants (anon/authenticated/service_role +
--     PUBLIC), EXECUTE to of_app ONLY — identical hardening to 0012/0013.
DO $$
DECLARE
  r text;
  f text := 'public.of_redeem_member_invite(text,text)';
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

-- A3. Enable RLS + the standard dept_isolation policy (matches the ~100 other
--     tenant tables and the 0015 of_department_join_codes pattern exactly).
ALTER TABLE public.of_member_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.of_member_invites;
CREATE POLICY dept_isolation ON public.of_member_invites FOR ALL
  USING      (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);

-- ════════════════════════════════════════════════════════════════════════════
-- PART B — legal-record FKs: CASCADE → RESTRICT
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.exposure_records  DROP CONSTRAINT IF EXISTS exposure_records_member_id_fkey;
ALTER TABLE public.exposure_records
  ADD  CONSTRAINT exposure_records_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE RESTRICT;

ALTER TABLE public.personnel_actions DROP CONSTRAINT IF EXISTS personnel_actions_member_id_fkey;
ALTER TABLE public.personnel_actions
  ADD  CONSTRAINT personnel_actions_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE RESTRICT;
