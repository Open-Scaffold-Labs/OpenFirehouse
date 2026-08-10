'use strict';
/**
 * utils/leaveSchedule.js — PURE schedule↔leave helpers (no DB, fully unit-testable).
 *
 * Two jobs, both built on the fact that OF already stores who is riding:
 *   1. crew membership BY MEMBER ID (rename-proof) for the min-staffing impact (1.2c) —
 *      the old path matched a name STRING, which silently missed a renamed member and
 *      could false-match two people with similar names. `shifts.memberIds` (a JSON id
 *      array, migration-era) is the robust key; the name array (`crew`) is the fallback
 *      for legacy shifts whose memberIds isn't populated yet.
 *   2. deriving the HOURS a leave draws from the member's actually-scheduled tours in the
 *      window — never a guessed flat per-day number (the 1.2 exit-criteria gate). A tour
 *      the member is on is charged as a WHOLE tour (the conservative market behavior; OF
 *      has no partial-day leave model, so there is nothing to prorate DOWN).
 *
 * The market bar (2026-07-25 pass, competitors generic): leading fire/EMS scheduling
 * platforms auto-deduct a request from the member's scheduled hours and surface
 * future/projected adjustments — these helpers implement that against OF's own stores.
 */

// Known shift-type → tour length in hours. Mirrors client/src/data/schedule.js SHIFT_TIMES
// (Day 0600–1800, Night 1800–0600, 24-Hour/Duty Officer = full day). Matched
// case-insensitively on a trimmed label. Unknown labels return null — we do NOT guess a
// number for a tour we don't recognize; the caller surfaces it for review / lets the
// member enter it. This is a fallback ONLY: apparatus_assignments carries real hours.
const SHIFT_TYPE_HOURS = {
  'day': 12,
  'night': 12,
  '24-hour': 24,
  '24 hour': 24,
  '24hr': 24,
  'duty officer': 24,
  'full day': 24,
};

/**
 * Hours for one scheduled tour. Prefers explicit start/end times, then explicit hours,
 * then the shift-type map. Returns { hours:(number|null), source, needsReview:boolean }.
 * A tour we can't quantify is needsReview (null hours) — never a fabricated default.
 * @param {object} tour { shiftType?, hours?, start_time?, end_time?, startTime?, endTime? }
 */
function tourHours(tour) {
  if (!tour) return { hours: null, source: 'none', needsReview: true };
  // 1) explicit numeric hours (apparatus_assignments.hours)
  const h = tour.hours != null ? Number(tour.hours) : null;
  if (h != null && Number.isFinite(h) && h > 0) return { hours: h, source: 'hours', needsReview: false };
  // 2) start/end clock times → duration (handles a tour that spans midnight)
  const st = tour.start_time ?? tour.startTime;
  const en = tour.end_time ?? tour.endTime;
  const dur = clockDurationHours(st, en);
  if (dur != null) return { hours: dur, source: 'clock', needsReview: false };
  // 3) shift-type label map
  const label = String(tour.shiftType ?? tour.shift_type ?? '').trim().toLowerCase();
  if (label && SHIFT_TYPE_HOURS[label] != null) return { hours: SHIFT_TYPE_HOURS[label], source: 'shiftType', needsReview: false };
  return { hours: null, source: 'unknown', needsReview: true };
}

/**
 * Duration in hours between two "HH:MM" clock strings, wrapping past midnight (18:00→06:00
 * = 12h; 08:00→08:00 = 24h, a full-day tour). Returns null if either is unparseable.
 */
function clockDurationHours(start, end) {
  const p = (s) => {
    if (typeof s !== 'string') return null;
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const hh = Number(m[1]), mm = Number(m[2]);
    if (hh > 23 || mm > 59) return null;
    return hh * 60 + mm;
  };
  const a = p(start), b = p(end);
  if (a == null || b == null) return null;
  let diff = b - a;
  if (diff <= 0) diff += 24 * 60;              // wrap midnight; equal → full 24h tour
  return Math.round((diff / 60) * 100) / 100;
}

/**
 * Is this member riding this shift? Matches BY ID (rename-proof; the authoritative memberIds
 * array from the 1.1b consolidation) OR BY NAME (the derived/legacy crew). It is deliberately
 * a UNION, not id-exclusive: this feeds a min-staffing SAFETY warning, where a false NEGATIVE
 * (failing to flag a member who really is on the shift) is the dangerous direction and a
 * false positive (an extra coverage warning) is safe. So it never misses anyone the old
 * name-only path caught, and additionally catches a renamed member by id. Coerces ids on
 * both sides (pg BIGINT is a string).
 * @param {object} shift { memberIds?:Array, crew?:Array<string> }
 */
function memberOnShift(shift, memberId, memberName) {
  if (!shift) return false;
  const ids = Array.isArray(shift.memberIds) ? shift.memberIds : [];
  const idMatch = memberId != null && ids.some((x) => String(x) === String(memberId));
  const crew = Array.isArray(shift.crew) ? shift.crew : [];
  const nameMatch = memberName != null && crew.includes(memberName);
  return idMatch || nameMatch;
}

/**
 * The crew COUNT after this member is removed. Names are the roster of record for counting;
 * but if the member matched BY ID and their name isn't in `crew` (a rename), we still
 * decrement by one so the count reflects the real removal instead of missing it.
 * @returns {number} crew size after removal (>= 0)
 */
function crewCountAfterRemoval(shift, memberId, memberName) {
  const crew = Array.isArray(shift && shift.crew) ? shift.crew : [];
  const byName = crew.filter((n) => n !== memberName);
  if (byName.length < crew.length) return byName.length;         // name matched → normal case
  // Name didn't match but the id did (rename) → count them off anyway.
  return memberOnShift(shift, memberId, memberName) ? Math.max(0, crew.length - 1) : crew.length;
}

/**
 * The crew arrays after removing this member — remove the name from `crew` AND the id from
 * `memberIds`, so the two stores stay consistent and a renamed member is cleaned from ids.
 * @returns {{ crew:Array<string>, memberIds:Array }}
 */
function removeMemberFromShift(shift, memberId, memberName) {
  const crew = Array.isArray(shift && shift.crew) ? shift.crew : [];
  const ids = Array.isArray(shift && shift.memberIds) ? shift.memberIds : [];
  return {
    crew: crew.filter((n) => n !== memberName),
    memberIds: ids.filter((x) => String(x) !== String(memberId)),
  };
}

module.exports = {
  SHIFT_TYPE_HOURS, tourHours, clockDurationHours,
  memberOnShift, crewCountAfterRemoval, removeMemberFromShift,
};
