/**
 * nerisUnitTypes.test.js — the NERIS vocabulary is a FEDERAL REPORTING vocabulary.
 * A wrong value here doesn't just look bad; it goes into a submittable record.
 * These tests fence the two ways that can happen: an invalid value, or a guess.
 */
const test = require('node:test');
const assert = require('node:assert');
const {
  NERIS_UNIT_TYPES, NERIS_UNIT_TYPE_VALUES, LEGACY_TYPE_MAP,
  nerisTypeFromLegacy, isValidNerisType,
} = require('../constants/nerisUnitTypes');

test('the vocabulary is the 49 active NERIS type_unit values', () => {
  assert.equal(NERIS_UNIT_TYPE_VALUES.length, 49);
  // Spot-check the ones that carry the Truck/Tanker doctrine.
  assert.ok(isValidNerisType('TENDER'));       // "Water Tender/Tanker" — one type, both words
  assert.ok(isValidNerisType('AIR_TANKER'));   // the AIRCRAFT is a separate type
  assert.ok(isValidNerisType('ENGINE_WUI'));   // there is no BRUSH type
  assert.ok(isValidNerisType('CHIEF_STAFF_COMMAND')); // there is no BATTALION type
  assert.ok(!isValidNerisType('BRUSH'));
  assert.ok(!isValidNerisType('BATTALION'));
  assert.ok(!isValidNerisType('TRUCK'));       // NERIS splits trucks by length + pump
});

test('every legacy mapping targets a REAL NERIS value (no typos reach the record)', () => {
  for (const [legacy, neris] of Object.entries(LEGACY_TYPE_MAP)) {
    assert.ok(isValidNerisType(neris), `${legacy} → ${neris} is not a NERIS value`);
  }
});

test('unambiguous legacy words map', () => {
  assert.equal(nerisTypeFromLegacy('Engine'),    'ENGINE_STRUCT');
  assert.equal(nerisTypeFromLegacy('Brush'),     'ENGINE_WUI');       // NERIS: brush IS the WUI engine
  assert.equal(nerisTypeFromLegacy('Tanker'),    'TENDER');           // NERIS: "Water Tender/Tanker"
  assert.equal(nerisTypeFromLegacy('Tender'),    'TENDER');           // …the same rig either way
  assert.equal(nerisTypeFromLegacy('Command'),   'CHIEF_STAFF_COMMAND');
  assert.equal(nerisTypeFromLegacy('Utility'),   'UTIL');
});

test('UNDER-SPECIFIED legacy words return NULL — we never guess a reportable type', () => {
  // "Ladder" → 7 candidates: the answer depends on aerial LENGTH (<75'/75'+) and
  // whether it carries a PUMP. The word cannot tell us. Our own prod data proves
  // it: legacy type "Ladder" covers Ladder 1, Tower Ladder 1, Truck 1, 2 and 3.
  assert.equal(nerisTypeFromLegacy('Ladder'), null);
  assert.equal(nerisTypeFromLegacy('Ladder / Aerial'), null);
  assert.equal(nerisTypeFromLegacy('Truck'), null);
  assert.equal(nerisTypeFromLegacy('Tower Ladder'), null);
  // "Rescue" → heavy / medium / light / USAR / water.
  assert.equal(nerisTypeFromLegacy('Rescue'), null);
  // "Ambulance" → ALS vs BLS depends on LICENSURE, not on the word.
  assert.equal(nerisTypeFromLegacy('Ambulance'), null);
  assert.equal(nerisTypeFromLegacy('Ambulance / EMS'), null);
});

test('empty / unknown input never invents a type', () => {
  assert.equal(nerisTypeFromLegacy(null), null);
  assert.equal(nerisTypeFromLegacy(''), null);
  assert.equal(nerisTypeFromLegacy('Zamboni'), null);
});

test('every type carries a human label (the UI must never show a raw enum)', () => {
  for (const v of NERIS_UNIT_TYPE_VALUES) {
    assert.ok(NERIS_UNIT_TYPES[v].label && NERIS_UNIT_TYPES[v].label.length > 2, v);
  }
});
