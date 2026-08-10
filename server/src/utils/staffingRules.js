'use strict';
/**
 * utils/staffingRules.js — PURE min-staffing rule evaluation (no DB, fully unit-testable).
 * Phase 1.4 (migration 0080). Spec: docs/PHASE1-VACANCY-SPEC-2026-07-25.md §3.
 *
 * Market parity (2026-07-25 pass, competitors generic): minimums are LAYERED rules at
 * three grains — per-shift headcount, per-rank/cert counts, per-apparatus seats — each
 * optionally scoped to a shift type, a clock window (may span midnight), days of week,
 * and an effective date range (temporary event rules). Staffing state is a pure function
 * of the schedule + riding board, recomputed on every mutation and on view — never a
 * cron, never telemetry.
 *
 * Doctrine: this module ADVISES. It never writes anything, never flips a status, and its
 * verdicts feed a warn-first posture (block only gates employee self-service under the
 * 0075 per-dept 'block' mode — command is never hard-blocked; that is the market ceiling).
 */

// Known shift-type → clock interval in minutes-from-midnight [start, end), end may wrap.
// Mirrors utils/leaveSchedule.SHIFT_TYPE_HOURS / client SHIFT_TIMES (Day 0600–1800,
// Night 1800–0600, 24-Hour / Duty Officer = full day). Unknown labels = full day
// (conservative: the rule applies — a false coverage warning is the safe direction).
const SHIFT_CLOCK = {
  'day':          [360, 1080],
  'night':        [1080, 1440 + 360],
  '24-hour':      [0, 1440],
  '24 hour':      [0, 1440],
  '24hr':         [0, 1440],
  'duty officer': [0, 1440],
  'full day':     [0, 1440],
};

// Canonical-ish rank normalization for rank_count matching. Exact normalized equality
// (never substring — 'battalion chief' must not match a 'chief' target and vice versa).
const RANK_ALIASES = {
  'ff': 'firefighter', 'probationary ff': 'probationary firefighter',
  'lt': 'lieutenant', 'capt': 'captain', 'bc': 'battalion chief',
  'driver': 'driver/engineer', 'engineer': 'driver/engineer',
};
function normalizeRank(label) {
  const s = String(label || '').trim().toLowerCase();
  return RANK_ALIASES[s] || s;
}

function toMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

// Split a possibly-midnight-wrapping [start, end) interval into linear segments on [0, 1440).
function segments(start, end) {
  if (start == null || end == null) return [[0, 1440]];
  if (end <= start) end += 1440;                       // wrap (18:00→06:00); equal = full day
  if (end <= 1440) return [[start, end]];
  return [[start, 1440], [0, end - 1440]];
}

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  for (const [as, ae] of segments(aStart, aEnd)) {
    for (const [bs, be] of segments(bStart, bEnd)) {
      if (Math.min(ae, be) - Math.max(as, bs) > 0) return true;
    }
  }
  return false;
}

// Day-of-week for a 'YYYY-MM-DD' local-day string (0=Sun). UTC-parse of the plain date is
// deterministic regardless of server tz — the string IS the local day (local-day doctrine).
function dayOfWeek(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.getUTCDay();
}

/** Does this rule apply on this date? (active + effective window + days_of_week) */
function ruleAppliesOnDate(rule, dateStr) {
  if (!rule || rule.active === false) return false;
  const day = String(dateStr).slice(0, 10);
  const from = rule.effective_from ? String(rule.effective_from).slice(0, 10) : null;
  const to   = rule.effective_to   ? String(rule.effective_to).slice(0, 10)   : null;
  if (from && day < from) return false;
  if (to && day > to) return false;
  if (rule.days_of_week) {
    let days = rule.days_of_week;
    if (typeof days === 'string') { try { days = JSON.parse(days); } catch (_) { days = null; } }
    if (Array.isArray(days) && days.length) {
      const dow = dayOfWeek(day);
      if (dow == null || !days.map(Number).includes(dow)) return false;
    }
  }
  return true;
}

/** Does this rule's shift-type / clock-window scope cover this shift? */
function ruleCoversShift(rule, shift) {
  if (rule.shift_type &&
      String(rule.shift_type).trim().toLowerCase() !== String(shift.shiftType || '').trim().toLowerCase()) {
    return false;
  }
  const rs = toMinutes(rule.time_start), re = toMinutes(rule.time_end);
  if (rs == null && re == null) return true;           // no window → whole day
  const clock = SHIFT_CLOCK[String(shift.shiftType || '').trim().toLowerCase()] || [0, 1440];
  return intervalsOverlap(clock[0], clock[1], rs ?? 0, re ?? rs ?? 1440);
}

/** Crew headcount for a shift. Names are the roster of record; ids are the fallback. */
function shiftHeadcount(shift) {
  const crew = Array.isArray(shift.crew) ? shift.crew.length : 0;
  const ids  = Array.isArray(shift.memberIds) ? shift.memberIds.length : 0;
  return crew || ids;
}

