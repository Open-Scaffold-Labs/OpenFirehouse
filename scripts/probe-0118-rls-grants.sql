-- probe-0118-rls-grants.sql
--
-- The role-scoped half of 0118's verification: RLS isolation and the physical grant guard,
-- run as `of_app` (the role the application actually connects as). The CHECK/trigger probes in
-- probe-0118-fee-schedules.sql run as the OWNER, which BYPASSES grants and RLS — so they
-- cannot see any of this. Two files, two threat models, and neither substitutes for the other.
--
-- Covers spec §9 probes (a) wrong-dept RLS read as of_app returns 0 rows and (b) physical guard
-- returns 42501, plus §8 F13 (cross-tenant) and F14 (separation of duties at the schema layer).
--
-- Rolls back. Safe on any database.
--   psql "$DATABASE_URL" -f scripts/probe-0118-rls-grants.sql

\set ON_ERROR_STOP on

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
    RAISE NOTICE 'PASS  % — refused with %', label, got;
  ELSE
    RAISE WARNING 'FAIL  % — refused with % (wanted %): %', label, got, want_sqlstate, msg;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Seed one schedule in dept 1 and one in dept 2, as the owner.
DO $seed$
DECLARE s1 INT; s2 INT; v1 INT;
BEGIN
  INSERT INTO fi_fee_schedules (department_id, name) VALUES (1, '__rls dept1') RETURNING id INTO s1;
  INSERT INTO fi_fee_schedules (department_id, name) VALUES (2, '__rls dept2') RETURNING id INTO s2;
  INSERT INTO fi_fee_schedule_versions
    (department_id, schedule_id, version, status, effective_from, effective_to,
     adopting_instrument, adopting_instrument_ref, adopted_by, adopted_on)
    VALUES (1, s1, 1, 'Adopted', DATE '2026-01-01', DATE '2026-12-31', 'ordinance',
            'Ord. 2026-01', 'Board', DATE '2025-12-01') RETURNING id INTO v1;
  INSERT INTO fi_fee_items (department_id, version_id, code, name, kind, flat_amount)
    VALUES (1, v1, 'RLS-1', 'x', 'flat', 100.00);
  CREATE TEMP TABLE rls_ids AS SELECT s1, s2, v1;
  -- of_app must be able to READ its own fixture ids after the role switch. Without this the
  -- grant section dies on `permission denied for table rls_ids` and reports nothing — the
  -- probe would fail for a reason that has nothing to do with what it is testing.
  GRANT SELECT ON rls_ids TO of_app;
  RAISE NOTICE '--- seeded: dept1 schedule=% dept2 schedule=% dept1 version=%', s1, s2, v1;
END $seed$;

SET LOCAL ROLE of_app;
SET LOCAL app.department_id = '1';

-- ── (a) RLS: dept 1's connection cannot see dept 2's rows ────────────────────────────────
DO $rls$
DECLARE mine INT; theirs INT; leaked INT;
BEGIN
  SELECT count(*) INTO mine   FROM fi_fee_schedules WHERE department_id = 1;
  SELECT count(*) INTO theirs FROM fi_fee_schedules WHERE department_id = 2;
  SELECT count(*) INTO leaked FROM fi_fee_schedules WHERE name = '__rls dept2';

  IF mine >= 1 AND theirs = 0 AND leaked = 0 THEN
    RAISE NOTICE 'PASS  R1 dept_isolation on fi_fee_schedules — own rows visible (%), other dept 0', mine;
  ELSE
    RAISE WARNING 'FAIL  R1 dept_isolation LEAKED — own=% other=% by-name=%', mine, theirs, leaked;
  END IF;
END $rls$;

DO $rls2$
DECLARE t TEXT; n INT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fi_fee_schedules','fi_fee_schedule_versions','fi_fee_items',
                           'fi_fee_item_tiers','fi_fee_item_modifiers','fi_fee_assessments'] LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE department_id <> 1', t) INTO n;
    IF n = 0 THEN
      RAISE NOTICE 'PASS  R2/%  — no foreign-department rows readable', t;
    ELSE
      RAISE WARNING 'FAIL  R2/%  — % foreign-department rows readable', t, n;
    END IF;
  END LOOP;
END $rls2$;

