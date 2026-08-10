-- 0061-neris-phase2.sql  (NERIS Phase 2 — casualty capture, PSAP call times, review chain — 2026-07-16)
--
-- Phase-2 Wave 3 of the NERIS bulletproof build (docs/NERIS-BULLETPROOF-BUILD-2026-07-16.md,
-- PHASE 2 APPENDIX). Same doctrines as 0060: closed sets owned by the server, exact match
-- only, structural + stable-set CHECKs in Postgres (D5), big evolving enums in
-- server/src/constants/neris/.
--
-- WHAT THIS ADDS
--
--   incidents.neris_casualty_rescues  JSONB  (P2-D2) — per-person casualty/rescue entries.
--       OUR CAPTURE FORMAT (the transformer maps this into the spec's discriminated
--       unions — CasualtyRescuePayload / InjuryPayload / NoinjuryPayload / RescuePayload):
--         { "type":        "FF" | "NONFF",                      -- who the person IS
--           "injury":      "INJURED_NONFATAL" | "INJURED_FATAL" | "NONE",
--           "cause":       <type_casualty_cause>,               -- optional
--           "rescue_type": one of RESCUED_BY_FIREFIGHTER | RESCUED_BY_FF_RIT |
--                          EVAC_ASSISTED_BY_FIREFIGHTER | RESCUED_BY_NONFIREFIGHTER |
--                          SELF_EVACUATION | NO_RESCUE_NEEDED }  -- optional
--       Demographics (gender/race/rank/DOB) are deliberately NOT captured in Phase 2
--       (PII-adjacent, optional in the spec — Matt's call later). Value membership is
--       server-enforced (utils/nerisValidate.js); Postgres enforces the array shape.
--
--   incidents.neris_dispatch_times    JSONB  (P2-D4) — officer-entered PSAP time
--       fallbacks: { "call_answered"?: ISO string, "call_arrival"?: ISO string }.
--       Transformer precedence: cad_alerts column → this officer-entered fallback →
--       validation error. A time nobody recorded stays an ERROR — never defaulted.
--
--   incidents.neris_status            TEXT   (P2-D6) — the review chain:
--       draft → in_review → approved (revertible via return_to_draft). Small + stable
--       3-value set, so it lives in a CHECK (like neris_noaction / result_code).
--       Transitions happen through ONE route (compare-and-set, role-gated, audited);
--       while 'approved', PATCHes to NERIS fields 409 NERIS_APPROVED_LOCKED.
--
--   incidents.neris_review            JSONB  (P2-D6) — transition history:
--       { submitted_by, submitted_at, reviewed_by, reviewed_at, notes,
--         history: [{action, by, by_name, at, notes?}, ...] }. Route-owned — NEVER
--       client-writable (422 NERIS_STATUS_VIA_ROUTE on any client attempt).
--
--   cad_alerts.call_answered_at / call_arrival_at  TIMESTAMPTZ  (P2-D4) — PSAP call
--       times captured when a CAD webhook carries them. Nullable; never invented.
--
-- ADDITIVE + SAFE: existing rows get NULL in the jsonb columns (every CHECK accepts
-- NULL) and 'draft' in neris_status (the correct state for every pre-review record).
--
-- PROD IS MATT'S GATE (D6): this file applies to LOCAL ONLY in this build. The code
-- that writes these columns must not ship until 0061 is on prod — a migration and its
-- dependent code are ONE change (the 2026-07-14 outage lesson).
--
-- NUMBERING: 0060 (neris-incident-record) is the highest in the ledger; 0061 was free
-- at write time (verified against docs/migrations/ + the local ledger, 2026-07-16).

-- ── incidents columns (idempotent) ───────────────────────────────────────────
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_casualty_rescues JSONB;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_dispatch_times   JSONB;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_review JSONB;

-- ── cad_alerts columns (idempotent) ──────────────────────────────────────────
ALTER TABLE public.cad_alerts ADD COLUMN IF NOT EXISTS call_answered_at TIMESTAMPTZ;
ALTER TABLE public.cad_alerts ADD COLUMN IF NOT EXISTS call_arrival_at  TIMESTAMPTZ;

-- ── Structural CHECKs (guarded — idempotent re-apply is a no-op) ─────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'incidents_neris_casualty_rescues_chk'
                   AND conrelid = 'public.incidents'::regclass) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_casualty_rescues_chk
      CHECK (neris_casualty_rescues IS NULL
             OR jsonb_typeof(neris_casualty_rescues) = 'array');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'incidents_neris_dispatch_times_chk'
                   AND conrelid = 'public.incidents'::regclass) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_dispatch_times_chk
      CHECK (neris_dispatch_times IS NULL
             OR jsonb_typeof(neris_dispatch_times) = 'object');
  END IF;
END $$;

-- The 3-value review-status set (small + stable — lives in a CHECK per D5, like
-- neris_noaction and fi_inspections.result_code). Case is load-bearing: 'APPROVED'
-- is NOT a status.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'incidents_neris_status_chk'
                   AND conrelid = 'public.incidents'::regclass) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_status_chk
      CHECK (neris_status IN ('draft','in_review','approved'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'incidents_neris_review_chk'
                   AND conrelid = 'public.incidents'::regclass) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_review_chk
      CHECK (neris_review IS NULL
             OR jsonb_typeof(neris_review) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN public.incidents.neris_casualty_rescues IS
  'NERIS per-person casualty/rescue entries (P2-D2): JSONB array of {type: FF|NONFF, '
  'injury: INJURED_NONFATAL|INJURED_FATAL|NONE, cause?, rescue_type?}. Our capture '
  'format — the server transformer maps it into CasualtyRescuePayload unions. Value '
  'membership server-enforced; shape enforced here.';
COMMENT ON COLUMN public.incidents.neris_dispatch_times IS
  'Officer-entered PSAP time fallbacks (P2-D4): {call_answered?, call_arrival?} ISO '
  'strings. Precedence: cad_alerts.call_answered_at/call_arrival_at win; a time nobody '
  'recorded stays a validation error — never defaulted.';
COMMENT ON COLUMN public.incidents.neris_status IS
  'NERIS review chain (P2-D6): draft -> in_review -> approved (revertible). Transitions '
  'via POST /api/incidents/:id/neris-status ONLY (compare-and-set, role-gated, audited). '
  'While approved, NERIS fields are PATCH-locked (409 NERIS_APPROVED_LOCKED).';
COMMENT ON COLUMN public.incidents.neris_review IS
  'Review-chain transition history (P2-D6): {submitted_by/at, reviewed_by/at, notes, '
  'history:[...]}. Route-owned — never client-writable (422 NERIS_STATUS_VIA_ROUTE).';
COMMENT ON COLUMN public.cad_alerts.call_answered_at IS
  'PSAP call-answered time from the CAD webhook when carried (P2-D4). Nullable — never invented.';
COMMENT ON COLUMN public.cad_alerts.call_arrival_at IS
  'PSAP call-arrival time from the CAD webhook when carried (P2-D4). Nullable — never invented.';

-- Stamp the ledger (of_schema_migrations stays 1:1 with the files).
INSERT INTO public.of_schema_migrations (filename)
VALUES ('0061-neris-phase2.sql')
ON CONFLICT DO NOTHING;
