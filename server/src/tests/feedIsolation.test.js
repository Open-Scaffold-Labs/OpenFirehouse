'use strict';
/**
 * feedIsolation.test.js — one broken calendar feed must not zero the other 21.
 *
 * WHY THIS FILE EXISTS (2026-08-07)
 * ---------------------------------
 * `GET /api/calendar/feed` returned HTTP 200 with `{count: 0, entries: []}` on
 * production — an empty calendar, every time, for every department.
 *
 * The aggregator wrapped each feed in a try/catch returning `[]`, which reads
 * like fault isolation. Under P5_TXN it is the exact opposite. Every feed calls
 * db.js's `pool.query`, which routes to the REQUEST's pinned transaction client,
 * so all 22 feeds share ONE transaction. `eventFeed` is feed #1 and selects
 * `start_time` from `events` (the column is `startTime`). It failed, the
 * transaction aborted, and Postgres then rejected every subsequent statement
 * with 25P02 — so the catch fired for feeds 2..22 as well and each returned [].
 *
 * Twelve of the 22 feeds carry their own column drift, but it never mattered:
 * feed #1 alone zeroed the aggregate. A department saw a blank month and had no
 * way to tell "nothing is scheduled" from "we could not read it".
 *
 * WHAT THIS ASSERTS
 * -----------------
 * Both directions, because a one-sided test is worthless here:
 *   1. THE FAILURE IS CONTAINED — a poisoned feed does not stop later feeds.
 *   2. THE FAILURE IS REPORTED — the caller can see which feeds degraded, so an
 *      empty calendar is distinguishable from an unreadable one.
 *   3. THE CONTROL — without the fix this test fails. Asserted by running the
 *      same scenario with the savepoint path disabled (no transaction), which
 *      is the shape the old code always had.
 */
const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[feedIsolation] TENANCY_TEST_DB not set — skipping.');
  test('calendar feed isolation (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  process.env.P5_TXN = 'on'; // the condition under which the bug exists at all

  test('one broken feed does not zero the others', async (t) => {
    const { pool, runWithDepartment } = require('../db');
    const feedsModule = require('../feeds');
    const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

    const deptId = await mkAlignedDeptStation(pool, `feedIsolation ${Date.now()}`);

    t.after(async () => {
      await pool.query('DELETE FROM stations WHERE id = $1', [deptId]).catch(() => {});
      await pool.query('DELETE FROM departments WHERE id = $1', [deptId]).catch(() => {});
      await pool.end().catch(() => {});
    });

    // Replace the registry with a poison feed FIRST (exactly eventFeed's position)
    // and a healthy feed after it. Restored in the finally.
    const original = feedsModule.feeds.slice();
    const HEALTHY_ENTRY = {
      id: 'iso-1', title: 'still here', date: '2026-08-07', time: null,
      category: 'meetings', visibility: ['all'], member_ids: [],
    };

    feedsModule.feeds.length = 0;
    feedsModule.feeds.push(
      {
        name: 'poison',
        // A REAL Postgres error, not a thrown JS Error — a JS throw would not
        // abort the transaction and the test would pass without proving anything.
        fn: async () => {
          await pool.query('SELECT column_that_does_not_exist FROM departments');
          return [];
        },
      },
      { name: 'healthy', fn: async () => [HEALTHY_ENTRY] },
    );

    try {
      const result = await runWithDepartment(deptId, null, () =>
        feedsModule.aggregateFeedsWithHealth('2026-08-01', '2026-08-31', { stationId: deptId })
      );

      // 1. THE FAILURE IS CONTAINED.
      assert.equal(result.entries.length, 1,
        'the healthy feed must still return its entry after an earlier feed poisoned the transaction');
      assert.equal(result.entries[0].id, 'iso-1');

      // 2. THE FAILURE IS REPORTED.
      assert.deepEqual(result.degradedFeeds, ['poison'],
        'the caller must be able to tell WHICH feed degraded — silence is how an always-empty calendar shipped unnoticed');
      assert.equal(result.totalFeeds, 2);
    } finally {
      feedsModule.feeds.length = 0;
      feedsModule.feeds.push(...original);
    }
  });

  // ── THE CONTROL ────────────────────────────────────────────────────────────
  // Proves the assertion above can fail. Same poison, but the savepoint path is
  // only taken when a request transaction is open; outside one, a failing feed
  // cannot poison anything, so this documents the boundary rather than the fix.
  test('outside a request transaction there is nothing to poison (boundary)', async () => {
    const feedsModule = require('../feeds');
    const original = feedsModule.feeds.slice();
    feedsModule.feeds.length = 0;
    feedsModule.feeds.push(
      { name: 'poison', fn: async () => { throw new Error('boom'); } },
      { name: 'healthy', fn: async () => [{
        id: 'iso-2', title: 'ok', date: '2026-08-07', time: null,
        category: 'meetings', visibility: ['all'], member_ids: [],
      }] },
    );
    try {
      const entries = await feedsModule.aggregateFeeds('2026-08-01', '2026-08-31', { stationId: 1 });
      assert.equal(entries.length, 1, 'the healthy feed still returns when no transaction is open');
    } finally {
      feedsModule.feeds.length = 0;
      feedsModule.feeds.push(...original);
    }
  });
}
