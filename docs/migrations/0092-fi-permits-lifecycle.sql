-- 0092-fi-permits-lifecycle.sql
--
-- Phase 3, module 3.1a — permit lifecycle core.
-- Spec: docs/PHASE3-31A-PERMIT-LIFECYCLE-SPEC-2026-07-26.md
-- Claimed by stub 2026-07-26 (d69c2d7). Head at claim: 0091, verified by listing docs/migrations/.
-- Phase 3 owns block 0090–0099 (§5b parallel protocol); siblings hold 0083–0089 and 0100+.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- SCOPE, AND WHY IT IS THIS SMALL
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- A competitive audit of 13 fire-prevention platforms found the market ships the REVENUE half of
-- the permit lifecycle and skips the ENFORCEMENT half. Zero of 13 ship suspension, coded denial
-- reasons, appeal/stay, an immutable issued-document snapshot, terminate-and-succeed, void-vs-
-- delete, append-only permit history, or numbering guarantees. Revocation: 1 of 13, free text.
-- Matt's ruling (2026-07-26): cut to the market line, nothing more nothing less.
--
-- So this migration adds ONLY what survives that cut:
--   (a) repo doctrine that costs nothing and prevents a known failure — the closed status set;
--   (b) the two things the R4 carve-out covers, where the CODE is unambiguous and a competitor's
--       omission is an omission to beat rather than a ceiling to respect — revocation on
--       enumerated IFC §105.4 grounds, and terminate-and-reissue per IFC §105.3.1.
-- No new tables. No append-only ledger. No snapshot table. Those were specced and then cut.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY EACH CHANGE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. status CHECK + NOT NULL.
--    status was free text on a CONTROL value — the value that decides whether a permit is valid.
--    This repo has paid for that twice: inspection results (three surfaces, three vocabularies,
--    and a /^pass\b/i regex that let "Passed" and "Passing" silently defeat a life-safety guard —
--    closed by 0056) and violation status ('Abated' counted as open forever because only
--    'Corrected' was checked). constants/permitStatus.js already holds the server-owned set; this
--    puts Postgres behind it so the database refuses a bad value even if a caller does not.
--    NOT NULL because the column is nullable today and a CHECK passes on NULL (unknown), so
--    without it a NULL status would slip straight through the constraint. Verified against prod
--    2026-07-26: 4 rows, 'Active' x3 + 'Expired' x1, ZERO nulls — both values are already in the
--    set, so this is additive with NO data migration. Re-verify before applying.
--
-- 2. superseded_by_permit_id — the transfer chain.  ⚠ DALE-GATED (FK touching a legal record).
--    IFC §105.3.1: "Permits are not transferable and any change in occupancy, operation, tenancy
--    or ownership shall require that a new permit be issued." (That sentence lives inside
--    §105.3.1 *Expiration* — a grep for "transfer" will miss it.) A UI that lets someone edit the
--    owner on a live permit models the wrong thing entirely: the permit is bound to a
--    (person x location x activity x period) tuple, and mutating any leg is a terminating event
--    that mints a successor. RESTRICT, never CASCADE — deleting a successor must not silently
--    destroy the record of what it superseded.
--
-- 3. revoked_at / terminated_at — when the terminal act happened, separate from "updatedAt",
--    which any edit moves.
--
-- 4. revocation_ground / _citation / _basis, with two CHECKs.
--    The ground is a CODED value matched exactly (constants/permitGrounds.js) — never free text,
--    which is precisely what the single competitor shipping revocation does and is the same bug
--    class as the regex above.
--    ⚠ CORRECTION CARRIED IN FROM THIS SESSION'S VERIFICATION PASS: IFC §105.4 enumerates SEVEN
--    grounds, not five, and prefaces them "including, but not limited to" — so the model list is
--    ILLUSTRATIVE, not closed. The two the earlier spec had dropped are the two that fire AFTER
--    issuance, i.e. the most common real-world revocations: "conditions and limitations set forth
--    in the permit have been violated" and "the permittee failed, refused or neglected to comply
--    with orders or notices duly served within the time provided."
--    A hard-closed set of seven would therefore BLOCK a lawful local revocation. LOCAL_GROUND
--    solves it without reopening free text: it is a coded value with a CONTRACT — refused unless
--    a citation to the local provision accompanies it. The control value stays exactly-matched
--    and enumerable in a report; the code's own "not limited to" stays lawful.
--    The basis is required alongside ANY ground: the code says what KIND, the basis says what
--    HAPPENED, and neither substitutes for the other. A revocation can never be reason-free.
--
-- NOT IN THIS MIGRATION, deliberately:
--   - 'Expired' is in the CHECK set (prod holds one such row) but NOTHING in 3.1a writes it. The
--     stored Active->Expired transition needs the term/anchor engine, which is 3.1b; until then
--     the API derives is_expired for display only. Auto-EXPIRY is in-bar and universal in the
--     market; auto-REVOCATION never is, and no timer may ever produce 'Revoked' — enumerated
--     grounds, written notice and a hearing right make it statutorily impossible. Same class as
--     "a timer must not decide a call is over."
--   - No issuance gates. R3's three (fee paid / contractor licence / inspection) all depend on
--     objects that do not exist yet (catalogue = 3.1b, fees + credential = 3.2).
--
-- PRE-FLIGHT VERIFIED AGAINST PROD 2026-07-26 (live query, not from a doc):
--   fee is NUMERIC and issued_by_user_id exists (0090 live) · status default 'Pending' (0091 live)
--   4 rows / 0 soft-deleted / 0 NULL status / status values all inside the proposed set
--   RLS dept_isolation already ON · trg_sync_department_id already attached (fi_permits carries
--   BOTH station_id and department_id, so the trigger applies and no explicit set is needed)
--
-- D6 ORDER IS BINDING: applied to prod by hand + ledgered + verified by the four live probes
-- BEFORE any dependent code pushes. Vercel auto-deploys on push to main, so a column the code
-- writes that prod lacks is a live outage, not a pending migration.
--
-- MIRROR INTO db.js for fresh installs. Note CREATE TABLE IF NOT EXISTS cannot alter an existing
-- table — that exact gap is what produced 0091. Read information_schema.columns back after deploy.

