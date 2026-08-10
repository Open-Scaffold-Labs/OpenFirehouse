-- 0095-fi-job-runs.sql
--
-- Phase 3, module 3.1b — the append-only scheduled-job run ledger.
-- Spec: docs/PHASE3-31B-CATALOGUE-EXPIRY-RENEWAL-SPEC-2026-07-27.md §3.5 (R8)
--
-- Claimed by stub 2026-07-27 (pushed). Block 0090–0099. Head verified by listing.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- WHAT THIS BACKS
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Two things, and they are at different heights against the market:
--   AT THE BAR — the admin job monitor. Both enterprise platforms whose documentation is
--   reachable ship a customer-visible monitor (job name, status, timestamps, drill-through)
--   plus per-job notification on success/error/warning. This is a copy, not an invention.
--   A DELIBERATE DEPARTURE (R8) — the last-successful-run staleness check. NO platform
--   reached documents detection of a job that STOPS FIRING, and a state licensing/permitting
--   RFP matrix (~125 scored requirements) read end-to-end asks for zero batch-job-health
--   items. Matt approved it as a reasoned departure, not as a market finding.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 🔴 ONE ROW PER RUN, WRITTEN AT THE END. THIS IS NOT LAZINESS — IT IS THE DESIGN.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The obvious shape is insert-at-start then update-at-finish, which gives you a "running"
-- state. It also gives you a table that can be REWRITTEN AFTER THE FACT, and a ledger whose
-- rows can be edited cannot answer the only question it exists to answer: did this job
-- actually run? Same reasoning as mayday_events (0059) and cs_events (0087).
--
-- The consequence is deliberate and worth stating plainly: A RUN THAT DIES MID-FLIGHT
-- LEAVES NO ROW AT ALL. That is not a gap in the ledger — it IS the signal. All three ways
-- this job can silently stop (verified against our own code, not argued in the abstract)
-- produce exactly that:
--   1. utils/cronAuth.js gates every cron on a CRON_SECRET bearer, so a rotated or unset
--      secret means the invocation is turned away BEFORE our handler runs. No exception is
--      raised inside our code; there is nothing for an on-error notification to report.
--   2. The schedule lives in vercel.json. A merge that drops or renames the line removes the
--      invocation entirely, and nothing in the app notices its own absence.
--   3. A growing table against maxDuration and the max:1 pool: the job starts, times out
--      every night, does partial work, and completes never.
-- Every one of those is SILENCE. An on-error email is structurally blind to all three,
-- because all three prevent the code that would send it from running. Absence-of-success is
-- the only signal that catches them, and that is what last_successful_run is for.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- WHY THE COUNTS ARE COLUMNS AND NOT A JSON BLOB
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- skipped_no_terms is the one that matters and it must be queryable, not buried. A permit
-- issued BEFORE the catalogue existed carries no term/notice/grace snapshot, so the ladder
-- CANNOT be computed for it — and the job therefore leaves its status alone rather than
-- inventing terms for a legal record. That is the 0056 doctrine (an unmappable value is
-- surfaced for a human, never defaulted onto a record) applied to a transition instead of a
-- value. Prod holds FOUR such permits today, two of them past their term date. They must be
-- visible as "cannot be evaluated", not silently absent from the ladder forever.
--
-- ADDITIVE. One new table. No existing table touched.
-- ─────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS fi_job_runs (
  id             SERIAL PRIMARY KEY,
  department_id  INTEGER NOT NULL,

  -- Closed set. A job name is a CONTROL value — the staleness query filters on it exactly,
  -- and a typo'd name would silently create a second job that never appears stale because
  -- nothing ever looks for it.
  job_name       TEXT NOT NULL CHECK (job_name IN ('permit_expiry')),

  started_at     TIMESTAMPTZ NOT NULL,
  finished_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome        TEXT NOT NULL CHECK (outcome IN ('success','failed')),

  -- The day the ladder was evaluated against, recorded verbatim. Without it a run is not
  -- reproducible: "why did this permit flip on the 3rd" has no answer if you cannot see what
  -- the job thought the date was.
  evaluated_for  DATE NOT NULL,

  examined       INTEGER NOT NULL DEFAULT 0,
  transitioned   INTEGER NOT NULL DEFAULT 0,
  -- Permits the job could not evaluate because they carry no term snapshot. Queryable on
  -- purpose — see the header.
  skipped_no_terms INTEGER NOT NULL DEFAULT 0,

  -- Present only on outcome='failed'. Sanitized at the call site; never a raw driver dump.
  error          TEXT,

  CHECK (finished_at >= started_at),
  CHECK ((outcome = 'failed') OR (error IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_fi_job_runs_dept_job
  ON fi_job_runs (department_id, job_name, finished_at DESC);
-- The staleness query's index: newest SUCCESS per department+job.
CREATE INDEX IF NOT EXISTS idx_fi_job_runs_last_success
  ON fi_job_runs (department_id, job_name, finished_at DESC) WHERE outcome = 'success';

-- ── RLS ──────────────────────────────────────────────────────────────────────────────────
ALTER TABLE fi_job_runs ENABLE ROW LEVEL SECURITY;
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fi_job_runs' AND policyname = 'dept_isolation') THEN
    CREATE POLICY dept_isolation ON fi_job_runs
      USING (department_id = NULLIF(current_setting('app.department_id', true), '')::int);
  END IF;
END $p$;

-- ── Grants: APPEND-ONLY, per role (the 0082 lesson — Supabase default privileges
--    auto-grant table-level UPDATE, and revoking from PUBLIC alone does not strip it) ─────
DO $grants$
DECLARE r TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON fi_job_runs FROM %I', r);
      END IF;
    END LOOP;
    GRANT SELECT, INSERT ON fi_job_runs TO of_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO of_app;
  END IF;
END $grants$;

INSERT INTO of_schema_migrations (filename) VALUES ('0095-fi-job-runs.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
