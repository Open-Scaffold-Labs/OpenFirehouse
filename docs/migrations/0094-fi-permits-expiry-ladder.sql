-- 0094-fi-permits-expiry-ladder.sql
--
-- Phase 3, module 3.1b — the corrected expiry ladder + the R7 snapshot on fi_permits.
-- Spec: docs/PHASE3-31B-CATALOGUE-EXPIRY-RENEWAL-SPEC-2026-07-27.md §2, §3.3
--
-- Claimed by stub 2026-07-27 (pushed). Block 0090–0099. Head verified by listing.
--
-- ⚠ DALE-GATED SURFACE: permit_type_id / expiration_rule_id are FKs FROM A LEGAL RECORD.
-- RESTRICT, never CASCADE — the same rule as 0092's superseded_by_permit_id. Deleting a
-- catalogue row must never be able to destroy or orphan an issued permit. That is also why
-- 0093 grants of_app no DELETE on the catalogue at all: retire, never delete.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE LADDER — and why 'Expired' is the TRAPDOOR, not the start of grace
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The market audit graded the renewal window a genuine SPLIT between two platforms and
-- escalated it as a question only Matt could settle. A second, targeted research pass found
-- it is NOT a policy split — it is a status NAMING difference, and reading it as a policy
-- split would have had us build the INVERSE of the only documented behaviour.
--
-- The platform whose administrator guide is publicly reachable places grace and penalty
-- UPSTREAM of 'Expired': at 'Expired' "the renewal option no longer displays on the record
-- and it is not available for renewal", and implementers are told to tune the scheduled job
-- "to accommodate any grace and/or penalty periods BEFORE record statuses change to
-- Expired." A large municipal fire department's own OPERATIONAL-permit instructions
-- corroborate the same shape independently at the agency layer: renewable 90 days past the
-- expiration date -> cancelled -> reinstatable for 180 more with late fees -> then a new
-- application, re-inspection, and current-code conditions.
--
--   Active -> AboutToExpire -> Delinquent -> Expired
--   [in term]  [in term,       [term ended, [past end-of-grace,
--              notice window,   in grace,    renewal WITHDRAWN]
--              renewal opens]   still renewable, late fees peg HERE]
--
-- Both new statuses are written ONLY by the scheduled job (0095). 'Revoked' stays
-- operator-only and NO TIMER MAY EVER PRODUCE IT — enumerated grounds, written notice and a
-- hearing right make it statutorily impossible. Carried verbatim from 0092's header; same
-- doctrine as "a timer must not decide a call is over."
--
-- 🔴 THE TRAP THIS CREATES, already fenced in code before this migration (commit bd6cc4b):
-- `status = 'Active'` STOPS being the test for "is this permit valid". An AboutToExpire
-- permit is perfectly valid and its holder is operating lawfully, so every literal
-- comparison becomes wrong SILENTLY. constants/permitStatus.js now derives its sets from a
-- facet table and the suite fails if a status is added without being classified.
--
-- WIDEN ONLY, NEVER NARROW. Verified live immediately before applying: prod holds 4 rows,
-- 0 NULL status, all values already inside the existing set.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. R7 — THE SNAPSHOT, AND WHY IT IS ENFORCED IN POSTGRES
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Matt's ruling, 2026-07-27: an issued permit stores the term in force AT ISSUANCE; a later
-- catalogue edit changes only FUTURE issuances.
--
-- Recorded honestly: this is NOT a market copy. No administrator guide reached states what
-- happens to an already-issued permit when its type is edited. One platform exposes
-- retain-vs-adopt as a system switch WITH NO DOCUMENTED DEFAULT, and resolves which fee
-- schedule version applies DIFFERENTLY PER FEE SOURCE (submission date for some, current
-- date for others). A split inside a single product is the evidence that there is no bar to
-- match here. R7 is this repo's RECORD_FINALIZED doctrine filling a genuine market silence.
--
-- ⚠ AND THE DOCTRINE HAD A HOLE THE MOMENT IT WAS WRITTEN. of_app holds TABLE-LEVEL UPDATE
-- on fi_permits (verified live), so a new column is writable by default — every "snapshot"
-- would have been freely rewritable, which is the 0082 finding again (Supabase default
-- privileges left result_code rewritable until the per-role REVOKE sweep). A snapshot that
-- can be edited is not a snapshot; it is just a slower way to lie about what was issued.
--
-- Fixed with a WRITE-ONCE trigger rather than by restructuring the whole grant: once a
-- snapshot column is non-NULL, changing it is refused BY THE DATABASE. Deliberate choice —
-- re-scoping every column grant on a live legal-record table at the end of a session has a
-- blast radius (issue/revoke/terminate all UPDATE), and the trigger closes exactly the hole
-- R7 opens. The broader column-scoping of fi_permits UPDATE is recorded as a real follow-up,
-- not quietly dropped.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. DELETE ON A LEGAL RECORD — closed while we are here
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- of_app also held table-level DELETE on fi_permits. Permits are SOFT-deleted (deleted_at);
-- a grep of server/src found the only hard DELETEs are test-fixture cleanup, which runs as
-- the local DB owner and never as of_app. So the privilege is unused in production and its
-- existence is pure downside on a subpoenable record. Revoked.
--
-- ADDITIVE. No data migration. Existing rows keep NULL snapshots — they were issued before
-- the catalogue existed, and NULL is the honest value for "we do not know what terms this
-- was issued under", which is exactly what 0056 established for unmappable legacy results:
-- surface it for a human, never default it to something convenient.
-- ─────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. The ladder ────────────────────────────────────────────────────────────────────────
ALTER TABLE fi_permits DROP CONSTRAINT IF EXISTS fi_permits_status_chk;
ALTER TABLE fi_permits ADD CONSTRAINT fi_permits_status_chk
  CHECK (status IN ('Pending','Active','AboutToExpire','Delinquent','Expired',
                    'Revoked','Denied','TerminatedByTransfer'));

