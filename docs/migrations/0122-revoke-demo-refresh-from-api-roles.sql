-- 0122-revoke-demo-refresh-from-api-roles.sql
--
-- Take EXECUTE on refresh_demo_data() / refresh_demo_staffing() away from anon + authenticated.
--
-- Claimed by stub 2026-08-04 per the F4 rule. Head verified 0121 by listing docs/migrations/.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 WHY: THESE TWO ARE CALLABLE BY ANYONE ON THE INTERNET, RIGHT NOW, ON PRODUCTION.
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- Four facts, each verified live 2026-08-04, and all four have to hold for this to be real:
--   1. The Supabase Data API is ENABLED on this project (dashboard → Integrations → Data API →
--      "Enable Data API" toggle is ON). Read from the dashboard, not inferred.
--   2. Both functions are in the Data API's EXPOSED FUNCTIONS set (9 of 22 exposed; these two
--      are ticked).
--   3. `has_function_privilege('anon', ..., 'EXECUTE')` returns TRUE for both.
--   4. The anon key is PUBLIC BY DESIGN — it ships inside the browser bundle.
-- So: POST https://<ref>.supabase.co/rest/v1/rpc/refresh_demo_data with the public anon key
-- invokes them. No login, no session, no department.
--
-- WHAT THEY DO WHEN CALLED — this is the part that matters:
--     UPDATE public.shifts SET date = ((date::date) + off_days)::text;
-- **NO WHERE CLAUSE.** Every row in `shifts`, every department, slid forward in time. The
-- function's own comment says "(TEXT, whole-table demo)". It also rewrites daily_staffing,
-- vacancy_fill and activity_entries.department_id, and every block is wrapped in
-- `EXCEPTION WHEN OTHERS THEN NULL` — so it fails SILENTLY and leaves no error trail.
--
-- Today the blast radius is demo rows, because OF is pre-launch. At launch `shifts` holds real
-- duty rosters, and this becomes an anonymous request that moves every department's schedule.
-- Pre-launch is exactly when this is free to fix.
--
-- NOT VERIFIED BY CALLING IT, deliberately: invoking it to "prove" the hole would mutate
-- production. The privilege chain above is proof; the demonstration would be vandalism.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- WHY A REVOKE AND NOT A REWRITE — and why this does NOT break the nightly jobs
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- These functions are INTENTIONAL: `0034`/`0035` and the demo-refresh work created them, and
-- three pg_cron jobs call them nightly (`refresh-demo-data` 06:10, `refresh-demo-staffing`
-- 06:20). OF's CLAUDE.md explicitly warns against "fixing" that machinery. So this migration
-- does NOT touch what they do, when they run, or who owns them.
--
-- pg_cron runs them as `postgres`, the OWNER. Revoking from `anon` and `authenticated` cannot
-- affect the owner, so the nightly refresh is untouched. `of_app` is not granted EXECUTE here
-- either — the app has never called these; only cron does.
--
-- This is the same shape as 0121: remove a privilege nothing legitimate uses. A REVOKE can only
-- ever refuse an operation, never enable one, which is why it is safe to apply before the
-- dashboard-side questions below are answered.
--
-- ⚠️ TWO DASHBOARD SETTINGS THIS MIGRATION CANNOT REACH — they are Matt's, not SQL:
--   (a) "Automatically expose new tables" is ON. Supabase's own UI recommends turning it off.
--       It is why three trigger functions I created TODAY were auto-exposed to the Data API
--       within minutes of existing, without anyone deciding that.
--   (b) Whether the Data API should be enabled at all. Nothing in OF calls PostgREST — the
--       server connects by direct Postgres as of_app, and Realtime is a SEPARATE service that
--       is unaffected by that switch (verified on the Hub project 2026-07-23, where disabling
--       the Data API left Realtime working).
--
-- ALSO NOTE, and it is the reassuring half: every SECURITY DEFINER function is correctly
-- locked. `of_provision_department`, `ops_run_retention`, `of_link_member`,
-- `of_register_pending_member`, `of_cad_connection_by_webhook_secret` and the rest all return
-- anon/authenticated/service_role = FALSE for EXECUTE, because our migrations revoked them
-- explicitly. That doctrine has been working exactly as 0012 intended. The nine exposed
-- functions are precisely the nine nobody wrote a REVOKE for.
-- ─────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $rv$
DECLARE fn TEXT; r TEXT; done INT := 0;
BEGIN
  FOREACH fn IN ARRAY ARRAY['refresh_demo_data()', 'refresh_demo_staffing()'] LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = split_part(fn, '(', 1)) THEN
      FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','PUBLIC'] LOOP
        IF r = 'PUBLIC' OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
          EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM %s', fn,
                         CASE WHEN r = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r) END);
        END IF;
      END LOOP;
      done := done + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '0122: EXECUTE revoked from the API roles on % demo-refresh function(s)', done;
END $rv$;

-- A check that CAN fail: no API role may hold EXECUTE afterwards, and the OWNER must keep it
-- (otherwise the nightly pg_cron jobs would start failing and this fix would be the outage).
DO $verify$
DECLARE bad TEXT; owner_ok BOOLEAN; present INT;
BEGIN
  SELECT string_agg(p.proname || ':' || r, ', ')
    INTO bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace,
         unnest(ARRAY['anon','authenticated','service_role']) AS r
   WHERE n.nspname = 'public'
     AND p.proname IN ('refresh_demo_data','refresh_demo_staffing')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
     AND has_function_privilege(r, p.oid, 'EXECUTE');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '0122 FAILED: EXECUTE still held — %', bad;
  END IF;

  -- The owner must KEEP execute, or this fix becomes the outage. Two corrections here, both
  -- found by this check failing on the first local run rather than passing quietly:
  --   · the owner is read from pg_proc.proowner, NOT hardcoded as 'postgres' — locally these
  --     functions are owned by the developer role, so a hardcoded name is a false failure;
  --   · a database with NO demo-refresh functions (local, CI, any fresh install) must PASS.
  --     bool_and() over an empty set returns NULL, which my first version treated as failure.
  SELECT count(*) INTO present
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('refresh_demo_data','refresh_demo_staffing');

  IF present = 0 THEN
    RAISE NOTICE '0122: no demo-refresh functions on this database — nothing to revoke, nothing to verify';
  ELSE
    SELECT bool_and(has_function_privilege(pg_get_userbyid(p.proowner), p.oid, 'EXECUTE'))
      INTO owner_ok
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('refresh_demo_data','refresh_demo_staffing');
    IF owner_ok IS NOT TRUE THEN
      RAISE EXCEPTION '0122 FAILED: the OWNER lost EXECUTE — the nightly pg_cron jobs would break';
    END IF;
    RAISE NOTICE '0122: verified — API roles cannot execute, owner (pg_cron) still can';
  END IF;
END $verify$;

INSERT INTO of_schema_migrations (filename) VALUES ('0122-revoke-demo-refresh-from-api-roles.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
