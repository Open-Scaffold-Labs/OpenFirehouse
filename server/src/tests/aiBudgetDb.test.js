'use strict';
// DB-backed AI-budget round-trip (M1, 2026-06-15).
//
// Proves the M1 fix: recorded usage is now VISIBLE to the enforcement read and
// exceeding the budget throws BUDGET_EXCEEDED/429. Before M1, recordUsage wrote
// only `station_id` while the reads filtered `department_id` (NULL), so usage
// never accumulated and the budget never enforced.
//
// Opt-in via TENANCY_TEST_DB (like the tenancy suite); skips cleanly otherwise.
// Never calls pool.end() — the pg pool is a shared singleton across the test
// run (db.js Lesson #4); we only delete our own throwaway-dept rows.

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[aiBudgetDb] TENANCY_TEST_DB not set — skipping live AI-budget suite.');
  test('ai budget round-trip (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  // Must be set BEFORE requiring db.js — it builds its pool from DATABASE_URL
  // at require time (mirrors tenancyIsolation.test.js).
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  const aiBudget = require('../utils/aiBudget');
  const { pool } = require('../db');

  const DEPT = 990177; // throwaway dept id — collides with no real tenant

  test('recorded usage is visible to getTodayUsage + enforcement fires (M1 fix)', async () => {
    await pool.query('DELETE FROM ai_usage WHERE department_id = $1', [DEPT]);
    try {
      const before = await aiBudget.getTodayUsage(DEPT);
      assert.equal(before.tokens, 0, 'fixture dept starts at zero usage');

      await aiBudget.recordUsage(DEPT, { action: 'test', model: 'm', inputTokens: 100, outputTokens: 50 });
      const after = await aiBudget.getTodayUsage(DEPT);
      assert.equal(after.tokens, 150, 'recorded usage must be visible to the budget read (was invisible pre-M1)');
      assert.ok(after.calls >= 1, 'call count accumulates');

      // Push past the default budget and confirm enforcement throws 429-shaped.
      await aiBudget.recordUsage(DEPT, {
        action: 'test', model: 'm', inputTokens: aiBudget.DEFAULT_DAILY_BUDGET, outputTokens: 0,
      });
      await assert.rejects(
        () => aiBudget.assertWithinBudget(DEPT),
        (e) => e.code === 'BUDGET_EXCEEDED' && e.status === 429,
        'usage over budget must throw BUDGET_EXCEEDED/429',
      );
    } finally {
      await pool.query('DELETE FROM ai_usage WHERE department_id = $1', [DEPT]);
    }
  });
}
