-- 0060-neris-incident-record.sql  (NERIS incident-record axis on `incidents` — 2026-07-16)
--
-- Wave 3 of the NERIS bulletproof build (docs/NERIS-BULLETPROOF-BUILD-2026-07-16.md).
-- Incident reports are LEGAL RECORDS headed for a federal submission API; the same
-- doctrines as inspections apply: closed sets owned by the server, exact match only,
-- nothing ever pattern-matches a control value.
--
-- WHAT THIS ADDS — the incident's NERIS axis (decision D3):
--   neris_incident_types  JSONB  array of { "value": "<||-path>", "primary": bool },
--                                1–3 entries, EXACTLY ONE primary. Values are stored
--                                VERBATIM in the standard's own path format (D2), e.g.
--                                'FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE'.
--   neris_actions         JSONB  array of action/tactic path strings.
--   neris_noaction        TEXT   the CAD-clear "nothing was done" disposition.
--   neris_fire_detail     JSONB  fire-module object   (condition_arrival, …).
--   neris_hazsit_detail   JSONB  hazsit-module object (disposition, evacuated, …).
--   neris_medical_details JSONB  array of per-patient objects (patient_care_evaluation,
--                                transport_disposition, patient_status).
--   neris_aids            JSONB  array of aid objects (aid_direction, aid_type, …).
--
-- The legacy free-text `disposition` column is RETAINED VERBATIM as historical
-- display — it is never an input to a decision or an export (the result vs
-- result_code pattern, D3).
--
-- WHY THE CHECKS ARE STRUCTURAL + STABLE-SET ONLY (decision D5): the big evolving
-- enums (130 incident types, 89 actions) are enforced in the server constants layer
-- (server/src/constants/neris/, generated from the live OpenAPI spec — D1), NOT in
-- DB CHECKs, so a NERIS V2 value-set rev does not require a schema migration to
-- accept. What Postgres DOES enforce:
--   * jsonb shape (array/object) + 1–3 count on the types array,
--   * the 3-value noaction set (small + stable — the CAD-clear dispositions,
--     same set already used verbatim by the CAD clear flow),
--   * actions XOR noaction (a record cannot both act and no-act — spec rule, F3).
-- Primary-uniqueness (exactly one primary:true) and value membership are enforced
-- server-side in utils/nerisValidate.js (422 NERIS_INVALID).
--
-- ADDITIVE + SAFE: seven nullable columns no deployed code reads yet. All existing
-- rows keep NULL in every new column, which every CHECK accepts — nothing to
-- backfill, nothing to rewrite (and per the 0056 lesson we would not rewrite a
-- recorded value anyway; the legacy->NERIS crosswalk is an EXPORT-time concern,
-- flagged explicitly, never a silent storage rewrite).
--
-- PROD IS MATT'S GATE (decision D6): this file applies to LOCAL ONLY in this build.
-- The code that writes these columns must not ship until 0060 is on prod — a
-- migration and its dependent code are ONE change (the 2026-07-14 outage lesson).
--
-- NUMBERING: 0059 (mayday-record) is the highest in the ledger; 0060 was free at
-- write time (verified against docs/migrations/ + the local of_schema_migrations
-- ledger, 2026-07-16).

-- ── Columns (idempotent) ─────────────────────────────────────────────────────
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_incident_types  JSONB;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_actions         JSONB;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_noaction        TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_fire_detail     JSONB;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_hazsit_detail   JSONB;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_medical_details JSONB;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_aids            JSONB;

-- ── Structural CHECKs (guarded — idempotent re-apply is a no-op) ─────────────
-- types: an array of 1–3 entries when present. Entry shape + one-primary +
-- value membership are server-enforced (D5).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'incidents_neris_types_shape_chk'
                   AND conrelid = 'public.incidents'::regclass) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_types_shape_chk
      CHECK (neris_incident_types IS NULL
             OR (jsonb_typeof(neris_incident_types) = 'array'
                 AND jsonb_array_length(neris_incident_types) BETWEEN 1 AND 3));
  END IF;
END $$;

-- actions: an array when present (values server-enforced).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'incidents_neris_actions_shape_chk'
                   AND conrelid = 'public.incidents'::regclass) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_actions_shape_chk
      CHECK (neris_actions IS NULL OR jsonb_typeof(neris_actions) = 'array');
  END IF;
END $$;

-- noaction: the 3-value stable set (the CAD-clear dispositions — D5 says this one
-- IS small + stable enough to live in a CHECK, like fi_inspections.result_code).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'incidents_neris_noaction_chk'
                   AND conrelid = 'public.incidents'::regclass) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_noaction_chk
      CHECK (neris_noaction IS NULL
             OR neris_noaction IN ('CANCELLED','STAGED_STANDBY','NO_INCIDENT_FOUND'));
  END IF;
END $$;

-- actions XOR noaction: a record cannot claim "we did these things" AND "nothing
-- was done" (NERIS spec rule; failure mode F3). NULL/empty actions + noaction is
-- fine; actions + no noaction is fine; both populated is a contradiction.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'incidents_neris_action_xor_chk'
                   AND conrelid = 'public.incidents'::regclass) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_action_xor_chk
      CHECK (NOT (neris_noaction IS NOT NULL
                  AND jsonb_array_length(COALESCE(neris_actions, '[]'::jsonb)) > 0));
  END IF;
END $$;

-- Module details: structural typeof only (contents server-enforced, D5).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'incidents_neris_fire_detail_chk'
                   AND conrelid = 'public.incidents'::regclass) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_fire_detail_chk
      CHECK (neris_fire_detail IS NULL OR jsonb_typeof(neris_fire_detail) = 'object');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'incidents_neris_hazsit_detail_chk'
                   AND conrelid = 'public.incidents'::regclass) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_hazsit_detail_chk
      CHECK (neris_hazsit_detail IS NULL OR jsonb_typeof(neris_hazsit_detail) = 'object');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'incidents_neris_medical_details_chk'
                   AND conrelid = 'public.incidents'::regclass) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_medical_details_chk
      CHECK (neris_medical_details IS NULL OR jsonb_typeof(neris_medical_details) = 'array');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'incidents_neris_aids_chk'
                   AND conrelid = 'public.incidents'::regclass) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_aids_chk
      CHECK (neris_aids IS NULL OR jsonb_typeof(neris_aids) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN public.incidents.neris_incident_types IS
  'NERIS incident types: JSONB array of {value, primary}, 1-3 entries, exactly one '
  'primary. Values are verbatim ||-path strings from the live spec (D2); membership '
  'enforced server-side (constants/neris), shape enforced here (D5).';
COMMENT ON COLUMN public.incidents.neris_noaction IS
  'NERIS type_noaction (CANCELLED / STAGED_STANDBY / NO_INCIDENT_FOUND). Mutually '
  'exclusive with a non-empty neris_actions (XOR CHECK). The legacy free-text '
  'disposition column is display-only history and never drives a decision.';

-- Stamp the ledger (of_schema_migrations stays 1:1 with the files).
INSERT INTO public.of_schema_migrations (filename)
VALUES ('0060-neris-incident-record.sql')
ON CONFLICT DO NOTHING;
