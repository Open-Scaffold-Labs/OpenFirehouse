-- 0091-fi-permits-status-default.sql
--
-- Phase 3, module 3.0k. One line, and it exists because 3.0's own audit caught it.
--
-- WHY
-- Module 3.0 found TWO disagreeing defaults for fi_permits.status — routes/fiPermits.js
-- sent 'Pending' while db.js fiPermCreate fell back to 'Active', so the answer depended
-- on which caller you came through. Both were reconciled to 'Pending' in 986b624, and
-- db.js's CREATE TABLE was updated so FRESH installs default 'Pending' too.
--
-- But `CREATE TABLE IF NOT EXISTS` cannot alter a table that already exists. So prod's
-- column default stayed 'Active' while fresh installs now say 'Pending' — the very
-- disagreement 3.0 set out to cure, re-created one layer down. Post-deploy verification
-- caught it (information_schema.columns.column_default = 'Active'::text on prod).
--
-- 'Pending' is correct: a permit RECORD that has been created has not been ISSUED. The
-- market lifecycle gates issuance behind payment / contractor licence / inspection
-- (spec R3), so a row that appears with no one having issued anything must not read as
-- a live permit. Defaulting to 'Active' means a raw INSERT that omits status silently
-- produces a valid-looking permit.
--
-- NO LIVE RISK EITHER WAY: every application write supplies a status explicitly
-- (fiPermCreate passes `data.status || DEFAULT_PERMIT_STATUS`). This column default only
-- applies to a direct INSERT that omits the column — a fixture, a manual query, a future
-- import path. It is defense in depth, not a bug fix, and it is being applied because a
-- silent disagreement between prod and a fresh install is exactly the class of drift
-- this module exists to end.
--
-- Existing rows are NOT touched. A column default applies only to future inserts; the
-- four permits on prod keep their recorded values verbatim (3 'Active', 1 'Expired'),
-- as they should — this is not a data migration and must not become one.
--
-- Numbering: 0091 is inside Phase 3's block (0090–0099, §5b parallel protocol), so there
-- is no collision surface with the concurrent Phase 2 session (0083–0089).
--
-- Applied to prod: 2026-07-26. Verified by reading column_default back.

BEGIN;

ALTER TABLE public.fi_permits
  ALTER COLUMN status SET DEFAULT 'Pending';

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0091-fi-permits-status-default.sql')
ON CONFLICT DO NOTHING;

COMMIT;
