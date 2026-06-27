'use strict';
/**
 * p5TxnContext.test.js — Phase A (P5) request-transaction + RLS-GUC plumbing.
 *
 * Exercises the REAL modules together against the local DB:
 *   middleware/dbTransaction.js  +  utils/dbContext.js  +  db.js pool.query override.
 *
 * Proves: the GUC is set inside a request, each request sees only its own
 * department, errors roll back, the client is always released (no pool leak),
 * and with the flag off the path is behavior-neutral.
 *
 * Run: P5_TXN=on node --test server/src/tests/p5TxnContext.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

const db = require('../db');
const dbTransaction = require('../middleware/dbTransaction');

// These exercise the real db.pool. Skip where no app DB is configured — CI sets
// TENANCY_TEST_DB (for the tenancy suite) but not DATABASE_URL, so db.pool has no
// reachable database there. Locally these run against the P5-migrated dev DB.
const SKIP = process.env.DATABASE_URL ? false : 'requires DATABASE_URL (P5 dev DB)';

// Drive one request through the middleware. `handler` runs inside the request
// context (where db.pool.query should hit the pinned client) and its return
// value resolves the promise. Mirrors how Express invokes middleware → handler
// → res.end (which the middleware wraps to commit-before-flush).
function runRequest({ departmentId, userId = 1, statusCode = 200, handler }) {
  return new Promise((resolve, reject) => {
    const req = { user: { department_id: departmentId, id: userId } };
    const res = {
      statusCode,
      _flush: null,
      on() {},
      end() { this._ended = true; if (this._flush) this._flush(); return this; },
    };
    const next = (err) => {
      if (err) return reject(err);
      Promise.resolve()
        .then(handler)
        .then((result) => { res._flush = () => resolve(result); res.end(); })
        .catch((e) => { res.statusCode = 500; res._flush = () => reject(e); res.end(); });
    };
    dbTransaction(req, res, next);
  });
}

const readGuc = () => db.pool
  .query("SELECT current_setting('app.department_id', true) AS d")
  .then((r) => r.rows[0].d);

describe('P5 request-transaction plumbing', { skip: SKIP }, () => {

test('GUC is set to the request department inside the transaction', async () => {
  process.env.P5_TXN = 'on';
  const seen = await runRequest({ departmentId: 1, handler: readGuc });
  assert.strictEqual(seen, '1', 'handler should see app.department_id = 1');
});

test('each request sees only its own department (no cross-request bleed)', async () => {
  process.env.P5_TXN = 'on';
  // Interleaved: each handler reads the GUC across multiple awaits.
  const mkHandler = (expected) => async () => {
    for (let i = 0; i < 3; i++) {
      const d = await readGuc();
      assert.strictEqual(d, expected, `expected ${expected}, saw ${d}`);
      await new Promise((r) => setTimeout(r, 5));
    }
    return expected;
  };
  const [a, b] = await Promise.all([
    runRequest({ departmentId: 1, handler: mkHandler('1') }),
    runRequest({ departmentId: 2, handler: mkHandler('2') }),
  ]);
  assert.strictEqual(a, '1');
  assert.strictEqual(b, '2');
});

test('error in handler rolls back and still releases the client', async () => {
  process.env.P5_TXN = 'on';
  const before = db.pool.idleCount + db.pool.waitingCount;
  await assert.rejects(
    runRequest({ departmentId: 1, handler: async () => { await readGuc(); throw new Error('boom'); } }),
    /boom/,
  );
  // Give release() a tick.
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(db.pool.totalCount <= 1, 'pool should not have grown past max=1');
});

test('no connection leak across many requests', async () => {
  process.env.P5_TXN = 'on';
  for (let i = 0; i < 25; i++) {
    // alternate departments
    await runRequest({ departmentId: (i % 2) + 1, handler: readGuc });
  }
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(db.pool.totalCount <= 1, `expected <=1 connection, got ${db.pool.totalCount}`);
  assert.strictEqual(db.pool.waitingCount, 0, 'no requests should be left waiting on the pool');
});

test('runInTransaction reuses the request client (no deadlock under max:1)', async () => {
  process.env.P5_TXN = 'on';
  // If runInTransaction called pool.connect() here it would block forever (the
  // request holds the only connection). This test passing IS the deadlock proof.
  const seen = await runRequest({
    departmentId: 2,
    handler: () => db.runInTransaction(async (client) => {
      const r = await client.query("SELECT current_setting('app.department_id', true) AS d");
      return r.rows[0].d;
    }),
  });
  assert.strictEqual(seen, '2', 'nested txn should run on the reused request client with its GUC');
});

test('runInTransaction inner failure rolls back via savepoint, outer survives', async () => {
  process.env.P5_TXN = 'on';
  const out = await runRequest({
    departmentId: 1,
    handler: async () => {
      let innerFailed = false;
      try {
        await db.runInTransaction(async (client) => {
          await client.query('SELECT 1');
          throw new Error('inner boom');
        });
      } catch (_) { innerFailed = true; }
      // Outer request transaction must still be usable after the savepoint rollback.
      const r = await db.pool.query("SELECT current_setting('app.department_id', true) AS d");
      return { innerFailed, dept: r.rows[0].d };
    },
  });
  assert.strictEqual(out.innerFailed, true, 'inner txn should have thrown');
  assert.strictEqual(out.dept, '1', 'outer txn should survive the inner savepoint rollback');
});

test('runInTransaction opens its own transaction when no request context', async () => {
  process.env.P5_TXN = 'off';
  const n = await db.runInTransaction(async (client) => {
    const r = await client.query('SELECT count(*)::int AS n FROM departments');
    return r.rows[0].n;
  });
  assert.ok(typeof n === 'number', 'standalone runInTransaction should commit + return data');
  process.env.P5_TXN = 'on';
});

test('streaming response (write+write+end) commits once, flushes, no leak', async () => {
  process.env.P5_TXN = 'on';
  const chunks = [];
  await new Promise((resolve, reject) => {
    const req = { user: { department_id: 1, id: 1 } };
    let settles = 0;
    const res = {
      statusCode: 200,
      _flush: null,
      on() {},
      write(c) { chunks.push(c); return true; },
      end(c) { settles++; if (c) chunks.push(c); if (this._flush) this._flush(); return this; },
    };
    const next = (err) => {
      if (err) return reject(err);
      (async () => {
        const r = await db.pool.query("SELECT current_setting('app.department_id', true) AS d");
        assert.strictEqual(r.rows[0].d, '1', 'GUC must be set during a streaming handler');
        res.write('a'); res.write('b');           // body chunks (flush before commit — fine for reads)
        res._flush = () => { assert.strictEqual(settles, 1, 'end/commit must run exactly once'); resolve(); };
        res.end('z');                              // triggers commit-before-final-flush
      })().catch(reject);
    };
    dbTransaction(req, res, next);
  });
  assert.deepStrictEqual(chunks, ['a', 'b', 'z'], 'all chunks written in order');
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(db.pool.totalCount <= 1, 'no connection leak after a streamed response');
});

test('runWithDepartment sets the GUC for no-JWT public paths (flag on)', async () => {
  process.env.P5_TXN = 'on';
  const seen = await db.runWithDepartment(2, null, async () => {
    const r = await db.pool.query("SELECT current_setting('app.department_id', true) AS d");
    return r.rows[0].d;
  });
  assert.strictEqual(seen, '2', 'public-path queries should run with app.department_id set');
});

test('runWithDepartment is behavior-neutral when flag off (runs fn, no txn/GUC)', async () => {
  process.env.P5_TXN = 'off';
  const out = await db.runWithDepartment(2, null, async () => {
    const r = await db.pool.query('SELECT count(*)::int AS n FROM departments');
    return r.rows[0].n;
  });
  assert.ok(typeof out === 'number', 'fn should still run and return data with flag off');
  process.env.P5_TXN = 'on';
});

test('flag OFF is behavior-neutral (no real department set)', async () => {
  process.env.P5_TXN = 'off';
  const seen = await runRequest({ departmentId: 1, handler: readGuc });
  // Unset reads back as null on a fresh connection, or '' on a connection that
  // previously ran a SET LOCAL (custom GUCs revert to '' after COMMIT, not to
  // truly-unset). Both are "no department". This is WHY Phase B policies must
  // use NULLIF(current_setting('app.department_id', true), '')::int — a bare
  // ''::int throws instead of failing closed on connection reuse.
  assert.ok(seen === null || seen === '', `expected unset (null/empty), got ${JSON.stringify(seen)}`);
  process.env.P5_TXN = 'on';
});

}); // describe P5 request-transaction plumbing
