'use strict';
/**
 * tests/mayday.test.js — MAYDAY is a SEALED, append-only record (0059).
 *
 * The highest-consequence fireground event. The declaration is immutable and the
 * event log is append-only; a replay (offline retry) must not double-record; the
 * timeline must be server-authoritative (a spoofed device clock cannot move it);
 * and "MAYDAY resolved" is gated on a whole-scene PAR. Tap-and-snapshot: no typed
 * LUNAR, no air, no channel (decisions log 2026-07-15).
 *
 * DB-backed; gated on TENANCY_TEST_DB (mirrors parReplay). Registers an explicit
 * skip so CI stays green without a database.
 */
const test   = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('mayday (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  const db = require('../db');
  const DEPT = 1;

  async function cleanup(maydayId, parClientId) {
    await db.pool.query('DELETE FROM mayday_event_log WHERE mayday_id=$1', [maydayId]);
    await db.pool.query('DELETE FROM mayday_events WHERE client_id=$1', [maydayId]);
    if (parClientId) await db.pool.query('DELETE FROM par_checks WHERE department_id=$1 AND client_id=$2', [DEPT, parClientId]);
  }

  test('declare seals a row with a SERVER-authoritative declared_at (device clock ignored)', async () => {
    const clientId = crypto.randomUUID();
    try {
      const skewed = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // device clock +1h
      const out = await db.mayday.declare(DEPT, {
        clientId, declaredByUserId: 1, nature: 'trapped',
        clientRecordedAt: skewed, sceneSnapshot: { crewsInside: ['E1', 'L1'] },
      });
      assert.equal(out.duplicate, false);
      assert.ok(out.mayday, 'row sealed');
      assert.ok(Math.abs(new Date(out.mayday.declared_at) - Date.now()) < 5000,
        'declared_at is server time — a spoofed device clock cannot move the record');
      assert.equal(out.mayday.nature, 'trapped');
      assert.deepEqual(out.mayday.scene_snapshot, { crewsInside: ['E1', 'L1'] });
    } finally { await cleanup(clientId); }
  });

  test('🛑 replaying the same client_id is IDEMPOTENT — one sealed row, marked duplicate', async () => {
    const clientId = crypto.randomUUID();
    try {
      const first  = await db.mayday.declare(DEPT, { clientId, declaredByUserId: 1, sceneSnapshot: {} });
      const replay = await db.mayday.declare(DEPT, { clientId, declaredByUserId: 1, sceneSnapshot: {} });
      assert.equal(first.duplicate, false);
      assert.equal(replay.duplicate, true, 'a replay is a duplicate, not a second MAYDAY');
      assert.equal(replay.mayday.client_id, first.mayday.client_id, 'same row returned');
      const c = await db.pool.query('SELECT count(*)::int n FROM mayday_events WHERE client_id=$1', [clientId]);
      assert.equal(c.rows[0].n, 1, 'exactly one sealed row');
    } finally { await cleanup(clientId); }
  });
}

if (TENANCY_TEST_DB) {
  const test   = require('node:test');
  const assert = require('node:assert');
  const crypto = require('crypto');
  const db = require('../db');
  const DEPT = 1;
  async function cleanup(maydayId, parClientId) {
    await db.pool.query('DELETE FROM mayday_event_log WHERE mayday_id=$1', [maydayId]);
    await db.pool.query('DELETE FROM mayday_events WHERE client_id=$1', [maydayId]);
    if (parClientId) await db.pool.query('DELETE FROM par_checks WHERE department_id=$1 AND client_id=$2', [DEPT, parClientId]);
  }

  test('append-only log: events append, replay is idempotent, getActive projects the status', async () => {
    const clientId = crypto.randomUUID();
    try {
      await db.mayday.declare(DEPT, { clientId, declaredByUserId: 1, sceneSnapshot: {} });
      const e1 = crypto.randomUUID();
      const a = await db.mayday.appendEvent(DEPT, clientId, { clientId: e1, actorUserId: 1, kind: 'checklist_item', payload: { key: 'rit_deployed' } });
      const b = await db.mayday.appendEvent(DEPT, clientId, { clientId: e1, actorUserId: 1, kind: 'checklist_item', payload: { key: 'rit_deployed' } });
      assert.equal(a.duplicate, false);
      assert.equal(b.duplicate, true, 'a replayed log event is a duplicate');
      const active = await db.mayday.getActive(DEPT);
      assert.ok(active && active.client_id === clientId, 'the MAYDAY is active (no resolved row)');
      assert.equal(active.log.length, 1, 'exactly one log row (idempotent)');
    } finally { await cleanup(clientId); }
  });

  test('resolve is GATED on a whole-scene PAR; once resolved, getActive drops it', async () => {
    const clientId = crypto.randomUUID();
    const parClientId = crypto.randomUUID();
    try {
      await db.mayday.declare(DEPT, { clientId, declaredByUserId: 1, sceneSnapshot: {} });
      assert.equal(await db.mayday.parCompleteForScene(DEPT, clientId), false, 'no clean PAR yet → gate closed');
      await db.activeBoard.recordPar(DEPT, {
        accounted: 4, missing: 0, total: 4, ranBy: null, clientId: parClientId,
        ranAt: new Date().toISOString(), incidentType: 'Structure Fire', address: '1 Test St',
      });
      assert.equal(await db.mayday.parCompleteForScene(DEPT, clientId), true, 'a clean whole-scene PAR opens the gate');
      const r = crypto.randomUUID();
      await db.mayday.appendEvent(DEPT, clientId, { clientId: r, actorUserId: 1, kind: 'resolved', payload: null });
      const active = await db.mayday.getActive(DEPT);
      assert.ok(!active || active.client_id !== clientId, 'a resolved MAYDAY is no longer active');
    } finally { await cleanup(clientId, parClientId); }
  });
}
