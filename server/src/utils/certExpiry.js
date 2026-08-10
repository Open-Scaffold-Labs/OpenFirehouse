/**
 * Certification expiry classification — ONE implementation, used by every
 * qualifications surface that has an opinion about whether a cert is current.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `member_qualifications.expiry_date` is TEXT, not DATE. Every consumer was
 * therefore writing its own string comparison, and they had drifted:
 *
 *   • routes/qualifications.js  GET /matrix   — computed `expiring_soon` as
 *       `cert.expiry_date && !cert.expired && cert.expiry_date < cutoff`
 *     `cert` is the raw DB row. There IS NO `expired` COLUMN on that table, so
 *     `cert.expired` was always `undefined` and `!cert.expired` was always
 *     true. The guard excluded nothing. An expired cert came back flagged
 *     `expired: true` AND `expiring_soon: true` — two contradictory facts about
 *     one certification, from one query, in one response body.
 *
 *   • routes/qualifications.js  GET /expiring — filters in SQL with
 *       `expiry_date != '' AND expiry_date <= $cutoff`
 *     Lexicographic comparison on TEXT is only chronological while the value is
 *     a well-formed ISO day. A row reading '7/27/26' sorts ABOVE any '2026-…'
 *     cutoff, so it fails the `<=` and is dropped from the result set with no
 *     trace. A cert with a typo'd expiry date does not appear as a problem —
 *     it disappears. Prod is clean today (50 of 50 parse); that is precisely
 *     when to close this, not after a department imports a bad roster.
 *
 * THE RULE, which is the same rule the rest of this phase runs on: a value we
 * cannot read is its own answer. It is not "current" and it is not "expired" —
 * it is UNREADABLE, and it gets counted and shown so somebody can go fix it.
 * Never silently omitted, never silently assumed valid.
 *
 * All functions here are pure and take `asOf` explicitly. The server does not
 * decide what day it is on the caller's behalf.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Closed set. A cert is in exactly one of these states. */
const CERT_STATE = Object.freeze({
  CURRENT: 'current',
  EXPIRING: 'expiring',
  EXPIRED: 'expired',
  NO_EXPIRY_RECORDED: 'no_expiry_recorded',
  UNREADABLE: 'unreadable',
});

/** A cert that does not permit riding. Excludes UNREADABLE — that is a data
 *  problem to fix, not a competency verdict to act on. */
const BLOCKING_STATES = Object.freeze([CERT_STATE.EXPIRED]);

function isIsoDay(v) {
  if (typeof v !== 'string' || !ISO_DAY.test(v)) return false;
  // Reject 2026-02-31 and friends: round-trip through Date and require the
  // same string back. Regex alone would accept a calendar-impossible day.
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * @param {string|null|undefined} expiryDate  raw TEXT column value
 * @param {string} asOf        ISO day the question is being asked about
 * @param {number} daysAhead   size of the "expiring" window, in days
 * @returns {string} one of CERT_STATE
 */
function classifyCert(expiryDate, asOf, daysAhead = 90) {
  if (!isIsoDay(asOf)) throw new TypeError('classifyCert: asOf must be an ISO day (YYYY-MM-DD)');
  if (expiryDate === null || expiryDate === undefined || expiryDate === '') {
    return CERT_STATE.NO_EXPIRY_RECORDED;
  }
  if (!isIsoDay(expiryDate)) return CERT_STATE.UNREADABLE;

  // Both sides are now known-good ISO days, so lexicographic === chronological
  // and we never construct a Date in a local timezone that could shift the day.
  if (expiryDate < asOf) return CERT_STATE.EXPIRED;

  const window = new Date(`${asOf}T00:00:00Z`);
  window.setUTCDate(window.getUTCDate() + Math.max(0, Math.floor(daysAhead)));
  const cutoff = window.toISOString().slice(0, 10);

  return expiryDate <= cutoff ? CERT_STATE.EXPIRING : CERT_STATE.CURRENT;
}

/** Roll a list of raw expiry values into per-state counts. Every input lands in
 *  exactly one bucket, so the counts always sum to the input length — that is
 *  what makes an omission impossible to hide. */
function tallyCerts(expiryDates, asOf, daysAhead = 90) {
  const counts = {
    [CERT_STATE.CURRENT]: 0,
    [CERT_STATE.EXPIRING]: 0,
    [CERT_STATE.EXPIRED]: 0,
    [CERT_STATE.NO_EXPIRY_RECORDED]: 0,
    [CERT_STATE.UNREADABLE]: 0,
  };
  for (const v of expiryDates) counts[classifyCert(v, asOf, daysAhead)]++;
  return counts;
}

module.exports = { CERT_STATE, BLOCKING_STATES, classifyCert, tallyCerts, isIsoDay };
