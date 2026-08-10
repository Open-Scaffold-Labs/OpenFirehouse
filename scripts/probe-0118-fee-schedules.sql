-- probe-0118-fee-schedules.sql
--
-- Adversarial probes for migration 0118 (Phase 3 module 3.2 Slice A). Every probe is a
-- statement that COULD fail — that is the whole point. A probe that cannot fail verifies
-- nothing (the 401-on-a-locked-door lesson, OF CLAUDE.md "Verifying the fix").
--
-- Maps to spec §8: F5 (in-place edit of a money record), F6 (exact match not pattern),
-- F8 (silent proration/override), F9 (fee math drift), F11 (void/waiver attribution),
-- F14 (separation of duties at the schema, not the route), F18 (zero-fee first class).
--
-- Runs entirely inside a transaction and ROLLS BACK. Safe against any database, including
-- prod. Every probe prints PASS or FAIL with the sqlstate it actually got.
--
--   psql "$DATABASE_URL" -f scripts/probe-0118-fee-schedules.sql

\set ON_ERROR_STOP on
\timing off

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.probe(label TEXT, stmt TEXT, want_sqlstate TEXT)
RETURNS VOID AS $$
DECLARE got TEXT; msg TEXT;
BEGIN
  BEGIN
    EXECUTE stmt;
    RAISE WARNING 'FAIL  % — statement SUCCEEDED; expected sqlstate %', label, want_sqlstate;
    RETURN;
  EXCEPTION WHEN OTHERS THEN
    got := SQLSTATE; msg := SQLERRM;
  END;
  IF got = want_sqlstate THEN
    RAISE NOTICE 'PASS  % — refused with % ', label, got;
  ELSE
    RAISE WARNING 'FAIL  % — refused with % (wanted %): %', label, got, want_sqlstate, msg;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.probe_ok(label TEXT, stmt TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE stmt;
  RAISE NOTICE 'PASS  % — allowed, as designed', label;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAIL  % — should have been ALLOWED but got %: %', label, SQLSTATE, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ── Fixtures ─────────────────────────────────────────────────────────────────────────────
-- Department 1. A real permit id is looked up rather than assumed; if none exists the
-- assessment probes are SKIPPED loudly rather than silently passing on absent data.
DO $fix$
DECLARE sched_id INT; draft_id INT; adopted_id INT; item_id INT; permit_id INT; assess_id INT;
BEGIN
  INSERT INTO fi_fee_schedules (department_id, name)
    VALUES (1, '__probe schedule 0118') RETURNING id INTO sched_id;

  -- A Draft version: fee lines must be editable here.
  INSERT INTO fi_fee_schedule_versions (department_id, schedule_id, version, status, effective_from)
    VALUES (1, sched_id, 1, 'Draft', DATE '2026-01-01') RETURNING id INTO draft_id;

  -- An Adopted version: fee lines must be FROZEN here. effective_to set so it is not the
  -- open version (the partial unique index allows only one open per schedule).
  INSERT INTO fi_fee_schedule_versions
    (department_id, schedule_id, version, status, effective_from, effective_to,
     adopting_instrument, adopting_instrument_ref, adopted_by, adopted_on)
    VALUES (1, sched_id, 2, 'Adopted', DATE '2026-02-01', DATE '2026-12-31',
            'ordinance_exhibit', 'Ord. 2026-04, Exhibit A', 'Board of Fire Commissioners',
            DATE '2026-01-15')
    RETURNING id INTO adopted_id;

  INSERT INTO fi_fee_items (department_id, version_id, code, name, kind, flat_amount)
    VALUES (1, adopted_id, 'OP-BASE', 'Operational permit base', 'flat', 150.00)
    RETURNING id INTO item_id;

  SELECT id INTO permit_id FROM fi_permits
    WHERE department_id = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1;

  IF permit_id IS NOT NULL THEN
    INSERT INTO fi_fee_assessments
      (department_id, permit_id, schedule_version_id, vesting_date,
       inputs, computed_amount, computed_breakdown)
      VALUES (1, permit_id, adopted_id, DATE '2026-03-01',
              '{"square_footage": 4200}'::jsonb, 150.00,
              '[{"code":"OP-BASE","kind":"flat","amount":150.00}]'::jsonb)
      RETURNING id INTO assess_id;
  END IF;

  CREATE TEMP TABLE probe_ids AS SELECT sched_id, draft_id, adopted_id, item_id, permit_id, assess_id;
  RAISE NOTICE '--- fixtures: schedule=% draft=% adopted=% item=% permit=% assessment=%',
    sched_id, draft_id, adopted_id, item_id, permit_id, assess_id;
  IF permit_id IS NULL THEN
    RAISE WARNING 'SKIP  assessment probes — no fi_permits row for department 1 on this database';
  END IF;
END $fix$;

-- ── A. Adopted fee terms are frozen (F5 / F14 / the §1.9 rate-table finding) ─────────────
DO $a$
DECLARE ids RECORD;
BEGIN
  SELECT * INTO ids FROM probe_ids;

  PERFORM pg_temp.probe('A1 edit fee amount on an ADOPTED version',
    format('UPDATE fi_fee_items SET flat_amount = 999.00 WHERE id = %s', ids.item_id), 'P0001');

  PERFORM pg_temp.probe('A2 delete a fee line from an ADOPTED version',
    format('DELETE FROM fi_fee_items WHERE id = %s', ids.item_id), 'P0001');

  PERFORM pg_temp.probe('A3 move effective_from of an ADOPTED version',
    format('UPDATE fi_fee_schedule_versions SET effective_from = DATE ''2020-01-01'' WHERE id = %s',
           ids.adopted_id), 'P0001');

  PERFORM pg_temp.probe('A4 rewrite the adopting instrument after adoption',
    format('UPDATE fi_fee_schedule_versions SET adopting_instrument_ref = ''Ord. 1999-01'' WHERE id = %s',
           ids.adopted_id), 'P0001');

  PERFORM pg_temp.probe('A5 change the penalty multiplier after adoption',
    format('UPDATE fi_fee_schedule_versions SET penalty_multiplier = 4.00 WHERE id = %s',
           ids.adopted_id), 'P0001');

  PERFORM pg_temp.probe('A6 return an adopted version to Draft',
    format('UPDATE fi_fee_schedule_versions SET status = ''Draft'' WHERE id = %s',
           ids.adopted_id), 'P0001');

  -- The seam that must WORK: superseding an adopted version.
  PERFORM pg_temp.probe_ok('A7 supersede an adopted version (the allowed move)',
    format('UPDATE fi_fee_schedule_versions SET status = ''Superseded'' WHERE id = %s',
           ids.adopted_id));

  -- And a DRAFT must remain editable, or a department cannot author a schedule at all.
  PERFORM pg_temp.probe_ok('A8 edit a fee line on a DRAFT version',
    format('INSERT INTO fi_fee_items (department_id, version_id, code, name, kind, flat_amount) '
        || 'VALUES (1, %s, ''DRAFT-1'', ''draft line'', ''flat'', 10.00)', ids.draft_id));
END $a$;

-- ── B. Adoption cannot be anonymous (the seven-year-old board action) ────────────────────
DO $b$
DECLARE ids RECORD;
BEGIN
  SELECT * INTO ids FROM probe_ids;

  PERFORM pg_temp.probe('B1 adopt a version with no adopting instrument',
    format('INSERT INTO fi_fee_schedule_versions (department_id, schedule_id, version, status, effective_from) '
        || 'VALUES (1, %s, 90, ''Adopted'', DATE ''2026-05-01'')', ids.sched_id), '23514');

  PERFORM pg_temp.probe('B2 adopt with an instrument but no adopting body',
    format('INSERT INTO fi_fee_schedule_versions (department_id, schedule_id, version, status, '
        || 'effective_from, adopting_instrument, adopting_instrument_ref, adopted_on) '
        || 'VALUES (1, %s, 91, ''Adopted'', DATE ''2026-05-01'', ''ordinance'', ''Ord. 1'', DATE ''2026-04-01'')',
           ids.sched_id), '23514');

  PERFORM pg_temp.probe('B3 unrecognised adopting instrument form',
    format('INSERT INTO fi_fee_schedule_versions (department_id, schedule_id, version, status, '
        || 'effective_from, adopting_instrument, adopting_instrument_ref, adopted_by, adopted_on) '
        || 'VALUES (1, %s, 92, ''Adopted'', DATE ''2026-05-01'', ''verbal_agreement'', ''x'', ''y'', DATE ''2026-04-01'')',
           ids.sched_id), '23514');

  PERFORM pg_temp.probe('B4 penalty multiplier above the observed band (4.0 ceiling)',
    format('INSERT INTO fi_fee_schedule_versions (department_id, schedule_id, version, status, '
        || 'effective_from, penalty_multiplier) VALUES (1, %s, 93, ''Draft'', DATE ''2026-05-01'', 5.00)',
           ids.sched_id), '23514');

  PERFORM pg_temp.probe('B5 penalty multiplier below the observed band (1.5 floor)',
    format('INSERT INTO fi_fee_schedule_versions (department_id, schedule_id, version, status, '
        || 'effective_from, penalty_multiplier) VALUES (1, %s, 94, ''Draft'', DATE ''2026-05-01'', 1.00)',
           ids.sched_id), '23514');

  PERFORM pg_temp.probe('B6 a second OPEN version on one schedule (ambiguous "which fee applied")',
    format('INSERT INTO fi_fee_schedule_versions (department_id, schedule_id, version, status, '
        || 'effective_from, effective_to) VALUES (1, %s, 95, ''Draft'', DATE ''2026-06-01'', NULL)',
           ids.sched_id), '23505');
END $b$;

-- ── C. A primitive missing its parameter (the "$0 fee" defect, F9) ──────────────────────
DO $c$
DECLARE ids RECORD;
BEGIN
  SELECT * INTO ids FROM probe_ids;

  PERFORM pg_temp.probe('C1 flat item with no amount',
    format('INSERT INTO fi_fee_items (department_id, version_id, code, name, kind) '
        || 'VALUES (1, %s, ''C1'', ''x'', ''flat'')', ids.draft_id), '23514');

  PERFORM pg_temp.probe('C2 hourly item with no rate',
    format('INSERT INTO fi_fee_items (department_id, version_id, code, name, kind) '
        || 'VALUES (1, %s, ''C2'', ''x'', ''hourly'')', ids.draft_id), '23514');

  PERFORM pg_temp.probe('C3 percent_of item with no base item',
    format('INSERT INTO fi_fee_items (department_id, version_id, code, name, kind, percent_rate) '
        || 'VALUES (1, %s, ''C3'', ''x'', ''percent_of'', 25.0)', ids.draft_id), '23514');

  PERFORM pg_temp.probe('C4 tiered item with no tiering axis',
    format('INSERT INTO fi_fee_items (department_id, version_id, code, name, kind) '
        || 'VALUES (1, %s, ''C4'', ''x'', ''tiered'')', ids.draft_id), '23514');

  PERFORM pg_temp.probe('C5 unrecognised tiering axis (the silent-$0 axis, F9)',
    format('INSERT INTO fi_fee_items (department_id, version_id, code, name, kind, input_variable) '
        || 'VALUES (1, %s, ''C5'', ''x'', ''tiered'', ''number_of_dogs'')', ids.draft_id), '23514');

  PERFORM pg_temp.probe('C6 a surcharge that surcharges itself',
    format('INSERT INTO fi_fee_items (department_id, version_id, code, name, kind, percent_rate, surchargeable) '
        || 'VALUES (1, %s, ''C6'', ''x'', ''surcharge'', 3.0, TRUE)', ids.draft_id), '23514');

  PERFORM pg_temp.probe('C7 duplicate fee code within one version',
    format('INSERT INTO fi_fee_items (department_id, version_id, code, name, kind, flat_amount) '
        || 'VALUES (1, %s, ''DRAFT-1'', ''dupe'', ''flat'', 1.00)', ids.draft_id), '23505');

  PERFORM pg_temp.probe('C8 negative fee amount',
    format('INSERT INTO fi_fee_items (department_id, version_id, code, name, kind, flat_amount) '
        || 'VALUES (1, %s, ''C8'', ''x'', ''flat'', -5.00)', ids.draft_id), '23514');

  PERFORM pg_temp.probe('C9 max below min',
    format('INSERT INTO fi_fee_items (department_id, version_id, code, name, kind, flat_amount, '
        || 'min_amount, max_amount) VALUES (1, %s, ''C9'', ''x'', ''flat'', 50.00, 100.00, 20.00)',
           ids.draft_id), '23514');

  -- The chaining shapes that must WORK — §1.7's three documented chains depend on them.
  PERFORM pg_temp.probe_ok('C10 valuation item keyed on an application variable',
    format('INSERT INTO fi_fee_items (department_id, version_id, code, name, kind, input_variable) '
        || 'VALUES (1, %s, ''C10'', ''valuation'', ''valuation'', ''construction_valuation'')', ids.draft_id));

  PERFORM pg_temp.probe_ok('C11 percent_of chained onto that item (25% of the building fee)',
    format('INSERT INTO fi_fee_items (department_id, version_id, code, name, kind, percent_rate, input_item_id) '
        || 'SELECT 1, %s, ''C11'', ''25%% of C10'', ''percent_of'', 25.0, id FROM fi_fee_items '
        || 'WHERE version_id = %s AND code = ''C10''', ids.draft_id, ids.draft_id));

  PERFORM pg_temp.probe_ok('C12 hourly carrying BOTH a multiplier and a minimum-hours floor',
    format('INSERT INTO fi_fee_items (department_id, version_id, code, name, kind, hourly_rate, '
        || 'minimum_hours, rounding_increment_hours, rounding_mode, after_hours_multiplier) '
        || 'VALUES (1, %s, ''C12'', ''after-hours inspection'', ''hourly'', 200.00, 3.00, 0.25, '
        || '''up_any_part'', 1.50)', ids.draft_id));
END $c$;

-- ── D. Self-reference (the trivial cycle the DB owns; longer cycles are the engine's) ────
DO $d$
DECLARE ids RECORD; new_id INT;
BEGIN
  SELECT * INTO ids FROM probe_ids;
  SELECT id INTO new_id FROM fi_fee_items WHERE version_id = ids.draft_id AND code = 'C10';
  PERFORM pg_temp.probe('D1 an item consuming its own output',
    format('UPDATE fi_fee_items SET input_item_id = %s WHERE id = %s', new_id, new_id), '23514');
END $d$;

-- ── E. Tier rows ─────────────────────────────────────────────────────────────────────────
DO $e$
DECLARE ids RECORD; tiered_id INT;
BEGIN
  SELECT * INTO ids FROM probe_ids;
  INSERT INTO fi_fee_items (department_id, version_id, code, name, kind, input_variable, tier_axis_2)
    VALUES (1, ids.draft_id, 'E-MATRIX', 'occupancy x sq ft', 'tiered', 'square_footage', 'occupancy_group')
    RETURNING id INTO tiered_id;

  PERFORM pg_temp.probe('E1 a tier row claiming both a range and an exact value on one axis',
    format('INSERT INTO fi_fee_item_tiers (department_id, item_id, axis1_min, axis1_max, axis1_match, amount) '
        || 'VALUES (1, %s, 0, 5000, ''A-2'', 100.00)', tiered_id), '23514');

  PERFORM pg_temp.probe('E2 an inverted tier range',
    format('INSERT INTO fi_fee_item_tiers (department_id, item_id, axis1_min, axis1_max, amount) '
        || 'VALUES (1, %s, 5000, 1000, 100.00)', tiered_id), '23514');

  PERFORM pg_temp.probe('E3 a per-unit rate with no unit size (an undefined rate)',
    format('INSERT INTO fi_fee_item_tiers (department_id, item_id, axis1_min, axis1_max, amount, per_unit) '
        || 'VALUES (1, %s, 0, 5000, 100.00, 10.00)', tiered_id), '23514');

  PERFORM pg_temp.probe_ok('E4 a true 2-D matrix row (occupancy group x sq ft)',
    format('INSERT INTO fi_fee_item_tiers (department_id, item_id, axis1_min, axis1_max, axis2_match, '
        || 'amount, per_unit, unit_size) VALUES (1, %s, 0, 5000, ''A-2'', 250.00, 15.00, 1000)', tiered_id));

  PERFORM pg_temp.probe('E5 a modifier declaring "per unit" with no variable',
    format('INSERT INTO fi_fee_item_modifiers (department_id, item_id, seq, kind, value) '
        || 'VALUES (1, %s, 1, ''per_unit_add'', 10.00)', tiered_id), '23514');

  PERFORM pg_temp.probe_ok('E6 the documented "+50%% then +$10 per bed" modifier chain',
    format('INSERT INTO fi_fee_item_modifiers (department_id, item_id, seq, kind, value, per_unit_variable, unit_size) '
        || 'VALUES (1, %s, 1, ''percent_add'', 50.0, NULL, NULL), '
        || '       (1, %s, 2, ''per_unit_add'', 10.00, ''licensed_beds'', 1)', tiered_id, tiered_id));

  PERFORM pg_temp.probe('E7 two modifiers claiming the same sequence position',
    format('INSERT INTO fi_fee_item_modifiers (department_id, item_id, seq, kind, value) '
        || 'VALUES (1, %s, 1, ''amount_add'', 5.00)', tiered_id), '23505');
END $e$;

-- ── F. Assessments: the computation is a fact; the commit happens once ──────────────────
DO $f$
DECLARE ids RECORD;
BEGIN
  SELECT * INTO ids FROM probe_ids;
  IF ids.assess_id IS NULL THEN
    RAISE WARNING 'SKIP  section F — no assessment fixture (no permit row for department 1)';
    RETURN;
  END IF;

  PERFORM pg_temp.probe('F1 rewrite the computed amount in place',
    format('UPDATE fi_fee_assessments SET computed_amount = 10.00 WHERE id = %s', ids.assess_id), 'P0001');

  PERFORM pg_temp.probe('F2 rewrite the inputs the computation was based on',
    format('UPDATE fi_fee_assessments SET inputs = ''{}''::jsonb WHERE id = %s', ids.assess_id), 'P0001');

  PERFORM pg_temp.probe('F3 re-point an assessment at a different schedule version',
    format('UPDATE fi_fee_assessments SET schedule_version_id = %s WHERE id = %s',
           ids.draft_id, ids.assess_id), 'P0001');

  PERFORM pg_temp.probe('F4 commit a DIFFERENT amount with no written reason',
    format('UPDATE fi_fee_assessments SET committed_amount = 75.00, committed_at = NOW(), '
        || 'committed_by_user_id = 1 WHERE id = %s', ids.assess_id), '23514');

  PERFORM pg_temp.probe('F5 commit with a whitespace-only reason',
    format('UPDATE fi_fee_assessments SET committed_amount = 75.00, committed_at = NOW(), '
        || 'committed_by_user_id = 1, override_reason = ''   '' WHERE id = %s', ids.assess_id), '23514');

  PERFORM pg_temp.probe('F6 commit with no operator recorded',
    format('UPDATE fi_fee_assessments SET committed_amount = 150.00, committed_at = NOW() WHERE id = %s',
           ids.assess_id), '23514');

  PERFORM pg_temp.probe_ok('F7 a properly reasoned, attributed override',
    format('UPDATE fi_fee_assessments SET committed_amount = 75.00, committed_at = NOW(), '
        || 'committed_by_user_id = 1, override_reason = ''Board-approved 50%% hardship reduction, '
        || 'Res. 2026-11'' WHERE id = %s', ids.assess_id));

  PERFORM pg_temp.probe('F8 re-commit a committed assessment at a new amount',
    format('UPDATE fi_fee_assessments SET committed_amount = 500.00 WHERE id = %s', ids.assess_id), 'P0001');

  PERFORM pg_temp.probe('F9 a re-inspection fee with no attested reason (the §1.6 doctrine)',
    format('INSERT INTO fi_fee_assessments (department_id, permit_id, assessment_kind, '
        || 'schedule_version_id, vesting_date, computed_amount) '
        || 'VALUES (1, %s, ''reinspection'', %s, DATE ''2026-03-01'', 150.00)',
           ids.permit_id, ids.adopted_id), '23514');

  PERFORM pg_temp.probe('F10 a re-inspection fee with a reason but no attesting inspector',
    format('INSERT INTO fi_fee_assessments (department_id, permit_id, assessment_kind, reason_code, '
        || 'schedule_version_id, vesting_date, computed_amount) '
        || 'VALUES (1, %s, ''reinspection'', ''NOT_READY_CONTRACTOR_FAULT'', %s, DATE ''2026-03-01'', 150.00)',
           ids.permit_id, ids.adopted_id), '23514');

  PERFORM pg_temp.probe('F11 a waiver with no approver (auditors sample waivers first)',
    format('INSERT INTO fi_fee_assessments (department_id, permit_id, schedule_version_id, '
        || 'vesting_date, computed_amount, waiver_amount, waiver_reason) '
        || 'VALUES (1, %s, %s, DATE ''2026-03-01'', 150.00, 150.00, ''nonprofit'')',
           ids.permit_id, ids.adopted_id), '23514');

  PERFORM pg_temp.probe('F12 an assessment attached to neither a permit nor an inspection',
    format('INSERT INTO fi_fee_assessments (department_id, schedule_version_id, vesting_date, '
        || 'computed_amount) VALUES (1, %s, DATE ''2026-03-01'', 150.00)', ids.adopted_id), '23514');

  PERFORM pg_temp.probe('F13 an assessment attached to BOTH a permit and an inspection',
    format('INSERT INTO fi_fee_assessments (department_id, permit_id, inspection_id, '
        || 'schedule_version_id, vesting_date, computed_amount) '
        || 'SELECT 1, %s, id, %s, DATE ''2026-03-01'', 150.00 FROM fi_inspections LIMIT 1',
           ids.permit_id, ids.adopted_id), '23514');

  -- F18: a zero-fee assessment must be a real, findable row — not an absence.
  PERFORM pg_temp.probe_ok('F14 a ZERO-fee assessment is a first-class record (spec F18)',
    format('INSERT INTO fi_fee_assessments (department_id, permit_id, schedule_version_id, '
        || 'vesting_date, computed_amount, reason_code, reason_text, attested_by_user_id) '
        || 'VALUES (1, %s, %s, DATE ''2026-03-01'', 0.00, ''EXEMPT_MUNICIPAL'', '
        || '''City-owned occupancy, no fee per adopted schedule'', 1)',
           ids.permit_id, ids.adopted_id));
