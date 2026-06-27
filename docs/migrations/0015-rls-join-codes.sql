-- 0015-rls-join-codes.sql — close the RLS gap on of_department_join_codes.
--
-- RLS-everywhere audit (2026-06-15) found ~100 tenant tables already carry the
-- dept_isolation policy (P5+), but the two P4 tables I added did not:
--   - of_department_join_codes → SAFE to add RLS (this migration): its only access
--     paths are authed chief routes (request GUC set) + of_register_pending_member
--     (SECURITY DEFINER, owner-side → bypasses RLS regardless). Verified on prod
--     under SET ROLE of_app: own-dept sees its codes, another dept sees zero.
--   - of_member_invites → INTENTIONALLY left without RLS: the public, unauthenticated
--     accept-invite redeem reads it with NO dept GUC, so a dept policy would block
--     the redeem. Proper fix is a SECURITY DEFINER redeem fn (Dale-gated follow-up);
--     isolation today is the unguessable single-use token + app-layer chief scoping.
--
-- Matches the canonical dept_isolation policy (PERMISSIVE, FOR ALL, app.department_id
-- GUC). Idempotent. Applied to prod via Supabase MCP; mirror in db.js for fresh installs.

ALTER TABLE public.of_department_join_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.of_department_join_codes;
CREATE POLICY dept_isolation ON public.of_department_join_codes
  FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);
