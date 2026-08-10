-- 0034-retention-and-archival.sql — scheduled retention for unbounded operational
-- and audit tables (closes the "no data archival/retention" gap).
--
-- STATUS: PROPOSED — review before applying to prod. Touches the DB-security
-- surface (SECURITY DEFINER + RLS-bypass), so it is Dale-gated per doctrine.
-- Named dollar-quote tags ($fn$/$do$) are used so the Supabase SQL editor parses
-- the multiple function/DO blocks unambiguously.

-- ── Prereq extension (enable once; superuser / Supabase dashboard) ────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Config: one row per table we prune (operator-tunable, no code changes) ────
CREATE TABLE IF NOT EXISTS public.retention_policy (
  table_name   text PRIMARY KEY,
  ts_column    text NOT NULL,
  retain_days  integer NOT NULL CHECK (retain_days >= 1),
  enabled      boolean NOT NULL DEFAULT true,
  note         text DEFAULT '',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.retention_policy (table_name, ts_column, retain_days, note) VALUES
  ('cad_alerts',          'created_at', 180, 'Dispatch alerts; legal record persists in incidents'),
  ('unit_status_history', 'changed_at', 365, 'Run-time analytics window'),
  ('audit_log',           'at',         730, 'Compliance audit trail; 2yr then prune'),
  ('radio_log',           'created_at',  365, 'Radio transcripts/log'),
  ('knox_access_log',     'accessed_at', 730, 'Access log — security value; keep 2yr'),
  ('station_log',         'createdAt',   365, 'Station activity log (camelCase ts column)')
ON CONFLICT (table_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.retention_run_log (
  id           bigserial PRIMARY KEY,
  ran_at       timestamptz NOT NULL DEFAULT now(),
  table_name   text NOT NULL,
  rows_deleted bigint NOT NULL,
  retain_days  integer NOT NULL
);

-- ── Batched, lock-friendly prune of a single table ───────────────────────────
CREATE OR REPLACE FUNCTION public.ops_prune_table(
  p_table text, p_ts_col text, p_retain_days integer, p_batch integer DEFAULT 5000)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_total bigint := 0;
  v_deleted integer;
BEGIN
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

-- ── Nightly driver: prune every enabled table, log each result ───────────────
CREATE OR REPLACE FUNCTION public.ops_run_retention()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT table_name, ts_column, retain_days
             FROM public.retention_policy WHERE enabled LOOP
    n := public.ops_prune_table(r.table_name, r.ts_column, r.retain_days);
    INSERT INTO public.retention_run_log (table_name, rows_deleted, retain_days)
      VALUES (r.table_name, n, r.retain_days);
  END LOOP;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.ops_prune_table(text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ops_run_retention() FROM PUBLIC;

-- ── Schedule: nightly at 09:10 UTC (idempotent) ──────────────────────────────
DO $do$
BEGIN
  PERFORM cron.unschedule('of-retention-nightly')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'of-retention-nightly');
EXCEPTION WHEN OTHERS THEN NULL;
END
$do$;
SELECT cron.schedule('of-retention-nightly', '10 9 * * *', 'SELECT public.ops_run_retention();');

-- ── LEGAL records: soft-deleted incident purge — DISABLED, manual, gated ──────
CREATE OR REPLACE FUNCTION public.ops_purge_soft_deleted_incidents(p_retain_years integer)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE n bigint;
BEGIN
  IF p_retain_years IS NULL OR p_retain_years < 3 THEN
    RAISE EXCEPTION 'Refusing to purge incidents with a retention window under 3 years';
  END IF;
  DELETE FROM public.incidents
   WHERE deleted_at IS NOT NULL
     AND deleted_at < now() - make_interval(years => p_retain_years);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$fn$;
REVOKE EXECUTE ON FUNCTION public.ops_purge_soft_deleted_incidents(integer) FROM PUBLIC;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- SELECT cron.unschedule('of-retention-nightly');
-- DROP FUNCTION IF EXISTS public.ops_run_retention();
-- DROP FUNCTION IF EXISTS public.ops_prune_table(text, text, integer, integer);
-- DROP FUNCTION IF EXISTS public.ops_purge_soft_deleted_incidents(integer);
-- DROP TABLE IF EXISTS public.retention_run_log;
-- DROP TABLE IF EXISTS public.retention_policy;

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0034-retention-and-archival.sql')
ON CONFLICT (filename) DO NOTHING;
