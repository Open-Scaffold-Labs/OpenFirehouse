-- 0055-fi-drop-violation-severity.sql — 2026-07-14
--
-- Drop fi_violations.severity. The field was INVENTED and never should have shipped.
--
-- WHY (Matt, a working fire inspector): "we dont have a severity button or label....
-- imminenthazard handles this on its own." Fire inspection does not grade violations
-- Low/Moderate/High. A condition is either an IMMINENT HAZARD or an ordinary violation
-- with a correct-by date. `imminent_hazard` is the real, code-grounded flag and already
-- does this job.
--
-- WHY IT MATTERED (not cosmetic): the value PRINTED ON THE SERVED NOTICE, and the picker
-- DEFAULTED to 'Moderate'. An inspector who never touched the field still had a grading
-- attributed to him on the legal instrument handed to the property owner — the record
-- saying something the officer never said.
--
-- WHY DROP RATHER THAN RETIRE: normally a column on a legal-record table is retired,
-- never dropped. That doctrine protects REAL records. OF has not yet performed a single
-- real inspection — every fi_violations row is pre-launch test data (verified live before
-- this ran: 6 rows, severity NULL on every one). This is the only window in which the
-- column is free to remove; after the first real department cites the first real
-- violation, it would be permanent. Taken deliberately, with Matt's explicit approval.
--
-- SEQUENCING (load-bearing): the application code that named this column
-- (utils/fiViolationSync.js INSERT + ON CONFLICT, routes/fiReports.js SELECT) MUST be
-- deployed BEFORE this runs. Otherwise every violation write 500s on an unknown column.
-- Code shipped first; this follows.
--
-- Mirrored into server/src/db.js (the column is simply absent from the fresh-install
-- CREATE TABLE) so a new install builds the same schema.

ALTER TABLE fi_violations DROP COLUMN IF EXISTS severity;

INSERT INTO of_schema_migrations (version, name)
VALUES ('0055', 'fi-drop-violation-severity')
ON CONFLICT (version) DO NOTHING;
