'use strict';
/**
 * unitStatusPrecondition.test.js — the server-side committed-status gate (2026-07-12).
 *
 * A rig-side actor (unit login / run-list officer) may set a COMMITTED status
 * (dispatched / enroute / on_scene) only while its unit is named on an
 * UNCLEARED call — "a committed status always attaches to an incident" (the
 * public CAD functional standard), enforced at the API layer instead of only
 * the client's rigStepAllowed gate. Dispatch/command are exempt; the ladder's
 * tail never needs a call.
 *
 * Pieces under test:
 *   1. requireUnitStatusAuth tags rig-side actors with req.rigActor (both
 *      paths) and does NOT tag dispatch/command.
 *   2. unitOnActiveCall — alias-aware active-call membership.
 *   3. COMMITTED_STATUSES — regression-lock the gated set.
 */
const test = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const { requireUnitStatusAuth } = require('../middleware/requireUnitStatusAuth');
const { unitOnActiveCall, COMMITTED_STATUSES } = require('../routes/units');
const { rigGateApplies } = require('../cad/unitCommitment');

// ── 3. The committed set: 0022 model + the EMS extension (2026-07-13) ───────
test('COMMITTED_STATUSES is exactly the five committed statuses', () => {
  assert.deepEqual([...COMMITTED_STATUSES].sort(),
    ['at_hospital', 'dispatched', 'enroute', 'on_scene', 'transporting']);
});

// ── 3b. The refined gate: entry + orphaned-dispatched gated; progression free ─
test('rigGateApplies: gates ENTRY into committed and the orphaned-dispatched step', () => {
  for (const from of ['in_service', 'returning', 'on_the_air', 'out_of_service', 'dispatched', null]) {
    assert.equal(rigGateApplies(from, 'enroute'), true, `from ${from}`);
  }
});

test('rigGateApplies: a working rig progresses deeper + walks home ungated', () => {
  assert.equal(rigGateApplies('enroute', 'on_scene'), false);      // the live-caught edge
  assert.equal(rigGateApplies('on_scene', 'transporting'), false); // EMS leg
  assert.equal(rigGateApplies('transporting', 'at_hospital'), false);
  assert.equal(rigGateApplies('on_scene', 'returning'), false);    // tail never gated
  assert.equal(rigGateApplies('at_hospital', 'returning'), false);
  assert.equal(rigGateApplies('in_service', 'returning'), false);  // non-committed target
});

// ── 1. rigActor tagging ──────────────────────────────────────────────────────
async function runAuth(user, apparatusIdParam, { toggle = true, runList = null, member = null, appt = null } = {}) {
  const origPool = db.pool, origUsers = db.users, origApparatus = db.apparatus;
  const fakeQuery = async (sql) => {
    if (/allow_rig_status/i.test(sql)) return { rows: [{ allow_rig_status: toggle }] };
    if (/run_lists/i.test(sql)) return { rows: runList ? [{ payload: { crew: runList } }] : [] };
    throw new Error(`unexpected query in test: ${sql}`);
  };
  Object.defineProperty(db, 'pool', { value: { query: fakeQuery }, configurable: true });
  Object.defineProperty(db, 'users', { value: { findById: async () => member }, configurable: true });
  Object.defineProperty(db, 'apparatus', { value: { findById: async () => appt }, configurable: true });

  const req = { user, params: { apparatusId: String(apparatusIdParam) } };
  let nexted = false;
  const res = { status() { return this; }, json() { return this; } };
  try {
    await requireUnitStatusAuth(req, res, () => { nexted = true; });
  } finally {
    Object.defineProperty(db, 'pool', { value: origPool, configurable: true });
    Object.defineProperty(db, 'users', { value: origUsers, configurable: true });
    Object.defineProperty(db, 'apparatus', { value: origApparatus, configurable: true });
  }
  return { nexted, rigActor: req.rigActor === true };
}

test('dispatch/command pass WITHOUT the rigActor tag (never gated)', async () => {
  for (const role of ['dispatch', 'chief']) {
    const r = await runAuth({ role, department_id: 1 }, 42);
    assert.equal(r.nexted, true);
    assert.equal(r.rigActor, false, `${role} must not be tagged rigActor`);
  }
});

test('unit login is tagged rigActor', async () => {
  const user = { role: 'unit', session_kind: 'unit', apparatusId: 7, department_id: 1 };
  const r = await runAuth(user, 7, { toggle: true });
  assert.equal(r.nexted, true);
  assert.equal(r.rigActor, true);
});

test('run-list officer is tagged rigActor', async () => {
  const user = { id: 5, role: 'officer', stationId: 1, department_id: 1 };
  const r = await runAuth(user, 9, {
    toggle: true,
    member: { name: 'Pat Officer' },
    appt: { designation: 'Tower Ladder 1' },
    runList: [{ apparatus_id: 9, member_name: 'Pat Officer', position_name: 'Captain' }],
  });
  assert.equal(r.nexted, true);
  assert.equal(r.rigActor, true);
});

// ── 2. unitOnActiveCall ──────────────────────────────────────────────────────
async function withAlerts(alerts, fn) {
  const orig = db.cadAlerts;
  Object.defineProperty(db, 'cadAlerts', {
    value: { recent: async () => alerts }, configurable: true,
  });
  try { return await fn(); } finally {
    Object.defineProperty(db, 'cadAlerts', { value: orig, configurable: true });
  }
}

test('unitOnActiveCall: true when the unit is named on an uncleared call', async () => {
  const on = await withAlerts(
    [{ units: 'Engine 1, Ladder 1' }],
    () => unitOnActiveCall(1, 7, 'Engine 1'),
  );
  assert.equal(on, true);
});

test('unitOnActiveCall: false with no active calls', async () => {
  const on = await withAlerts([], () => unitOnActiveCall(1, 7, 'Engine 1'));
  assert.equal(on, false);
});

test('unitOnActiveCall: false when only OTHER units are named (no Engine 1 / Engine 10 bleed)', async () => {
  const on = await withAlerts(
    [{ units: 'Engine 10, Rescue 1' }],
    () => unitOnActiveCall(1, 7, 'Engine 1'),
  );
  assert.equal(on, false);
});

test('unitOnActiveCall: units string handled defensively (empty / missing)', async () => {
  const on = await withAlerts(
    [{ units: '' }, {}],
    () => unitOnActiveCall(1, 7, 'Engine 1'),
  );
  assert.equal(on, false);
});