-- ── (b) The physical grant guard: 42501 (insufficient_privilege) ─────────────────────────
DO $grants$
DECLARE ids RECORD;
BEGIN
  SELECT * INTO ids FROM rls_ids;

  -- No DELETE anywhere on the money records. Retain, never delete.
  PERFORM pg_temp.probe('P1 of_app DELETE on fi_fee_assessments',
    'DELETE FROM fi_fee_assessments WHERE id = -1', '42501');
  PERFORM pg_temp.probe('P2 of_app DELETE on fi_fee_schedule_versions',
    format('DELETE FROM fi_fee_schedule_versions WHERE id = %s', ids.v1), '42501');
  PERFORM pg_temp.probe('P3 of_app DELETE on fi_fee_schedules',
    format('DELETE FROM fi_fee_schedules WHERE id = %s', ids.s1), '42501');
  PERFORM pg_temp.probe('P4 of_app TRUNCATE fi_fee_items',
    'TRUNCATE fi_fee_items', '42501');

  -- Column-scoped UPDATE: the computation is not a grantable column.
  PERFORM pg_temp.probe('P5 of_app UPDATE fi_fee_assessments.computed_amount (not granted)',
    'UPDATE fi_fee_assessments SET computed_amount = 1 WHERE id = -1', '42501');
  PERFORM pg_temp.probe('P6 of_app UPDATE fi_fee_assessments.inputs (not granted)',
    'UPDATE fi_fee_assessments SET inputs = ''{}''::jsonb WHERE id = -1', '42501');
  PERFORM pg_temp.probe('P7 of_app UPDATE fi_fee_assessments.schedule_version_id (not granted)',
    'UPDATE fi_fee_assessments SET schedule_version_id = 1 WHERE id = -1', '42501');
  PERFORM pg_temp.probe('P8 of_app UPDATE fi_fee_schedules.department_id (tenant re-parenting)',
    format('UPDATE fi_fee_schedules SET department_id = 2 WHERE id = %s', ids.s1), '42501');
  PERFORM pg_temp.probe('P9 of_app UPDATE fi_fee_schedule_versions.version (not granted)',
    format('UPDATE fi_fee_schedule_versions SET version = 99 WHERE id = %s', ids.v1), '42501');
END $grants$;

RESET ROLE;

-- ── anon / authenticated hold nothing; service_role is REPORTED, not asserted ────────────
--
-- 🔴 THIS SECTION ORIGINALLY ASSERTED "anon, authenticated AND service_role hold ZERO
-- privileges" AND PASSED ON LOCAL WHILE BEING FALSE ON PROD. That false pass is the lesson.
-- A local Postgres has no Supabase `ALTER DEFAULT PRIVILEGES` configured, so those roles are
-- never granted anything there and the assertion is vacuously true. On prod, Supabase's schema
-- default privileges grant every NEW table to service_role automatically — measured 2026-08-04
-- on the six fi_fee_* tables: SELECT, INSERT, REFERENCES, TRIGGER (the migration's REVOKE did
-- strip UPDATE, DELETE and TRUNCATE).
--
-- So: a grant probe run ONLY against local cannot detect the grant class that actually exists.
-- Run this file against prod too, and read section X as an observation to compare against the
-- rest of the schema — not as a gate that local can satisfy.
--
-- Context measured on prod the same day, so the number is not read as a regression: 0118's
-- tables are the STRICTEST of any comparable table. fi_permit_notices and fi_permits also give
-- service_role UPDATE; fi_inspections and fi_violations also give DELETE, UPDATE and TRUNCATE;
-- cad_ingest_log — the "append-only, archive forever" CAD receipt log — also gives TRUNCATE.
-- service_role is rolbypassrls = true and rolcanlogin = false: it cannot connect over Postgres,
-- and it is only reachable through the Data API with the service_role key.
DO $anon$
DECLARE n INT; sr TEXT;
BEGIN
  -- These two ARE hard assertions. They are true on local and on prod.
  SELECT count(*) INTO n FROM information_schema.table_privileges
   WHERE table_name LIKE 'fi_fee%' AND grantee IN ('anon','authenticated');
  IF n = 0 THEN
    RAISE NOTICE 'PASS  X1 anon/authenticated hold ZERO table privileges on fi_fee_*';
  ELSE
    RAISE WARNING 'FAIL  X1 % table privileges held by anon/authenticated', n;
  END IF;

  SELECT count(*) INTO n FROM information_schema.column_privileges
   WHERE table_name LIKE 'fi_fee%' AND grantee IN ('anon','authenticated');
  IF n = 0 THEN
    RAISE NOTICE 'PASS  X2 anon/authenticated hold ZERO column privileges on fi_fee_*';
  ELSE
    RAISE WARNING 'FAIL  X2 % column privileges held by anon/authenticated', n;
  END IF;

  -- The write verbs are the ones the migration explicitly revokes, so THESE are assertable
  -- against service_role on any database.
  SELECT count(*) INTO n FROM information_schema.table_privileges
   WHERE table_name LIKE 'fi_fee%' AND grantee = 'service_role'
     AND privilege_type IN ('UPDATE','DELETE','TRUNCATE');
  IF n = 0 THEN
    RAISE NOTICE 'PASS  X3 service_role holds no UPDATE/DELETE/TRUNCATE on fi_fee_*';
  ELSE
    RAISE WARNING 'FAIL  X3 service_role still holds % UPDATE/DELETE/TRUNCATE grants on fi_fee_*', n;
  END IF;

  -- Reported, not gated: what Supabase's defaults left behind.
  SELECT coalesce(string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type), '(none)')
    INTO sr FROM information_schema.table_privileges
   WHERE table_name LIKE 'fi_fee%' AND grantee = 'service_role';
  RAISE NOTICE 'INFO  X4 service_role residual grants on fi_fee_* (Supabase schema defaults): %', sr;
END $anon$;

ROLLBACK;
