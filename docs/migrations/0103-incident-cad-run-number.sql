-- 0103-incident-cad-run-number.sql
-- Phase 4 · 4.1a-R.1 · 2026-07-26
-- Spec: docs/PHASE4-1aR-CALL-INCIDENT-ASSOCIATION-2026-07-26.md §4.1a-R.1
--
-- WHY ─────────────────────────────────────────────────────────────────────────
-- THE RUN NUMBER IS THE LINK. Every surveyed platform keys the call -> incident
-- association on the CAD dispatch/run number. From a middleware vendor's
-- integration documentation, read in full: the decision to create a report turns
-- on unit clear times plus "the existence of another report with the same
-- 'Dispatch Run Number'". No time proximity. No unit-overlap match. No
-- "which call is currently open".
--
-- That is the whole point of this migration. The reverted 4.1a writer picked
-- "the one open call" and then carefully refused to guess when two were open --
-- an elegant answer to a question the correct key never asks. Under a run-number
-- key, CONCURRENT CALLS ARE NOT AMBIGUOUS.
--
-- WHAT ────────────────────────────────────────────────────────────────────────
-- incidents.cad_run_number TEXT -- the CAD-supplied run number, verbatim.
--
-- NULLABLE ON PURPOSE. An incident authored with no CAD call is normal and
-- legitimate (a walk-in, a still alarm, a report written after the fact). NULL
-- means "no call", not "error" -- it is never guessed and never back-filled from
-- timing (spec D5).
--
-- OPAQUE ON PURPOSE. Prod has never seen a real CAD run number -- all 30
-- cad_alerts rows are synthetic (20 demo-<epoch> + 10 test artifacts). We
-- therefore know NOTHING about the format and must not assume one. No parsing,
-- no sequence assumption, no format CHECK. The only properties relied on: it is
-- a string, supplied by the CAD, unique within a department. This mirrors the
-- NERIS doctrine already ledgered in 0061 -- capture what the source gave us,
-- never invent.
--
-- UNIQUENESS ─────────────────────────────────────────────────────────────────
-- Partial UNIQUE (department_id, cad_run_number), excluding NULLs and
-- soft-deleted rows. This IS the market's dedupe -- "the existence of another
-- report with the same Dispatch Run Number" -- enforced in Postgres rather than
-- hoped for in application code, matching how OF already enforces the closed
-- result set for inspections (0056).
--
-- Shape copied deliberately from the existing incident-number precedent
-- (db.js: idx_incidents_station_number_active), which is partial on
-- `deleted_at IS NULL` so a number can be reused after a soft delete.
--
-- DEPARTMENT-SCOPED, and that is not incidental: 0104 (same session) had to undo
-- two GLOBAL unique keys that refused a second department its own CAD run number
-- and its own hydrant H-001. A new global unique key on a CAD-supplied value
-- would reintroduce that exact defect. NULLS NOT DISTINCT (PG17) so a NULL
-- department_id cannot open a hole.
--
-- Verified before applying (live, prod): incidents = 18 rows, 0 with a NULL
-- department_id, 0 soft-deleted, 1 existing trigger (of_sync_department_id,
-- BEFORE INSERT -- so department_id is populated ahead of any uniqueness check).
--
-- NOT DONE HERE ──────────────────────────────────────────────────────────────
-- No backfill. The 30 existing alerts and 18 incidents could only be matched on
-- timing, which is precisely the cross-attribution guess this design exists to
-- eliminate. They stay unassociated and report `not_captured`. An honest gap
-- beats an invented fact.
--
-- cad_alerts.incident_id (0100) REMAINS as the denormalized reverse edge that
-- cad/pipeline.js processStatusUpdate reads. The single writer maintains both
-- edges IN ONE TRANSACTION or neither -- a half-written association reports a
-- number nobody can trace.

BEGIN;

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS cad_run_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_dept_cad_run
  ON public.incidents (department_id, cad_run_number) NULLS NOT DISTINCT
  WHERE cad_run_number IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_cad_run_lookup
  ON public.incidents (department_id, cad_run_number)
  WHERE cad_run_number IS NOT NULL;

COMMENT ON COLUMN public.incidents.cad_run_number IS
  'The CAD dispatch/run number this incident was created from (0103) — THE key '
  'for the call->incident association, matching every surveyed platform. Opaque '
  'string, supplied by the CAD, never parsed and never minted by OF. NULL means '
  'the incident had no CAD call (walk-in, still alarm, after-the-fact report) — '
  'a legitimate state, never an error, never inferred from timing. Unique per '
  'department among non-deleted incidents. Written ONLY by the single '
  'association writer, which maintains cad_alerts.incident_id in the same '
  'transaction. The Command Board never writes it.';

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0103-incident-cad-run-number.sql')
ON CONFLICT DO NOTHING;

COMMIT;
