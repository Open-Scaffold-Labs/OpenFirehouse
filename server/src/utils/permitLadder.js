'use strict';
/**
 * permitLadder.js — the pure arithmetic of the permit expiry ladder (Phase 3, module 3.1b).
 *
 * PURE ON PURPOSE. No database, no clock, no I/O. The runner in jobs/permitExpiry.js does
 * the reading and writing; everything that can be got WRONG lives here where a unit test can
 * pin every boundary. The repo has paid for date logic hidden inside a route more than once.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE LADDER, AND WHY GRACE COMES BEFORE 'Expired'
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *   Active  →  AboutToExpire  →  Delinquent  →  Expired
 *              (notice window,   (term ended,     (past end-of-grace;
 *               renewal opens)    in grace,        RENEWAL IS WITHDRAWN)
 *                                 still renewable)
 *
 * The 3.1b market audit graded the renewal window a policy SPLIT between two platforms and
 * escalated it as un-derivable. A second targeted research pass found it is a status NAMING
 * difference: one platform's administrator guide instructs implementers to run grace and
 * penalty "before record statuses change to Expired", and a large municipal fire
 * department's own OPERATIONAL-permit instructions describe the same ladder independently.
 * 'Expired' is the TRAPDOOR. Building it the other way round would have been the inverse of
 * the only documented behaviour — see spec §0.1.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 🔴 WHAT THIS FUNCTION REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 1. It never returns an operator-terminal status. Revoked / Denied / TerminatedByTransfer
 *    are human acts. In particular NO TIMER MAY EVER PRODUCE 'Revoked': enumerated grounds,
 *    written notice and a hearing right make it statutorily impossible, and a timer cannot
 *    find a material misrepresentation. Same doctrine as "a timer must not decide a call is
 *    over." Auto-EXPIRY is fine and is universal in the market — a term simply ends.
 * 2. It never guesses a missing term. A permit issued BEFORE the catalogue existed carries
 *    no notice/grace snapshot, so the ladder CANNOT be computed for it and this returns
 *    NO_TERMS. The caller leaves the record alone and counts it for a human to see. That is
 *    0056's doctrine (an unmappable value is surfaced, never defaulted) applied to a
 *    transition rather than a value. Prod holds four such permits today, two already past
 *    their term date — defaulting them would be inventing terms for a legal record.
 * 3. It never moves a permit BACKWARDS down the ladder. See ladderRank.
 */

const {
  isTerminalPermitStatus, PERMIT_STATUSES,
} = require('../constants/permitStatus');

/** Sentinel: the ladder cannot be computed for this permit. Not a status — never stored. */
const NO_TERMS = 'NO_TERMS';

/**
 * The ONLY statuses this job may write, and the only ones it may write FROM.
 * Anything outside these sets is a human's business and the job does not touch it.
 */
const JOB_WRITABLE_STATUSES = Object.freeze(['AboutToExpire', 'Delinquent', 'Expired']);
const JOB_MOVABLE_FROM      = Object.freeze(['Active', 'AboutToExpire', 'Delinquent']);

/**
 * Monotonic position on the ladder. The job may only move a permit FORWARD.
 *
 * Why this exists: the ladder is computed from dates, and a date can move backwards — a
 * department correcting a typo'd expiry, or (once renewal ships) a successor's dates landing
 * on the parent. Without this, a permit that has already been recorded as Expired could be
 * walked back to Active by a data edit, silently un-lapsing a legal record. Forward-only
 * means a correction is a HUMAN act with a record, not a side effect of a nightly job.
 */
const LADDER_RANK = Object.freeze({ Active: 0, AboutToExpire: 1, Delinquent: 2, Expired: 3 });

function ladderRank(status) {
  return Object.prototype.hasOwnProperty.call(LADDER_RANK, status) ? LADDER_RANK[status] : null;
}

/** Add whole days to an ISO YYYY-MM-DD, returning ISO. UTC-anchored so it cannot drift. */
function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  const dt = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Add a TERM (n days / months / years) to an ISO day.
 *
 * ⚠ MONTH AND YEAR ARITHMETIC CLAMPS TO THE END OF THE MONTH, and that is a decision, not an
 * accident: 2026-01-31 + 1 month is 2026-02-28, not 2026-03-03. Rolling over into March
 * would make a one-month permit outlive its month, and the rollover is silent — nobody
 * notices until a term lands on a 31st. JS Date does the wrong thing here by default
 * (Date.UTC(2026, 1, 31) rolls to March 3), so this is computed explicitly.
 */
function addTerm(iso, value, unit) {
  if (!ISO_DAY.test(iso) || !Number.isInteger(value)) return null;
  if (unit === 'day') return addDays(iso, value);

  const [y, m, d] = iso.split('-').map(Number);
  let year = y;
  let month = m; // 1-based
  if (unit === 'month') month += value;
  else if (unit === 'year') year += value;
  else return null;

  // Normalize an out-of-range month into year + month.
  year += Math.floor((month - 1) / 12);
  month = ((month - 1) % 12 + 12) % 12 + 1;

  // Clamp the day to the last day of the target month. Day 0 of the NEXT month is the last
  // day of this one, which handles February and leap years without a table.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const p = (n) => String(n).padStart(2, '0');
  return `${year}-${p(month)}-${p(day)}`;
}

