/**
 * nerisEnums.test.js — the NERIS control-value enums are GENERATED from the live
 * OpenAPI spec (D1, docs/NERIS-BULLETPROOF-BUILD-2026-07-16.md). These values go
 * into a submittable federal record, so the tests fence the two ways a wrong one
 * gets there: a stale/hand-edited enum, and a validator that matches loosely
 * (the /^pass\b/i lesson — D2 says EXACT match, never pattern, never case-fold).
 *
 * Every literal below was verified against the LIVE api.neris.fsri.org/v1 spec
 * (v1.4.76, 2026-07-16). If a regeneration breaks one of these, that is NERIS
 * revving its value sets — review the diff, don't just update the number.
 */
const test = require('node:test');
const assert = require('node:assert');
const {
  NERIS_SPEC_VERSION,
  TYPE_INCIDENT_VALUES, TYPE_ACTION_TACTIC_VALUES, TYPE_NOACTION_VALUES,
  TYPE_MEDICAL_PATIENT_CARE_VALUES, TYPE_FIRE_CONDITION_ARRIVAL_VALUES,
  isValidIncidentType, isValidActionTactic, isValidNoaction,
  isValidMedicalPatientCare, isValidFireConditionArrival,
  // Phase-2 Wave 2 sets (P2-D1/P2-D2)
  TYPE_WATER_SUPPLY_VALUES, TYPE_FIRE_INVEST_NEED_VALUES, TYPE_FIRE_INVEST_TYPE_VALUES,
  TYPE_SUPPRESS_APPLIANCE_VALUES, TYPE_FIRE_BLDG_DAMAGE_VALUES, TYPE_ROOM_VALUES,
  TYPE_FIRE_CAUSE_IN_VALUES, TYPE_FIRE_CAUSE_OUT_VALUES, TYPE_CASUALTY_CAUSE_VALUES,
  TYPE_RESPONSE_MODE_VALUES, TYPE_DISPLACE_CAUSE_INCIDENT_VALUES,
  isValidWaterSupply, isValidFireInvestNeed, isValidFireInvestType,
  isValidSuppressAppliance, isValidFireBldgDamage, isValidRoom,
  isValidFireCauseIn, isValidFireCauseOut, isValidCasualtyCause,
  isValidResponseMode, isValidDisplaceCauseIncident,
  // FP-W2 — Fire Protection module sets
  TYPE_ALARM_SMOKE_VALUES, TYPE_ALARM_FIRE_VALUES, TYPE_ALARM_OTHER_VALUES,
  TYPE_ALARM_OPERATION_VALUES, TYPE_ALARM_FAILURE_VALUES, TYPE_OCCUPANT_RESPONSE_VALUES,
  TYPE_SUPPRESS_FIRE_VALUES, TYPE_FULL_PARTIAL_VALUES, TYPE_SUPPRESS_NO_OPERATION_VALUES,
  TYPE_SUPPRESS_OPERATION_VALUES, TYPE_SUPPRESS_COOKING_VALUES,
  FIRE_PROTECTION_PRESENCE_VALUES, FIRE_PROTECTION_LABELS,
  isValidAlarmSmoke, isValidAlarmFire, isValidAlarmOther, isValidAlarmOperation,
  isValidAlarmFailure, isValidOccupantResponse, isValidSuppressFire, isValidFullPartial,
  isValidSuppressNoOperation, isValidSuppressOperation, isValidSuppressCooking,
  isValidFireProtectionPresence,
} = require('../constants/neris');

test('the enum layer is pinned to a spec version', () => {
  assert.match(NERIS_SPEC_VERSION, /^\d+\.\d+\.\d+$/);
});

test('type_noaction is EXACTLY the stable 3-value set (the CAD-clear dispositions)', () => {
  // This is the one set small + stable enough to also live in a DB CHECK (D5).
  assert.deepEqual(
    [...TYPE_NOACTION_VALUES].sort(),
    ['CANCELLED', 'NO_INCIDENT_FOUND', 'STAGED_STANDBY'],
  );
});

test('type_action_tactic: 16 top-level groups, and INVESTIGATION is a bare 1-level value', () => {
  assert.ok(TYPE_ACTION_TACTIC_VALUES.includes('INVESTIGATION'));
  const groups = new Set(TYPE_ACTION_TACTIC_VALUES.map((v) => v.split('||')[0]));
  assert.equal(groups.size, 16);
});

test('type_fire_condition_arrival is the 6-value set including FIRE_OUT_UPON_ARRIVAL', () => {
  assert.equal(TYPE_FIRE_CONDITION_ARRIVAL_VALUES.length, 6);
  assert.ok(TYPE_FIRE_CONDITION_ARRIVAL_VALUES.includes('FIRE_OUT_UPON_ARRIVAL'));
});

