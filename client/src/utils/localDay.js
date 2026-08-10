// localDay.js — "what day is it, HERE?" for the browser.
//
// The bug this exists to prevent (found on The Board, 2026-08-05): a calendar day
// is a LOCAL wall-clock day, but `new Date().toISOString().slice(0,10)` is the UTC
// day. West of Greenwich those disagree for the last hours of every local day —
// in America/New_York from 20:00 EDT (19:00 EST). Measured live at 21:37 EDT on
// 2026-08-05: local date 5, UTC date 6, and the calendar grid put its "today"
// pill on the 6th while styling the real today as PAST.
//
// So: any comparison against a stored YYYY-MM-DD date (shift dates, event dates,
// expiry dates — all authored as local days) must use localToday(), never an ISO
// string. Full timestamps are a different thing and correctly stay UTC ISO.
//
// NOTE: several components still carry their own inline copy of this formatter
// (AllStationsBoard, DailyStaffingBoard, ResponseAnalytics, TVDisplay, DataImport)
// and ~28 sites still derive a day from toISOString(). Those belong to modules
// that have not had their design/hardening pass yet — migrate them there rather
// than in a blind sweep, and check each one first: a few (export filenames,
// "generated on" stamps) are legitimately UTC.

/** Today as YYYY-MM-DD in the viewer's local timezone. */
export function localToday() {
  return toLocalDay(new Date());
}

/** Any Date as YYYY-MM-DD in the viewer's local timezone. */
export function toLocalDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * A stored calendar date, rendered for a human — WITHOUT a timezone conversion.
 *
 * Postgres `date` columns arrive over JSON as `2026-03-21T00:00:00.000Z`. Two
 * things then go wrong, and they go wrong in opposite directions:
 *
 *   · Printed raw, a fire officer reads "2026-03-21T00:00:00.000Z" on an
 *     after-action report. (Shipped. Found 2026-08-06 on `#/after-action`.)
 *   · "Fixed" with `new Date(v).toLocaleDateString()`, midnight UTC becomes
 *     20:00 the PREVIOUS day in America/New_York — so the report silently
 *     moves to the 20th. That is the worse bug, and it is the obvious fix.
 *
 * A calendar date has no time and no zone. So we take the date PORTION as
 * written and never construct a Date from it. Returns '' for empty input so a
 * caller renders nothing rather than "Invalid Date".
 */
export function displayDay(value) {
  if (!value) return '';
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const [, y, mo, d] = m;
  return `${mo}/${d}/${y}`;
}

/** Today shifted by `days`, as a local YYYY-MM-DD. Negative goes backwards. */
export function localDayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalDay(d);
}

export default localToday;
