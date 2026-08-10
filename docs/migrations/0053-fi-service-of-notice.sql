-- 0053 — Service of notice + signature outcomes (Prevention Core, Phase 3.5)
--
-- WHY (researched 2026-07-13, live sources):
--   A notice of violation's legal validity rests on SERVICE, not on a signature.
--     · IFC §109.3.1 — served by personal service, by mail, or by leaving it with
--       "some person of responsibility on the premises"; for unattended/abandoned
--       premises: POST at the entrance AND mail (certified w/ return receipt, or
--       certificate of mailing).
--     · IPMC §107.3 — if the mailed notice is "returned showing that the letter was
--       not delivered, a copy thereof shall be POSTED in a conspicuous place."
--   The occupant's signature is an ACKNOWLEDGMENT OF RECEIPT only. It is not an
--   agreement with the findings, and REFUSAL TO SIGN DOES NOT INVALIDATE THE NOTICE
--   nor toll the correction deadline (the food-code family states this in terms;
--   the fire codes never mention a recipient signature at all).
--
--   Jones v. Flowers, 547 U.S. 220 (2006): when mailed notice comes back unclaimed
--   the government "cannot simply ignore that information" and must take additional
--   reasonable steps before a deprivation. Because THIS SYSTEM INGESTS the returned
--   event, it manufactures the constructive knowledge that triggers that duty — so
--   the returned→post cascade is a HARD GATE in code, not a suggestion. The Court
--   blessed exactly three cheap cures (resend first-class, address to "occupant",
--   post the premises) and expressly did NOT require an open-ended address search.
--
-- WHAT: fi_signatures gains a first-class OUTCOME (refusal is a recorded event, not
--   an absent row) + the e-signature audit trail ESIGN/UETA needs (document hash,
--   consent text version, device/GPS). New fi_notice_service table = one notice, MANY
--   service records (statutes demand conjunctions: "mail AND post"). Append-only.
--
-- Idempotent. Local rehearsal → prod via Supabase MCP → db.js mirror for fresh installs.
-- NOTE: 0052 was taken by a concurrent session (incident-personnel-roster); this is 0053.

-- ── 1. Signature outcomes ────────────────────────────────────────────────────
-- Absence of a signature row was AMBIGUOUS: refused? nobody home? inspector forgot?
-- app crashed? Ambiguity is exactly what gets attacked. Every outcome is now stated.
ALTER TABLE fi_signatures ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'signed';
ALTER TABLE fi_signatures ADD COLUMN IF NOT EXISTS signer_role_label TEXT NOT NULL DEFAULT '';
ALTER TABLE fi_signatures ADD COLUMN IF NOT EXISTS refusal_reason TEXT NOT NULL DEFAULT '';
-- The three advisements the inspector must read aloud on a refusal (receipt is not
-- agreement; refusal does not affect the duty to correct; the refusal is recorded).
ALTER TABLE fi_signatures ADD COLUMN IF NOT EXISTS advisements_read BOOLEAN NOT NULL DEFAULT FALSE;
-- ESIGN §7001(e) / UETA §§9,12: the signature must be ATTRIBUTABLE and ASSOCIATED with
-- the record, and the record must be retainable + accurately reproducible. The hash
-- binds this signature to the EXACT bytes that were signed.
ALTER TABLE fi_signatures ADD COLUMN IF NOT EXISTS document_sha256 TEXT NOT NULL DEFAULT '';
ALTER TABLE fi_signatures ADD COLUMN IF NOT EXISTS consent_text TEXT NOT NULL DEFAULT '';
ALTER TABLE fi_signatures ADD COLUMN IF NOT EXISTS device_label TEXT NOT NULL DEFAULT '';
ALTER TABLE fi_signatures ADD COLUMN IF NOT EXISTS gps_lat DOUBLE PRECISION;
ALTER TABLE fi_signatures ADD COLUMN IF NOT EXISTS gps_lng DOUBLE PRECISION;
ALTER TABLE fi_signatures ADD COLUMN IF NOT EXISTS gps_accuracy_m DOUBLE PRECISION;

-- Existing rows predate the outcome model: they are, by definition, signed.
UPDATE fi_signatures SET status = 'signed' WHERE status IS NULL OR status = '';

