-- 0009-license-config-per-dept.sql — per-department licensing storage.
--
-- The old license_config was a SINGLE-ROW table (id int primary key check(id=1))
-- holding one activation for the whole deployment. For a single deployment serving
-- many departments, each department needs its OWN active license. The license JWT
-- already carries a dept_id claim, so we key the active-license row by department.
--
-- Safe to recreate: both prod and local have ZERO license rows (verified
-- 2026-06-14, pre-launch test data). DROP+CREATE avoids brittle constraint-name
-- ALTERs and is deterministic on both the old-shape table (prod) and a fresh DB
-- (local, where the table didn't exist).
--
-- ISOLATION NOTE: the licensing runtime connects with the Supabase SERVICE_ROLE
-- key, which BYPASSES RLS (it must, for cross-department Stripe/vendor ops). So
-- the dept_isolation policy below is DEFENSE-IN-DEPTH only — the real per-dept
-- boundary is application logic in lib/licenseRuntime.js (every read/write scoped
-- to the authenticated department; activation validates the JWT dept matches).

DROP TABLE IF EXISTS public.license_config CASCADE;

CREATE TABLE public.license_config (
  department_id int PRIMARY KEY REFERENCES public.departments(id) ON DELETE CASCADE,
  jwt          text         NOT NULL,
  jti          text         NOT NULL,
  license_id   text         NOT NULL,
  dept_name    text,
  dept_email   text,
  tier         text,
  expires_at   timestamptz  NOT NULL,
  activated_at timestamptz  NOT NULL DEFAULT now(),
  activated_by text,
  metadata     jsonb        NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.license_config IS
  'Per-department activated license JWT (one row per department). Written via '
  '/api/license/activate, read via /api/license/status — both scoped to the '
  'authenticated department. Runtime uses the service_role key (RLS-bypassing), '
  'so isolation is enforced in app logic; the policy below is defense-in-depth.';

ALTER TABLE public.license_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shared_access ON public.license_config;
DROP POLICY IF EXISTS dept_isolation ON public.license_config;
CREATE POLICY dept_isolation ON public.license_config
  USING      (department_id = NULLIF(current_setting('app.department_id', true), '')::int)
  WITH CHECK (department_id = NULLIF(current_setting('app.department_id', true), '')::int);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.license_config TO of_app;
