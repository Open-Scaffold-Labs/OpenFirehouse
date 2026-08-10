'use strict';
/**
 * tests/auditIsolation.test.js — audit() must NEVER poison the caller's transaction.
 *
 * THE BUG (2026-07-16): a MAYDAY declare passed a UUID into audit_log.record_id (an
 * INTEGER column). The audit INSERT failed; under P5_TXN the whole request runs in
 * ONE transaction, so that failed statement POISONED it — every later statement was
 * rejected and the request's COMMIT silently became a ROLLBACK. The route still
 * returned 201, but the sealed MAYDAY record persisted NOTHING. The local suite
 * missed it because P5_TXN was off (writes autocommit).
 *
 * audit() now wraps its write in a SAVEPOINT so a failed audit rolls back ONLY
 * itself. This suite proves the caller's transaction survives a failed audit.
 *
 * DB-backed; gated on TENANCY_TEST_DB (mirrors parReplay/mayday). Skips clean w/o a DB.
 */
const test   = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('audit isolation (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  const db = require('../db');
  const { audit } = require('../utils/auditLog');
  const dbContext = require('../utils/dbContext');
  const DEPT = 1;

  test('🛑 a FAILED audit (bad record_id type) does NOT poison the open transaction', async () => {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await dbContext.run({ client }, async () => {
        // record_id is INTEGER; a non-integer makes the audit INSERT fail — exactly
        // the MAYDAY-UUID case. Pre-SAVEPOINT this poisoned the whole transaction.
        await audit(DEPT, { id: 1, username: 'test' }, 'create', 'mayday_events',
                    'a-uuid-not-an-int', { probe: true });
        // If the transaction were poisoned, THIS throws "current transaction is aborted".
        const r = await client.query('SELECT 42 AS ok');
        assert.equal(r.rows[0].ok, 42, 'transaction is still usable after a failed audit');
      });
      await client.query('COMMIT'); // must succeed — the txn was never poisoned
    } finally {
      client.release();
    }
  });

  test('a GOOD audit (integer record_id) still records inside the transaction', async () => {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      let before, after;
      await dbContext.run({ client }, async () => {
        before = (await client.query('SELECT count(*)::int n FROM audit_log WHERE department_id=$1', [DEPT])).rows[0].n;
        await audit(DEPT, { id: 1, username: 'test' }, 'create', 'incidents', 999999999, { probe: true });
        after = (await client.query('SELECT count(*)::int n FROM audit_log WHERE department_id=$1', [DEPT])).rows[0].n;
      });
      await client.query('ROLLBACK'); // discard the probe audit row
      assert.equal(after, before + 1, 'a valid audit write lands inside the txn (savepoint released)');
    } finally {
      client.release();
    }
  });
}
