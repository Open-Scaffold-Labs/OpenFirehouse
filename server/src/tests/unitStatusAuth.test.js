'use strict';
/**
 * unitStatusAuth.test.js — who may flip a unit's status (rig self-status, 0040).
 *
 * Covers the three authority paths of requireUnitStatusAuth:
 *   1. dispatch/command → any unit, never gated
 *   2. unit login (session_kind 'unit') → OWN unit only, gated by allow_rig_status
 *   3. run-list officer → own unit, gated by allow_rig_status
 * All other callers fail closed.
 */
const test = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const { requireUnitStatusAuth } = require('../middleware/requireUnitStatusAuth');

async function run(user, apparatusIdParam, { toggle = true, runList = null, member = null, appt = null } = {}) {
  // Stub the db surface the middleware touches; restore after each run.
  const origPool = db.pool;
  const origUsers = db.users;
  const origApparatus = db.apparatus;
  const fakeQuery = async (sql, params) => {
    if (/allow_rig_status/i.test(sql)) return { rows: [{ allow_rig_status: toggle }] };
    if (/run_lists/i.test(sql)) return { rows: runList ? [{ payload: { crew: runList } }] : [] };
    throw new Error(`unexpected query in test: ${sql}`);
  };
  Object.defineProperty(db, 'pool', { value: { query: fakeQuery }, configurable: true });
  Object.defineProperty(db, 'users', {
    value: { findById: async () => member }, configurable: true,
  });
  Object.defineProperty(db, 'apparatus', {
    value: { findById: async () => appt }, configurable: true,
  });

  let status = null, body = null, nexted = false;
  const req = { user, params: { apparatusId: String(apparatusIdParam) } };
  const res = {
    status(s) { status = s; return this; },
    json(b) { body = b; return this; },
  };
  try {
    await requireUnitStatusAuth(req, res, () => { nexted = true; });
  } finally {
    Object.defineProperty(db, 'pool', { value: origPool, configurable: true });
    Object.defineProperty(db, 'users', { value: origUsers, configurable: true });
    Object.defineProperty(db, 'apparatus', { value: origApparatus, configurable: true });
  }
  return { status, body, nexted };
}

test('dispatch and command set ANY unit, never gated', async () => {
  for (const role of ['dispatch', 'chief', 'deputy_chief', 'battalion_chief']) {
    const r = await run({ role, department_id: 1 }, 42, { toggle: false });
    assert.equal(r.nexted, true, `${role} should pass even with the gate off`);
  }
});

test('unit login sets its OWN unit when the gate is on', async () => {
  const user = { role: 'unit', session_kind: 'unit', apparatusId: 7, department_id: 1 };
  const r = await run(user, 7, { toggle: true });
  assert.equal(r.nexted, true);
});

test('unit login can NEVER set another unit (fails closed before the gate)', async () => {
  const user = { role: 'unit', session_kind: 'unit', apparatusId: 7, department_id: 1 };
  const r = await run(user, 8, { toggle: true });
  assert.equal(r.nexted, false);
  assert.equal(r.status, 403);
});

test('unit login denied when the department gate is OFF', async () => {
  const user = { role: 'unit', session_kind: 'unit', apparatusId: 7, department_id: 1 };
  const r = await run(user, 7, { toggle: false });
  assert.equal(r.nexted, false);
  assert.equal(r.status, 403);
});

const OFFICER_CREW = [
  { apparatus_id: 7, apparatus_name: 'Tower Ladder 1', member_name: 'Sam Officer', position_name: 'Captain' },
];

test('run-list officer sets own unit when the gate is on', async () => {
  const user = { id: 5, role: 'member', session_kind: 'member', department_id: 1, stationId: 1 };
  const r = await run(user, 7, {
    toggle: true,
    runList: OFFICER_CREW,
    member: { name: 'Sam Officer' },
    appt: { designation: 'Tower Ladder 1' },
  });
  assert.equal(r.nexted, true);
});

test('run-list officer denied when the department gate is OFF', async () => {
  const user = { id: 5, role: 'member', session_kind: 'member', department_id: 1, stationId: 1 };
  const r = await run(user, 7, {
    toggle: false,
    runList: OFFICER_CREW,
    member: { name: 'Sam Officer' },
    appt: { designation: 'Tower Ladder 1' },
  });
  assert.equal(r.nexted, false);
  assert.equal(r.status, 403);
});

test('non-officer crew and strangers fail closed', async () => {
  const user = { id: 6, role: 'member', session_kind: 'member', department_id: 1, stationId: 1 };
  const r = await run(user, 7, {
    toggle: true,
    runList: [{ apparatus_id: 7, member_name: 'Random FF', position_name: 'Firefighter' }],
    member: { name: 'Random FF' },
    appt: { designation: 'Tower Ladder 1' },
  });
  assert.equal(r.nexted, false);
  assert.equal(r.status, 403);
});
