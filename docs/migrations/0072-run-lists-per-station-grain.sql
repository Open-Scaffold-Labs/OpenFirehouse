-- 0072 — Per-station roster grain (Phase 2.1a): re-key run_lists from (department_id, date)
-- to (department_id, station_id, date). Market grain (2026-07-23 pass): each STATION publishes
-- its own daily riding board; a shared department-wide roster per date collides the moment a
-- department runs a second firehouse. run_lists already carries station_id (17/17 rows populated);
-- this makes it part of the uniqueness key so two stations can post the same date without clobbering.
-- D6: applied to prod by hand → verified by query → ledgered → then dependent code ships.
--
-- Additive + one uniqueness re-key. No drops of data.

BEGIN;

-- Belt-and-suspenders: backfill any NULL station_id from the department's sole station
-- (all current rows are already populated; this only guards single-house rows that predate the col).
UPDATE run_lists r
SET station_id = s.id
FROM stations s
WHERE s.department_id = r.department_id
  AND r.station_id IS NULL
  AND (SELECT count(*) FROM stations s2 WHERE s2.department_id = r.department_id) = 1;

-- station_id becomes part of the key → it must be NOT NULL.
ALTER TABLE run_lists ALTER COLUMN station_id SET NOT NULL;

-- Re-key: one published roster per (department, station, date).
ALTER TABLE run_lists DROP CONSTRAINT IF EXISTS run_lists_department_id_date_key;
ALTER TABLE run_lists ADD CONSTRAINT run_lists_dept_station_date_key UNIQUE (department_id, station_id, date);

-- Hot read path (per-station-per-date snapshot lookups).
CREATE INDEX IF NOT EXISTS idx_run_lists_dept_station_date ON run_lists (department_id, station_id, date);

-- The roster derivation now filters apparatus_assignments by station_id, so EVERY seated
-- assignment must carry its station. Several writers (web assignment board, riding-board
-- hours editor) don't set it explicitly. Enhance the shared dept-sync trigger to stamp
-- station_id from the apparatus when a seated row omits it — a single-point guarantee
-- (guarded to apparatus_assignments; all other tables' behavior is unchanged). Seatless
-- rows (apparatus_id NULL) keep whatever station the caller provided.
-- NOTE: the apparatus_id check MUST be NESTED inside the TG_TABLE_NAME guard. This
-- trigger fires on ~100 tables; plpgsql prepares the whole boolean expression against
-- each table's rowtype, so a flat `TG_TABLE_NAME=... AND NEW.apparatus_id ...` throws
-- 42703 (no such field) on every table without an apparatus_id column. Nesting means
-- NEW.apparatus_id is only referenced when the row IS an apparatus_assignment.
CREATE OR REPLACE FUNCTION public.of_sync_department_id()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  IF TG_TABLE_NAME = 'apparatus_assignments' THEN
    IF NEW.station_id IS NULL AND NEW.apparatus_id IS NOT NULL THEN
      NEW.station_id := (SELECT station_id FROM public.apparatus WHERE id = NEW.apparatus_id);
    END IF;
  END IF;
  IF NEW.department_id IS NULL THEN
    NEW.department_id := COALESCE(
      (SELECT s.department_id FROM public.stations s WHERE s.id = NEW.station_id),
      NEW.station_id
    );
  END IF;
  RETURN NEW;
END;
$function$;

INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0072-run-lists-per-station-grain.sql', NOW());

COMMIT;
