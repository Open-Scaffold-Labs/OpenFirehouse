'use strict';
/**
 * utils/staffingScore.js — Qualification-weighted staffing scoring.
 *
 * Pure functions (no DB) so they're trivially unit-testable. The staffing
 * endpoint fetches member_qualifications + the position template + the filling
 * member (run-list crew or incident responder) and asks scoreSeat() for a
 * per-seat verdict.
 *
 * Cert matching is CODE-TO-CODE: required_certs (canonical codes) vs the
 * member's set of VALID held cert codes (status active AND not expired).
 *
 * Seat verdicts:
 *   qualified  — seat filled, holds all required certs, meets min_rank
 *   partial    — seat filled, but missing a required cert and/or under min_rank
 *   unverified — seat filled, but the member has NO cert records at all (can't
 *                assess — never downgrade to "short" purely from missing data)
 *   open       — seat not filled
 */

// ── Rank ladder ─────────────────────────────────────────────────────────────
// Higher = more senior. Order of checks matters (Battalion Chief contains
// "chief"; Firefighter/Paramedic contains "paramedic" but is still FF rank).
function rankOrdinal(rank) {
  const r = String(rank || '').toLowerCase();
  if (!r) return 0;
  if (/prob/.test(r)) return 1;
  if (/battalion/.test(r)) return 6;
  if (/chief/.test(r)) return 7;            // Fire Chief, Deputy Chief, Chief
  if (/captain/.test(r)) return 5;
  if (/lieutenant|lt\b/.test(r)) return 4;
  if (/engineer|driver/.test(r)) return 3;  // Driver/Engineer, Engineer
  if (/firefighter|\bff\b|emt|paramedic|medic/.test(r)) return 2;
  return 0;                                  // unknown rank
}

function rankMet(memberRank, minRank) {
  if (!minRank) return true;                 // no requirement
  const need = rankOrdinal(minRank);
  if (need === 0) return true;               // unparseable requirement → don't penalize
  return rankOrdinal(memberRank) >= need;
}

// ── Cert validity ───────────────────────────────────────────────────────────
// A qualification counts toward "qualified" only when active and not expired.
function isValidQual(row, now = new Date()) {
  if (!row) return false;
  const status = String(row.status || '').toLowerCase();
  if (status && status !== 'active') return false; // pending / expired / revoked
  if (row.expiry_date) {
    const exp = new Date(row.expiry_date);
    if (!isNaN(exp.getTime()) && exp < now) return false;
  }
  return true;
}

/**
 * buildMemberCertIndex(qualRows) -> Map<member_id, { valid:Set<code>, all:Set<code>, hasAny:boolean }>
 * `valid` = active+unexpired codes (count toward qualified); `all` = every code
 * the member has a record for (used to distinguish "missing this cert" from
 * "no data at all"); `hasAny` true if the member has ≥1 record.
 */
function buildMemberCertIndex(qualRows, now = new Date()) {
  const index = new Map();
  for (const row of qualRows || []) {
    const id = row.member_id;
    if (!index.has(id)) index.set(id, { valid: new Set(), all: new Set(), hasAny: false });
    const entry = index.get(id);
    entry.hasAny = true;
    if (row.cert_type) {
      entry.all.add(row.cert_type);
      if (isValidQual(row, now)) entry.valid.add(row.cert_type);
    }
  }
  return index;
}

/**
 * scoreSeat({ requiredCerts, minRank, member }) -> {
 *   qualification, filled, rankMet, missingCerts, heldCerts
 * }
 * `member` is null for an unfilled seat, else { rank, certs:{valid:Set,hasAny:bool} }.
 */
function scoreSeat({ requiredCerts = [], minRank = '', member = null } = {}) {
  const required = Array.isArray(requiredCerts) ? requiredCerts : [];
  if (!member) {
    return { qualification: 'open', filled: false, rankMet: false, missingCerts: required, heldCerts: [] };
  }

  const valid = member.certs && member.certs.valid ? member.certs.valid : new Set();
  const hasAny = !!(member.certs && member.certs.hasAny);
  const heldCerts = required.filter((c) => valid.has(c));
  const missingCerts = required.filter((c) => !valid.has(c));
  const meetsRank = rankMet(member.rank, minRank);

  // Qualification is CERT-based ONLY. Rank shortfall is NOT a deficiency — an
  // under-ranked member in an officer seat is "acting up" (A/C / A/L), which is
  // a normal manpower arrangement surfaced via actingInfo(), not penalized here.
  let qualification;
  if (!hasAny) qualification = 'unverified';   // filled but no cert data to assess
  else if (missingCerts.length === 0) qualification = 'qualified';
  else qualification = 'partial';

  return { qualification, filled: true, rankMet: meetsRank, missingCerts, heldCerts };
}

// ── Acting-officer titles ────────────────────────────────────────────────────
// A firefighter (or anyone below the seat's officer rank) filling an officer
// seat is ACTING UP and must be labeled A/C / A/L / A/BC — never "FF". The
// acting level follows the seat's min_rank (the department sets it).
const ACTING_ABBR = { 7: 'A/Chief', 6: 'A/BC', 5: 'A/C', 4: 'A/L' };

function isOfficerSeat(minRank, positionName) {
  if (rankOrdinal(minRank) >= 4) return true;
  return /officer|captain|lieutenant|battalion|\bchief\b/i.test(positionName || '');
}

/**
 * actingInfo(memberRank, minRank, positionName) -> { acting, isOfficerSeat, displayRank }
 * displayRank is what the board/run-list should show for the person in this seat:
 *  - non-officer seat → the member's real rank (unchanged)
 *  - officer seat, member at/above the seat rank → their real rank (Captain/Lieutenant…)
 *  - officer seat, member acting up → the acting abbreviation (A/C / A/L / A/BC)
 */
function actingInfo(memberRank, minRank, positionName) {
  const officer = isOfficerSeat(minRank, positionName);
  if (!memberRank) return { acting: false, isOfficerSeat: officer, displayRank: memberRank || '' };
  if (!officer) return { acting: false, isOfficerSeat: false, displayRank: memberRank };
  const seatOrd = rankOrdinal(minRank);
  const threshold = seatOrd > 0 ? seatOrd : 4; // default officer threshold = Lieutenant
  if (rankOrdinal(memberRank) >= threshold) {
    return { acting: false, isOfficerSeat: true, displayRank: memberRank };
  }
  return { acting: true, isOfficerSeat: true, displayRank: ACTING_ABBR[threshold] || 'A/O' };
}

/**
 * apparatusVerdict(seatResults) -> 'staffed' | 'short' | 'unstaffed'
 * staffed   — every seat filled AND none are 'open'
 * unstaffed — no seat filled
 * short     — partially filled (some open seats)
 * Verdict is about COVERAGE (advisory); qualification quality is surfaced
 * per-seat, not folded into staffed/short (a filled-but-partial rig is still
 * "staffed" with a flagged seat — the officer decides).
 */
function apparatusVerdict(seatResults) {
  const seats = seatResults || [];
  if (seats.length === 0) return 'unstaffed';
  const filled = seats.filter((s) => s.filled).length;
  if (filled === 0) return 'unstaffed';
  if (filled < seats.length) return 'short';
  return 'staffed';
}

module.exports = {
  rankOrdinal,
  rankMet,
  isValidQual,
  buildMemberCertIndex,
  scoreSeat,
  apparatusVerdict,
  isOfficerSeat,
  actingInfo,
};
