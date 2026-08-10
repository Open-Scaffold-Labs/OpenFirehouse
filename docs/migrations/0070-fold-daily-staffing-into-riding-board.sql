-- 0070 — Fold daily_staffing (payroll hours) into the date-keyed riding board (apparatus_assignments).
-- Phase 1.1c-b. Market grain (2026-07-23 competitive pass): person -> assignment -> shift block;
-- an apparatus riding seat is ONE assignment type among duty-command / floater / admin / coverage /
-- training. Seatless-but-paid on-duty is first-class. The assignment IS the timecard hours source
-- ("the timecard flows from the seat/assignment you rode"). No paid assignment is ever discarded.
-- D6: applied to prod by hand -> verified by query -> ledgered -> only THEN does dependent code ship.
--
-- Additive + ONE constraint relaxation (apparatus_id -> nullable) + a data backfill. No drops.

BEGIN;

-- 1) Seatless-but-paid on-duty is first-class -> the board must allow an on-duty row with no rig seat.
ALTER TABLE apparatus_assignments ALTER COLUMN apparatus_id DROP NOT NULL;

-- 2) Hours + tour fields become properties of the date-keyed assignment (the timecard line).
ALTER TABLE apparatus_assignments
  ADD COLUMN IF NOT EXISTS hours      NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS start_time TEXT,
  ADD COLUMN IF NOT EXISTS end_time   TEXT,
  ADD COLUMN IF NOT EXISTS status     TEXT DEFAULT 'on_duty',
  ADD COLUMN IF NOT EXISTS notes      TEXT DEFAULT '';

-- 3) Backfill every daily_staffing row into the board, carrying its hours, collision-safe and
--    member-faithful. Seat-unique index = (department_id, date, apparatus_id, position_name).
--    If a legacy row's seat is already filled by an existing board row, the legacy row folds in as
--    a SEATLESS hours row (apparatus_id -> NULL) so NO member's paid hours are lost and NO seat is
--    double-filled (NULL <> NULL in a unique index, so seatless rows never collide). This mirrors the
--    market: an on-duty assignment always carries its hours; nothing paid is dropped.
INSERT INTO apparatus_assignments
  (department_id, station_id, date, apparatus_id, position_id, position_name,
   member_id, hours, start_time, end_time, status, shift_id, created_at)
SELECT ds.department_id, ds.station_id, ds.date,
       CASE WHEN ds.apparatus_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM apparatus_assignments aa
         WHERE aa.department_id = ds.department_id AND aa.date = ds.date
           AND aa.apparatus_id  = ds.apparatus_id
           AND aa.position_name = COALESCE(ds.position, '')
       ) THEN NULL ELSE ds.apparatus_id END,
       NULL, COALESCE(ds.position, ''), ds.member_id,
       ds.hours, ds.start_time, ds.end_time, COALESCE(ds.status, 'on_duty'),
       NULL, ds.created_at
FROM daily_staffing ds;

COMMIT;
