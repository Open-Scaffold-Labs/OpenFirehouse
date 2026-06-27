-- 0020-sync-trigger-resolve-real-department.sql  (P6.2/P7 — multi-house correctness)
--
-- The 0005 sync trigger backfilled `department_id := station_id` whenever an
-- insert/update left department_id NULL. That was correct only while the
-- EXPAND→MIGRATE invariant held (1 dept = 1 station, so station_id == the dept).
-- For a department with MORE THAN ONE house, station_id is the *house* id, which
-- is NOT the department id — so the old trigger would tag rows with the wrong
-- tenant, and under RLS the WITH CHECK would then reject the insert.
--
-- This upgrades the trigger to resolve the row's REAL department from its
-- station: department_id := (the department that owns NEW.station_id). One
-- function change makes ALL ~236 insert paths multi-house-correct at once,
-- instead of hand-writing department_id at every call site (fragile, one-way).
-- The COALESCE fallback to NEW.station_id preserves the exact prior behavior for
-- any row whose station_id has no matching stations row (orphan / pre-backfill),
-- so this is behavior-IDENTICAL for the current single-station data (where a
-- station's department_id already equals its own id) and only changes outcomes
-- for genuine multi-house departments (none live yet).
--
-- Triggers themselves are unchanged — CREATE OR REPLACE FUNCTION updates the body
-- for every table the 0005 DO-block already attached it to. `stations` is NOT in
-- that set (it has no station_id column), so there is no self-reference.
--
-- Idempotent. Apply to prod via Supabase MCP + mirror in db.js + stamp the ledger.

CREATE OR REPLACE FUNCTION of_sync_department_id() RETURNS trigger AS $$
BEGIN
  IF NEW.department_id IS NULL THEN
    NEW.department_id := COALESCE(
      (SELECT s.department_id FROM public.stations s WHERE s.id = NEW.station_id),
      NEW.station_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- of_station_department(station_id) — resolve a house's real department, BYPASSING
-- RLS. The CAD pipeline needs this BEFORE it has a department context (to set the
-- per-request dept GUC + key the realtime broadcast), and `stations` is RLS-on so a
-- plain read would be hidden. Read-only, search_path-locked, EXECUTE to of_app only.
CREATE OR REPLACE FUNCTION public.of_station_department(p_station_id integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT department_id FROM public.stations WHERE id = p_station_id $$;

DO $$
DECLARE r text; f text := 'public.of_station_department(integer)';
BEGIN
  IF to_regprocedure(f) IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r); END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO of_app', f); END IF;
  END IF;
END $$;