/**
 * The LAST VALID DAY of a permit issued on `issuedDate` for a term of value/unit.
 *
 * 🔴 THE CONVENTION, stated because it is a real choice and both readings exist in the wild:
 * a permit issued 2026-01-01 for one year is in force THROUGH 2026-12-31, not through
 * 2027-01-01. The term is counted INCLUSIVE of the issue day, so the last valid day is
 * (issuedDate + term) − 1 day.
 *
 * This has to agree with computeLadderStatus, which treats expiresDate as the last day the
 * permit is in force. If the two ever disagree, a permit reads as lapsed a day early or a
 * day late — small, silent, and exactly the kind of thing a bureau would notice before we do.
 */
function computeExpiresDate(issuedDate, termValue, termUnit) {
  const end = addTerm(issuedDate, termValue, termUnit);
  return end ? addDays(end, -1) : null;
}

/**
 * Where should this permit sit on the ladder, given the day it is being evaluated for?
 *
 * @param {object} permit  needs expiresDate (ISO), notice_window_days, grace_days
 * @param {string} today   ISO YYYY-MM-DD — the day the ladder is evaluated FOR
 * @returns {string} a ladder status, or NO_TERMS when it cannot be computed
 *
 * BOUNDARIES, stated so the tests can pin them and nobody has to infer them from `<` vs `<=`:
 *   · the notice window OPENS on (expiresDate − notice_window_days) — that day is inclusive;
 *   · the term's LAST VALID DAY is expiresDate itself — a permit expiring the 1st is in
 *     force ON the 1st, which is how a permit reads to the person holding it;
 *   · grace runs from the day AFTER expiresDate through (expiresDate + grace_days) inclusive;
 *   · Expired begins the day after grace ends. With grace_days = 0 (a department running no
 *     grace at all — a legitimate setting) the permit goes straight from its last valid day
 *     to Expired, and 'Delinquent' is simply never occupied. That is correct, not a gap.
 */
function computeLadderStatus(permit, today) {
  if (!permit || typeof today !== 'string' || !ISO_DAY.test(today)) return NO_TERMS;

  const expires = permit.expiresDate ?? permit.expires_date;
  if (!expires || typeof expires !== 'string' || !ISO_DAY.test(expires)) return NO_TERMS;

  const notice = permit.notice_window_days;
  const grace  = permit.grace_days;
  // Both must be real numbers. NULL means "issued before the catalogue existed" and is
  // exactly the case we refuse to guess at. Number.isInteger rejects null, undefined,
  // NaN and the numeric strings pg hands back for some column types.
  if (!Number.isInteger(notice) || !Number.isInteger(grace)) return NO_TERMS;
  if (notice < 0 || grace < 0) return NO_TERMS;

  const noticeOpens = addDays(expires, -notice);
  const graceEnds   = addDays(expires, grace);

  // ISO YYYY-MM-DD compares correctly as a string — no Date objects, no timezone.
  if (today > graceEnds)   return 'Expired';
  if (today > expires)     return 'Delinquent';
  if (today >= noticeOpens) return 'AboutToExpire';
  return 'Active';
}

/**
 * Should the job write, and to what? Returns null when it must leave the record alone.
 *
 * Every reason to decline is explicit here rather than spread across the runner, because a
 * job that writes to a legal record needs its refusals in one readable place.
 */
function nextStatusFor(permit, today) {
  if (!permit) return null;
  const current = permit.status;

  // A human's terminal act. Revoked, Denied and TerminatedByTransfer are the end of the
  // lifecycle and a timer has no business anywhere near them.
  if (isTerminalPermitStatus(current)) return null;
  // Pending is an application, not an issued permit. Nothing expires that was never issued.
  if (!JOB_MOVABLE_FROM.includes(current)) return null;

  const target = computeLadderStatus(permit, today);
  if (target === NO_TERMS) return null;          // cannot compute — never guess
  if (target === current) return null;            // idempotent: no change, no write
  if (!JOB_WRITABLE_STATUSES.includes(target)) return null; // e.g. computed 'Active'

  // Forward-only. See LADDER_RANK.
  const from = ladderRank(current);
  const to   = ladderRank(target);
  if (from === null || to === null || to <= from) return null;

  return target;
}

// Fail loudly at load time if the ladder and the vocabulary ever disagree — a status this
// file writes that the CHECK constraint would reject is a 500 waiting for the first nightly
// run, and it would land at 2am on a table full of legal records.
for (const s of [...JOB_WRITABLE_STATUSES, ...JOB_MOVABLE_FROM]) {
  if (!PERMIT_STATUSES.includes(s)) {
    throw new Error(`permitLadder: '${s}' is not in PERMIT_STATUSES — the ladder and the ` +
                    'status vocabulary have drifted');
  }
}

module.exports = {
  NO_TERMS,
  JOB_WRITABLE_STATUSES,
  JOB_MOVABLE_FROM,
  LADDER_RANK,
  addDays,
  addTerm,
  computeExpiresDate,
  computeLadderStatus,
  nextStatusFor,
};