/** Resolve the member objects riding a shift (id-first, name fallback; String-coerced). */
function shiftMembers(shift, membersById = {}, membersByName = {}) {
  const seen = new Set();
  const out = [];
  for (const id of (Array.isArray(shift.memberIds) ? shift.memberIds : [])) {
    const m = membersById[String(id)];
    if (m && !seen.has(String(m.id))) { seen.add(String(m.id)); out.push(m); }
  }
  for (const name of (Array.isArray(shift.crew) ? shift.crew : [])) {
    const m = membersByName[typeof name === 'string' ? name.trim() : ''];
    if (m && !seen.has(String(m.id))) { seen.add(String(m.id)); out.push(m); }
  }
  return out;
}

/**
 * Evaluate every applicable rule for one date. PURE — callers fetch, this computes.
 *
 * @param {object} args
 *   date               'YYYY-MM-DD'
 *   rules              min_staffing_rules rows (any department scoping done by caller)
 *   minCrewFallback    departments.min_staffing_per_shift || 3 (the 0075 umbrella)
 *   shifts             shifts rows for the date ({ id, date, shiftType, crew, memberIds })
 *   membersById        { [String(id)]: { id, name, rank } }
 *   membersByName      { [name]: member }
 *   activeCertsByMemberId  { [String(memberId)]: Set|Array of canonical cert codes }
 *   boardRows          apparatus_assignments rows for the date ({ apparatus_id, member_id })
 *
 * @returns {{ date, verdicts: Array, rollup: 'ok'|'short'|'critical'|'no_schedule' }}
 * Verdict: { ruleId, name, ruleType, target, shiftId, shiftType, required, actual,
 *            short, ok, critical, implicit }
 */
function evaluateStaffing({
  date, rules = [], minCrewFallback = 3, shifts = [],
  membersById = {}, membersByName = {}, activeCertsByMemberId = {}, boardRows = [],
} = {}) {
  const applicable = rules.filter((r) => ruleAppliesOnDate(r, date));
  const verdicts = [];

  const perShiftRules = applicable.filter((r) =>
    ['shift_count', 'rank_count', 'cert_count'].includes(r.rule_type));
  // 0075 umbrella: when no explicit shift_count rule applies, the per-dept number (or the
  // historic default) evaluates as an implicit rule — unconfigured depts behave as today.
  if (!applicable.some((r) => r.rule_type === 'shift_count') && minCrewFallback > 0) {
    perShiftRules.push({
      id: null, name: 'Department minimum', rule_type: 'shift_count',
      target: null, min_count: minCrewFallback, implicit: true,
    });
  }

  for (const shift of shifts) {
    for (const rule of perShiftRules) {
      if (!rule.implicit && !ruleCoversShift(rule, shift)) continue;
      let actual;
      if (rule.rule_type === 'shift_count') {
        actual = shiftHeadcount(shift);
      } else {
        const riding = shiftMembers(shift, membersById, membersByName);
        if (rule.rule_type === 'rank_count') {
          const want = normalizeRank(rule.target);
          actual = riding.filter((m) => normalizeRank(m.rank) === want).length;
        } else {
          const want = String(rule.target || '').trim();
          actual = riding.filter((m) => {
            const certs = activeCertsByMemberId[String(m.id)];
            const arr = certs instanceof Set ? [...certs] : (Array.isArray(certs) ? certs : []);
            return arr.includes(want);
          }).length;
        }
      }
      const required = rule.min_count;
      const short = Math.max(0, required - actual);
      verdicts.push({
        ruleId: rule.id ?? null, name: rule.name, ruleType: rule.rule_type,
        target: rule.target ?? null, shiftId: shift.id ?? null,
        shiftType: shift.shiftType ?? null, required, actual, short,
        ok: short === 0, critical: short > 0 && actual === 0,
        implicit: !!rule.implicit,
      });
    }
  }

  // Apparatus-seat rules ride the riding board, independent of the shifts store.
  for (const rule of applicable.filter((r) => r.rule_type === 'apparatus_seats')) {
    const rigId = String(rule.target ?? '');
    const crew = new Set(
      boardRows
        .filter((b) => b.member_id != null && String(b.apparatus_id ?? '') === rigId)
        .map((b) => String(b.member_id))
    );
    const required = rule.min_count;
    const actual = crew.size;
    const short = Math.max(0, required - actual);
    verdicts.push({
      ruleId: rule.id, name: rule.name, ruleType: rule.rule_type, target: rule.target,
      shiftId: null, shiftType: null, required, actual, short,
      ok: short === 0, critical: short > 0 && actual === 0, implicit: false,
    });
  }

  let rollup = 'ok';
  if (!shifts.length && !verdicts.length) rollup = 'no_schedule';
  else if (verdicts.some((v) => v.critical)) rollup = 'critical';
  else if (verdicts.some((v) => !v.ok)) rollup = 'short';
  return { date: String(date).slice(0, 10), verdicts, rollup };
}

module.exports = {
  SHIFT_CLOCK, normalizeRank, toMinutes, segments, intervalsOverlap, dayOfWeek,
  ruleAppliesOnDate, ruleCoversShift, shiftHeadcount, shiftMembers, evaluateStaffing,
};
