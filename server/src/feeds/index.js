'use strict';
/**
 * feeds/index.js — Calendar feed registry.
 *
 * Each feed is a function(start, end, options) → Promise<CalendarEntry[]>.
 * The aggregator route calls all registered feeds in parallel and merges results.
 *
 * To add a new feed: require it and push to the `feeds` array.
 */

const { getClient } = require('../utils/dbContext');
const { pool } = require('../db');

const feeds = [
  { name: 'events',        fn: require('./eventFeed') },
  { name: 'shifts',        fn: require('./shiftFeed') },
  { name: 'training',      fn: require('./trainingFeed') },
  { name: 'meetings',      fn: require('./meetingFeed') },
  { name: 'maintenance',   fn: require('./maintenanceFeed') },
  { name: 'leave',         fn: require('./leaveFeed') },
  { name: 'inspections',   fn: require('./inspectionFeed') },
  { name: 'hydrants',      fn: require('./hydrantFeed') },
  { name: 'grants',        fn: require('./grantFeed') },
  { name: 'incidents',     fn: require('./incidentFeed') },
  { name: 'drills',        fn: require('./drillFeed') },
  { name: 'grievances',    fn: require('./grievanceFeed') },
  { name: 'apparatus-oos', fn: require('./apparatusOOSFeed') },
  { name: 'wellness',      fn: require('./wellnessFeed') },
  { name: 'scba',          fn: require('./scbaFeed') },
  { name: 'fundraising',   fn: require('./fundraisingFeed') },
  { name: 'shift-trades',  fn: require('./shiftTradeFeed') },
  { name: 'mutual-aid-agreements', fn: require('./mutualAidAgreementFeed') },
  { name: 'sogs',          fn: require('./sogFeed') },
  { name: 'equipment',     fn: require('./equipmentFeed') },
  { name: 'personnel',     fn: require('./personnelFeed') },
  { name: 'community',     fn: require('./communityFeed') },
];

/**
 * Aggregate all feeds for a date range.
 *
 * @param {string} start  — ISO date string (YYYY-MM-DD)
 * @param {string} end    — ISO date string (YYYY-MM-DD)
 * @param {object} options — { stationId, tier, memberId, categories }
 * @returns {Promise<CalendarEntry[]>} — sorted by date, then time
 */
