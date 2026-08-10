'use strict';
/**
 * utils/localDate.js — timezone-safe DATE-STRING arithmetic (Prevention Core P2).
 *
 * THE RULE (gameplan doctrine 8): inspection scheduling math NEVER goes through
 * a Date's local/UTC "now" — the known UTC-"today" bug class (after ~8pm Eastern,
 * toISOString() is tomorrow) corrupts date-heavy scheduling. "Today" is supplied
 * by the CLIENT (the inspector's local day — mobile fixed in P0); the server does
 * pure calendar math on YYYY-MM-DD strings.
 *
 * Implementation detail: arithmetic pins to 12:00 UTC ("UTC-noon trick") so DST
 * transitions and leap seconds can never shift the calendar day.
 */

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Is this a well-formed, REAL calendar day? ('2026-02-30' → false) */
function isIsoDay(s) {
  if (typeof s !== 'string' || !ISO_DAY_RE.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** '2026-07-12' + 365 → '2027-07-12'. Throws on malformed input (fail loud, never guess a date). */
function addDaysISO(day, days) {
  if (!isIsoDay(day)) throw new Error(`addDaysISO: not a calendar day: ${JSON.stringify(day)}`);
  if (!Number.isInteger(days)) throw new Error(`addDaysISO: days must be an integer: ${JSON.stringify(days)}`);
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First 10 chars if they form a real day, else null (legacy TEXT date columns). */
function coerceIsoDay(v) {
  if (typeof v !== 'string') return null;
  const s = v.slice(0, 10);
  return isIsoDay(s) ? s : null;
}

/** Whole days from a → b (positive when b is later). Throws on malformed input. */
function daysBetweenISO(a, b) {
  if (!isIsoDay(a)) throw new Error(`daysBetweenISO: not a calendar day: ${JSON.stringify(a)}`);
  if (!isIsoDay(b)) throw new Error(`daysBetweenISO: not a calendar day: ${JSON.stringify(b)}`);
  const da = new Date(`${a}T12:00:00Z`);
  const db = new Date(`${b}T12:00:00Z`);
  return Math.round((db - da) / 86400000);
}

/** Day of week for a calendar day (0=Sunday … 6=Saturday). Throws on malformed input. */
function isoDayOfWeek(day) {
  if (!isIsoDay(day)) throw new Error(`isoDayOfWeek: not a calendar day: ${JSON.stringify(day)}`);
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

module.exports = { isIsoDay, addDaysISO, coerceIsoDay, daysBetweenISO, isoDayOfWeek };
