'use strict';
/**
 * Client↔server NERIS vocabulary drift test (F1 applied to the client).
 *
 * The client UI offers incident types / actions / dispositions from
 * client/src/data/nerisTypes.js; the server enforces the live-spec enums in
 * server/src/constants/neris/enums.json. If the two drift, officers can pick
 * values the server will 422 — this test fails the suite before that ships.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const enums = require('../constants/neris/enums.json');
const { LEGACY_TYPE_MAP: SERVER_LEGACY_MAP } = require('../utils/nerisPayload');

const typeSet = new Set(enums.sets.type_incident);
const actionSet = new Set(enums.sets.type_action_tactic);

const CLIENT_DATA = path.resolve(__dirname, '../../../client/src/data/nerisTypes.js');

async function loadClientData() {
  return import(pathToFileURL(CLIENT_DATA).href);
}

test('every UI incident type maps to a live-spec value', async () => {
  const mod = await loadClientData();
  const { NERIS_INCIDENT_TYPES, toNerisPath } = mod;
  const bad = [];
  for (const [catCode, cat] of Object.entries(NERIS_INCIDENT_TYPES)) {
    for (const [subCode, sub] of Object.entries(cat.subcategories || {})) {
      for (const typeCode of Object.keys(sub.types || {})) {
        const p = toNerisPath(`${catCode}.${subCode}.${typeCode}`);
        if (!typeSet.has(p)) bad.push(p);
      }
    }
  }
  assert.deepEqual(bad, [], `UI incident types not in the live spec: ${bad.join(', ')}`);
});

test('every UI action/tactic maps to a live-spec value', async () => {
  const mod = await loadClientData();
  const { NERIS_ACTIONS_TACTICS, toNerisPath } = mod;
  const bad = [];
  for (const [catCode, cat] of Object.entries(NERIS_ACTIONS_TACTICS)) {
    for (const item of cat.items || []) {
      // Bare single-level values use code:'' — the path is just the category
      const p = toNerisPath(item.code ? `${catCode}.${item.code}` : catCode);
      if (!actionSet.has(p)) bad.push(p);
    }
  }
  assert.deepEqual(bad, [], `UI actions not in the live spec: ${bad.join(', ')}`);
});

test('client and server LEGACY_TYPE_MAP are byte-equal', async () => {
  const mod = await loadClientData();
  assert.deepEqual(mod.LEGACY_TYPE_MAP, SERVER_LEGACY_MAP);
});

test('no-action reasons and hazard dispositions match the live enums exactly', async () => {
  const mod = await loadClientData();
  assert.deepEqual(
    mod.NERIS_NO_ACTION_REASONS.map((r) => r.code).sort(),
    [...enums.sets.type_noaction].sort()
  );
  assert.deepEqual(
    mod.NERIS_HAZARD_DISPOSITIONS.map((r) => r.code).sort(),
    [...enums.sets.type_hazard_disposition].sort()
  );
});

// ── Phase-2 Wave 4 vocabularies (fire module, medical, aid, casualty causes) ──
// Every UI list mirrors its enums.json set EXACTLY (equality, not just subset —
// a value the server accepts but the UI can't offer is a capture gap; a value
// the UI offers but the server rejects is a 422 in an officer's face).
const P2_LIST_TO_ENUM = [
  ['NERIS_FIRE_CONDITIONS', 'type_fire_condition_arrival'],
  ['NERIS_WATER_SUPPLY', 'type_water_supply'],
  ['NERIS_FIRE_INVEST_NEED', 'type_fire_invest_need'],
  ['NERIS_FIRE_INVEST_TYPES', 'type_fire_invest_type'],
  ['NERIS_SUPPRESS_APPLIANCES', 'type_suppress_appliance'],
  ['NERIS_FIRE_BLDG_DAMAGE', 'type_fire_bldg_damage'],
  ['NERIS_ROOMS', 'type_room'],
  ['NERIS_FIRE_CAUSE_IN', 'type_fire_cause_in'],
  ['NERIS_FIRE_CAUSE_OUT', 'type_fire_cause_out'],
  ['NERIS_CASUALTY_CAUSES', 'type_casualty_cause'],
  ['NERIS_MEDICAL_PATIENT_CARE', 'type_medical_patient_care'],
  ['NERIS_MEDICAL_TRANSPORT', 'type_medical_transport'],
  ['NERIS_MEDICAL_PATIENT_STATUS', 'type_medical_patient_status'],
  ['NERIS_AID_TYPES', 'type_aid'],
  ['NERIS_AID_DIRECTIONS', 'type_aid_direction'],
];

test('every Phase-2 vocabulary list matches its live enum set exactly', async () => {
  const mod = await loadClientData();
  for (const [listName, setName] of P2_LIST_TO_ENUM) {
    const list = mod[listName];
    assert.ok(Array.isArray(list) && list.length > 0, `${listName} is missing or empty`);
    assert.ok(enums.sets[setName], `enums.json has no set named ${setName}`);
    assert.deepEqual(
      list.map((x) => x.code).sort(),
      [...enums.sets[setName]].sort(),
      `${listName} drifted from enums.sets.${setName}`
    );
    for (const x of list) {
      assert.ok(x.label && typeof x.label === 'string', `${listName} entry ${x.code} lacks a label`);
    }
  }
});

test('casualty/rescue UI vocabulary matches the server validator exactly (incl. FF grouping)', async () => {
  const mod = await loadClientData();
  // These sets have no enums.json entry — nerisValidate.js is their truth.
  const v = require('../utils/nerisValidate');
  assert.deepEqual(
    mod.NERIS_CASUALTY_PERSON_TYPES.map((x) => x.code).sort(),
    [...v.CASUALTY_PERSON_TYPES].sort()
  );
  assert.deepEqual(
    mod.NERIS_CASUALTY_INJURIES.map((x) => x.code).sort(),
    [...v.CASUALTY_INJURY_VALUES].sort()
  );
  assert.deepEqual(
    mod.NERIS_RESCUE_TYPES.map((x) => x.code).sort(),
    [...v.FF_RESCUE_TYPES, ...v.NONFF_RESCUE_TYPES].sort()
  );
  // The FF-performed grouping drives the removal-field disclosure in the form —
  // it must match the server's FF branch exactly, both ways.
  assert.deepEqual(
    mod.NERIS_RESCUE_TYPES.filter((x) => x.ffPerformed).map((x) => x.code).sort(),
    [...v.FF_RESCUE_TYPES].sort()
  );
  assert.deepEqual(mod.FF_PERFORMED_RESCUE_TYPES.slice().sort(), [...v.FF_RESCUE_TYPES].sort());
  assert.deepEqual(
    mod.NERIS_REMOVALS.map((x) => x.code).sort(),
    [...v.REMOVAL_VALUES].sort()
  );
});


// ── FP (Fire Protection, 0063) vocabularies ──────────────────────────────────

const FP_LIST_TO_ENUM = [
  ['NERIS_FP_PRESENCE', 'fire_protection_presence'],
  ['NERIS_ALARM_SMOKE_TYPES', 'type_alarm_smoke'],
  ['NERIS_ALARM_OPERATIONS', 'type_alarm_operation'],
  ['NERIS_OCCUPANT_RESPONSES', 'type_occupant_response'],
  ['NERIS_ALARM_FAILURES', 'type_alarm_failure'],
  ['NERIS_ALARM_FIRE_TYPES', 'type_alarm_fire'],
  ['NERIS_ALARM_OTHER_TYPES', 'type_alarm_other'],
  ['NERIS_SUPPRESS_FIRE_TYPES', 'type_suppress_fire'],
  ['NERIS_FULL_PARTIAL', 'type_full_partial'],
  ['NERIS_SUPPRESS_OPERATIONS', 'type_suppress_operation'],
  ['NERIS_SUPPRESS_NO_OPERATIONS', 'type_suppress_no_operation'],
  ['NERIS_SUPPRESS_COOKING_TYPES', 'type_suppress_cooking'],
];

test('every Fire Protection vocabulary list matches its live enum set exactly', async () => {
  const mod = await loadClientData();
  for (const [listName, setName] of FP_LIST_TO_ENUM) {
    const list = mod[listName];
    assert.ok(Array.isArray(list) && list.length > 0, `${listName} is missing or empty`);
    assert.ok(enums.sets[setName], `enums.json has no set named ${setName}`);
    assert.deepEqual(
      list.map((x) => x.code).sort(),
      [...enums.sets[setName]].sort(),
      `${listName} drifted from enums.sets.${setName}`
    );
    for (const x of list) {
      assert.ok(x.label && typeof x.label === 'string', `${listName} entry ${x.code} lacks a label`);
    }
  }
});

test('the Fire Protection question wording is the spec x-ui-label VERBATIM (never retyped)', async () => {
  const mod = await loadClientData();
  const labels = enums.fire_protection_labels;
  assert.ok(labels && typeof labels === 'object', 'enums.json has no fire_protection_labels — regenerate');
  for (const m of ['smoke_alarm', 'fire_alarm', 'other_alarm', 'fire_suppression', 'cooking_fire_suppression']) {
    assert.equal(
      mod.NERIS_FP_QUESTIONS[m],
      labels[m].presence.label,
      `NERIS_FP_QUESTIONS.${m} drifted from the spec's own x-ui-label wording`
    );
  }
});
