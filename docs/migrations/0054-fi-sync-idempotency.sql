-- 0054 — Offline sync idempotency + verbatim served-notice provenance
--        (Prevention Core, Phase 3.6 — Offline Field Ops)
--
-- WHY (the whole reason this table exists):
--   An inspector works a basement with no signal. The device queues the writes and
--   drains them when signal returns. A drain request can be SENT, ARRIVE, be APPLIED,
--   and the acknowledgment can still be lost on the way back (dead cell, tab closed,
--   serverless timeout). The client — correctly — retries. Without a dedupe guarantee
--   that retry writes the violation, the signature, or the SERVED NOTICE a SECOND TIME.
--
--   These are legal records. A subpoenaed inspection that carries the same violation
--   twice, or two "served" records for one hand-off, is a record no officer can swear
--   to, and it hands the opposition a method-of-preparation attack on the entire system
--   (FRE 803(6)). Duplication here is not a cosmetic bug — it is an evidentiary defect.
--
--   So every offline write carries a client-generated UUID (client/src/lib/offline/
--   syncCore.js — newClientId(), minted ONCE and never regenerated on retry). The
--   UNIQUE (department_id, client_id) below IS the guarantee: the second arrival of the
--   same write cannot insert, so the server answers `duplicate` and applies NOTHING.
--   The client treats `duplicate` as success — that is precisely what the key is for.
--
--   Scoped by department because the key is client-minted: one department's client must
--   never be able to collide with (or probe for) another's. Same tenancy posture as
--   every other fi_* table.
--
-- ALSO (TRAP 1 of the offline gameplan): when the notice is rendered ON DEVICE and the
--   paper is handed to the owner, THOSE BYTES are the instrument that was served. They
--   are uploaded verbatim and stored append-only. fi_notices gains the provenance to say
--   so — `source` ('device' vs 'server') and the SHA-256 the device computed over the
--   bytes the occupant actually signed. A server-regenerated PDF could differ in any byte
--   and then the record disagrees with the paper in the owner's hand.
--
-- Idempotent. Local rehearsal → prod by hand → db.js mirror for fresh installs.
-- NOTE: 0053 was the previous number; 0054 was free at time of writing.

-- ── 1. The dedupe ledger ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fi_sync_ops (
  id             SERIAL PRIMARY KEY,
  department_id  INTEGER NOT NULL,
  -- The client's idempotency key (a v4 UUID). Minted on the device when the write
  -- was AUTHORED — offline, possibly hours before it reaches us.
  client_id      TEXT NOT NULL,
  op             TEXT NOT NULL,
  inspection_id  INTEGER,
  -- The server row the op produced (a signature id, a service id, a notice id…), so a
  -- retry can be answered with the SAME id the first attempt would have returned.
  -- NULL while the first attempt is still in flight — a concurrent retry is still
  -- correctly answered `duplicate` (the client's contract makes the id optional).
  result_id      INTEGER,
  -- SERVER-AUTHORITATIVE. The device's clock is not evidence.
  applied_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- THIS is the dedupe guarantee. Everything else in this file is bookkeeping.
DO $$ BEGIN
  ALTER TABLE fi_sync_ops ADD CONSTRAINT uq_fi_sync_ops_client
    UNIQUE (department_id, client_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_fi_sync_ops_dept ON fi_sync_ops (department_id);

-- Tenant isolation, identical to fi_notice_service (0053).
ALTER TABLE fi_sync_ops ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY dept_isolation ON fi_sync_ops
    USING (department_id = current_setting('app.department_id', true)::int)
    WITH CHECK (department_id = current_setting('app.department_id', true)::int);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- No DELETE grant, deliberately: the ledger is the proof that a retry was refused.
-- (The route's own rollback of a failed claim runs on the same INSERT/DELETE surface,
--  so DELETE is granted — but nothing else ever removes a row. See routes/fiSync.js.)
GRANT SELECT, INSERT, UPDATE, DELETE ON fi_sync_ops TO of_app;
GRANT USAGE, SELECT ON SEQUENCE fi_sync_ops_id_seq TO of_app;

-- ── 2. Served-notice provenance (TRAP 1) ─────────────────────────────────────
-- 'server' = this PDF was rendered by buildNoticePdf() here.
-- 'device' = these are the EXACT bytes the officer printed/handed over in the field.
--            They are never re-rendered, never normalized, never touched.
ALTER TABLE fi_notices ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'server';
-- The hash the DEVICE computed over the bytes it served and the occupant signed
-- (ESIGN §7001(e) / UETA §§9,12 — the signature must be ASSOCIATED with the record).
-- The server re-computes it on upload and REFUSES the write if it disagrees: a notice
-- that did not survive transit intact is not the document that was served.
ALTER TABLE fi_notices ADD COLUMN IF NOT EXISTS sha256 TEXT NOT NULL DEFAULT '';

DO $$ BEGIN
  ALTER TABLE fi_notices ADD CONSTRAINT fi_notices_source_chk
    CHECK (source IN ('server', 'device'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
