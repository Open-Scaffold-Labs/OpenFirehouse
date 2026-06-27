-- 0010-reconcile-lazy-department-id.sql
-- Reconcile lazy/runtime-created tables that have station_id but NOT department_id.
--
-- Root cause: a few tables are created at request time from INIT_SQL that uses
-- `station_id` (the pre-Phase-3 shape). When such a table is first created AFTER
-- migration 0004 ran, 0004 never added department_id to it — yet the routes were
-- migrated to query `WHERE department_id` (Phase 3). Result: "column department_id
-- does not exist" 500s. This is independent of the of_app cutover (it also breaks
-- fresh installs) — the cutover just surfaced it. On prod (2026-06-14) the affected
-- tables are: activity_entries, webhook_deliveries, webhook_subscriptions.
--
-- This generically fixes EVERY public table with station_id but no department_id
-- (so no straggler is missed), EXCLUDING `users` (shared identity — intentionally
-- has no department_id) and foreign-app prefixes. For each: add department_id,
-- backfill from station_id, attach the of_sync_department_id trigger (so new
-- inserts that set station_id also get department_id — required for the WITH CHECK
-- policy to pass), enable RLS, add the dept_isolation policy, grant of_app.
-- Idempotent (ADD COLUMN guarded by the NOT EXISTS filter; DROP POLICY/TRIGGER IF EXISTS).

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT s.table_name
    FROM (SELECT table_name FROM information_schema.columns
          WHERE table_schema='public' AND column_name='station_id') s
    JOIN information_schema.tables tb
      ON tb.table_schema='public' AND tb.table_name=s.table_name AND tb.table_type='BASE TABLE'
    WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns d
            WHERE d.table_schema='public' AND d.table_name=s.table_name AND d.column_name='department_id')
      AND s.table_name NOT IN ('users')                        -- shared identity, exempt
      AND s.table_name !~ '^(ods_|odh_|oia_|ola_|or_|lsh_)'    -- never foreign apps
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN department_id int', t);
    EXECUTE format('UPDATE public.%I SET department_id = station_id WHERE department_id IS NULL', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_department_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION of_sync_department_id()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
    EXECUTE format('CREATE POLICY dept_isolation ON public.%I '
      'USING (department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int) '
      'WITH CHECK (department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO of_app', t);
    RAISE NOTICE '0010: reconciled %', t;
  END LOOP;
END $$;
