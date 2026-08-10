-- 0115-cad-ingest-log.sql
-- 4C.2 — CAD ingest durability. Spec: docs/CAD-INGEST-4C2-SPEC-2026-07-27.md
--
-- NUMBERING (F4): number claimed by empty stub 558ca37 before any SQL. The file
-- head in the worktree read 0113 while prod's ledger already carried 0114 from a
-- parallel session — listing the directory alone would have picked a spent
-- number, the fifth collision on this program. Verified against BOTH the
-- migrations dir and the live of_schema_migrations ledger, 2026-07-27.
--
-- THE DEFECT
-- The ingest path answers 500 on any processing error and 400 on a parse
-- failure. Per NENA-STA-024.1.1-2025 §3.3.5.3.1 the sender's action on 400, 404,
-- 408, 500 and 501 is NOTHING — only 503 means retry — and the standard defines
-- no dead-letter queue and no redelivery machinery. So a transient error today
-- permanently loses a dispatch and nobody finds out, because nobody looks for a
-- row that was never written. This is not hypothetical: cad/index.js called
-- processStatusUpdate() without importing it for 12 days (fixed 745f425), and
-- every CAD-relayed arrival time in that window was answered 500 and discarded.
--
-- Because the market does not redeliver, the RECEIVER carries the entire burden
-- of not losing the message. NENA-STA-024 §3.14 makes logging every message
-- MUST-level; NFPA 1221 §12.5.3 makes keeping a record of every dispatch signal
-- SHALL; and NENA i3 §4.12.3.7 (MalformedMessageLogEvent) requires an
-- unparseable message to be logged WITH its raw bytes and the sender's IP as
-- REQUIRED members. Keeping the bytes is the whole remedy.
--
-- TWO TABLES, BOTH APPEND-ONLY — the 0059 mayday precedent.
-- A receipt is a fact that can never change: these bytes arrived, from there, at
-- that instant. Whether we could later READ them is a different, later fact. So
-- the receipt is written before parsing and never touched again, and the outcome
-- is a separate append-only row. Neither table grants UPDATE to anything, so
-- "immutable" is enforced by Postgres rather than by our own good intentions
-- (the 0046 lesson: Supabase auto-grants UPDATE/DELETE, so the REVOKE is
-- mandatory on every new table).
--
-- RETENTION: NONE. Archive forever, never deleted (Matt, 2026-07-27; spec §5.7).
-- No retention column and no sweep in cronRetention.js. This matches what OF
-- already does for cad_alerts / incidents / unit_status_history, matches the
-- dominant interface engine's shipped default, and is the only rule compliant in
-- every state at once — schedules diverge by an order of magnitude and at least
-- one binds an audit trail to the life of the record it describes. CJIS AU-11's
-- one year is a FLOOR, not a ceiling.
--
-- TENANCY: department_id is NOT NULL on both tables and both carry the standard
-- dept_isolation policy. That is only possible because 4C.2 makes the
-- per-connection webhook secret the ONLY accepted credential, so the department
-- is always resolved BEFORE we attempt to parse. The retired global
-- CAD_WEBHOOK_SECRET fallback had no department, which would have forced either
-- a nullable department_id (invisible to of_app: `NULL = <guc>` is NULL, never
-- true, so the row could be neither read nor inserted under the policy) or a new
-- SECURITY DEFINER write. Removing the fallback removed the problem.

BEGIN;

-- ── cad_ingest_log — the immutable receipt ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cad_ingest_log (
  id             BIGSERIAL PRIMARY KEY,
  -- i3 §2.1.8: "Each Logging Service MUST assign a globally unique identifier to
  -- each LogEvent." Also the handle we hand back to the sender in the ack.
  log_event_id   UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  department_id  INTEGER     NOT NULL,
  station_id     INTEGER,
  connection_id  INTEGER,
  -- clock_timestamp(), NOT now(): now() is transaction-start and is identical for
  -- every row in a txn. i3 §2.3 requires enough precision to ORDER two events
  -- inside the same second, which a transaction timestamp cannot express.
  received_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  vendor         TEXT        NOT NULL,
  source_ip      INET,                    -- i3 §4.12.3.7 required member
  raw_body       TEXT        NOT NULL,    -- i3 §4.12.3.7 required member
  -- Redacted at the application layer: webhookAuth accepts the secret in a query
  -- parameter as well as a header, so the URL is scrubbed too, not just the
  -- headers. A credential must never come to rest in a table we keep forever.
  headers        JSONB
);