test('type_incident carries the live-API values the framework repo gets wrong (D1)', () => {
  // BACKCOUNTRY_RESCUE is the corrected spelling — the unmaintained GitHub repo drifted.
  assert.ok(isValidIncidentType('RESCUE||OUTSIDE||BACKCOUNTRY_RESCUE'));
  assert.ok(isValidIncidentType('NOEMERG||FALSE_ALARM||ACCIDENTAL_ALARM'));
  assert.ok(isValidIncidentType('FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE'));
  assert.ok(TYPE_INCIDENT_VALUES.includes('FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE'));
});

test('type_medical_patient_care includes PATIENT_DEAD_ON_ARRIVAL', () => {
  assert.ok(TYPE_MEDICAL_PATIENT_CARE_VALUES.includes('PATIENT_DEAD_ON_ARRIVAL'));
  assert.ok(isValidMedicalPatientCare('PATIENT_DEAD_ON_ARRIVAL'));
});

test('validators are EXACT match — no morphology, no case-folding, no coercion (D2)', () => {
  // The 'Passed' class of bug: a near-miss must NEVER validate.
  assert.ok(!isValidIncidentType('Passed'));
  assert.ok(!isValidActionTactic('Passed'));
  assert.ok(isValidNoaction('CANCELLED'));
  assert.ok(!isValidNoaction('cancelled'));           // case is load-bearing
  assert.ok(!isValidNoaction('CANCELLED '));          // whitespace is load-bearing
  assert.ok(!isValidFireConditionArrival('FIRE_OUT')); // a prefix is not a value
  for (const fn of [isValidIncidentType, isValidActionTactic, isValidNoaction,
                    isValidMedicalPatientCare, isValidFireConditionArrival]) {
    assert.ok(!fn(''));
    assert.ok(!fn(null));
    assert.ok(!fn(undefined));
  }
});

test('the exported arrays are frozen — nothing mutates the vocabulary at runtime', () => {
  assert.ok(Object.isFrozen(TYPE_NOACTION_VALUES));
  assert.ok(Object.isFrozen(TYPE_INCIDENT_VALUES));
  assert.throws(() => { TYPE_NOACTION_VALUES.push('MADE_UP'); }, TypeError);
});

// ─── Phase-2 Wave 2 sets (P2-D1/P2-D2, F26) ─────────────────────────────────────
// Pinned values verified against the vendored snapshot (spec v1.4.76, 2026-07-16).
// NOTE: the schema behind type_fire_invest_type is TypeFireInvestValue — that IS the
// items $ref of FirePayload.investigation_types (there is no "TypeFireInvestTypeValue").

const WAVE2_SETS = [
  // [label, values, validator, pinned real values (1–2), near-miss that must reject]
  ['type_water_supply', TYPE_WATER_SUPPLY_VALUES, isValidWaterSupply,
    ['HYDRANT_LESS_500', 'WATER_TENDER_SHUTTLE'], 'HYDRANT'],
  ['type_fire_invest_need', TYPE_FIRE_INVEST_NEED_VALUES, isValidFireInvestNeed,
    ['YES', 'NO_CAUSE_OBVIOUS'], 'YES_'],
  ['type_fire_invest_type', TYPE_FIRE_INVEST_TYPE_VALUES, isValidFireInvestType,
    ['INVESTIGATED_BY_ARSON_FIRE_INVESTIGATOR', 'INVESTIGATED_ON_SCENE_RESOURCE'], 'INVESTIGATED'],
  ['type_suppress_appliance', TYPE_SUPPRESS_APPLIANCE_VALUES, isValidSuppressAppliance,
    ['MASTER_STREAM', 'SMALL_DIAMETER_FIRE_HOSE'], 'FIRE_HOSE'],
  ['type_fire_bldg_damage', TYPE_FIRE_BLDG_DAMAGE_VALUES, isValidFireBldgDamage,
    ['MAJOR_DAMAGE', 'NO_DAMAGE'], 'DAMAGE'],
  ['type_room', TYPE_ROOM_VALUES, isValidRoom,
    ['KITCHEN', 'BEDROOM'], 'KITCHENS'],
  ['type_fire_cause_in', TYPE_FIRE_CAUSE_IN_VALUES, isValidFireCauseIn,
    ['COOKING', 'UNABLE_TO_BE_DETERMINED'], 'COOKING_'],
  ['type_fire_cause_out', TYPE_FIRE_CAUSE_OUT_VALUES, isValidFireCauseOut,
    ['DEBRIS_OPEN_BURNING', 'SPREAD_FROM_CONTROLLED_BURN'], 'DEBRIS'],
  ['type_casualty_cause', TYPE_CASUALTY_CAUSE_VALUES, isValidCasualtyCause,
    ['CAUGHT_TRAPPED_BY_FIRE_EXPLOSION', 'STRESS_OVEREXERTION'], 'CAUGHT_TRAPPED'],
  ['type_response_mode', TYPE_RESPONSE_MODE_VALUES, isValidResponseMode,
    ['EMERGENT', 'NON_EMERGENT'], 'LIGHTS_SIRENS'],
  ['type_displace_cause_incident', TYPE_DISPLACE_CAUSE_INCIDENT_VALUES, isValidDisplaceCauseIncident,
    ['FIRE', 'UTILITIES'], 'HAZARD'],
];

