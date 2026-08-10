-- 0066-department-key-run-foundation.sql
-- Phase 0.4 (HARDEN THE TAIL): re-key the four "who's riding" tables from the
-- mis-populated station_id FK to department_id — the isolation unit.
--
-- WHY (verified live 2026-07-22):
--   Every writer of active_boards / run_lists / apparatus_assignments /
--   apparatus_positions passes req.user.department_id into the station_id
--   column (FK -> stations, NOT NULL; active_boards' PK). It only holds today
--   because seed installs have station.id == department_id. Worse, the
--   trg_sync_department_id BEFORE trigger backfills department_id by looking up
--   stations WHERE id = NEW.station_id — so for a multi-house department the
--   write either FK-fails OR stamps ANOTHER department's id on the row
--   (cross-tenant corruption). RLS on all four tables already keys on
--   department_id (0006), so this migration aligns the physical constraints
--   with the RLS tenant key and the application's actual semantics.
--
-- DATA-PRESERVING: no rows are dropped. station_id is retained as a nullable
-- legacy column (its dept-valued history is meaningless as a station ref; new
-- writes leave it NULL). department_id was verified fully backfilled with zero
-- divergence from station_id on prod before this ran (1 / 17 / 153 / 19 rows;
-- 0 FK orphans against departments).
--
-- unit_statuses / unit_status_history remain station-keyed — that is the P7
-- residue, tracked separately; NOT touched here.

-- ── active_boards: PK moves station_id → department_id ──────────────────────
UPDATE active_boards SET department_id = station_id WHERE department_id IS NULL;
ALTER TABLE active_boards ALTER COLUMN department_id SET NOT NULL;
ALTER TABLE active_boards DROP CONSTRAINT IF EXISTS active_boards_station_id_fkey;
ALTER TABLE active_boards DROP CONSTRAINT IF EXISTS active_boards_pkey;
ALTER TABLE active_boards ADD CONSTRAINT active_boards_pkey PRIMARY KEY (department_id);
ALTER TABLE active_boards
  ADD CONSTRAINT active_boards_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE active_boards ALTER COLUMN station_id DROP NOT NULL;

-- ── run_lists: uniqueness anchor moves (station_id, date) → (department_id, date)
UPDATE run_lists SET department_id = station_id WHERE department_id IS NULL;
ALTER TABLE run_lists ALTER COLUMN department_id SET NOT NULL;
ALTER TABLE run_lists DROP CONSTRAINT IF EXISTS run_lists_station_id_fkey;
ALTER TABLE run_lists DROP CONSTRAINT IF EXISTS run_lists_station_id_date_key;
ALTER TABLE run_lists
  ADD CONSTRAINT run_lists_department_id_date_key UNIQUE (department_id, date);
ALTER TABLE run_lists
  ADD CONSTRAINT run_lists_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE run_lists ALTER COLUMN station_id DROP NOT NULL;

-- ── apparatus_assignments: drop the wrong FK + NOT NULL ─────────────────────
UPDATE apparatus_assignments SET department_id = station_id WHERE department_id IS NULL;
ALTER TABLE apparatus_assignments ALTER COLUMN department_id SET NOT NULL;
ALTER TABLE apparatus_assignments DROP CONSTRAINT IF EXISTS apparatus_assignments_station_id_fkey;
ALTER TABLE apparatus_assignments
  ADD CONSTRAINT apparatus_assignments_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE apparatus_assignments ALTER COLUMN station_id DROP NOT NULL;

-- ── apparatus_positions: drop the wrong FK + NOT NULL ───────────────────────
UPDATE apparatus_positions SET department_id = station_id WHERE department_id IS NULL;
ALTER TABLE apparatus_positions ALTER COLUMN department_id SET NOT NULL;
ALTER TABLE apparatus_positions DROP CONSTRAINT IF EXISTS apparatus_positions_station_id_fkey;
ALTER TABLE apparatus_positions
  ADD CONSTRAINT apparatus_positions_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE apparatus_positions ALTER COLUMN station_id DROP NOT NULL;
