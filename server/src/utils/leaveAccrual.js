'use strict';
/**
 * utils/leaveAccrual.js — PURE accrual math (no DB, fully unit-testable).
 *
 * The market bar (2026-07-24 research pass, competitors generic) names three things a
 * naive accrual engine gets wrong; these functions encode the correct behavior:
 *   - tenure tiers select on COMPLETED years of service as of the period-END date, with
 *     real calendar math (never days/365, which drifts on leap years / the exact anniversary);
 *   - a balance cap CLAMPS to the ceiling (credit the portion that fits) — it never skips the
 *     whole accrual (silent under-crediting) and never forfeits already-banked hours (which is
 *     illegal in CA/CO/MT and is the year-end carryover run's job, not the accrual run's);
 *   - years-of-service uses the AS-OF (period-end) date so a late run doesn't mis-tier.
 */

/**
 * Completed years of service from a hire date to an as-of date, by calendar math.
 * @param {string|Date} hireDate  e.g. '2019-03-15'
 * @param {string|Date} asOf      the period-END date
 * @returns {number} whole completed years (>= 0)
 */
function yearsOfService(hireDate, asOf) {
  if (!hireDate || !asOf) return 0;
  const h = new Date(hireDate);
  const a = new Date(asOf);
  if (isNaN(h.getTime()) || isNaN(a.getTime())) return 0;
  let years = a.getUTCFullYear() - h.getUTCFullYear();
  // Subtract one if this year's anniversary (same month+day) hasn't occurred by asOf.
  const annivMonth = h.getUTCMonth();
  const annivDay = h.getUTCDate();
  const am = a.getUTCMonth();
  const ad = a.getUTCDate();
  if (am < annivMonth || (am === annivMonth && ad < annivDay)) years -= 1;
  return Math.max(0, years);
}

/**
 * Select the accrual rate for a member: the HIGHEST tenure tier whose `years` threshold is
 * <= the member's years of service (inclusive at the exact anniversary). Falls back to the
 * bank's base rate when no tier matches (or there are no tiers).
 * @param {Array<{years:number, rate:number}>} tenureTiers
 * @param {number} years   years of service (from yearsOfService)
 * @param {number} baseRate  the bank's base accrual_rate
 * @returns {{ rate:number, tier:(object|null) }}
 */
function selectAccrualRate(tenureTiers, years, baseRate) {
  let rate = Number(baseRate) || 0;
  let tier = null;
  const tiers = Array.isArray(tenureTiers) ? [...tenureTiers] : [];
  tiers.sort((x, y) => Number(x.years) - Number(y.years));
  for (const t of tiers) {
    if (t && Number.isFinite(Number(t.years)) && years >= Number(t.years)) {
      rate = Number(t.rate) || 0;
      tier = t;
    }
  }
  return { rate, tier };
}

/**
 * Clamp a proposed accrual to the bank's max-balance cap: credit the portion that FITS under
 * the ceiling, never overshoot, never negative. NULL cap = no ceiling. At/over cap = 0.
 * @param {number} amount   proposed accrual (>= 0)
 * @param {number} current  current balance
 * @param {number|null} cap accrual_cap (max balance) or null
 * @returns {number} the amount to actually credit (>= 0)
 */
function clampAccrual(amount, current, cap) {
  const amt = Math.max(0, Number(amount) || 0);
  if (cap == null) return amt;
  const room = Number(cap) - Number(current);
  if (room <= 0) return 0;
  return Math.min(amt, room);
}

/**
 * Excess to forfeit at the year-end carryover boundary = balance above the carryover cap.
 * NULL cap = nothing forfeits. Never negative. (The CALLER must exempt FLSA §7(o) comp banks
 * entirely — that exemption is not this function's job.)
 * @returns {number} hours to forfeit (>= 0)
 */
function carryoverExcess(current, carryoverCap) {
  if (carryoverCap == null) return 0;
  const excess = Number(current) - Number(carryoverCap);
  return excess > 0 ? excess : 0;
}

// Accrual methods that credit hours over time (project-able). 'none' and
// 'per_hours_worked' are NOT projected — the former never accrues, the latter needs
// future hours-worked we can't foresee (honest: we don't invent them).
const PROJECTABLE_METHODS = ['per_period', 'annual_grant', 'anniversary'];

