-- 0007-app-role.sql — dedicated non-owner application role for P5 RLS enforcement.
--
-- AUDIT (2026-06-14): the current app role `postgres` has rolbypassrls=TRUE and
-- owns all public tables. BYPASSRLS is absolute — it overrides even FORCE ROW
-- LEVEL SECURITY. So RLS/FORCE can NEVER enforce while the app connects as
-- postgres; the policies in 0006 would be silently inert for the app.
--
-- Fix: the app connects as `of_app` — a role that is NON-OWNER, NOSUPERUSER, and
-- NOBYPASSRLS. Such a role is subject to RLS the moment RLS is enabled + a policy
-- exists (0003 + 0006). No FORCE is needed (FORCE only subjects the table OWNER).
--
-- Created NOLOGIN here so enforcement can be validated via `SET ROLE of_app`
-- without putting a credential in the repo. The LOGIN + password + DATABASE_URL
-- cutover is a separate, out-of-band step (secret never committed).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    CREATE ROLE of_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  -- Let the migration-runner (postgres on prod, which is NOT a superuser, or the
  -- local owner) assume of_app via SET ROLE — needed for admin tasks and the
  -- enforced-denial validation. Harmless: the grantee is already more privileged.
  EXECUTE format('GRANT of_app TO %I', current_user);
END $$;

GRANT USAGE ON SCHEMA public TO of_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO of_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO of_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO of_app;

-- Future objects inherit the same grants (so new tables added by initDb on a
-- fresh install, or later migrations, are reachable by of_app). No FOR ROLE — the
-- default privileges apply to objects created by whatever role runs this migration
-- (the table owner: postgres on prod, matthewlavin on local). Env-agnostic.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO of_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO of_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO of_app;