CREATE INDEX IF NOT EXISTS idx_cad_ingest_log_dept_time
  ON public.cad_ingest_log (department_id, received_at DESC);

ALTER TABLE public.cad_ingest_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.cad_ingest_log;
CREATE POLICY dept_isolation ON public.cad_ingest_log FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);

GRANT SELECT, INSERT ON public.cad_ingest_log TO of_app;
GRANT USAGE, SELECT ON SEQUENCE public.cad_ingest_log_id_seq TO of_app;
REVOKE UPDATE, DELETE ON public.cad_ingest_log FROM of_app, anon, authenticated, service_role, PUBLIC;

COMMENT ON TABLE public.cad_ingest_log IS
  'Immutable receipt for every authenticated inbound CAD payload, written RAW and '
  'durably BEFORE any parse attempt. Append-only (REVOKE UPDATE/DELETE), RLS '
  'dept_isolation, retained FOREVER — never pruned. NENA i3 4.12.3.7 requires the '
  'raw bytes and sender IP for an unparseable message; NENA-STA-024 3.14 and NFPA '
  '1221 12.5.3 require the record of every message. 0115.';

-- ── cad_ingest_outcome — what we managed to do with it, appended after ──────
CREATE TABLE IF NOT EXISTS public.cad_ingest_outcome (
  id               BIGSERIAL PRIMARY KEY,
  log_event_id     UUID        NOT NULL REFERENCES public.cad_ingest_log (log_event_id),
  department_id    INTEGER     NOT NULL,
  at               TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  -- A CLOSED SET, matched exactly, enforced in Postgres. The fi_inspections
  -- result_code lesson: a control value that is free text WILL drift into three
  -- vocabularies across three writers, and nothing may ever pattern-match it.
  parse_status     TEXT        NOT NULL
                     CHECK (parse_status IN ('parsed','unparseable','processing_failed')),
  parse_error      TEXT,
  alert_id         TEXT,        -- correlation to cad_alerts once one exists
  -- What we actually answered. Makes the response contract auditable after the
  -- fact rather than inferred from code that has since changed.
  responded_status SMALLINT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cad_ingest_outcome_event
  ON public.cad_ingest_outcome (log_event_id);
-- The operator panel's query: unreadable payloads for this department, newest
-- first. Partial, because the rows that matter are a small minority of the table.
CREATE INDEX IF NOT EXISTS idx_cad_ingest_outcome_unparseable
  ON public.cad_ingest_outcome (department_id, at DESC)
  WHERE parse_status <> 'parsed';

ALTER TABLE public.cad_ingest_outcome ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.cad_ingest_outcome;
CREATE POLICY dept_isolation ON public.cad_ingest_outcome FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);

GRANT SELECT, INSERT ON public.cad_ingest_outcome TO of_app;
GRANT USAGE, SELECT ON SEQUENCE public.cad_ingest_outcome_id_seq TO of_app;
REVOKE UPDATE, DELETE ON public.cad_ingest_outcome FROM of_app, anon, authenticated, service_role, PUBLIC;

COMMENT ON TABLE public.cad_ingest_outcome IS
  'Append-only outcome for a cad_ingest_log receipt: whether the payload parsed, '
  'the error if not, the correlated alert_id, and the HTTP status we answered. '
  'Separate from the receipt because "these bytes arrived" and "we could read '
  'them" are different facts established at different times. Retained FOREVER. 0115.';

INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0115-cad-ingest-log.sql', NOW())
ON CONFLICT DO NOTHING;

COMMIT;