-- ── 2. The R7 snapshot ───────────────────────────────────────────────────────────────────
ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS permit_type_id      INTEGER;
ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS expiration_rule_id  INTEGER;
ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS term_value          INTEGER;
ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS term_unit           TEXT;
ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS notice_window_days  INTEGER;
ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS grace_days          INTEGER;

DO $$ BEGIN
  ALTER TABLE fi_permits ADD CONSTRAINT fi_permits_permit_type_fk
    FOREIGN KEY (permit_type_id) REFERENCES fi_permit_types(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE fi_permits ADD CONSTRAINT fi_permits_expiration_rule_fk
    FOREIGN KEY (expiration_rule_id) REFERENCES fi_permit_expiration_rules(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The same CHECKs the rule table carries. A snapshot that can hold values the rule table
-- would reject is not a faithful copy of anything.
DO $$ BEGIN
  ALTER TABLE fi_permits ADD CONSTRAINT fi_permits_term_chk
    CHECK ((term_value IS NULL OR term_value > 0)
       AND (term_unit  IS NULL OR term_unit IN ('day','month','year'))
       AND (notice_window_days IS NULL OR notice_window_days >= 0)
       AND (grace_days IS NULL OR grace_days >= 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_fi_permits_type ON fi_permits (permit_type_id)
  WHERE permit_type_id IS NOT NULL;

-- ── 3. WRITE-ONCE enforcement for the snapshot ───────────────────────────────────────────
-- Table-specific by design. The repo has been burned by a shared trigger applied as a flat
-- expression throwing 42703 across ~100 unrelated tables; this one touches fi_permits only.
CREATE OR REPLACE FUNCTION fi_permits_snapshot_write_once()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  -- NULL -> value is the issuance write, and is allowed. value -> anything-different is a
  -- rewrite of what a holder was issued under, and is refused. value -> same value is a
  -- no-op and must stay allowed, or every ordinary UPDATE of an unrelated column would fail.
  IF OLD.permit_type_id IS NOT NULL AND NEW.permit_type_id IS DISTINCT FROM OLD.permit_type_id THEN
    RAISE EXCEPTION 'permit_type_id is fixed at issuance (R7 snapshot) and cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.expiration_rule_id IS NOT NULL AND NEW.expiration_rule_id IS DISTINCT FROM OLD.expiration_rule_id THEN
    RAISE EXCEPTION 'expiration_rule_id is fixed at issuance (R7 snapshot) and cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.term_value IS NOT NULL AND NEW.term_value IS DISTINCT FROM OLD.term_value THEN
    RAISE EXCEPTION 'term_value is fixed at issuance (R7 snapshot) and cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.term_unit IS NOT NULL AND NEW.term_unit IS DISTINCT FROM OLD.term_unit THEN
    RAISE EXCEPTION 'term_unit is fixed at issuance (R7 snapshot) and cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.notice_window_days IS NOT NULL AND NEW.notice_window_days IS DISTINCT FROM OLD.notice_window_days THEN
    RAISE EXCEPTION 'notice_window_days is fixed at issuance (R7 snapshot) and cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.grace_days IS NOT NULL AND NEW.grace_days IS DISTINCT FROM OLD.grace_days THEN
    RAISE EXCEPTION 'grace_days is fixed at issuance (R7 snapshot) and cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_fi_permits_snapshot_write_once ON fi_permits;
CREATE TRIGGER trg_fi_permits_snapshot_write_once
  BEFORE UPDATE ON fi_permits
  FOR EACH ROW EXECUTE FUNCTION fi_permits_snapshot_write_once();

-- ── 4. The department's ruling on operating during grace ─────────────────────────────────
-- Spec §2.2. The market documents that a delinquent permit is RENEWABLE; neither research
-- pass established whether the underlying OPERATION is lawful during grace, because that is
-- an enforcement posture, not a software question. DEFAULT FALSE — the strict reading, and
-- the safe direction for a life-safety record. Either setting is a one-row change.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS treat_delinquent_as_valid BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 5. Grants ────────────────────────────────────────────────────────────────────────────
DO $grants$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      -- Permits are SOFT-deleted. Production never issues a hard DELETE (verified by grep);
      -- the privilege was unused and is pure downside on a subpoenable record.
      EXECUTE format('REVOKE DELETE, TRUNCATE ON fi_permits FROM %I', r);
    END IF;
  END LOOP;
END $grants$;

INSERT INTO of_schema_migrations (filename) VALUES ('0094-fi-permits-expiry-ladder.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
