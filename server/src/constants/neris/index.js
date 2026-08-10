'use strict';
/**
 * constants/neris/index.js — the NERIS control-value enums. Server-owned, GENERATED.
 *
 * ── SOURCE OF TRUTH (decision D1, docs/NERIS-BULLETPROOF-BUILD-2026-07-16.md) ────────
 * The values in ./enums.json are machine-extracted from the LIVE production NERIS
 * OpenAPI spec (https://api.neris.fsri.org/v1/openapi.json). The GitHub framework
 * repo (ulfsri/neris-framework) is NOT the source of truth — it is unmaintained and
 * has drifted from the live API (the BACKCOUNTRY_RESCUE spelling, the 2-level
 * MEDICAL||ILLNESS / MEDICAL||INJURY incident types, extra incident statuses).
 *
 * Spec version pinned in enums.json (`spec_version`, currently 1.4.76). Regenerate:
 *
 *     node scripts/gen-neris-enums.js            # fetch live spec, rewrite enums.json
 *     node scripts/gen-neris-enums.js --check    # drift check against the live API
 *
 * NEVER edit enums.json by hand. When NERIS V2 lands, the swap is one regeneration —
 * that isolation is the point of this layer (D5: the DB CHECKs stay structural).
 *
 * ── THE RULE (D2 — the /^pass\b/i lesson) ────────────────────────────────────────────
 * These are CONTROL VALUES on a legal record, stored verbatim in the standard's own
 * format (`||`-delimited path strings, e.g. FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE).
 * The validators below are EXACT string match on the closed set — never pattern-matched,
 * never case-normalized, never prefix-matched. Nothing in this file matches a substring,
 * and nothing ever will.
 */
const enums = require('./enums.json');

/** Fail LOUDLY if enums.json is missing a set — never serve a partial vocabulary. */
function setFor(key) {
  const arr = enums.sets && enums.sets[key];
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(`constants/neris: enums.json has no set "${key}" — regenerate: node scripts/gen-neris-enums.js`);
  }
  return Object.freeze(arr.slice());
}

const NERIS_SPEC_VERSION = enums.spec_version;

const TYPE_INCIDENT_VALUES               = setFor('type_incident');
const TYPE_ACTION_TACTIC_VALUES          = setFor('type_action_tactic');
const TYPE_NOACTION_VALUES               = setFor('type_noaction');
const TYPE_MEDICAL_PATIENT_CARE_VALUES   = setFor('type_medical_patient_care');
const TYPE_MEDICAL_TRANSPORT_VALUES      = setFor('type_medical_transport');
const TYPE_MEDICAL_PATIENT_STATUS_VALUES = setFor('type_medical_patient_status');
const TYPE_HAZARD_DISPOSITION_VALUES     = setFor('type_hazard_disposition');
const TYPE_FIRE_CONDITION_ARRIVAL_VALUES = setFor('type_fire_condition_arrival');
const TYPE_AID_VALUES                    = setFor('type_aid');
const TYPE_AID_DIRECTION_VALUES          = setFor('type_aid_direction');
const TYPE_AID_NONFD_VALUES              = setFor('type_aid_nonfd');
const TYPE_SPECIAL_MODIFIER_VALUES       = setFor('type_special_modifier');
const TYPE_INCIDENT_STATUS_VALUES        = setFor('type_incident_status');
// ── Phase-2 Wave 2 (P2-D1/P2-D2) — fire module + casualty + response sets ─────────
const TYPE_WATER_SUPPLY_VALUES           = setFor('type_water_supply');
const TYPE_FIRE_INVEST_NEED_VALUES       = setFor('type_fire_invest_need');
const TYPE_FIRE_INVEST_TYPE_VALUES       = setFor('type_fire_invest_type');
const TYPE_SUPPRESS_APPLIANCE_VALUES     = setFor('type_suppress_appliance');
const TYPE_FIRE_BLDG_DAMAGE_VALUES       = setFor('type_fire_bldg_damage');
const TYPE_ROOM_VALUES                   = setFor('type_room');
const TYPE_FIRE_CAUSE_IN_VALUES          = setFor('type_fire_cause_in');
const TYPE_FIRE_CAUSE_OUT_VALUES         = setFor('type_fire_cause_out');
const TYPE_CASUALTY_CAUSE_VALUES         = setFor('type_casualty_cause');
const TYPE_RESPONSE_MODE_VALUES          = setFor('type_response_mode');
const TYPE_DISPLACE_CAUSE_INCIDENT_VALUES = setFor('type_displace_cause_incident');
// ── FP (Fire Protection modules, FP-W2) — alarm/suppression sets ──────────────────
const TYPE_ALARM_SMOKE_VALUES            = setFor('type_alarm_smoke');
const TYPE_ALARM_FIRE_VALUES             = setFor('type_alarm_fire');
const TYPE_ALARM_OTHER_VALUES            = setFor('type_alarm_other');
const TYPE_ALARM_OPERATION_VALUES        = setFor('type_alarm_operation');
const TYPE_ALARM_FAILURE_VALUES          = setFor('type_alarm_failure');
const TYPE_OCCUPANT_RESPONSE_VALUES      = setFor('type_occupant_response');
const TYPE_SUPPRESS_FIRE_VALUES          = setFor('type_suppress_fire');
const TYPE_FULL_PARTIAL_VALUES           = setFor('type_full_partial');
const TYPE_SUPPRESS_NO_OPERATION_VALUES  = setFor('type_suppress_no_operation');
const TYPE_SUPPRESS_OPERATION_VALUES     = setFor('type_suppress_operation');
const TYPE_SUPPRESS_COOKING_VALUES       = setFor('type_suppress_cooking');
const FIRE_PROTECTION_PRESENCE_VALUES    = setFor('fire_protection_presence');

