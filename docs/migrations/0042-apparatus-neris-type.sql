-- 0042 — apparatus.neris_type: adopt the NERIS unit-type vocabulary
--
-- WHY
-- ---
-- NFIRS sunset in Feb 2026. NERIS is the federal standard now and every RMS/CAD
-- vendor is being certified against it. Our apparatus.type is currently free text
-- and has already drifted: prod holds BOTH "Ladder" and "Ladder / Aerial", BOTH
-- "Ambulance" and "Ambulance / EMS" — and "Ladder" covers Truck 1/2/3 AND Tower
-- Ladder 1, which NERIS treats as different types. Free text cannot be exported to
-- a federal standard without a lossy translation layer, and the drift compounds.
--
-- Adopting NERIS `type_unit` VERBATIM (49 values) means our apparatus records are
-- NERIS-submittable with no translation. We do NOT invent an OF-local vocabulary.
-- Source: github.com/ulfsri/neris-framework — core_schemas/value_sets/csv/type_unit.csv
--
-- HOW NERIS RESOLVES THE "Truck vs Tanker" PROBLEM (the reason this exists):
--   • TENDER     = "Water Tender/Tanker" — ONE type covers both words.
--   • AIR_TANKER = the fixed-wing AIRCRAFT — a separate type (in NWCG vocabulary
--                  "tanker" means an aircraft).
--   • The aerial side is split FINER, not merged: LADDER_SMALL / LADDER_TALL /
--     LADDER_QUINT / QUINT_TALL / PLATFORM / PLATFORM_QUINT / LADDER_TILLER,
--     keyed on aerial length (<75' vs 75'+) and pump capability.
--   • No Brush type (→ ENGINE_WUI). No Battalion type (→ CHIEF_STAFF_COMMAND).
-- And decisively: NERIS documents the radio nomenclature ("Tanker, Tender, Engine")
-- but never makes it authoritative. Unit identity is the registered cad_designation;
-- the type is a SEPARATELY-SUBMITTED field. The standard NEVER infers type from the
-- designator — which is exactly the rule unitParse.js already follows.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- -------------------------------
-- It does NOT drop or overwrite apparatus.type. That column stays as the DISPLAY
-- label — what the crew actually calls the rig ("Tower Ladder 1"). NERIS has no
-- opinion on that and shouldn't.
--
-- It does NOT guess. The backfill maps only the legacy words that carry enough
-- information to be certain (Engine, Brush, Tanker, Command, Utility). It leaves
-- neris_type NULL for:
--   Ladder/Truck → 7 candidates (needs aerial length + pump)
--   Rescue       → 5 candidates (heavy/medium/light/USAR/water)
--   Ambulance    → 2 candidates (ALS vs BLS — depends on licensure)
-- Writing a wrong type into a federally-reportable record is worse than leaving it
-- blank for the chief to complete. Same doctrine as unit resolution: an honest gap
-- beats a confident lie.
--
-- Apply by hand (Supabase MCP) AND mirror into server/src/db.js for fresh installs.

ALTER TABLE apparatus
  ADD COLUMN IF NOT EXISTS neris_type TEXT;

-- Constrain to the 49 active NERIS values (NULL = "a human still has to choose").
ALTER TABLE apparatus DROP CONSTRAINT IF EXISTS apparatus_neris_type_valid;
ALTER TABLE apparatus ADD CONSTRAINT apparatus_neris_type_valid CHECK (
  neris_type IS NULL OR neris_type IN (
    'CREW_TRANS','ENGINE_STRUCT','ENGINE_WUI','BOAT','BOAT_LARGE',
    'LADDER_SMALL','LADDER_QUINT','LADDER_TALL','QUINT_TALL','PLATFORM',
    'PLATFORM_QUINT','LADDER_TILLER','ARFF','FOAM','TENDER','CREW',
    'HELO_GENERAL','HELO_FIRE','HELO_RESCUE','UAS_FIRE','UAS_RECON',
    'AIR_TANKER','AIR_EMS','AIR_RECON','ALS_AMB','BLS_AMB','EMS_NOTRANS',
    'EMS_SUPV','MAB','CHIEF_STAFF_COMMAND','HAZMAT','DECON','POV',
    'RESCUE_HEAVY','RESCUE_MEDIUM','RESCUE_LIGHT','RESCUE_USAR','RESCUE_WATER',
    'SCBA','AIR_LIGHT','REHAB','MOBILE_ICP','MOBILE_COMMS','DOZER',
    'OTHER_GROUND','ATV_EMS','ATV_FIRE','INVEST','UTIL'
  )
);

-- Backfill ONLY the unambiguous legacy words.
UPDATE apparatus SET neris_type = 'ENGINE_STRUCT'
  WHERE neris_type IS NULL AND lower(split_part(type, ' ', 1)) = 'engine';
UPDATE apparatus SET neris_type = 'ENGINE_WUI'
  WHERE neris_type IS NULL AND lower(split_part(type, ' ', 1)) = 'brush';
UPDATE apparatus SET neris_type = 'TENDER'
  WHERE neris_type IS NULL AND lower(split_part(type, ' ', 1)) IN ('tanker','tender');
UPDATE apparatus SET neris_type = 'CHIEF_STAFF_COMMAND'
  WHERE neris_type IS NULL AND lower(split_part(type, ' ', 1)) IN ('command','battalion');
UPDATE apparatus SET neris_type = 'UTIL'
  WHERE neris_type IS NULL AND lower(split_part(type, ' ', 1)) = 'utility';
UPDATE apparatus SET neris_type = 'HAZMAT'
  WHERE neris_type IS NULL AND lower(split_part(type, ' ', 1)) = 'hazmat';

-- Ladder / Rescue / Ambulance are deliberately left NULL — see the header.

CREATE INDEX IF NOT EXISTS idx_apparatus_neris_type
  ON apparatus (department_id, neris_type);
