'use strict';
/**
 * cadClearRelease.test.js — the clear-time unit-release surface (2026-07-12).
 *
 * committedUnitsForAlert feeds the Live Dispatch clear prompt AND validates the
 * dispatcher's releaseUnits list server-side: only units matched to THIS
 * alert's units string (alias-aware) that are CURRENTLY committed are eligible.
 * Radio doctrine holds: nothing here is automatic — the release is the
 * dispatcher's own confirmed action, recorded under their user id.
 */
const test = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const { committedUnitsForAlert } = require('../routes/cad');

async function withUnits(units, fn) {
  const orig = db.unitStatus;
  Object.defineProperty(db, 'unitStatus', {
    value: { list: async () => units }, configurable: true,
  });
  try { return await fn(); } finally {
    Object.defineProperty(db, 'unitStatus', { value: orig, configurable: true });
  }
}

const FLEET = [
  { apparatus_id: 1, designation: 'Engine 1',  status: 'on_scene' },
  { apparatus_id: 2, designation: 'Engine 10', status: 'in_service' },
  { apparatus_id: 3, designation: 'Ladder 1',  status: 'enroute' },
  { apparatus_id: 4, designation: 'Rescue 1',  status: 'returning' },
  { apparatus_id: null, designation: 'Mutual Aid 5', status: 'on_scene' }, // no fleet id — never eligible
];

test('lists only units matched to the alert AND currently committed', async () => {
  const out = await withUnits(FLEET, () =>
    committedUnitsForAlert(1, { units: 'Engine 1, Ladder 1, Rescue 1' }));
  // Engine 1 (on_scene) + Ladder 1 (enroute) qualify; Rescue 1 is 'returning'
  // (not committed); Engine 10 isn't on the call.
  assert.deepEqual(
    out.map((u) => u.apparatusId).sort(),
    [1, 3],
  );
  for (const u of out) assert.ok(['on_scene', 'enroute'].includes(u.status));
});

test('no substring bleed: Engine 1 on the call does not pull in Engine 10', async () => {
  const out = await withUnits(FLEET, () =>
    committedUnitsForAlert(1, { units: 'Engine 1' }));
  assert.deepEqual(out.map((u) => u.apparatusId), [1]);
});

test('empty / missing units string → empty list, no throw', async () => {
  assert.deepEqual(await withUnits(FLEET, () => committedUnitsForAlert(1, { units: '' })), []);
  assert.deepEqual(await withUnits(FLEET, () => committedUnitsForAlert(1, {})), []);
});

test('a call whose units are all non-committed → empty list (nothing to prompt)', async () => {
  const out = await withUnits(FLEET, () =>
    committedUnitsForAlert(1, { units: 'Rescue 1, Engine 10' }));
  assert.deepEqual(out, []);
});
