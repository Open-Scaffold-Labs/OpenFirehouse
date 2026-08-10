-- 0116-fi-permit-notices.sql
--
-- Phase 3, module 3.1b — expiry notices, the last real capability of the module.
-- Spec: docs/PHASE3-31B-CATALOGUE-EXPIRY-RENEWAL-SPEC-2026-07-27.md §3.6 (+ §0.1 for the shape)
--
-- Claimed by stub 2026-08-02 (pushed, 59ee6be). Block 0110–0119. Head verified at 0115 by listing.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 🔴 WHY THIS TABLE EXISTS AT ALL — the spec said "no migration needed" and the spec was wrong
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- §3.6 says expiry notices "ride the existing serviceOfNotice / Mailroom rail", and the 08-01
-- handoff restated that as "everything it needs already exists. No migration expected."
-- Checked against PROD (2026-08-02), not against the files, that is false in three ways:
--
--   1. fi_notices.inspection_id        is NOT NULL REFERENCES fi_inspections(id)
--   2. fi_notice_service.inspection_id is NOT NULL REFERENCES fi_inspections(id)
--   3. there is ZERO permit/notice coupling anywhere in the notice rail (grep, 0 hits)
--
-- A permit-expiry notice has no inspection. It cannot be written to either table.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- WHY A SEPARATE TABLE IS *NOT* THE FORBIDDEN "SECOND NOTIFICATION ENGINE"
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The standing rule bans a second ENGINE: a second scheduler, a second delivery mechanism, a
-- second template system. This adds none of those. It rides the existing permit-expiry cron,
-- the existing dormant-safe Resend call pattern, and the existing per-department settings
-- blocks. What it does NOT do is pretend an expiry reminder is a violation notice.
--
-- That distinction is a MARKET finding, not a preference (R1 — exactly what the big players
-- do, nothing more). Spec §0.1 records the agency-layer shape from a large municipal fire
-- department's own operational-permit instructions: invoice at −30 days · late notice at
-- +30 days · a renewable post-term window · then cancellation. Those are REMINDERS AND
-- INVOICES. Nothing in either researched vendor corpus or any of the three government
-- artifacts describes proof-of-service, posting, GPS or a returned-mail cure cascade for a
-- permit expiry notice — that machinery is IFC §109.3.1 service doctrine, and it exists in
-- this repo for the violation notice, which is a served legal instrument.
--
-- So forcing expiry notices into fi_notices would drag the Jones v. Flowers gate, the posting
-- photo and the inspector-attestation gate onto a reminder email. That is "more than the
-- market", which R1 forbids as squarely as it forbids "less".
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE THREE KINDS, AND WHY THREE AND NOT THE TWO THE SPEC SENTENCE NAMES
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- §3.6's sentence says "about-to-expire and expired". Our ladder has THREE transitions:
--   Active → AboutToExpire       the −30d invoice/notice. Also unlocks renewal.
--   AboutToExpire → Delinquent   term end has passed; this is the documented +30d LATE NOTICE.
--   Delinquent → Expired         grace exhausted; the trapdoor, renewal dies here (§0.1).
-- Notifying on only two would leave the documented +30-day late notice SILENT, which is less
-- than the market. Each of the three maps 1:1 onto an event the §0.1 agency source describes.
-- Kind mirrors the ladder's TARGET status so the set can never drift from the ladder.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- IDEMPOTENCY IS A DATABASE INVARIANT, NOT A CODE CONVENTION
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Spec §6 row 10: "run twice; assert no duplicate transitions, NO DUPLICATE NOTIFICATIONS."
-- The job is idempotent by construction, but a notice that double-sends is a bureau emailing
-- a business owner twice about one lapse, and code-level "did we already?" checks race.
-- UNIQUE (department_id, permit_id, notice_kind, audience) makes the second send IMPOSSIBLE
-- rather than unlikely. The ladder is forward-only, so a permit reaches each rung at most
-- once; a RENEWED permit is a different id and correctly gets its own notices.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- APPEND-ONLY, TRIGGER-ENFORCED — with one deliberate seam for delivery
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The notice FACT is immutable: which permit, which rung, who it was addressed to, what it
-- said. Delivery outcome genuinely resolves after the row exists, so the trigger permits
-- exactly three columns to move (delivery_state, sent_at, delivery_error) and only OUT OF
-- 'queued'. Everything else raises. This is the Hub 013 append-only-trigger pattern.
--
-- Why claim-then-send rather than send-then-insert (which is what fi_notices does today):
-- with a real RESEND key, send-then-insert double-sends whenever the send succeeds and the
-- insert fails. Inserting first makes the UNIQUE constraint the thing that claims the slot.
--
-- ⚠ EMAIL IS DORMANT. RESEND_API_KEY is unset in Vercel (outstanding since mid-July). Every
-- row this writes today lands as 'queued'. That is a real, verifiable outcome and it is the
-- ONLY one that may be claimed — nothing here sends mail until that key is set.
--
-- ADDITIVE. One new table. No existing table touched, no NOT NULL relaxed, no CHECK widened.
-- ─────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS fi_permit_notices (
  id             SERIAL PRIMARY KEY,
  department_id  INTEGER NOT NULL,

  -- FK from a legal record. RESTRICT, never CASCADE — the 0094 rule for permit_type_id.
  -- A permit that has been noticed cannot be hard-deleted out from under its own notice.
  permit_id      INTEGER NOT NULL REFERENCES fi_permits(id) ON DELETE RESTRICT,

  -- Closed set, mirroring the ladder's target status. See the header for why three.
  notice_kind    TEXT NOT NULL CHECK (notice_kind IN ('about_to_expire','delinquent','expired')),

  -- Who the notice is FOR. The market documents both, so both are built (§3.6: "bureau staff
  -- AND the permit contact"). They are separate rows because they are separate documents with
  -- separate recipients and separate delivery outcomes.
  audience       TEXT NOT NULL CHECK (audience IN ('permittee','bureau')),

  -- The transition that caused this notice, recorded verbatim for reproducibility — the same
  -- reasoning as fi_job_runs.evaluated_for. "Why did this owner get an email on the 3rd" has
  -- no answer without it.
  from_status    TEXT NOT NULL,
  to_status      TEXT NOT NULL,
  evaluated_for  DATE NOT NULL,

  -- Resolved at generation time and FROZEN. If the property's owner email changes later, the
  -- record must still say where this notice actually went.
  recipient_email TEXT NOT NULL DEFAULT '',

  -- What was actually said. A notice ledger that cannot reproduce its own text is a log line,
  -- not a record.
  subject        TEXT NOT NULL DEFAULT '',
  body           TEXT NOT NULL DEFAULT '',

  -- 'queued'       — generated, not yet sent (the ONLY state reachable while RESEND is unset)
  -- 'sent'         — a real 2xx from the mail provider
  -- 'failed'       — attempted and refused; error in delivery_error
  -- 'no_recipient' — nothing to send to. Surfaced for a human, NEVER silently dropped (0056).
  delivery_state TEXT NOT NULL DEFAULT 'queued'
                 CHECK (delivery_state IN ('queued','sent','failed','no_recipient')),
  delivery_error TEXT,
  sent_at        TIMESTAMPTZ,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK ((delivery_state = 'sent') = (sent_at IS NOT NULL)),
  CHECK ((delivery_state = 'failed') OR (delivery_error IS NULL))
);

-- THE IDEMPOTENCY GUARD. See the header — this is the test in §6 row 10, enforced by Postgres.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fi_permit_notices_once
  ON fi_permit_notices (department_id, permit_id, notice_kind, audience);

CREATE INDEX IF NOT EXISTS idx_fi_permit_notices_dept_created
  ON fi_permit_notices (department_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fi_permit_notices_permit
  ON fi_permit_notices (department_id, permit_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────────────────
ALTER TABLE fi_permit_notices ENABLE ROW LEVEL SECURITY;
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fi_permit_notices' AND policyname = 'dept_isolation') THEN
    CREATE POLICY dept_isolation ON fi_permit_notices
      USING (department_id = NULLIF(current_setting('app.department_id', true), '')::int);
  END IF;
END $p$;

-- ── Append-only, trigger-enforced ────────────────────────────────────────────────────────
-- The notice fact is immutable. Only the delivery seam moves, and only out of 'queued'.
CREATE OR REPLACE FUNCTION fi_permit_notices_immutable()
RETURNS TRIGGER AS $fn$
BEGIN
  IF OLD.delivery_state <> 'queued' THEN
    RAISE EXCEPTION 'fi_permit_notices %: delivery already resolved as %, it cannot change again',
      OLD.id, OLD.delivery_state;
  END IF;
  IF NEW.id              IS DISTINCT FROM OLD.id
  OR NEW.department_id   IS DISTINCT FROM OLD.department_id
  OR NEW.permit_id       IS DISTINCT FROM OLD.permit_id
  OR NEW.notice_kind     IS DISTINCT FROM OLD.notice_kind
  OR NEW.audience        IS DISTINCT FROM OLD.audience
  OR NEW.from_status     IS DISTINCT FROM OLD.from_status
  OR NEW.to_status       IS DISTINCT FROM OLD.to_status
  OR NEW.evaluated_for   IS DISTINCT FROM OLD.evaluated_for
  OR NEW.recipient_email IS DISTINCT FROM OLD.recipient_email
  OR NEW.subject         IS DISTINCT FROM OLD.subject
  OR NEW.body            IS DISTINCT FROM OLD.body
  OR NEW.created_at      IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'fi_permit_notices %: the notice record is append-only; only delivery_state, sent_at and delivery_error may change', OLD.id;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fi_permit_notices_immutable ON fi_permit_notices;
CREATE TRIGGER trg_fi_permit_notices_immutable
  BEFORE UPDATE ON fi_permit_notices
  FOR EACH ROW EXECUTE FUNCTION fi_permit_notices_immutable();

-- ── Grants: no DELETE, no TRUNCATE, per role (the 0082 lesson — Supabase default privileges
--    auto-grant table-level UPDATE, and revoking from PUBLIC alone does not strip it) ──────
DO $grants$
DECLARE r TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE DELETE, TRUNCATE ON fi_permit_notices FROM %I', r);
      END IF;
    END LOOP;
    GRANT SELECT, INSERT, UPDATE ON fi_permit_notices TO of_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO of_app;
  END IF;
END $grants$;

INSERT INTO of_schema_migrations (filename) VALUES ('0116-fi-permit-notices.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