for (const [label, values, validator, pinned, nearMiss] of WAVE2_SETS) {
  test(`${label}: non-empty, frozen, exact-match validator, pinned live values`, () => {
    assert.ok(values.length > 0, `${label} must not be empty`);
    assert.ok(Object.isFrozen(values), `${label} must be frozen`);
    assert.throws(() => { values.push('MADE_UP'); }, TypeError);
    for (const v of pinned) {
      assert.ok(values.includes(v), `${label} should contain ${v}`);
      assert.ok(validator(v), `validator should accept ${v}`);
      assert.ok(!validator(v.toLowerCase()), `lowercase ${v} must be rejected — case is load-bearing`);
      assert.ok(!validator(` ${v}`), 'leading whitespace must be rejected');
    }
    assert.ok(!validator(nearMiss), `near-miss "${nearMiss}" must be rejected — nothing pattern-matches a NERIS value`);
    assert.ok(!validator(''));
    assert.ok(!validator(null));
    assert.ok(!validator(undefined));
  });
}

test('type_fire_cause_in and type_fire_cause_out are DIFFERENT sets (P2-D1 — never conflate)', () => {
  assert.notDeepEqual([...TYPE_FIRE_CAUSE_IN_VALUES].sort(), [...TYPE_FIRE_CAUSE_OUT_VALUES].sort());
  // Values live in one and not the other — an in-structure cause is not an outside cause.
  assert.ok(TYPE_FIRE_CAUSE_IN_VALUES.includes('COOKING'));
  assert.ok(!TYPE_FIRE_CAUSE_OUT_VALUES.includes('COOKING'));
  assert.ok(TYPE_FIRE_CAUSE_OUT_VALUES.includes('SPREAD_FROM_CONTROLLED_BURN'));
  assert.ok(!TYPE_FIRE_CAUSE_IN_VALUES.includes('SPREAD_FROM_CONTROLLED_BURN'));
  assert.ok(isValidFireCauseIn('COOKING') && !isValidFireCauseOut('COOKING'));
});

test('type_response_mode is EXACTLY {EMERGENT, NON_EMERGENT} — the spec term, not "lights and sirens"', () => {
  assert.deepEqual([...TYPE_RESPONSE_MODE_VALUES].sort(), ['EMERGENT', 'NON_EMERGENT']);
  assert.ok(isValidResponseMode('EMERGENT'));
  assert.ok(!isValidResponseMode('LIGHTS_SIRENS')); // plausible guess, NOT a NERIS value
});

// ─── FP-W2 — Fire Protection module sets (alarm/suppression) ────────────────────
// Pinned values verified against the vendored snapshot (spec v1.4.76, 2026-07-20).

