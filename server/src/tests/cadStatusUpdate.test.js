'use strict';
/**
 * tests/cadStatusUpdate.test.js — CAD unit-status ingestion (arrival parity).
 *
 * This is how the market gets a real ARRIVAL time onto the fireground board: the
 * dispatcher marks a unit on-scene in CAD, CAD pushes the status out, and OF
 * writes it through the same canonical path as an on-board flip — which drives
 * the PAR clock's on-scene anchor.
 *
 * Two layers here, both DB-free:
 *   • the pure status-word normaliser (statusNormalize.js)
 *   • the generic adapter's status-event parse (adapters/generic.js)
 *
 * The DB-backed end-to-end (processStatusUpdate actually writing unit_statuses +
 * unit_status_history) is exercised by the pipeline behaviour and is gated on
 * TENANCY_TEST_DB in the harness; the two pure layers below are the fence that
 * catches vocabulary/skip regressions with zero setup.
 */

const test   = require('node:test');
const assert = require('node:assert');

const { normalizeCadStatus } = require('../cad/statusNormalize');
const generic = require('../cad/adapters/generic');

// ── the vocabulary bridge ───────────────────────────────────────────────────

test('ARRIVAL words all map to on_scene — the one that starts the clock', () => {
  for (const w of ['on scene', 'On-Scene', 'ONSCENE', 'OS', 'AR', 'arrived', 'arrival', 'at scene', 'on location']) {
    assert.equal(normalizeCadStatus(w), 'on_scene', `"${w}" must mean on_scene`);
  }
});

test('en route / transport / available words map correctly', () => {
  for (const w of ['enroute', 'en route', 'ENR', 'responding', 'mobile']) {
    assert.equal(normalizeCadStatus(w), 'enroute', `"${w}"`);
  }
  assert.equal(normalizeCadStatus('transporting'), 'transporting');
  assert.equal(normalizeCadStatus('at hospital'), 'at_hospital');
  assert.equal(normalizeCadStatus('returning'), 'returning');
  for (const w of ['available', 'AVL', 'in service', 'clear', 'in quarters']) {
    assert.equal(normalizeCadStatus(w), 'in_service', `"${w}"`);
  }
});

test('🛑 AN UNKNOWN STATUS WORD MAPS TO NULL — it must flip nothing', () => {
  // A status we cannot read is not a status. The caller skips + reports; it never
  // guesses. This is the whole safety property.
  for (const w of ['', '   ', 'banana', 'sitrep', 'pto', 'lunch', 'code 4', 'xyz']) {
    assert.equal(normalizeCadStatus(w), null, `"${w}" must NOT resolve to a status`);
  }
});

test('🛑 CAD CANNOT TAKE A RIG OUT OF SERVICE — mechanical status is not CAD\'s', () => {
  // out_of_service is a maintenance state the department owns. A CAD feed must not
  // be able to bench a rig, so those words deliberately map to nothing.
  for (const w of ['out of service', 'oos', 'maintenance', 'broke down']) {
    assert.equal(normalizeCadStatus(w), null, `"${w}" must not reach out_of_service via CAD`);
  }
});

test('10-codes are stripped before matching (radio noise, not status)', () => {
  // "10-97" (arrived, in some regions) — we do not decode 10-codes to a status;
  // we strip them and require a real word. A bare 10-code resolves to nothing
  // rather than being guessed.
  assert.equal(normalizeCadStatus('10-97'), null);
  assert.equal(normalizeCadStatus('on scene 10-97'), 'on_scene', 'the real word still wins');
});

// ── the adapter parse ───────────────────────────────────────────────────────

const parse = (body) => generic.parse({ body });

test('generic adapter recognises an ARRAY status event', async () => {
  const r = await parse({
    event: 'status',
    unit_statuses: [
      { unit: 'E41', status: 'on scene' },
      { unit: 'L23', status: 'enroute' },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.incident.statusUpdate, true);
  assert.equal(r.incident.statusUpdates.length, 2);
  assert.deepEqual(r.incident.statusUpdates[0], { unit: 'E41', status: 'on scene', at: null });
});

test('generic adapter recognises a SINGLE-unit status event', async () => {
  // The single-unit shape must NOT read the event word ('status') as the status —
  // it reads unit_status/new_status/state.
  const r = await parse({ event: 'unit_status', unit: 'E41', unit_status: 'on scene' });
  assert.equal(r.incident.statusUpdate, true);
  assert.deepEqual(r.incident.statusUpdates, [{ unit: 'E41', status: 'on scene', at: null }]);
});

test('a status event and a close event and a dispatch are told apart', async () => {
  assert.equal((await parse({ event: 'status', unit: 'E1', unit_status: 'arrived' })).incident.statusUpdate, true);
  assert.equal((await parse({ event: 'closed', id: 'X1' })).incident.close, true);
  const disp = await parse({ description: 'STRUCTURE FIRE', units: 'E1', address: '1 Main' });
  assert.equal(disp.incident.close, undefined);
  assert.equal(disp.incident.statusUpdate, undefined);
  assert.equal(disp.incident.description, 'STRUCTURE FIRE');
});

test('a status event carries the alertId so the on-scene time can attach to the call', async () => {
  const r = await parse({ event: 'status', id: 'CAD-2026-0042', unit: 'E1', unit_status: 'on scene' });
  assert.equal(r.incident.alertId, 'CAD-2026-0042');
});
