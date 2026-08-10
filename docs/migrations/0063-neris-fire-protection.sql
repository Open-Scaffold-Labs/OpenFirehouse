-- 0063 — NERIS Fire Protection modules (FP storage decision, 2026-07-20)
--
-- One new JSONB column on incidents: neris_fire_protection. Holds the five
-- IncidentPayload fire-protection modules VERBATIM in the spec's own shape (D2):
--   { smoke_alarm?, fire_alarm?, other_alarm?, fire_suppression?,
--     cooking_fire_suppression? }
-- each value being the module payload, e.g.
--   { "presence": { "type": "PRESENT", "working": true, "alarm_types": [...],
--                   "operation": { "type": "OPERATED_ALERTED_OCCUPANT", ... } } }
--
-- WHY A DEDICATED COLUMN (not keys inside neris_fire_detail): in the NERIS spec
-- these five modules are TOP-LEVEL SIBLINGS of fire_detail on IncidentPayload,
-- not children of it — and the official NERIS platform captures fire-protection
-- data on ANY incident type (CRR value), while neris_fire_detail is coupled to
-- FIRE incident types. Nesting them would create an internal dialect (D2) and
-- structurally block non-fire capture.
--
-- Per D5 the CHECK is STRUCTURAL ONLY (jsonb object). Value membership —
-- presence tri-state, discriminated-union branches, leaf enums — is enforced in
-- the server constants layer (constants/neris, spec v1.4.76) + utils/
-- nerisValidate.js, so a NERIS V2 value-set change never needs a migration.
--
-- Requirement rule (server-enforced, transformer): FIRE||STRUCTURE_FIRE incidents
-- require smoke_alarm + fire_alarm + other_alarm + fire_suppression (and
-- CONFINED_COOKING_APPLIANCE_FIRE additionally requires cooking_fire_suppression)
-- unless ALL aids are SUPPORT_AID GIVEN — mirrored from the live NERIS validator.
--
-- Apply: psql $DATABASE_URL -f docs/migrations/0063-neris-fire-protection.sql
-- Mirrored into server/src/db.js (CREATE TABLE + 0063 self-heal block).

ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_fire_protection JSONB;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'incidents_neris_fire_protection_chk'
      AND conrelid = 'public.incidents'::regclass
  ) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_fire_protection_chk
      CHECK (neris_fire_protection IS NULL OR jsonb_typeof(neris_fire_protection) = 'object');
  END IF;
END $$;
