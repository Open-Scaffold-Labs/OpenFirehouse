'use strict';
/**
 * helpers/withRole.js — run a probe AS ANOTHER POSTGRES ROLE, on a pinned connection.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 🔴 WHY THIS EXISTS: A POOLED QUERY IS NOT A SESSION.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `pool.query` checks out a connection PER CALL. So this, which reads perfectly:
 *
 *     await pool.query('BEGIN');
 *     await pool.query('SET LOCAL ROLE of_app');
 *     await pool.query('DELETE FROM some_append_only_ledger WHERE id = 1');  // expect 42501
 *
 * ...applies the role change to whichever connection ran line 2, and may run line 3 on a
 * DIFFERENT connection that is still the SUPERUSER. The delete then SUCCEEDS.
 *
 * This is not hypothetical. It happened on 2026-07-27 while writing the 3.1b job tests: the
 * UPDATE landed on the role-switched connection and was correctly refused, the DELETE landed
 * on another and really deleted the row. The test reported "missing expected rejection" and
 * the grant had been correct the entire time. The failure mode that matters is the INVERSE
 * of that one — a probe like this can just as easily PASS while proving nothing, because the
 * statement never actually ran as the restricted role.
 *
 * That is the dangerous direction: a green "this ledger is append-only" test that never
 * exercised the restriction. It certifies a guarantee nobody verified, on tables whose whole
 * point is that they cannot be rewritten — the narcotics custody ledger (21 CFR §1304.27),
 * mayday events, the permit job runs.
 *
 * Use this helper for ANY probe that depends on session state: SET ROLE, SET LOCAL, a GUC,
 * or an open transaction. sessionStateProbes.test.js fails the suite if a test file switches
 * roles through the raw pool instead.
 */

/**
 * Run `fn(client)` inside ONE pinned connection, as `role`, with the department GUC set,
 * and always roll back. The callback receives the client — use it, not the pool.
 *
 * @param {import('pg').Pool} pool
 * @param {string} role            e.g. 'of_app'
 * @param {number|string|null} departmentId  sets app.department_id; null leaves it empty
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 */
async function withRole(pool, role, departmentId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Role name is interpolated because SET ROLE takes no parameters. Callers pass literals
    // from this repo, never user input — but keep it that way.
    if (!/^[a-z_][a-z0-9_]*$/i.test(role)) throw new Error(`withRole: unsafe role name ${role}`);
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SELECT set_config('app.department_id', $1, true)",
                       [departmentId == null ? '' : String(departmentId)]);
    return await fn(client);
  } finally {
    // ROLLBACK unconditionally: a probe must leave nothing behind, and a statement that
    // failed has already poisoned the transaction anyway.
    try { await client.query('ROLLBACK'); } catch { /* already aborted */ }
    client.release();
  }
}

/**
 * Assert that `sql` is REFUSED with `expectedCode` when run as `role`.
 *
 * Each call gets its OWN transaction, because the first failed statement aborts the txn and
 * every later statement in it returns 25P02 ("current transaction is aborted") — which is an
 * error, so a naive assert.rejects would pass for the WRONG REASON and keep passing even if
 * the grant were removed.
 */
async function expectRefused(pool, role, departmentId, sql, params, expectedCode = '42501') {
  let code = null;
  await withRole(pool, role, departmentId, async (client) => {
    try {
      await client.query(sql, params);
    } catch (e) {
      code = e.code;
      return;
    }
    code = 'ACCEPTED';
  });
  return { refused: code === expectedCode, code };
}

module.exports = { withRole, expectRefused };
