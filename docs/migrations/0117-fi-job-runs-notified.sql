-- 0117-fi-job-runs-notified.sql
--
-- Phase 3, module 3.1b — the notice count on the run ledger.
-- Spec: docs/PHASE3-31B-CATALOGUE-EXPIRY-RENEWAL-SPEC-2026-07-27.md §3.5, §3.6
--
-- Claimed by stub 2026-08-02 (pushed, e893c39). Block 0110–0119. Head verified at 0116.
--
-- 0095's header states why the counts on this table are COLUMNS and not a JSON blob: the
-- number that matters must be queryable, not buried. `notified` is the same class of number.
-- A run that transitioned 12 permits and notified 0 of them is a broken run that otherwise
-- looks completely healthy — every existing counter would read normal, and the failure would
-- be invisible until a business owner rang up asking why nobody told them.
--
-- This is the counter the 08-01 handoff's own process note warns about: "read the output of
-- the fix you just ran — two systems were reporting their own failure in a counter nobody
-- read (skipped_no_terms, verify_failed)." So it is added as a first-class column and the
-- monitor renders it.
--
-- ADDITIVE. One column with a DEFAULT, on a table whose existing rows are all historical
-- runs that genuinely notified nobody, because notices did not exist yet. 0 is therefore the
-- truthful backfill value, not merely a convenient one.
--
-- ⚠ fi_job_runs is physically append-only (0095 REVOKEs UPDATE/DELETE). ADD COLUMN is DDL,
-- not DML, so it is unaffected by those grants — the ledger's immutability is preserved.

BEGIN;

ALTER TABLE fi_job_runs ADD COLUMN IF NOT EXISTS notified INTEGER NOT NULL DEFAULT 0;

INSERT INTO of_schema_migrations (filename) VALUES ('0117-fi-job-runs-notified.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