DO $$ BEGIN
  ALTER TABLE fi_signatures ADD CONSTRAINT fi_signatures_status_chk CHECK (
    status IN ('signed','refused','unable_no_party_present','unable_other','declined_by_policy'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Service of notice — the object the incumbents do not have ─────────────
-- The most-documented code-enforcement suite models notice delivery as
-- carrier + tracking_number + sent_date (a SHIPPING abstraction). Nothing records
-- HOW service was legally effected, WHO effected it, whether it was REFUSED, or
-- whether it came BACK. Those are the only facts that make the notice stick.
CREATE TABLE IF NOT EXISTS fi_notice_service (
  id             SERIAL PRIMARY KEY,
  department_id  INTEGER NOT NULL,
  inspection_id  INTEGER NOT NULL REFERENCES fi_inspections(id) ON DELETE RESTRICT,
  notice_id      INTEGER REFERENCES fi_notices(id) ON DELETE RESTRICT,

  method         TEXT NOT NULL,   -- how service was effected (see CHECK below)
  outcome        TEXT NOT NULL,   -- what happened (see CHECK below)
  attempt_seq    INTEGER NOT NULL DEFAULT 1,

  -- SERVER-AUTHORITATIVE. The compliance clock, the appeal window, and the
  -- hearing-notice window all run from THIS, never from the generation date.
  served_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  served_by_user_id INTEGER,
  served_by      TEXT NOT NULL DEFAULT '',   -- the officer, by name, for the certificate

  servee_name         TEXT NOT NULL DEFAULT '',
  servee_relationship TEXT NOT NULL DEFAULT '',  -- owner / agent / operator / occupant / manager

  -- Address provenance: Jones excuses an open-ended search, NOT a careless address.
  address_used   TEXT NOT NULL DEFAULT '',
  address_source TEXT NOT NULL DEFAULT '',   -- which record, as of when

  -- Proof of posting (IFC §109.3.1 / IPMC §107.3). A posting photo is EVIDENCE:
  -- it carries its own GPS + accuracy so a bad fix can be flagged, never silently
  -- accepted (mirrors the ">100 m GPS fix is not trustworthy" doctrine).
  posting_photo        BYTEA,
  posting_lat          DOUBLE PRECISION,
  posting_lng          DOUBLE PRECISION,
  posting_accuracy_m   DOUBLE PRECISION,
  posting_location_desc TEXT NOT NULL DEFAULT '',  -- "front entrance, north door"

  -- Mail. Modeled in full now; the vendor API (label minting + return-receipt
  -- ingestion) can be wired later without a schema change. Until then the officer
  -- records the tracking number and the outcome by hand.
  mail_class            TEXT NOT NULL DEFAULT '',  -- certified_rrr | cert_of_mailing | first_class
  mail_tracking_number  TEXT NOT NULL DEFAULT '',
  mail_accepted_at      TIMESTAMPTZ,
  mail_delivered_at     TIMESTAMPTZ,
  mail_returned_at      TIMESTAMPTZ,               -- the Jones trigger
  return_receipt_pdf    BYTEA,
  delivery_signature    BYTEA,
  delivered_address     TEXT NOT NULL DEFAULT '',

  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Retire, never delete: these are subpoenable. A mistaken entry is VOIDED
  -- (with a reason) and stays on the record.
  voided_at   TIMESTAMPTZ,
  void_reason TEXT NOT NULL DEFAULT ''
);

DO $$ BEGIN
  ALTER TABLE fi_notice_service ADD CONSTRAINT fi_notice_service_method_chk CHECK (
    method IN ('personal_service','left_with_responsible_person','posted_premises',
               'certified_mail','first_class_mail','certificate_of_mailing','email'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE fi_notice_service ADD CONSTRAINT fi_notice_service_outcome_chk CHECK (
    outcome IN ('served','refused_signature','refused_acceptance','no_party_present',
                'mailed','accepted','delivered','returned_undelivered','unclaimed','posted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_fi_notice_service_dept
  ON fi_notice_service (department_id);
CREATE INDEX IF NOT EXISTS idx_fi_notice_service_inspection
  ON fi_notice_service (department_id, inspection_id) WHERE voided_at IS NULL;

-- Tenant isolation, same as every other fi_* table.
ALTER TABLE fi_notice_service ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY dept_isolation ON fi_notice_service
    USING (department_id = current_setting('app.department_id', true)::int)
    WITH CHECK (department_id = current_setting('app.department_id', true)::int);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE ON fi_notice_service TO of_app;
GRANT USAGE, SELECT ON SEQUENCE fi_notice_service_id_seq TO of_app;

-- ── 3. Per-department service policy ─────────────────────────────────────────
-- Jurisdiction-neutral defaults + per-department override. Nothing here is
-- hardcoded national policy: UETA §18 leaves it to each AGENCY whether it accepts
-- e-signatures on enforcement records, and local adoptions amend IFC/IPMC freely.
ALTER TABLE fi_settings ADD COLUMN IF NOT EXISTS require_inspector_signature BOOLEAN NOT NULL DEFAULT TRUE;
-- Deliberately FALSE by default: an occupant signature is receipt-acknowledgment and
-- is NEVER a validity condition. A department may still demand it as internal QA.
ALTER TABLE fi_settings ADD COLUMN IF NOT EXISTS require_recipient_signature BOOLEAN NOT NULL DEFAULT FALSE;
-- The three advisements, department-authored (a clearly-flagged SAMPLE is rendered
-- when blank — the software never writes a department's legal language for it).
ALTER TABLE fi_settings ADD COLUMN IF NOT EXISTS refusal_advisement_text TEXT NOT NULL DEFAULT '';
ALTER TABLE fi_settings ADD COLUMN IF NOT EXISTS certificate_of_service_text TEXT NOT NULL DEFAULT '';