END $f$;

-- ── G. The 3.1b seam is now a real reference ─────────────────────────────────────────────
--
-- 🔴 THIS SECTION SHIPPED BROKEN ON ITS FIRST RUN (2026-08-04) AND HOW IT BROKE IS THE REASON
-- THE PROBE STYLE MATTERS. G1 was originally an UPDATE keyed on
-- `WHERE id = (SELECT id FROM fi_permit_types WHERE department_id = 1 ...)`. The local database
-- holds 33 permit types and ZERO in department 1, so the UPDATE matched no rows and returned
-- success — reported as a schema FAIL. The FK was fine all along
-- (fk_fi_permit_types_fee_schedule, contype 'f'); the PROBE was what could not fail.
-- A statement satisfiable by touching nothing verifies nothing. G1 is now an INSERT, which has
-- no zero-row escape, and G2 exercises the UPDATE path against a row the probe creates itself
-- rather than one it hopes is there.
DO $g$
DECLARE seeded_type_id INT;
BEGIN
  PERFORM pg_temp.probe('G1 CREATE a permit type pointing at a fee schedule that does not exist',
    'INSERT INTO fi_permit_types (department_id, code, name, fee_schedule_id) '
    || 'VALUES (1, ''__probe-G1'', ''probe'', 987654321)', '23503');

  INSERT INTO fi_permit_types (department_id, code, name)
    VALUES (1, '__probe-G2', 'probe') RETURNING id INTO seeded_type_id;

  PERFORM pg_temp.probe('G2 REPOINT an existing permit type at a nonexistent fee schedule',
    format('UPDATE fi_permit_types SET fee_schedule_id = 987654321 WHERE id = %s', seeded_type_id),
    '23503');

  PERFORM pg_temp.probe_ok('G3 point a permit type at a real fee schedule (the seam, working)',
    format('UPDATE fi_permit_types SET fee_schedule_id = (SELECT sched_id FROM probe_ids) '
        || 'WHERE id = %s', seeded_type_id));
END $g$;

-- ── H. Referenced rows cannot be deleted out from under a record ─────────────────────────
DO $h$
DECLARE ids RECORD;
BEGIN
  SELECT * INTO ids FROM probe_ids;
  PERFORM pg_temp.probe('H1 delete a schedule that a version hangs off',
    format('DELETE FROM fi_fee_schedules WHERE id = %s', ids.sched_id), '23503');
  IF ids.assess_id IS NOT NULL THEN
    PERFORM pg_temp.probe('H2 delete a version an assessment vested under',
      format('DELETE FROM fi_fee_schedule_versions WHERE id = %s', ids.adopted_id), '23503');
  END IF;
END $h$;

ROLLBACK;
