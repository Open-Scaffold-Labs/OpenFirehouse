-- 0029-incident-response-member-id.sql — P3 of the identity-link gameplan (v2).
-- Put the STABLE link on the accountability record. Until now incident_responses
-- carried only user_id + a denormalized member_name; scoring/burnout resolved a
-- responder to a person by NAME as a last-ditch fallback, which mis-resolves
-- duplicate names (the Nathan McGee / Nathan P. McGee class). This adds the
-- deterministic member_id FK so a responder is scored against the RIGHT person's
-- certifications, and accountability survives deactivation.
--
-- D3 decision (Dale-greenlit 2026-06-18): ON DELETE RESTRICT. An incident
-- response is an accountability record; people are DEACTIVATED (status flip),
-- never hard-deleted, so RESTRICT protects the historical attribution (consistent
-- with the 0016 legal-FK CASCADE→RESTRICT hardening). FMEA R8: prevents the
-- "marking inactive strips them from historical calls" failure seen in a market
-- records platform — attribution is coupled to a STABLE id, not to status.
--
-- Verified live this session (2026-06-18): incident_responses has NO member_id on
-- prod OR local; prod table is EMPTY (0 rows) so the historical backfill is a
-- no-op there (low risk). member_id is nullable: an unlinked responder writes a
-- NULL member_id + a member_name, and is rendered as an explicit "Unlinked — not
-- scored" state downstream (Principle #4 — never silently score, never mis-score).
--
-- Idempotent. Reversible (rollback at foot). Mirror into db.js; stamp ledger.

-- ── P3.1 — the stable FK (nullable, RESTRICT) ────────────────────────────────
ALTER TABLE public.incident_responses
  ADD COLUMN IF NOT EXISTS member_id INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'incident_responses_member_id_fkey'
      AND conrelid = 'public.incident_responses'::regclass
  ) THEN
    ALTER TABLE public.incident_responses
      ADD CONSTRAINT incident_responses_member_id_fkey
      FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_incident_responses_member
  ON public.incident_responses (member_id) WHERE member_id IS NOT NULL;

-- ── P3.3 — backfill historical rows from the stable user_id→member link ───────
-- Only where deterministically resolvable (user_id ⋈ members.user_id within the
-- same department). Rows with no resolvable user stay member_id NULL (name-only,
-- counted not dropped). No-op on prod (0 rows). Batched-safe: single set update,
-- bounded by table size; re-runnable (only touches NULL member_id).
UPDATE public.incident_responses ir
   SET member_id = m.id
  FROM public.members m
 WHERE ir.member_id IS NULL
   AND ir.user_id IS NOT NULL
   AND m.user_id = ir.user_id
   AND m.department_id = ir.department_id;

-- ──────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (reversible by default — Principle #7):
--   DROP INDEX IF EXISTS public.idx_incident_responses_member;
--   ALTER TABLE public.incident_responses DROP CONSTRAINT IF EXISTS incident_responses_member_id_fkey;
--   ALTER TABLE public.incident_responses DROP COLUMN IF EXISTS member_id;
-- ──────────────────────────────────────────────────────────────────────────────
