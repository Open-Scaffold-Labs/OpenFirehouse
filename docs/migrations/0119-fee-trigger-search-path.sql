-- 0119-fee-trigger-search-path.sql
--
-- Lock `search_path` on the four fi_* trigger functions that do not have it.
--
-- Claimed by stub 2026-08-04 (pushed, 2d6aad9) per the F4 rule. Head verified 0118 by listing
-- docs/migrations/ and by `git log --all -- 'docs/migrations/0119*'` (no hits on any ref).
--
-- WHY: Supabase's own security advisor flags four functions WARN / facing EXTERNAL with
-- `function_search_path_mutable`. THREE OF THEM I CREATED TODAY in 0118
-- (fi_fee_schedule_versions_freeze, fi_fee_item_draft_only, fi_fee_assessments_append_only)
-- and I never ran get_advisors before declaring the module done. The fourth,
-- fi_permit_notices_immutable, came in with 0116 — so it is a pattern, not a one-off, and
-- both get fixed here.
--
-- NOT A MARKET QUESTION. Competitors' function definitions are unobservable, so R1's ceiling
-- has nothing to say. R4's standing correction governs instead: where the requirement is
-- unambiguous, the standard IS the bar. Supabase's linter and the Postgres docs answer it
-- outright, and this repo ALREADY follows the doctrine — verified live 2026-08-04, both real
-- SECURITY DEFINER functions carry it:
--     ops_prune_table                       prosecdef=t  search_path=public, pg_temp
--     of_cad_connection_by_webhook_secret   prosecdef=t  search_path=public, pg_temp
-- My triggers were the exception to a rule the codebase keeps.
--
-- HONEST SEVERITY: all four are `prosecdef = false` (verified live) — they run as the INVOKER,
-- not as the owner. So this is NOT the escalation shape 0035 was written for, where of_app
-- could have aimed a DEFINER function at any table. The residual risk is search-path shadowing:
-- the functions reference fi_fee_* and fi_fee_schedule_versions unqualified, so a role able to
-- create objects in an earlier schema could shadow them. Low, but free to close.
--
-- ADDITIVE AND REVERSIBLE. No table touched, no data touched. ALTER FUNCTION ... SET
-- search_path only; the function bodies are not rewritten.
--
-- ⚠️ THE TRAP THIS MIGRATION ALONE DOES NOT CLOSE — and why db.js changes in the same commit.
-- `CREATE OR REPLACE FUNCTION` **DISCARDS** a previously-SET search_path. Both 0116 and 0118
-- create these functions that way, and `server/src/db.js` mirrors them with CREATE OR REPLACE
-- on every fresh install. So an ALTER here, on its own, would be silently undone the next time
-- initDb ran the mirror — the setting would exist on prod and be absent on every new install,
-- which is worse than not having it (a lint that passes on the database you happen to check).
-- The db.js definitions therefore carry `SET search_path = public, pg_temp` inline in the same
-- commit. The migration files 0116/0118 are left alone: migrations are append-only.
-- ─────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $sp$
DECLARE
  fn TEXT;
  fixed INT := 0;
  missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'fi_fee_schedule_versions_freeze',   -- 0118 (mine, 2026-08-04)
    'fi_fee_item_draft_only',            -- 0118 (mine, 2026-08-04)
    'fi_fee_assessments_append_only',    -- 0118 (mine, 2026-08-04)
    'fi_permit_notices_immutable'        -- 0116 (pre-existing, same pattern)
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = fn
    ) THEN
      -- No arguments on any trigger function, so the unambiguous form is enough.
      EXECUTE format('ALTER FUNCTION public.%I() SET search_path = public, pg_temp', fn);
      fixed := fixed + 1;
    ELSE
      -- A fresh install that has not reached 0116/0118 yet legitimately lacks these. Record it
      -- rather than failing: this migration must be safe to apply in any order.
      missing := missing || fn;
    END IF;
  END LOOP;

  RAISE NOTICE '0119: search_path locked on % function(s)', fixed;
  IF array_length(missing, 1) > 0 THEN
    RAISE NOTICE '0119: not present on this database (expected on a fresh install): %',
      array_to_string(missing, ', ');
  END IF;
END $sp$;

INSERT INTO of_schema_migrations (filename) VALUES ('0119-fee-trigger-search-path.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