/**
 * Count the accrual events that fall in the window (from, to] for a cadence. Events land
 * ON period boundaries AFTER `from` and up to and including `to`:
 *   - per_period biweekly → every 14 days
 *   - per_period monthly  → the same day-of-month each month
 *   - per_period/annual_grant annual → each Jan 1
 *   - anniversary         → each hire-date anniversary
 * Returns an array of the event DATES (Date objects, ascending) so the caller can
 * tenure-tier the rate AS OF each event. Capped at 400 events (a hard sanity bound).
 * @returns {Date[]}
 */
function accrualEventDates(method, period, from, to, hireDate) {
  const start = new Date(from);
  const end = new Date(to);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return [];
  const out = [];
  const push = (d) => { if (d > start && d <= end && out.length < 400) out.push(new Date(d)); };

  if (method === 'anniversary') {
    if (!hireDate) return [];
    const h = new Date(hireDate);
    if (isNaN(h.getTime())) return [];
    let y = start.getUTCFullYear();
    // Walk anniversaries from the year of `start` through the year of `end`.
    for (; y <= end.getUTCFullYear() + 1; y++) {
      const anniv = new Date(Date.UTC(y, h.getUTCMonth(), h.getUTCDate()));
      push(anniv);
    }
    return out.sort((a, b) => a - b);
  }

  const per = period || (method === 'annual_grant' ? 'annual' : null);
  if (per === 'biweekly') {
    // Anchor on `from`; first event 14 days after.
    const d = new Date(start);
    for (let i = 0; i < 400; i++) {
      d.setUTCDate(d.getUTCDate() + 14);
      if (d > end) break;
      push(d);
    }
  } else if (per === 'monthly') {
    const anchorDay = start.getUTCDate();
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    for (let i = 0; i < 400; i++) {
      m += 1; if (m > 11) { m = 0; y += 1; }
      // Clamp to month length (e.g. day 31 → Feb 28).
      const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const day = Math.min(anchorDay, dim);
      const d = new Date(Date.UTC(y, m, day));
      if (d > end) break;
      push(d);
    }
  } else if (per === 'annual') {
    // Each Jan 1 in (from, to]. push() filters the boundaries; iterate one past end.year
    // so a Jan-1 landing exactly on `to` is included.
    for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear() + 1; y++) {
      push(new Date(Date.UTC(y, 0, 1)));
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * Project a bank balance FORWARD from a current balance to a target date, applying the
 * bank's accrual cadence + tenure-tiered rate at each event and clamping to the cap as it
 * goes (never overshoots the ceiling — same clamp semantics as a real run). Pure + honest:
 * it projects ONLY scheduled accruals (not future usage — OF debits at approval, so the
 * current posted balance already excludes approved-future leave). NULL/zero-rate/unprojectable
 * banks return the current balance unchanged with accrualEvents 0.
 *
 * @param {object} bank   { accrual_method, accrual_rate, period, accrual_cap, tenure_tiers }
 * @param {object} opts   { current, hireDate, from, to }
 * @returns {{ projected:number, estimatedAccrual:number, accrualEvents:number, cappedAt:(number|null), projectable:boolean }}
 */
function projectBalance(bank, { current, hireDate, from, to }) {
  const cur = Number(current) || 0;
  const method = bank && bank.accrual_method;
  const baseRate = Number(bank && bank.accrual_rate) || 0;
  const cap = bank && bank.accrual_cap != null ? Number(bank.accrual_cap) : null;
  const tiers = bank && bank.tenure_tiers ? bank.tenure_tiers : [];
  if (!PROJECTABLE_METHODS.includes(method) || !(baseRate > 0)) {
    return { projected: cur, estimatedAccrual: 0, accrualEvents: 0, cappedAt: null, projectable: false };
  }
  const events = accrualEventDates(method, bank.period, from, to, hireDate);
  let bal = cur;
  let credited = 0;
  let cappedAt = null;
  for (const ev of events) {
    const years = yearsOfService(hireDate, ev);
    const { rate } = selectAccrualRate(tiers, years, baseRate);
    if (!(rate > 0)) continue;
    const add = clampAccrual(rate, bal, cap);
    if (add <= 0) { if (cap != null) cappedAt = cap; continue; }
    bal += add;
    credited += add;
  }
  // Round to 2dp to avoid float dust in the displayed projection.
  const r2 = (n) => Math.round(n * 100) / 100;
  return { projected: r2(bal), estimatedAccrual: r2(credited), accrualEvents: events.length, cappedAt, projectable: true };
}

module.exports = {
  yearsOfService, selectAccrualRate, clampAccrual, carryoverExcess,
  projectBalance, accrualEventDates, PROJECTABLE_METHODS,
};