BEGIN;

-- 1 · the closed status set, enforced by the database
ALTER TABLE public.fi_permits
  ALTER COLUMN status SET DEFAULT 'Pending';

UPDATE public.fi_permits SET status = 'Pending' WHERE status IS NULL;

ALTER TABLE public.fi_permits
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.fi_permits
  DROP CONSTRAINT IF EXISTS fi_permits_status_chk;

ALTER TABLE public.fi_permits
  ADD CONSTRAINT fi_permits_status_chk
  CHECK (status IN (
    'Pending',               -- record created / applied for; NOT yet issued
    'Active',                -- issued and in force  (written ONLY by the issuance engine)
    'Expired',               -- term ended           (written ONLY by 3.1b; see header)
    'Revoked',               -- withdrawn on an enumerated ground (IFC §105.4). Terminal.
    'Denied',                -- application refused. Terminal for that application.
    'TerminatedByTransfer'   -- IFC §105.3.1 change of occupancy/operation/tenancy/ownership
  ));

-- 2 · the transfer chain (IFC §105.3.1)   ⚠ DALE-GATED — FK touching a legal record
ALTER TABLE public.fi_permits
  ADD COLUMN IF NOT EXISTS superseded_by_permit_id INTEGER;

ALTER TABLE public.fi_permits
  DROP CONSTRAINT IF EXISTS fi_permits_superseded_by_fk;

ALTER TABLE public.fi_permits
  ADD CONSTRAINT fi_permits_superseded_by_fk
  FOREIGN KEY (superseded_by_permit_id) REFERENCES public.fi_permits (id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_fi_permits_superseded_by
  ON public.fi_permits (superseded_by_permit_id)
  WHERE superseded_by_permit_id IS NOT NULL;

-- 3 · when the terminal act happened (distinct from "updatedAt", which any edit moves)
ALTER TABLE public.fi_permits
  ADD COLUMN IF NOT EXISTS revoked_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ;

-- 4 · revocation: a coded ground + a free-text basis, never reason-free
ALTER TABLE public.fi_permits
  ADD COLUMN IF NOT EXISTS revocation_ground          TEXT,
  ADD COLUMN IF NOT EXISTS revocation_ground_citation TEXT,
  ADD COLUMN IF NOT EXISTS revocation_basis           TEXT;

ALTER TABLE public.fi_permits
  DROP CONSTRAINT IF EXISTS fi_permits_revocation_ground_chk;

-- The SEVEN model grounds (IFC §105.4, 2021/2024; §105.5 in 2018) + the local-ground escape
-- with its citation contract. Keep in lockstep with constants/permitGrounds.js.
ALTER TABLE public.fi_permits
  ADD CONSTRAINT fi_permits_revocation_ground_chk
  CHECK (revocation_ground IS NULL OR revocation_ground IN (
    'MISREPRESENTATION',        -- false statement / misrepresentation of material fact
    'DIFFERENT_LOCATION',       -- used for a location other than that issued
    'DIFFERENT_ACTIVITY',       -- used for a condition or activity other than listed
    'CONDITION_VIOLATED',       -- conditions/limitations set forth in the permit violated
    'DIFFERENT_PERSON',         -- used by a person or firm other than the name issued to
    'NONCOMPLIANCE_WITH_ORDER', -- failed to comply with orders/notices duly served in time
    'ISSUED_IN_ERROR',          -- issued in error or in violation of an ordinance/regulation
    'LOCAL_GROUND'              -- adopted locally beyond the model code — REQUIRES a citation
  ));

-- LOCAL_GROUND without a citation is not a coded ground, it is free text wearing a code.
ALTER TABLE public.fi_permits
  DROP CONSTRAINT IF EXISTS fi_permits_local_ground_citation_chk;

ALTER TABLE public.fi_permits
  ADD CONSTRAINT fi_permits_local_ground_citation_chk
  CHECK (
    revocation_ground IS DISTINCT FROM 'LOCAL_GROUND'
    OR (revocation_ground_citation IS NOT NULL AND btrim(revocation_ground_citation) <> '')
  );

-- A ground says what KIND; the basis says what HAPPENED. Neither substitutes for the other.
ALTER TABLE public.fi_permits
  DROP CONSTRAINT IF EXISTS fi_permits_revocation_basis_chk;

ALTER TABLE public.fi_permits
  ADD CONSTRAINT fi_permits_revocation_basis_chk
  CHECK (
    revocation_ground IS NULL
    OR (revocation_basis IS NOT NULL AND btrim(revocation_basis) <> '')
  );

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0092-fi-permits-lifecycle.sql')
ON CONFLICT DO NOTHING;

COMMIT;
