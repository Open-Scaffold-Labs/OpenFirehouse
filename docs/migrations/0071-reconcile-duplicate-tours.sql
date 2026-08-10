-- 0071 — 1.1c-c: reconcile duplicate tours into one row per (dept, date, member).
-- Closes the 1.1c-b residual on seed data: the run-list seed and the daily_staffing seed
-- independently placed some members on DIFFERENT seats for the same date, so after the
-- 0070 fold a member can have BOTH a pure seat row (hours NULL) AND a folded hours row.
-- The market model is ONE row per member-tour carrying seat + hours. This moves the folded
-- hours onto the member's primary seat row and deletes the redundant folded row(s).
--
-- SAFE by construction: only touches (dept,date,member) sets that have BOTH a NULL-hours row
-- and a non-NULL-hours row. A genuine multi-rig day is TWO hours rows (no NULL-hours row) and
-- is NEVER matched. Per-member total hours are PRESERVED (moved + summed, never duplicated).
-- Data-only reconciliation (no schema change). D6: applied to prod by hand, verified by query.

BEGIN;

CREATE TEMP TABLE _dup_recon ON COMMIT DROP AS
  SELECT department_id, date, member_id
  FROM apparatus_assignments
  GROUP BY department_id, date, member_id
  HAVING COUNT(*) FILTER (WHERE hours IS NULL) > 0
     AND COUNT(*) FILTER (WHERE hours IS NOT NULL) > 0;

-- The target seat row per dup: prefer a real structured seat (position_id set), else lowest id.
CREATE TEMP TABLE _target ON COMMIT DROP AS
  SELECT DISTINCT ON (aa.department_id, aa.date, aa.member_id)
         aa.id AS seat_id, aa.department_id, aa.date, aa.member_id
  FROM apparatus_assignments aa
  JOIN _dup_recon d USING (department_id, date, member_id)
  WHERE aa.hours IS NULL
  ORDER BY aa.department_id, aa.date, aa.member_id, (aa.position_id IS NOT NULL) DESC, aa.id;

-- The member's folded hours for the day (summed across any folded rows) + representative tour.
CREATE TEMP TABLE _src ON COMMIT DROP AS
  SELECT aa.department_id, aa.date, aa.member_id,
         SUM(aa.hours) AS hours, MIN(aa.start_time) AS start_time, MAX(aa.end_time) AS end_time
  FROM apparatus_assignments aa
  JOIN _dup_recon d USING (department_id, date, member_id)
  WHERE aa.hours IS NOT NULL
  GROUP BY aa.department_id, aa.date, aa.member_id;

-- Ids of the folded hours rows to remove (every non-NULL-hours row in the dup set).
CREATE TEMP TABLE _del ON COMMIT DROP AS
  SELECT aa.id
  FROM apparatus_assignments aa
  JOIN _dup_recon d USING (department_id, date, member_id)
  WHERE aa.hours IS NOT NULL;

-- Move the hours onto the target seat row.
UPDATE apparatus_assignments a
SET hours = s.hours, start_time = s.start_time, end_time = s.end_time, status = 'on_duty'
FROM _target t
JOIN _src s USING (department_id, date, member_id)
WHERE a.id = t.seat_id;

-- Delete the now-redundant folded hours rows.
DELETE FROM apparatus_assignments WHERE id IN (SELECT id FROM _del);

INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0071-reconcile-duplicate-tours.sql', NOW());

COMMIT;