/**
 * FP-W2: the spec's own on-screen wording (x-ui-label / x-ui-hint), generated from
 * the vendored snapshot. Client wording is drift-tested against this — never retyped.
 */
const FIRE_PROTECTION_LABELS = Object.freeze(enums.fire_protection_labels || {});
if (!Object.keys(FIRE_PROTECTION_LABELS).length) {
  throw new Error('constants/neris: enums.json has no fire_protection_labels — regenerate: node scripts/gen-neris-enums.js');
}

/** O(1) membership. EXACT match only: a non-string is never a NERIS value. */
const exactMatch = (values) => {
  const set = new Set(values);
  return (v) => typeof v === 'string' && set.has(v);
};

const isValidIncidentType         = exactMatch(TYPE_INCIDENT_VALUES);
const isValidActionTactic         = exactMatch(TYPE_ACTION_TACTIC_VALUES);
const isValidNoaction             = exactMatch(TYPE_NOACTION_VALUES);
const isValidMedicalPatientCare   = exactMatch(TYPE_MEDICAL_PATIENT_CARE_VALUES);
const isValidMedicalTransport     = exactMatch(TYPE_MEDICAL_TRANSPORT_VALUES);
const isValidMedicalPatientStatus = exactMatch(TYPE_MEDICAL_PATIENT_STATUS_VALUES);
const isValidHazardDisposition    = exactMatch(TYPE_HAZARD_DISPOSITION_VALUES);
const isValidFireConditionArrival = exactMatch(TYPE_FIRE_CONDITION_ARRIVAL_VALUES);
const isValidAid                  = exactMatch(TYPE_AID_VALUES);
const isValidAidDirection         = exactMatch(TYPE_AID_DIRECTION_VALUES);
const isValidAidNonfd             = exactMatch(TYPE_AID_NONFD_VALUES);
const isValidSpecialModifier      = exactMatch(TYPE_SPECIAL_MODIFIER_VALUES);
const isValidIncidentStatus       = exactMatch(TYPE_INCIDENT_STATUS_VALUES);
const isValidWaterSupply          = exactMatch(TYPE_WATER_SUPPLY_VALUES);
const isValidFireInvestNeed       = exactMatch(TYPE_FIRE_INVEST_NEED_VALUES);
const isValidFireInvestType       = exactMatch(TYPE_FIRE_INVEST_TYPE_VALUES);
const isValidSuppressAppliance    = exactMatch(TYPE_SUPPRESS_APPLIANCE_VALUES);
const isValidFireBldgDamage       = exactMatch(TYPE_FIRE_BLDG_DAMAGE_VALUES);
const isValidRoom                 = exactMatch(TYPE_ROOM_VALUES);
const isValidFireCauseIn          = exactMatch(TYPE_FIRE_CAUSE_IN_VALUES);
const isValidFireCauseOut         = exactMatch(TYPE_FIRE_CAUSE_OUT_VALUES);
const isValidCasualtyCause        = exactMatch(TYPE_CASUALTY_CAUSE_VALUES);
const isValidResponseMode         = exactMatch(TYPE_RESPONSE_MODE_VALUES);
const isValidDisplaceCauseIncident = exactMatch(TYPE_DISPLACE_CAUSE_INCIDENT_VALUES);
const isValidAlarmSmoke           = exactMatch(TYPE_ALARM_SMOKE_VALUES);
const isValidAlarmFire            = exactMatch(TYPE_ALARM_FIRE_VALUES);
const isValidAlarmOther           = exactMatch(TYPE_ALARM_OTHER_VALUES);
const isValidAlarmOperation       = exactMatch(TYPE_ALARM_OPERATION_VALUES);
const isValidAlarmFailure         = exactMatch(TYPE_ALARM_FAILURE_VALUES);
const isValidOccupantResponse     = exactMatch(TYPE_OCCUPANT_RESPONSE_VALUES);
const isValidSuppressFire         = exactMatch(TYPE_SUPPRESS_FIRE_VALUES);
const isValidFullPartial          = exactMatch(TYPE_FULL_PARTIAL_VALUES);
const isValidSuppressNoOperation  = exactMatch(TYPE_SUPPRESS_NO_OPERATION_VALUES);
const isValidSuppressOperation    = exactMatch(TYPE_SUPPRESS_OPERATION_VALUES);
const isValidSuppressCooking      = exactMatch(TYPE_SUPPRESS_COOKING_VALUES);
const isValidFireProtectionPresence = exactMatch(FIRE_PROTECTION_PRESENCE_VALUES);

