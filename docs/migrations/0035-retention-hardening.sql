-- 0035-retention-hardening.sql — close the privilege gap left by 0034.
--
-- WHY (Dale security review, 2026-07-04):
-- 0034 revoked EXECUTE on the retention functions FROM PUBLIC only. Migration
-- 0007's ALTER DEFAULT PRIVILEGES grants of_app EXECUTE on every new function
-- and full DML on every new table, and REVOKE FROM PUBLIC does NOT strip
-- role-specific default-privilege grants (documented in 0012 §WHY THE REVOKE;
-- every migration 0013–0032 handles this; 0034 regressed). As applied to prod:
--   1. of_app can call ops_prune_table('members','created_at',1) directly —
--      a SECURITY DEFINER, RLS-bypassing mass delete of ANY table.
--   2. of_app has INSERT/UPDATE on retention_policy — a compromised app layer
--      could add ('members','created_at',1) and the nightly cron does the rest.
--   3. Same exposure on ops_run_retention() and
--      ops_purge_soft_deleted_incidents(int) (the legal-record purge).
--
-- FIX: explicit role revokes (functions + control tables) and a hardcoded
-- allowlist inside ops_prune_table as defense in depth — even a hostile
-- retention_policy row can never touch a non-operational table.
--
-- APPLY: prod, ASAP (0034 is already live there). Idempotent.

-- ── 1. Strip default-privilege grants from the 0034 functions ─────────────────
DO $do$
  DECLARE r text; f text;
  BEGIN
    FOREACH f IN ARRAY ARRAY[
      'public.ops_prune_table(text, text, integer, integer)',
      'public.ops_run_retention()',
      'public.ops_purge_soft_deleted_incidents(integer)'
    ] LOOP
      IF to_regprocedure(f) IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r);
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END $do$;

-- ── 2. Lock the control tables (no app surface reads them; owner+cron only) ──
DO $do$
  DECLARE r text; t text;
  BEGIN
    FOREACH t IN ARRAY ARRAY['retention_policy','retention_run_log'] LOOP
      IF to_regclass('public.' || t) IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
        FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', t, r);
          END IF;
        END LOOP;
      END IF;
    END LOOP;
    -- and the run-log sequence
    IF to_regclass('public.retention_run_log_id_seq') IS NOT NULL THEN
      EXECUTE 'REVOKE ALL ON SEQUENCE public.retention_run_log_id_seq FROM PUBLIC';
      FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
          EXECUTE format('REVOKE ALL ON SEQUENCE public.retention_run_log_id_seq FROM %I', r);
        END IF;
      END LOOP;
    END IF;
  END $do$;

-- ── 3. Allowlist inside ops_prune_table (defense in depth) ────────────────────
-- Only the six operational tables 0034 targeted can ever be pruned, no matter
-- what retention_policy contains. Non-allowlisted rows WARN and return 0 (never
-- RAISE — an exception would abort the nightly driver and skip healthy tables).
CREATE OR REPLACE FUNCTION public.ops_prune_table(
  p_table text, p_ts_col text, p_retain_days integer, p_batch integer DEFAULT 5000)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_total bigint := 0;
  v_deleted integer;
  v_allowlist CONSTANT text[] := ARRAY[
    'cad_alerts', 'unit_status_history', 'audit_log',
    'radio_log', 'knox_access_log', 'station_log'
  ];
BEGIN
  IF NOT (p_table = ANY (v_allowlist)) THEN
    RAISE WARNING 'ops_prune_table: % is not an allowlisted operational table, refusing', p_table;
    RETURN 0;
  END IF;
  IF p_retain_days IS NULL OR p_retain_days < 30 THEN
    RAISE WARNING 'ops_prune_table: retain_days % under 30-day floor for %, refusing', p_retain_days, p_table;
    RETURN 0;
  END IF;
  IF to_regclass('public.' || p_table) IS NULL THEN
    RAISE NOTICE 'ops_prune_table: table % not found, skipping', p_table;
    RETURN 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_ts_col
  ) THEN
    RAISE NOTICE 'ops_prune_table: column %.% not found, skipping', p_table, p_ts_col;
    RETURN 0;
  END IF;
  LOOP
    EXECUTE format(
      'WITH victims AS ('
      || ' SELECT ctid FROM %1$I'
      || ' WHERE %2$I < now() - make_interval(days => %3$L::int)'
      || ' ORDER BY %2$I LIMIT %4$L::int FOR UPDATE SKIP LOCKED)'
      || ' DELETE FROM %1$I t USING victims v WHERE t.ctid = v.ctid',
      p_table, p_ts_col, p_retain_days, p_batch);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;
    EXIT WHEN v_deleted = 0;
  END LOOP;
  RETURN v_total;
END
$fn$;

-- CREATE OR REPLACE re-applies default privileges → strip them again, last.
DO $do$
  DECLARE r text; f text := 'public.ops_prune_table(text, text, integer, integer)';
  BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r);
      END IF;
    END LOOP;
  END $do$;

-- ── Verification (run after apply) ────────────────────────────────────────────
-- 1. No app-role grants remain on the retention surface:
--    SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_name IN ('retention_policy','retention_run_log')
--       AND grantee NOT IN ('postgres');            -- expect 0 rows
--    SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--     WHERE routine_name IN ('ops_prune_table','ops_run_retention',
--                            'ops_purge_soft_deleted_incidents')
--       AND grantee NOT IN ('postgres');            -- expect 0 rows
-- 2. Allowlist works (as postgres):
--    SELECT public.ops_prune_table('members','created_at',3650);  -- WARNING + 0
-- 3. Nightly job still healthy next morning:
--    SELECT * FROM public.retention_run_log ORDER BY ran_at DESC LIMIT 10;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- Re-run 0034 (restores the unguarded function body); grants stay revoked,
-- which is safe in every direction.

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0035-retention-hardening.sql')
ON CONFLICT (filename) DO NOTHING;
