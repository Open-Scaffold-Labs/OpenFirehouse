'use strict';
/**
 * utils/reportPeriod.js — the period a scheduled report covers, and the key that
 * makes delivering it exactly once possible.
 *
 * THE DESIGN, and why there is no "day of month to send" field
 * -----------------------------------------------------------
 * The obvious schema is `send_on_day INTEGER` and a cron that asks "is today the
 * day?". That breaks the moment a department picks the 31st and February
 * arrives, it breaks again if a cron run is missed (the day passes, nothing ever
 * sends, and nobody finds out), and it double-sends if Vercel retries within the
 * same day.
 *
 * So the trigger is not a DAY, it is a PERIOD. A schedule owes a delivery for
 * every complete period that has elapsed and not yet been sent. The sweep asks
 * "what is the most recent COMPLETE period?" and compares it to the period key
 * already recorded on the row. Different → send, and claim the period by writing
 * its key. Same → nothing to do.
 *
 * That single change buys three properties for free:
 *   • A missed run self-heals — the next run still sees the period unsent.
 *   • A retried run is a no-op — the period is already claimed.
 *   • February is not a special case.
 *
 * TIME ZONE, stated rather than assumed: boundaries are computed in UTC. The
 * daily sweep runs at 14:15 UTC (mid-morning across US time zones), so by the
 * time a new month's first run happens, the previous month is complete in every
 * US zone — the boundary choice cannot move which month gets reported. Every
 * delivery names its exact date range anyway, so the reader never has to infer
 * the period from the key.
 *
 * Pure. No I/O, no clock of its own — `now` is always passed in.
 */

const CADENCE = Object.freeze({ WEEKLY: 'weekly', MONTHLY: 'monthly' });

function pad2(n) { return String(n).padStart(2, '0'); }
function iso(d) { return d.toISOString().slice(0, 10); }

/**
 * ISO-8601 week number. Weeks start Monday; week 1 is the week containing the
 * first Thursday. Hand-rolled because the alternative is a date library for one
 * function, and the rule is short enough to be checkable by eye.
 */
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday of this week determines the year the week belongs to.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d - jan1) / 86400000 + 1) / 7);
  return { year, week };
}

/**
 * The most recent period that is COMPLETE as of `now` — never the one in
 * progress. A report covering a half-finished month would be read as though it
 * covered the whole one.
 *
 * @param {string} cadence  CADENCE.WEEKLY | CADENCE.MONTHLY
 * @param {Date}   now
 * @returns {{key:string, from:string, to:string, label:string}}
 */
function lastCompletePeriod(cadence, now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('lastCompletePeriod: now must be a valid Date');
  }

  if (cadence === CADENCE.MONTHLY) {
    // First day of the current month, minus one day = last day of the previous.
    const firstOfThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastOfPrev = new Date(firstOfThis.getTime() - 86400000);
    const y = lastOfPrev.getUTCFullYear();
    const m = lastOfPrev.getUTCMonth();
    const from = new Date(Date.UTC(y, m, 1));
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return {
      key: `${y}-${pad2(m + 1)}`,
      from: iso(from),
      to: iso(lastOfPrev),
      label: `${MONTHS[m]} ${y}`,
    };
  }

  if (cadence === CADENCE.WEEKLY) {
    // Monday of the current ISO week, minus 7 days = Monday of the last complete
    // week. getUTCDay(): Sunday is 0, so `|| 7` maps Sunday to the END of its
    // week rather than the start of the next one.
    const dow = now.getUTCDay() || 7;
    const mondayThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    mondayThis.setUTCDate(mondayThis.getUTCDate() - (dow - 1));
    const from = new Date(mondayThis.getTime() - 7 * 86400000);
    const to = new Date(mondayThis.getTime() - 86400000);
    const { year, week } = isoWeek(from);
    return {
      key: `${year}-W${pad2(week)}`,
      from: iso(from),
      to: iso(to),
      label: `week of ${iso(from)}`,
    };
  }

  throw new TypeError(`lastCompletePeriod: unknown cadence ${cadence}`);
}

/**
 * Does this schedule owe a delivery?
 *
 * The whole of the idempotency guarantee is this comparison. `lastPeriodKey` is
 * written only after a delivery attempt reaches a terminal outcome, so a crash
 * mid-send leaves the period unclaimed and the next run retries it — the failure
 * mode we want, rather than a silently skipped month.
 */
function isDeliveryDue(schedule, now) {
  if (!schedule || schedule.enabled === false) return null;
  const period = lastCompletePeriod(schedule.cadence, now);
  return period.key === schedule.last_period_key ? null : period;
}

module.exports = { CADENCE, lastCompletePeriod, isDeliveryDue, isoWeek };