const FP_SETS = [
  ['type_alarm_smoke', TYPE_ALARM_SMOKE_VALUES, isValidAlarmSmoke,
    ['HARDWIRED', 'HARD_OF_HEARING_WITH_STROBE'], 'HARDWIRE'],
  ['type_alarm_fire', TYPE_ALARM_FIRE_VALUES, isValidAlarmFire,
    ['AUTOMATIC', 'MANUAL_AND_AUTOMATIC'], 'AUTO'],
  ['type_alarm_other', TYPE_ALARM_OTHER_VALUES, isValidAlarmOther,
    ['CARBON_MONOXIDE', 'NATURAL_GAS'], 'CO'],
  ['type_alarm_operation', TYPE_ALARM_OPERATION_VALUES, isValidAlarmOperation,
    ['OPERATED_ALERTED_OCCUPANT', 'INSUFFICIENT_SOURCE'], 'OPERATED'],
  ['type_alarm_failure', TYPE_ALARM_FAILURE_VALUES, isValidAlarmFailure,
    ['NO_BATTERY', 'UNABLE_TO_DETERMINE'], 'BATTERY'],
  ['type_occupant_response', TYPE_OCCUPANT_RESPONSE_VALUES, isValidOccupantResponse,
    ['EVACUATED', 'IGNORED_ALARM'], 'EVACUATE'],
  ['type_suppress_fire', TYPE_SUPPRESS_FIRE_VALUES, isValidSuppressFire,
    ['WET_PIPE_SPRINKLER_SYSTEM', 'CLEAN_AGENT_SYSTEM'], 'SPRINKLER'],
  ['type_full_partial', TYPE_FULL_PARTIAL_VALUES, isValidFullPartial,
    ['FULL', 'EXTENT_UNKNOWN'], 'PARTIAL_COVERAGE'],
  ['type_suppress_no_operation', TYPE_SUPPRESS_NO_OPERATION_VALUES, isValidSuppressNoOperation,
    ['SYSTEM_SHUTOFF_PRIOR_TO_INCIDENT', 'INSUFFICIENT_WATER_SUPPLY'], 'SYSTEM_SHUTOFF'],
  ['type_suppress_operation', TYPE_SUPPRESS_OPERATION_VALUES, isValidSuppressOperation,
    ['OPERATED_EFFECTIVE', 'NO_OPERATION'], 'EFFECTIVE'],
  ['type_suppress_cooking', TYPE_SUPPRESS_COOKING_VALUES, isValidSuppressCooking,
    ['COMMERCIAL_HOOD_SUPPRESSION', 'TEMPERATURE_LIMITING_STOVE'], 'HOOD'],
];

for (const [label, values, validator, pinned, nearMiss] of FP_SETS) {
  test(`${label}: non-empty, frozen, exact-match validator, pinned live values`, () => {
    assert.ok(values.length > 0, `${label} must not be empty`);
    assert.ok(Object.isFrozen(values), `${label} must be frozen`);
    for (const v of pinned) {
      assert.ok(values.includes(v), `${label} should contain ${v}`);
      assert.ok(validator(v), `validator should accept ${v}`);
      assert.ok(!validator(v.toLowerCase()), `lowercase ${v} must be rejected`);
    }
    assert.ok(!validator(nearMiss), `near-miss "${nearMiss}" must be rejected`);
    assert.ok(!validator('') && !validator(null) && !validator(undefined));
  });
}

test('fire_protection_presence is EXACTLY the tri-state — no UNKNOWN at presence level (deliberate)', () => {
  // NERIS forces the present/not-present commitment; UNKNOWN lives only in leaf enums.
  assert.deepEqual([...FIRE_PROTECTION_PRESENCE_VALUES].sort(),
    ['NOT_APPLICABLE', 'NOT_PRESENT', 'PRESENT']);
  assert.ok(isValidFireProtectionPresence('PRESENT'));
  assert.ok(!isValidFireProtectionPresence('UNKNOWN'));
  assert.ok(!isValidFireProtectionPresence('present'));
});

test('smoke-alarm operation discriminator values ARE type_alarm_operation (one set, two uses)', () => {
  // SmokeAlarmOperationPayload's discriminator mapping keys equal TypeAlarmOperationValue —
  // verified in the snapshot; if a spec rev splits them, the generator needs a new set.
  assert.deepEqual([...TYPE_ALARM_OPERATION_VALUES].sort(), [
    'FAILED_TO_OPERATE', 'INSUFFICIENT_SOURCE', 'NO_OCCUPANT_TO_NOTIFY',
    'OPERATED_ALERTED_OCCUPANT', 'OPERATED_FAILED_TO_ALERT_OCCUPANT',
  ]);
});

test('FIRE_PROTECTION_LABELS carries the official x-ui wording for all five modules', () => {
  for (const mod of ['smoke_alarm', 'fire_alarm', 'other_alarm', 'fire_suppression', 'cooking_fire_suppression']) {
    assert.ok(FIRE_PROTECTION_LABELS[mod], `labels missing module ${mod}`);
    assert.ok(FIRE_PROTECTION_LABELS[mod].presence
      && typeof FIRE_PROTECTION_LABELS[mod].presence.label === 'string'
      && FIRE_PROTECTION_LABELS[mod].presence.label.length > 10,
      `labels missing presence wording for ${mod}`);
  }
  // Pin one string verbatim — the smoke-alarm question is the flagship CRR wording.
  assert.equal(FIRE_PROTECTION_LABELS.smoke_alarm.presence.label,
    'Describe whether there was at least one smoke alarm present.');
});
