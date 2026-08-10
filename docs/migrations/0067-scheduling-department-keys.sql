-- 0067-scheduling-department-keys.sql
-- Phase 1.1a (HARDEN THE TAIL): extend the 0066 department-key repair to the
-- scheduling tables whose station_id columns receive department ids.
--
-- Verified live 2026-07-22 (scaffold inventory):
--   * ot_records.station_id and shift_trades.station_id are REAL FKs to
--     stations(id) but every writer passes req.user.department_id — the first
--     multi-house department FK-fails every OT log and every trade request.
--   * member_availability's UNIQUE is (station_id, user_id) while the toggle
--     upsert passes a department id — re-anchor on (department_id, user_id).
--   * leave_requests carries a split status vocabulary: routes write
--     'Pending'/'Approved'/'Denied', seeds wrote lowercase — lowercase rows are
--     INVISIBLE to the approval workflow, the coverage workbench, and pattern
--     expansion. Canonicalize existing data to the route vocabulary.
-- Data-preserving throughout; station_id retained as nullable legacy columns.

-- ── ot_records ──────────────────────────────────────────────────────────────
UPDATE ot_records SET department_id = station_id WHERE department_id IS NULL;
ALTER TABLE ot_records ALTER COLUMN department_id SET NOT NULL;
ALTER TABLE ot_records DROP CONSTRAINT IF EXISTS ot_records_station_id_fkey;
ALTER TABLE ot_records ALTER COLUMN station_id DROP NOT NULL;
ALTER TABLE ot_records
  ADD CONSTRAINT ot_records_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;

-- ── shift_trades ────────────────────────────────────────────────────────────
UPDATE shift_trades SET department_id = station_id WHERE department_id IS NULL;
ALTER TABLE shift_trades ALTER COLUMN department_id SET NOT NULL;
ALTER TABLE shift_trades DROP CONSTRAINT IF EXISTS shift_trades_station_id_fkey;
ALTER TABLE shift_trades ALTER COLUMN station_id DROP NOT NULL;
ALTER TABLE shift_trades
  ADD CONSTRAINT shift_trades_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;

-- ── member_availability ─────────────────────────────────────────────────────
UPDATE member_availability SET department_id = station_id WHERE department_id IS NULL;
ALTER TABLE member_availability ALTER COLUMN department_id SET NOT NULL;
ALTER TABLE member_availability DROP CONSTRAINT IF EXISTS member_availability_station_id_user_id_key;
ALTER TABLE member_availability
  ADD CONSTRAINT member_availability_department_id_user_id_key UNIQUE (department_id, user_id);
ALTER TABLE member_availability ALTER COLUMN station_id DROP NOT NULL;

-- ── leave_requests status canonicalization (data repair) ────────────────────
UPDATE leave_requests SET status = 'Pending'  WHERE status = 'pending';
UPDATE leave_requests SET status = 'Approved' WHERE status = 'approved';
UPDATE leave_requests SET status = 'Denied'   WHERE status IN ('denied', 'rejected');
