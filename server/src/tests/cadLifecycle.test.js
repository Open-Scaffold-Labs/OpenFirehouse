'use strict';
/**
 * cadLifecycle.test.js — call-close lifecycle parity pieces (0044, 2026-07-12).
 *
 * Covers: the disposition vocabulary (manual codes only — system codes are
 * server-set and never accepted from clients), the generic adapter's close-
 * event detection, and the last-unit clear suggestion.
 */
const test = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const { DISPOSITIONS, validDisposition } = require('../routes/cad');
const generic = require('../cad/adapters/generic');
const { clearSuggestionForUnit } = require('../cad/unitCommitment');

// ── Dispositions ─────────────────────────────────────────────────────────────
test('DISPOSITIONS is the NERIS type_noaction set (verified vs USFA NERIS 1.0.1)', () => {
  assert.deepEqual(DISPOSITIONS, [
    'CANCELLED', 'STAGED_STANDBY', 'NO_INCIDENT_FOUND',
  ]);
  // System code is NOT client-settable; the former auto_expired is gone entirely.
  assert.equal(validDisposition('cad_closed'), false);
  assert.equal(validDisposition('auto_expired'), false);
});

test('validDisposition accepts every NERIS no-action code, rejects junk + pre-NERIS codes', () => {
  for (const d of DISPOSITIONS) assert.ok(validDisposition(d), d);
  assert.equal(validDisposition(''), false);
  assert.equal(validDisposition(null), false);
  // The pre-NERIS mixed vocabulary is no longer valid.
  assert.equal(validDisposition('extinguished'), false);
  assert.equal(validDisposition('false_alarm'), false);
  assert.equal(validDisposition('cancelled'), false); // the NERIS value is UPPERCASE
});

// ── Generic adapter close-event detection ────────────────────────────────────
async function parseGeneric(body) {
  return generic.parse({ body });
}

test('generic adapter: close event with an id parses to a close incident', async () => {
  for (const word of ['clear', 'closed', 'close', 'call_cleared', 'end']) {
    const r = await parseGeneric({ event: word, incident_number: 'CAD-123' });
    assert.equal(r.ok, true, word);
    assert.equal(r.incident.close, true);
    assert.equal(r.incident.alertId, 'CAD-123');
  }
});

test('generic adapter: close event WITHOUT an id is rejected (never guess a call)', async () => {
  const r = await parseGeneric({ event: 'closed' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test('generic adapter: a normal dispatch still parses as a dispatch', async () => {
  const r = await parseGeneric({ description: 'Structure Fire', address: '1 Main St', incident_number: 'CAD-9' });
  assert.equal(r.ok, true);
  assert.notEqual(r.incident.close, true);
  assert.equal(r.incident.alertId, 'CAD-9');
});

test('generic adapter: a dispatch whose status word is NOT a close word is untouched', async () => {
  const r = await parseGeneric({ status: 'dispatched', description: 'MVA', incident_number: 'CAD-10' });
  assert.equal(r.ok, true);
  assert.notEqual(r.incident.close, true);
});

// ── Last-unit clear suggestion ───────────────────────────────────────────────
async function withDb(alerts, units, fn) {
  const origAlerts = db.cadAlerts, origUnits = db.unitStatus;
  Object.defineProperty(db, 'cadAlerts', { value: { ...origAlerts, recent: async () => alerts }, configurable: true });
  Object.defineProperty(db, 'unitStatus', { value: { list: async () => units }, configurable: true });
  try { return await fn(); } finally {
    Object.defineProperty(db, 'cadAlerts', { value: origAlerts, configurable: true });
    Object.defineProperty(db, 'unitStatus', { value: origUnits, configurable: true });
  }
}

test('clearSuggestionForUnit: suggests when the unit leaving was the LAST committed one', async () => {
  const alerts = [{ id: 7, units: 'Engine 1, Ladder 1', description: 'Structure Fire', address: '775 Route 22' }];
  const units = [
    { apparatus_id: 1, designation: 'Engine 1', status: 'returning' },   // just released
    { apparatus_id: 3, designation: 'Ladder 1', status: 'in_service' },  // already home
  ];
  const s = await withDb(alerts, units, () => clearSuggestionForUnit(1, 1, 'Engine 1'));
  assert.ok(s);
  assert.equal(s.alertId, 7);
  assert.equal(s.address, '775 Route 22');
});

test('clearSuggestionForUnit: NO suggestion while another unit is still committed', async () => {
  const alerts = [{ id: 7, units: 'Engine 1, Ladder 1', description: 'Structure Fire' }];
  const units = [
    { apparatus_id: 1, designation: 'Engine 1', status: 'returning' },
    { apparatus_id: 3, designation: 'Ladder 1', status: 'on_scene' }, // still working
  ];
  const s = await withDb(alerts, units, () => clearSuggestionForUnit(1, 1, 'Engine 1'));
  assert.equal(s, null);
});

test('clearSuggestionForUnit: NO suggestion for a call the unit was never on', async () => {
  const alerts = [{ id: 8, units: 'Rescue 1', description: 'MVA' }];
  const units = [
    { apparatus_id: 1, designation: 'Engine 1', status: 'in_service' },
    { apparatus_id: 4, designation: 'Rescue 1', status: 'on_scene' },
  ];
  const s = await withDb(alerts, units, () => clearSuggestionForUnit(1, 1, 'Engine 1'));
  assert.equal(s, null);
});
