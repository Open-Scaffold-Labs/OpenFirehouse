-- 0090-fi-permits-hardening.sql
--
-- Phase 3 (permits, fees & invoicing) · module 3.0 — integrity floor under the existing
-- fi_permits scaffold, so the lifecycle engine in 3.1 has something sound to stand on.
-- Spec: docs/PHASE3-PERMITS-FEES-SPEC-2026-07-26.md
-- Claimed by stub 2026-07-26 (head at claim: 0085, verified by listing docs/migrations/).
--
-- WHY EACH CHANGE (all four are gaps this session read out of the live schema, not guesses):
--   1. "permitNumber" was neither unique nor indexed, despite being the human-facing
--      identifier and required by the POST route. Duplicate permit numbers were accepted.
--      Market rule (spec §1.8): every document number is accounted for and a full document
--      number is NEVER REUSED — so the uniqueness spans soft-deleted rows too. A voided or
--      deleted permit CONSUMES AND RETAINS its number; it does not free it for reuse.
--      Blank/NULL numbers are excluded from the index rather than colliding with each other:
--      today there are zero blanks and the route already 400s without one, but a legacy or
--      edge-path blank must not be turned into a hard insert failure by this migration.
--      3.1's issuance engine mints numbers properly and closes the blank case at the source.
--   2. "propertyId" had NO foreign key — referential integrity was one route-level check
--      (assertOwnProperty). fi_violations / fi_notices / fi_signatures all declare
--      REFERENCES ... ON DELETE RESTRICT; permits are the outlier. RESTRICT (not CASCADE)
--      because a permit is a record of a regulatory act: deleting a property must not
--      silently destroy the permits issued against it.
--   3. fee was REAL — IEEE-754 floating point for money. Every recent ledger in this repo
--      (leave_accrual_ledger, shift_trade_ledger, hiring_charge_ledger) uses NUMERIC.
--      Phase 3 puts real money on this column; it cannot stay binary floating point.
--   4. "issuedBy" is a NAME STRING, so an issuance has no attributable operator — the
--      FRE 803(6)(A) / audit failure the spec calls out. issued_by_user_id is added
--      alongside it (the legacy text column is retained verbatim as historical record and
--      is NOT backfilled or rewritten — same doctrine as inspectionResult's free-text
--      `result` beside the coded `result_code`).
--      NOTE: no FK to users(id) — verified against prod, NO fi_* table declares one
--      (fi_inspections.assigned_to_user_id has none either). Matching the existing
--      convention rather than introducing a new one in a hardening migration.
--
-- PRE-FLIGHT VERIFIED AGAINST PROD 2026-07-26 (all clean, so nothing needs a data fix):
--   4 rows / 4 live / 1 department · 0 NULL department_id · 0 blank permitNumber
--   0 duplicate (department_id, permitNumber) groups · 0 orphan propertyId
--   0 permits pointing at a soft-deleted property · 0 cross-department property refs
--   4 rows carry a fee · 0 fee values that lose precision at 2dp
--   RLS already ON with the dept_isolation policy · trg_sync_department_id already attached
--
-- D6 ORDER IS BINDING: applied to prod by hand + ledgered + verified by the four live
-- probes BEFORE any dependent code pushes. Vercel auto-deploys on push to main, so a
-- column the code writes that prod lacks is a live outage, not a pending migration.

BEGIN;

-- 1 · permit number uniqueness (spans soft-deleted rows: numbers are consumed, never reused)
CREATE UNIQUE INDEX IF NOT EXISTS uq_fi_permits_dept_permit_number
  ON public.fi_permits (department_id, "permitNumber")
  WHERE "permitNumber" IS NOT NULL AND btrim("permitNumber") <> '';

-- 2 · referential integrity to the property the permit is issued against
CREATE INDEX IF NOT EXISTS idx_fi_permits_property
  ON public.fi_permits ("propertyId");

ALTER TABLE public.fi_permits
  DROP CONSTRAINT IF EXISTS fi_permits_property_fk;

ALTER TABLE public.fi_permits
  ADD CONSTRAINT fi_permits_property_fk
  FOREIGN KEY ("propertyId") REFERENCES public.fi_properties (id)
  ON DELETE RESTRICT;

-- 3 · money is NUMERIC, never REAL
ALTER TABLE public.fi_permits
  ALTER COLUMN fee TYPE NUMERIC(12,2) USING round(fee::numeric, 2);

-- 4 · attributable issuance (legacy "issuedBy" text retained verbatim, not backfilled)
ALTER TABLE public.fi_permits
  ADD COLUMN IF NOT EXISTS issued_by_user_id INTEGER;

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0090-fi-permits-hardening.sql')
ON CONFLICT DO NOTHING;

COMMIT;