module.exports = {
  NERIS_SPEC_VERSION,
  TYPE_INCIDENT_VALUES,
  TYPE_ACTION_TACTIC_VALUES,
  TYPE_NOACTION_VALUES,
  TYPE_MEDICAL_PATIENT_CARE_VALUES,
  TYPE_MEDICAL_TRANSPORT_VALUES,
  TYPE_MEDICAL_PATIENT_STATUS_VALUES,
  TYPE_HAZARD_DISPOSITION_VALUES,
  TYPE_FIRE_CONDITION_ARRIVAL_VALUES,
  TYPE_AID_VALUES,
  TYPE_AID_DIRECTION_VALUES,
  TYPE_AID_NONFD_VALUES,
  TYPE_SPECIAL_MODIFIER_VALUES,
  TYPE_INCIDENT_STATUS_VALUES,
  TYPE_WATER_SUPPLY_VALUES,
  TYPE_FIRE_INVEST_NEED_VALUES,
  TYPE_FIRE_INVEST_TYPE_VALUES,
  TYPE_SUPPRESS_APPLIANCE_VALUES,
  TYPE_FIRE_BLDG_DAMAGE_VALUES,
  TYPE_ROOM_VALUES,
  TYPE_FIRE_CAUSE_IN_VALUES,
  TYPE_FIRE_CAUSE_OUT_VALUES,
  TYPE_CASUALTY_CAUSE_VALUES,
  TYPE_RESPONSE_MODE_VALUES,
  TYPE_DISPLACE_CAUSE_INCIDENT_VALUES,
  TYPE_ALARM_SMOKE_VALUES,
  TYPE_ALARM_FIRE_VALUES,
  TYPE_ALARM_OTHER_VALUES,
  TYPE_ALARM_OPERATION_VALUES,
  TYPE_ALARM_FAILURE_VALUES,
  TYPE_OCCUPANT_RESPONSE_VALUES,
  TYPE_SUPPRESS_FIRE_VALUES,
  TYPE_FULL_PARTIAL_VALUES,
  TYPE_SUPPRESS_NO_OPERATION_VALUES,
  TYPE_SUPPRESS_OPERATION_VALUES,
  TYPE_SUPPRESS_COOKING_VALUES,
  FIRE_PROTECTION_PRESENCE_VALUES,
  FIRE_PROTECTION_LABELS,
  isValidIncidentType,
  isValidActionTactic,
  isValidNoaction,
  isValidMedicalPatientCare,
  isValidMedicalTransport,
  isValidMedicalPatientStatus,
  isValidHazardDisposition,
  isValidFireConditionArrival,
  isValidAid,
  isValidAidDirection,
  isValidAidNonfd,
  isValidSpecialModifier,
  isValidIncidentStatus,
  isValidWaterSupply,
  isValidFireInvestNeed,
  isValidFireInvestType,
  isValidSuppressAppliance,
  isValidFireBldgDamage,
  isValidRoom,
  isValidFireCauseIn,
  isValidFireCauseOut,
  isValidCasualtyCause,
  isValidResponseMode,
  isValidDisplaceCauseIncident,
  isValidAlarmSmoke,
  isValidAlarmFire,
  isValidAlarmOther,
  isValidAlarmOperation,
  isValidAlarmFailure,
  isValidOccupantResponse,
  isValidSuppressFire,
  isValidFullPartial,
  isValidSuppressNoOperation,
  isValidSuppressOperation,
  isValidSuppressCooking,
  isValidFireProtectionPresence,
};
