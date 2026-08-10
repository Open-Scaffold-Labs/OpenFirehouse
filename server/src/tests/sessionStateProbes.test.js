'use strict';
/**
 * sessionStateProbes.test.js — a repo-wide fence: NO TEST MAY SWITCH POSTGRES ROLES THROUGH
 * THE RAW POOL.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS PREVENTS, AND WHY IT IS A SUITE-LEVEL FENCE RATHER THAN A CODE REVIEW NOTE
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `pool.query` checks out a connection PER CALL, so `pool.query('SET LOCAL ROLE of_app')`
 * followed by `pool.query('DELETE …')` may run the DELETE on a DIFFERENT connection, still
 * as the superuser. Observed on 2026-07-27: a DELETE that should have been refused succeeded
 * and really removed a row.
 *
 * The direction that matters is the one that does NOT announce itself. A probe written this
 * way can PASS while proving nothing — the restricted statement simply never ran as the
 * restricted role. The tests that use this pattern are exactly the ones asserting that
 * append-only ledgers cannot be rewritten: narcotics custody (21 CFR §1304.27), mayday
 * events, permit job runs. A green test certifying an unverified guarantee on those tables
 * is worse than no test, because it ends the conversation.
 *
 * Reviewers cannot reliably catch this — it looks correct, and it usually passes. A fence
 * can. Use helpers/withRole.js instead; it pins one client for the whole probe.
 *
 * This test is CHEAP AND OFFLINE: it reads the test sources, so it runs everywhere, with or
 * without a database.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TEST_DIRS = [
  path.join(__dirname),
  path.join(__dirname, '..', 'utils'),
  path.join(__dirname, '..', 'cad'),
];

/** Every *.test.js under the directories the suite actually runs. */
function testFiles() {
  const out = [];
  for (const dir of TEST_DIRS) {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const e of entries) {
      if (e.endsWith('.test.js')) out.push(path.join(dir, e));
    }
  }
  return out;
}

// `pool.query('SET ROLE …')` / `pool.query("SET LOCAL ROLE …")` in any spacing or quoting.
// Deliberately narrow: it matches the POOL specifically. A pinned `client.query('SET LOCAL
// ROLE …')` is the correct pattern and must NOT be flagged, or the fence would push people
// away from the fix.
const RAW_POOL_ROLE_SWITCH = /pool\s*\.\s*query\s*\(\s*(['"`])\s*SET\s+(LOCAL\s+)?ROLE\b/i;

test('🔴 FENCE: no test switches Postgres roles through the raw pool', () => {
  const offenders = [];
  for (const file of testFiles()) {
    if (path.basename(file) === path.basename(__filename)) continue; // the regex above
    const src = fs.readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (RAW_POOL_ROLE_SWITCH.test(line)) {
        offenders.push(`${path.basename(file)}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, [],
    'A pooled query is not a session: pool.query() checks out a connection PER CALL, so the '
    + 'SET ROLE may apply to a different connection than the statement you are probing — and '
    + 'the probe can PASS while never running as the restricted role. Use '
    + 'tests/helpers/withRole.js, which pins one client for the whole probe.\n'
    + `Offenders: ${offenders.join(', ')}`);
});

test('the fence can actually fire — it detects the pattern it exists to detect', () => {
  // A fence nobody has watched trigger is not a fence. Prove the matcher on the exact
  // shapes it must catch, and prove it does NOT flag the correct pinned-client pattern.
  for (const bad of [
    `await pool.query('SET LOCAL ROLE of_app');`,
    `await pool.query("SET ROLE of_app");`,
    `pool.query( 'SET  LOCAL  ROLE  of_app' )`,
  ]) {
    assert.ok(RAW_POOL_ROLE_SWITCH.test(bad), `should flag: ${bad}`);
  }
  for (const good of [
    `await client.query('SET LOCAL ROLE of_app');`,
    `await withRole(pool, 'of_app', deptId, async (client) => {});`,
    `await pool.query('SELECT 1 FROM pg_roles WHERE rolname = $1', ['of_app']);`,
  ]) {
    assert.ok(!RAW_POOL_ROLE_SWITCH.test(good), `should NOT flag: ${good}`);
  }
});
