-- 0105-report-schedules.sql
-- Phase 4B / ANALYTICS — scheduled delivery of the canned reports.
-- Number claimed by stub 2026-07-27 (F4) before any SQL was written.
--
-- Scheduled delivery is shipped by roughly four of the nine surveyed platforms.
-- That is short of a majority and I had recorded it as "below the bar, not
-- claimed"; Matt's ruling 2026-07-27 is that four is still enough to match.
--
-- THE TWO THINGS THIS SCHEMA EXISTS TO PREVENT
--
-- 1. A SCHEDULE THAT SILENTLY NEVER SENDS. RESEND_API_KEY is unset on this
--    deployment (standing Matt+Dale ops item since P4). Every existing caller
--    no-ops gracefully on a missing key — right for a signup email, WRONG for a
--    standing report a chief believes goes out every month. last_status records
--    "not sent, email not configured" as an OUTCOME. Absence is never success.
--
-- 2. DOUBLE SENDS. The sweep runs daily; a monthly schedule fires once, and
--    Vercel Cron can retry. last_period_key holds the period ALREADY delivered
--    ('2026-06'), and delivery is CLAIMED by writing that key inside the same
--    conditional UPDATE that selects the row — so a concurrent or retried run
--    finds the period claimed and does nothing. The idempotency key is the
--    PERIOD, not the timestamp.

BEGIN;

CREATE TABLE IF NOT EXISTS report_schedules (
  id                 SERIAL PRIMARY KEY,
  department_id      INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  station_id         INTEGER REFERENCES stations(id) ON DELETE SET NULL,

  -- Closed set, mirrored in server/src/constants/reportSchedule.js. A CHECK
  -- constraint rather than free text: the result axis on fi_inspections was free
  -- text once, three clients drifted into three vocabularies, and a doctrine
  -- ended up being enforced by a regex. Postgres holds the line here too.
  report_key         TEXT NOT NULL
                     CHECK (report_key IN ('response_compliance','incident_activity','cert_expiry')),
  cadence            TEXT NOT NULL CHECK (cadence IN ('weekly','monthly')),

  -- Where it goes. Chiefs mail these to a mayor or a council member, so an
  -- address need not belong to a department member — which makes this the one
  -- egress surface in the reporting stack. Writes are chief-gated and audited.
  recipients         TEXT[] NOT NULL CHECK (cardinality(recipients) BETWEEN 1 AND 20),

  enabled            BOOLEAN NOT NULL DEFAULT TRUE,

  -- Delivery bookkeeping. last_period_key is the idempotency key (see above).
  last_period_key    TEXT,
  last_run_at        TIMESTAMPTZ,
  last_status        TEXT CHECK (last_status IN
                       ('sent','no_email_configured','send_failed','no_data')),
  last_error         TEXT,

  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The daily sweep reads exactly this predicate.
CREATE INDEX IF NOT EXISTS idx_report_schedules_due
  ON report_schedules (department_id, enabled) WHERE enabled;

-- Tenant isolation, same as every other tenant table. The app runs as the
-- non-owner of_app role and is subject to this.
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'report_schedules'
       AND policyname = 'dept_isolation'
  ) THEN
    CREATE POLICY dept_isolation ON report_schedules
      USING (department_id = current_setting('app.department_id', true)::int)
      WITH CHECK (department_id = current_setting('app.department_id', true)::int);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON report_schedules TO of_app;
GRANT USAGE, SELECT ON SEQUENCE report_schedules_id_seq TO of_app;

-- Ledger. The column is `filename`, not `version` — verified against prod
-- (information_schema) before applying, per D6. Writing `version` here would
-- have failed the whole transaction.
INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0105-report-schedules.sql', NOW())
ON CONFLICT DO NOTHING;

COMMIT;
