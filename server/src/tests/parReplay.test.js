'use strict';
/**
 * tests/parReplay.test.js — a PAR is a REPLAYABLE append-only record (0058).
 *
 * Matt, working fire officer: "nobody is going to re-run a PAR because it doesn't
 * work on the app ... don't make an error message the answer." Right. A PAR is a
 * record of something that happened, at a time, on a call — it must land even if
 * the call has closed, record WHEN it happened, and survive a retry without
 * double-recording.
 *
 * DB-backed; gated on TENANCY_TEST_DB (mirrors fiSyncE2E). Registers an explicit
 * skip so CI stays green without a database.
 */

const test   = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('par replay (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  const db = require('../db');
  const DEPT = 1;

  test('a PAR records with NO active board (a late write after the call closed)', async () => {
    await db.activeBoard.clear(DEPT);
    const clientId = crypto.randomUUID();
    const ranAt = new Date(Date.now() - 12 * 60 * 1000).toISOString();
    try {
      const out = await db.activeBoard.recordPar(DEPT, {
        accounted: 4, missing: 0, total: 4, results: [{ name: 'A', accounted: true }],
        ranBy: null, clientId, ranAt,
        incidentId: null, incidentType: 'Structure Fire', address: '1 Late St',
      });
      assert.ok(out.check, 'the PAR was recorded even though no board is live');
      assert.equal(out.duplicate, false);
      // ran_at is the CLIENT's time, not NOW().
      assert.ok(Math.abs(new Date(out.check.ran_at) - new Date(ranAt)) < 2000,
        'the PAR records WHEN IT HAPPENED, not when it was written');
    } finally {
      await db.pool.query('DELETE FROM par_checks WHERE department_id=$1 AND client_id=$2', [DEPT, clientId]);
    }
  });

  test('🛑 replaying the same client_id is IDEMPOTENT — one row, marked duplicate', async () => {
    const clientId = crypto.randomUUID();
    const body = {
      accounted: 3, missing: 1, total: 4, ranBy: null, clientId,
      ranAt: new Date().toISOString(), incidentType: 'MVA', address: '2 Retry Rd',
    };
    try {
      const first  = await db.activeBoard.recordPar(DEPT, body);
      const replay = await db.activeBoard.recordPar(DEPT, body);   // the outage-retry
      assert.equal(first.duplicate, false);
      assert.equal(replay.duplicate, true, 'a replay is a duplicate, not a new record');
      assert.equal(replay.check.id, first.check.id, 'same row returned');
      const c = await db.pool.query(
        'SELECT count(*)::int n FROM par_checks WHERE department_id=$1 AND client_id=$2', [DEPT, clientId]);
      assert.equal(c.rows[0].n, 1, 'exactly ONE row — a retried PAR must not double-record');
    } finally {
      await db.pool.query('DELETE FROM par_checks WHERE department_id=$1 AND client_id=$2', [DEPT, clientId]);
    }
  });

  test('without a client_id, a PAR still records (legacy / no-key path)', async () => {
    const before = await db.pool.query('SELECT count(*)::int n FROM par_checks WHERE department_id=$1', [DEPT]);
    const out = await db.activeBoard.recordPar(DEPT, {
      accounted: 2, missing: 0, total: 2, ranBy: null,
      incidentType: 'Alarm', address: '3 Legacy Ln',
    });
    assert.ok(out.check, 'a PAR with no client_id still records');
    const after = await db.pool.query('SELECT count(*)::int n FROM par_checks WHERE department_id=$1', [DEPT]);
    assert.equal(after.rows[0].n, before.rows[0].n + 1);
    await db.pool.query('DELETE FROM par_checks WHERE id=$1', [out.check.id]);
  });
}
