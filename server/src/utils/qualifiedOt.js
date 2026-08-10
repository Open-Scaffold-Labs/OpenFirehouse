'use strict';
/**
 * utils/qualifiedOt.js — PURE §225 qualified-overtime helpers (no DB, unit-tested).
 *
 * Legal facts (OBBBA → IRC §225 / IRS Notice 2025-69, confirmed 2026-07-25):
 *  - QUALIFIED overtime = ONLY the HALF-premium (0.5× the regular rate — the "half" of
 *    time-and-a-half), NOT the gross OT pay.
 *  - ONLY FLSA §7/§7(k)/§7(o)-required OT premium qualifies. CBA/MOU/policy OT does NOT.
 *    Comp-time CASH-OUT qualifies only where the underlying accrual was FLSA-required OT.
 *  - The figure is accumulated per member YTD → W-2 Box 12 Code "TT" (mandatory TY2026).
 *  - ADVISORY: OF computes + exports; payroll files. Never payroll-of-record.
 *
 * OF stores OT in HOURS; regular_rate is optional. So the export carries qualifying HOURS
 * always, and the half-premium DOLLARS only where a rate is known (payroll applies the rate
 * otherwise). An UNCLASSIFIED record (earn_code = null) is NEVER auto-qualified — surfaced.
 */

const EARN_CODES = ['flsa_ot', 'cba_ot', 'other_premium', 'comp_cashout'];
const EARN_CODE_LABELS = {
  flsa_ot: 'FLSA-required OT (qualifies)',
  cba_ot: 'CBA / contractual OT',
  other_premium: 'Holiday / callback / standby premium',
  comp_cashout: 'FLSA comp-time cash-out (qualifies)',
};
const QUALIFYING = new Set(['flsa_ot', 'comp_cashout']);

/** Does this earn code represent FLSA §7-required OT premium (so its half-premium qualifies)? */
function isQualifying(earnCode) {
  return QUALIFYING.has(earnCode);
}

/**
 * The §225 view of ONE OT record.
 * @returns {{ qualifies:boolean, qualifyingHours:number, halfPremium:(number|null) }}
 *   halfPremium is the 0.5× regular-rate dollars when a rate is known, else null (hours only).
 */
function qualifiedOt({ earnCode, otHours, regularRate }) {
  const hours = Number(otHours) || 0;
  const qualifies = isQualifying(earnCode);
  const rate = regularRate == null || regularRate === '' ? null : Number(regularRate);
  const halfPremium = qualifies && rate != null && rate >= 0
    ? Math.round(0.5 * rate * hours * 100) / 100
    : null;
  return { qualifies, qualifyingHours: qualifies ? hours : 0, halfPremium };
}

/**
 * Aggregate a member's OT records (a tax year) into the export figure.
 * @param {Array<{earn_code, ot_hours, regular_rate}>} records
 * @returns YTD qualifying hours, the (partial) half-premium dollars + a completeness flag,
 *   the unclassified hours (need a human), and an hours-by-earn-code breakdown (provenance).
 */
function aggregateQualified(records) {
  let qualifyingHours = 0;
  let halfPremiumDollars = 0;
  let dollarsComplete = true;     // false if any qualifying record lacks a rate
  let unclassifiedHours = 0;
  const hoursByEarnCode = {};
  for (const r of records || []) {
    const code = r.earn_code || null;
    const h = Number(r.ot_hours) || 0;
    const key = code || 'unclassified';
    hoursByEarnCode[key] = Math.round(((hoursByEarnCode[key] || 0) + h) * 100) / 100;
    if (code == null) unclassifiedHours += h;
    const q = qualifiedOt({ earnCode: code, otHours: h, regularRate: r.regular_rate });
    if (q.qualifies) {
      qualifyingHours += q.qualifyingHours;
      if (q.halfPremium == null) dollarsComplete = false;
      else halfPremiumDollars += q.halfPremium;
    }
  }
  return {
    qualifyingHours: Math.round(qualifyingHours * 100) / 100,
    halfPremiumDollars: Math.round(halfPremiumDollars * 100) / 100, // partial sum (records with a rate)
    dollarsComplete,
    unclassifiedHours: Math.round(unclassifiedHours * 100) / 100,
    hoursByEarnCode,
  };
}

module.exports = { EARN_CODES, EARN_CODE_LABELS, isQualifying, qualifiedOt, aggregateQualified };
