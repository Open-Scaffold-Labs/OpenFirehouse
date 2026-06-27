-- ============================================================================
-- 0005-department-id-sync-trigger.sql
-- OpenFirehouse — Multi-tenant MIGRATE enablement: keep department_id in sync
-- ============================================================================
--
-- Phase 3 of the gameplan flips read/write access from station_id to
-- department_id. The hazard: every tenant table has SEVERAL insert paths
-- (db.js helpers, routes/import, the CAD pipeline, seeds, route-lazy CREATEs),
-- and a read flipped to `WHERE department_id = $1` returns nothing for any row
-- whose department_id wasn't populated by whichever path inserted it.
--
-- This migration removes that hazard wholesale: a BEFORE INSERT OR UPDATE
-- trigger on every tenant table sets department_id := station_id whenever
-- department_id IS NULL. So no matter which code path writes a row,
-- department_id is always populated and stays equal to station_id during the
-- EXPAND→MIGRATE window (1 station = 1 dept today). This lets Phase 3 flip
-- reads to department_id safely, table by table, without auditing every INSERT.
--
-- TRANSITIONAL: removed in Contract (Phase 7), once station_id is demoted to a
-- pure house tag and department_id is written explicitly everywhere.
--
-- IDEMPOTENT. The runner wraps this file in its own transaction — no
-- BEGIN/COMMIT here. Mirrored into db.js applyDepartmentExpand() for fresh
-- installs.
-- ============================================================================

-- Shared trigger function: backfill department_id from station_id on write.
CREATE OR REPLACE FUNCTION of_sync_department_id() RETURNS trigger AS $$
BEGIN
  IF NEW.department_id IS NULL THEN
    NEW.department_id := NEW.station_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to every tenant table that carries BOTH station_id and department_id.
-- Discovered dynamically so the set always matches reality (and tolerates
-- route-lazy tables that may not exist yet — they're picked up on a re-run, or
-- carry the trigger via the db.js mirror at fresh-install time).
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c1.table_name
    FROM information_schema.columns c1
    JOIN information_schema.columns c2
      ON c1.table_name = c2.table_name AND c2.table_schema = 'public' AND c2.column_name = 'department_id'
    WHERE c1.table_schema = 'public' AND c1.column_name = 'station_id'
    GROUP BY c1.table_name
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_department_id ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON %I '
      || 'FOR EACH ROW EXECUTE FUNCTION of_sync_department_id()', t);
  END LOOP;
END $$;

-- ── BACKOUT ─────────────────────────────────────────────────────────────────
--   DO $$ DECLARE t text; BEGIN
--     FOR t IN SELECT table_name FROM information_schema.columns
--              WHERE table_schema='public' AND column_name='department_id'
--     LOOP EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_department_id ON %I', t); END LOOP;
--   END $$;
--   DROP FUNCTION IF EXISTS of_sync_department_id();