async function aggregateFeeds(start, end, options = {}, health = null) {
  const { tier, memberId, categories, stationId } = options;

  // Fail closed: never aggregate without a tenant scope.
  if (stationId === undefined || stationId === null) {
    throw new Error('aggregateFeeds: options.stationId is required');
  }

  // ── WHY THIS IS NOT A BARE try/catch ANY MORE (2026-08-07) ────────────────
  // It used to be `Promise.allSettled` with a per-feed try/catch returning [].
  // That reads like fault isolation and is the opposite of it under P5_TXN.
  //
  // Every feed calls db.js's pool.query, which routes to the REQUEST's pinned
  // transaction client when one is open. So all 22 feeds share ONE transaction.
  // The first feed to issue a bad statement aborts it, and Postgres then rejects
  // every subsequent statement with 25P02 — so the catch fires for feeds 2..22
  // as well, each dutifully returning [].
  //
  // Observed on prod: eventFeed is feed #1 and selects `start_time` from `events`
  // (the column is `startTime`). It fails, and GET /api/calendar/feed answers
  // HTTP 200 with {count: 0, entries: []} — an empty calendar, every time, with
  // no error anywhere. A department would see a blank month and assume nothing
  // was scheduled. Twelve of the 22 feeds carry their own column drift, but it
  // never mattered: feed #1 alone zeroed the whole aggregate.
  //
  // Fix: the SAVEPOINT pattern already used by utils/auditLog.js. A failing feed
  // rolls back only itself and the transaction stays usable for the rest.
  //
  // SEQUENTIAL when a transaction is open — this is REQUIRED, not a preference.
  // SAVEPOINT/RELEASE pairs cannot interleave on one connection: feed A's RELEASE
  // would discard feed B's savepoint. Parallelism buys nothing here anyway, since
  // a single pinned client serialises the queries regardless. Without a request
  // transaction (cron, scripts) there is nothing to poison, so keep it parallel.
  const inTxn = !!getClient();
  let results;

  if (inTxn) {
    results = [];
    for (const { name, fn } of feeds) {
      const SP = `of_feed_sp_${name.replace(/[^a-z0-9]/gi, '_')}`;
      try {
        await pool.query(`SAVEPOINT ${SP}`);
        const value = await fn(start, end, options);
        await pool.query(`RELEASE SAVEPOINT ${SP}`);
        results.push({ status: 'fulfilled', value });
      } catch (err) {
        // Undo ONLY this feed. If the rollback itself fails the transaction is
        // already unusable, so stop pretending the rest can run.
        try {
          await pool.query(`ROLLBACK TO SAVEPOINT ${SP}`);
          await pool.query(`RELEASE SAVEPOINT ${SP}`);
        } catch (rbErr) {
          console.error(`[calendar] feed "${name}" failed AND its savepoint could not be rolled back — the request transaction is poisoned:`, rbErr.message);
          throw err;
        }
        console.warn(`[calendar] feed "${name}" failed (isolated, other feeds unaffected):`, err.message);
        results.push({ status: 'fulfilled', value: [], failedFeed: name });
      }
    }
  } else {
    results = await Promise.allSettled(
      feeds.map(async ({ name, fn }) => {
        try {
          return await fn(start, end, options);
        } catch (err) {
          console.warn(`[calendar] feed "${name}" failed:`, err.message);
          return [];
        }
      })
    );
  }

  // Surface which feeds degraded. A caller that renders an empty calendar should
  // be able to tell "nothing is scheduled" from "we could not read it" — the
  // distinction the old code destroyed.
  const failedFeeds = results.filter(r => r.failedFeed).map(r => r.failedFeed);
  if (failedFeeds.length) {
    console.warn(`[calendar] ${failedFeeds.length}/${feeds.length} feeds degraded: ${failedFeeds.join(', ')}`);
  }
  if (health) health.degradedFeeds = failedFeeds;

  let entries = results.flatMap(r =>
    r.status === 'fulfilled' ? r.value : []
  );

  // ── Filter by calendar tier ──────────────────────────────────────────────
  // Tier hierarchy: station > officer > member > public
  // "all" visibility entries appear on every tier
  if (tier) {
    const TIER_ACCESS = {
      station: ['station', 'officer', 'all'],
      officer: ['officer', 'all'],
      member:  ['all'],
      public:  ['public', 'all'],
    };
    const allowed = TIER_ACCESS[tier] || ['all'];
    entries = entries.filter(e =>
      e.visibility.some(v => allowed.includes(v))
    );
  }

  // ── Filter by member (personal calendar) ─────────────────────────────────
  if (memberId) {
    entries = entries.filter(e =>
      e.member_ids.length === 0 || e.member_ids.includes(Number(memberId))
    );
  }

  // ── Filter by category ───────────────────────────────────────────────────
  if (categories && categories.length > 0) {
    entries = entries.filter(e => categories.includes(e.category));
  }

  // ── Sort by date, then time ──────────────────────────────────────────────
  entries.sort((a, b) => {
    const dc = (a.date || '').localeCompare(b.date || '');
    if (dc !== 0) return dc;
    return (a.time || '').localeCompare(b.time || '');
  });

  return entries;
}

/**
 * Aggregate, and report WHICH feeds degraded.
 *
 * aggregateFeeds() returns entries only, so a caller cannot distinguish "nothing
 * is scheduled" from "we could not read it". That ambiguity is what let an
 * always-empty calendar ship unnoticed. Routes rendering to a human should
 * prefer this and say so in the response.
 */
async function aggregateFeedsWithHealth(start, end, options = {}) {
  const health = { degradedFeeds: [] };
  const entries = await aggregateFeeds(start, end, options, health);
  return { entries, degradedFeeds: health.degradedFeeds, totalFeeds: feeds.length };
}

module.exports = { feeds, aggregateFeeds, aggregateFeedsWithHealth };
