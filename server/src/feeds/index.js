'use strict';
/**
 * feeds/index.js — Calendar feed registry.
 *
 * Each feed is a function(start, end, options) → Promise<CalendarEntry[]>.
 * The aggregator route calls all registered feeds in parallel and merges results.
 *
 * To add a new feed: require it and push to the `feeds` array.
 */

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
async function aggregateFeeds(start, end, options = {}) {
  const { tier, memberId, categories, stationId } = options;

  // Fail closed: never aggregate without a tenant scope.
  if (stationId === undefined || stationId === null) {
    throw new Error('aggregateFeeds: options.stationId is required');
  }

  // Run all feeds in parallel; if one fails, log and skip it
  const results = await Promise.allSettled(
    feeds.map(async ({ name, fn }) => {
      try {
        return await fn(start, end, options);
      } catch (err) {
        console.warn(`[calendar] feed "${name}" failed:`, err.message);
        return [];
      }
    })
  );

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

module.exports = { feeds, aggregateFeeds };
