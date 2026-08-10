-- 0123-remaining-function-search-path.sql
--
-- Lock `search_path` on the last three functions that lack it, emptying the advisor's WARN list.
--
-- Claimed by stub 2026-08-04 per the F4 rule. Head verified 0122 by listing docs/migrations/.
--
-- The three, verified live (pg_proc.proconfig IS NULL, owner postgres):
--   of_roles_protect_builtin   trigger  — the guard that stops built-in roles being edited (0113)
--   refresh_demo_data          text     — nightly demo-data slide (pg_cron)
--   refresh_demo_staffing      text     — nightly demo-staffing slide (pg_cron)
-- 0119 already fixed the other four. After this, ZERO functions on prod lack a search_path.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- WHY FINISH THE SET RATHER THAN LEAVE THREE
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- I recommended leaving of_roles_protect_builtin alone, then reversed under pressure, which is
-- its own failure. The honest reasoning, independent of anyone's mood:
--
-- 1. ADVISOR NOISE IS HOW REAL FINDINGS GET MISSED, and it nearly happened today. When I ran
--    the security advisor, three warnings I had just created sat in a list alongside three
--    pre-existing ones and I had to read carefully to tell them apart. Every permanently-unfixed
--    warning makes the next run harder to read. An empty list is a working alarm; a list with
--    three known entries is a list nobody reads.
-- 2. The project standard is explicit that reaching for the lesser fix and calling the better
--    one "a future upgrade" is the anti-pattern, and "it's more work" is not a reason. This is
--    one ALTER per function. "Whenever someone next touches roles" is a date that never comes —
--    0057 has been parked since July.
-- 3. of_roles_protect_builtin guards WHO-CAN-DO-WHAT. The bar for hardening that should be
--    lower than for anything else, not higher because it sits in someone else's migration.
--
-- ⚠️ THIS IS NOT "FIXING" THE DEMO/pg_cron MACHINERY that OF's CLAUDE.md warns about. Setting
-- search_path changes NOTHING about what these functions do, when they run, or who owns them —
-- it only fixes the schema in which unqualified names resolve. Their logic, their schedule and
-- their pg_cron jobs are untouched. That warning is about not disabling a reviewed design;
-- this does not disable anything.
--
-- SEVERITY, honestly: LOW. All three are prosecdef = false, so they run as the caller and there
-- is no privilege-escalation path of the kind 0035 was written for. And after 0122 the two demo
-- functions are owner-only anyway. This is hygiene that makes the alarm usable, not a breach fix.
--
-- The guard's behaviour is re-probed after applying — a search_path change that silently broke
-- the built-in-role protection would be far worse than the lint it fixes.
-- ─────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $sp$
DECLARE fn TEXT; fixed INT := 0; absent TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH fn IN ARRAY ARRAY['of_roles_protect_builtin','refresh_demo_data','refresh_demo_staffing'] LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname='public' AND p.proname = fn) THEN
      EXECUTE format('ALTER FUNCTION public.%I() SET search_path = public, pg_temp', fn);
      fixed := fixed + 1;
    ELSE
      absent := absent || fn;
    END IF;
  END LOOP;
  RAISE NOTICE '0123: search_path locked on % function(s)', fixed;
  IF array_length(absent,1) > 0 THEN
    RAISE NOTICE '0123: not present on this database (expected on a fresh install): %',
      array_to_string(absent, ', ');
  END IF;
END $sp$;

-- A check that CAN fail: nothing owner-side may be left without a search_path.
DO $verify$
DECLARE remaining TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO remaining
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proconfig IS NULL
     AND pg_get_userbyid(p.proowner) = 'postgres';
  IF remaining IS NOT NULL THEN
    RAISE WARNING '0123: functions still without a search_path: %', remaining;
  ELSE
    RAISE NOTICE '0123: verified — no owner-side function lacks a search_path';
  END IF;
END $verify$;

INSERT INTO of_schema_migrations (filename) VALUES ('0123-remaining-function-search-path.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
