-- 0069-roster-date-grain-seat-integrity.sql
-- Phase 1.1c-a (HARDEN THE TAIL): re-anchor the riding board on the DATE, the
-- way the market models a daily roster (station -> apparatus -> seat -> member,
-- for a DATE; a rotation shift is an OPTIONAL layer that says who is on duty).
-- Design of record: docs/PHASE1-SCHEDULING-SPEC-2026-07-22.md §7 (revised
-- 2026-07-23, deep market pass).
--
-- What this does:
--   1. apparatus_assignments gains `date` (the dated anchor). shift_id becomes
--      OPTIONAL — a link to the rotation shift when one generated the on-duty
--      list, NULL when the roster was posted for a date with no rotation
--      (volunteer / ad-hoc). This removes the need for the phantom
--      "Run List" shift the publish path used to auto-create.
--   2. Seat integrity at the DB (race-proof), replacing the app-layer
--      delete-then-insert: UNIQUE (department_id, date, apparatus_id,
--      position_name) — one person per named seat per apparatus per day.
--      apparatus_id already scopes to a station, so station is implied and
--      left out of the key (avoids NULL station_id key gymnastics).
--
-- Seat-key justification (verified on the DB before writing, D6):
--   * position_name is present on EVERY apparatus_assignments row (position_id
--     is nullable — 4/18 local rows are ad-hoc seats with a name but no
--     template id), so position_name is the reliable seat identity, NULL-free.
--   * apparatus_positions has NO duplicate position_name per apparatus, so a
--     name uniquely identifies a seat on a rig.
--
-- Data-safety (checked on LOCAL freestation before writing; MUST be re-checked
-- on PROD abvcmaknsyqmahspmasu BEFORE prod-apply per D6):
--   * simulated backfill (assignment.date := its shift's date): 0 duplicate
--     seats under the new key, 0 members double-booked per (dept,date),
--     0 assignments with a missing shift (backfill covers every row).
-- Additive + data-preserving (F13). No row is deleted; shift_id is retained.
--
-- NOTE: member-not-double-booked-in-a-day is enforced at the app layer (the
-- assignment write vacates a member's prior seat before assigning a new one),
-- NOT as a hard DB constraint — a hard member/day unique is ambiguous ground
-- (a volunteer covering two apparatus at different times) and is left as an
-- app-level move-semantic. The hard DB guarantee is one-person-per-SEAT.

-- ── 1. date anchor + optional shift link ────────────────────────────────────
ALTER TABLE apparatus_assignments ADD COLUMN IF NOT EXISTS date DATE;

-- backfill the date from the linked rotation shift (shifts.date is ISO text)
UPDATE apparatus_assignments aa
   SET date = s.date::date
  FROM shifts s
 WHERE aa.shift_id = s.id
   AND aa.date IS NULL;

-- every existing row is now dated (0 orphans verified locally); enforce it.
-- (If PROD holds an assignment whose shift is missing, this SET NOT NULL will
-- fail — that is the D6 pre-apply check: verify 0 NULL date rows on prod first.)
ALTER TABLE apparatus_assignments ALTER COLUMN date SET NOT NULL;

-- the rotation link is now optional (a roster can exist for a date with no shift)
ALTER TABLE apparatus_assignments ALTER COLUMN shift_id DROP NOT NULL;

-- ── 2. dedupe EXACT-duplicate seats before the constraint ───────────────────
-- Prod (verified 2026-07-23) carried 9 duplicate seats — ALL the SAME member
-- recorded twice in one seat (dept 1, 2026-07-11, shift 541): a double-written
-- roster, not two people contesting a seat. Remove the redundant copies, keeping
-- the lowest id. The `a.member_id = b.member_id` guard is the SAFETY: it only
-- removes EXACT duplicates. If two DIFFERENT members ever shared a seat (a real
-- conflict), this leaves them BOTH and the unique index below fails loudly — we
-- never silently pick who rode. (Local had 0 dups → no-op there.)
DELETE FROM apparatus_assignments a USING apparatus_assignments b
 WHERE a.department_id = b.department_id AND a.date = b.date
   AND a.apparatus_id = b.apparatus_id AND a.position_name = b.position_name
   AND a.member_id = b.member_id AND a.id > b.id;

-- ── 3. race-proof seat integrity (prevents the double-write recurring) ───────
-- With this in place, no writer on any path (assignments POST, importer, a
-- manual write) can create a second row for the same seat/day — the exact
-- failure that produced the 9 dups above. The app-layer writers additionally
-- use ON CONFLICT DO UPDATE so a re-submit updates in place instead of erroring.
CREATE UNIQUE INDEX IF NOT EXISTS uq_apparatus_assignments_seat
  ON apparatus_assignments (department_id, date, apparatus_id, position_name);

-- read path: the riding board for a (department, date)
CREATE INDEX IF NOT EXISTS idx_app_assign_dept_date
  ON apparatus_assignments (department_id, date);
