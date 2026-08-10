'use strict';
/**
 * utils/shiftPatternEngine.js — Phase 1.1b calendar core (PURE, no DB).
 *
 * The rotation math for the fire scheduling market, extracted from db.js's
 * expandPatterns so it can be unit-tested in isolation and shared by every
 * caller. expandPatterns now CALLS isOnDutyForDate — there is ONE copy of the
 * cycle math, never two that can drift.
 *
 * ── The two representations, and why there are two ──────────────────────────
 *
 * A rotation is either:
 *   (a) a SIMPLE on/off ratio — cycle_on days on, cycle_off days off — which
 *       covers 24/48, 48/96, 24/72, 4-on-4-off, and (with kelly_day_interval)
 *       the Kelly-day skip. Two integers. This is what shipped before 1.1b.
 *   (b) an ARBITRARY day-state cycle — cycle_pattern, a JSON array of 1/0 —
 *       which covers the patterns two integers CANNOT express: 2-2-3 / Pitman,
 *       DuPont, and any custom sequence a department authors itself.
 *
 * cycle_pattern WINS when present (length > 0); otherwise the simple ratio path
 * runs, so every pattern that worked before 1.1b keeps working byte-for-byte.
 *
 * ── Day-boundary doctrine (Matt, 2026-07-22, LOCKED) ────────────────────────
 * A shift belongs to its START date. 0800 Jul-23 → 0800 Jul-24 IS "July 23."
 * All date math here runs on YYYY-MM-DD STRING primitives (utils/localDate) so
 * a local-midnight Date can never be shifted a day by toISOString() in a
 * timezone behind UTC (the 1.1a off-by-one, killed and kept dead).
 */

const { addDaysISO, daysBetweenISO, isoDayOfWeek, coerceIsoDay } = require('./localDate');

/**
 * Named fire-service rotation presets. Each is a SENSIBLE STANDARD default a
 * department can then customize (self-serve authoring — the challenger bar).
 * Simple ratios stay as cycle_on/cycle_off (cheapest to reason about); the
 * patterns that need an arbitrary sequence carry an explicit cycle_pattern.
 *
 * cycle_pattern is written from the perspective of ONE crew/platoon: 1 = that
 * crew is on duty that day of the cycle, 0 = off. anchorOffset lets sibling
 * platoons (A/B/C) share the same pattern shifted by a fixed number of days.
 */
const PATTERN_PRESETS = {
  '24_48':            { label: '24/48',        repeatRule: 'platoon', cycle_on: 1, cycle_off: 2, cycle_pattern: [] },
  '48_96':            { label: '48/96',        repeatRule: 'platoon', cycle_on: 2, cycle_off: 4, cycle_pattern: [] },
  '24_72':            { label: '24/72',        repeatRule: 'platoon', cycle_on: 1, cycle_off: 3, cycle_pattern: [] },
  'four_on_four_off': { label: '4 on / 4 off', repeatRule: 'platoon', cycle_on: 4, cycle_off: 4, cycle_pattern: [] },
  // Kelly (classic 3-platoon 24h): on-off-on-off-on, then 4 days off = 9-day cycle.
  'kelly':            { label: 'Kelly (9-day)', repeatRule: 'cycle', cycle_on: 0, cycle_off: 0,
                        cycle_pattern: [1, 0, 1, 0, 1, 0, 0, 0, 0] },
  // Pitman / 2-2-3 (12h): 2 on, 2 off, 3 on, 2 off, 2 on, 3 off = 14-day cycle.
  'pitman_223':       { label: '2-2-3 (Pitman)', repeatRule: 'cycle', cycle_on: 0, cycle_off: 0,
                        cycle_pattern: [1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0] },
  // DuPont (12h, 4-week): 4 nights, 3 off, 3 days, 1 off, 3 nights, 3 off, 4 days, 7 off.
  // Collapsed to a working/not-working day-state (the app tracks the tour date,
  // not day-vs-night here) = 28-day cycle.
  'dupont':           { label: 'DuPont (28-day)', repeatRule: 'cycle', cycle_on: 0, cycle_off: 0,
                        cycle_pattern: [1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0] },
};

/** True when the label is a known preset key. */
function isPreset(key) {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(PATTERN_PRESETS, key);
}

/**
 * Normalize a stored pattern row into the canonical config the engine reads.
 * A preset_key fills in the cycle shape ONLY where the row didn't override it,
 * so a department can start from "24/48" and then hand-edit the cycle.
 * Pure; never touches the DB.
 */
function resolvePatternConfig(pattern) {
  const p = pattern || {};
  const preset = isPreset(p.preset_key) ? PATTERN_PRESETS[p.preset_key] : null;

  // cycle_pattern may arrive as an array (already deserialized) or a JSON string.
  let cyclePattern = p.cycle_pattern;
  if (typeof cyclePattern === 'string') {
    try { cyclePattern = JSON.parse(cyclePattern || '[]'); } catch { cyclePattern = []; }
  }
  if (!Array.isArray(cyclePattern)) cyclePattern = [];
  // Only 0/1 day-states are meaningful; coerce defensively.
  cyclePattern = cyclePattern.map((v) => (v ? 1 : 0));

  // A row with no explicit cycle_pattern inherits the preset's, if any.
  if (cyclePattern.length === 0 && preset && Array.isArray(preset.cycle_pattern) && preset.cycle_pattern.length) {
    cyclePattern = preset.cycle_pattern.slice();
  }

  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const cycleOn  = num(p.cycle_on,  preset ? preset.cycle_on  : 0);
  const cycleOff = num(p.cycle_off, preset ? preset.cycle_off : 0);

  return {
    repeatRule:   p.repeatRule || (preset ? preset.repeatRule : 'weekly'),
    repeatDays:   Array.isArray(p.repeatDays) ? p.repeatDays : [],
    cyclePattern,
    cycleOn,
    cycleOff,
    kellyInterval: num(p.kelly_day_interval, 0),
    anchor:       coerceIsoDay(p.anchor_date) || coerceIsoDay(p.startDate) || null,
    startDate:    coerceIsoDay(p.startDate) || null,
  };
}

/**
 * isOnDutyForDate(pattern, isoDate) -> boolean
 *
 * The single source of truth for "does this pattern put a crew on duty on this
 * calendar date?" Pure. isoDate is a YYYY-MM-DD string (the shift's START date).
 */
function isOnDutyForDate(pattern, isoDate) {
  const cfg = resolvePatternConfig(pattern);
  const date = coerceIsoDay(isoDate);
  if (!date) return false;

  // (b) Generalized arbitrary cycle — WINS when present.
  if (cfg.cyclePattern.length > 0) {
    const anchor = cfg.anchor || date;
    const len = cfg.cyclePattern.length;
    const since = daysBetweenISO(anchor, date);
    const idx = ((since % len) + len) % len; // negatives handled
    return cfg.cyclePattern[idx] === 1;
  }

  // (a) Simple on/off ratio (+ Kelly-day skip) — the pre-1.1b path, unchanged.
  if ((cfg.repeatRule === 'platoon' || cfg.repeatRule === 'cycle') && cfg.cycleOn > 0 && cfg.cycleOff > 0) {
    const anchor = cfg.anchor || date;
    const since = daysBetweenISO(anchor, date);
    const cycleLength = cfg.cycleOn + cfg.cycleOff;
    const dayInCycle = ((since % cycleLength) + cycleLength) % cycleLength;
    const isOnDuty = dayInCycle < cfg.cycleOn;
    if (isOnDuty && cfg.kellyInterval > 0) {
      // Count on-duty days since anchor; skip every Nth (the Kelly day).
      let onDutyCount = 0;
      for (let dd = 0; dd <= since; dd++) {
        const dc = ((dd % cycleLength) + cycleLength) % cycleLength;
        if (dc < cfg.cycleOn) onDutyCount++;
      }
      return (onDutyCount % cfg.kellyInterval) !== 0;
    }
    return isOnDuty;
  }

  // Calendar rules.
  if (cfg.repeatRule === 'daily') return true;
  if (cfg.repeatRule === 'weekly' || cfg.repeatRule === 'biweekly') {
    const dow = isoDayOfWeek(date);
    let on = cfg.repeatDays.includes(dow);
    if (cfg.repeatRule === 'biweekly' && on) {
      const startDay = cfg.startDate || date;
      const weekDiff = Math.floor(daysBetweenISO(startDay, date) / 7);
      on = on && (weekDiff % 2 === 0);
    }
    return on;
  }

  return false;
}

/**
 * detectConflicts(candidateShifts, existingShifts) -> [{ date, shiftType, kind, withPatternId }]
 *
 * The market's "conflict-check on apply": rather than silently skipping or
 * overwriting, REPORT every date+shiftType a candidate shift would collide with.
 * Three collision kinds, all keyed on (date, shiftType):
 *   - 'override'      : a manual override already owns this slot.
 *   - 'other_pattern' : an EXISTING shift from a DIFFERENT pattern owns it.
 *   - 'double_apply'  : TWO candidates in THIS apply run (different patterns)
 *                       both claim the slot — the double-award class, caught
 *                       before it is written, not after.
 * A same-pattern re-generation is NOT a conflict (idempotent apply).
 *
 * Pure; the caller decides whether to skip, warn, or (never, by default)
 * overwrite. The engine never resolves a conflict on its own.
 */
function detectConflicts(candidateShifts, existingShifts) {
  const conflicts = [];
  const existing = Array.isArray(existingShifts) ? existingShifts : [];
  const candidates = Array.isArray(candidateShifts) ? candidateShifts : [];
  const key = (s) => `${s.date} ${s.shiftType}`;

  // Candidate vs existing.
  for (const c of candidates) {
    for (const e of existing) {
      if (e.date !== c.date || e.shiftType !== c.shiftType) continue;
      if (e.isOverride) {
        conflicts.push({ date: c.date, shiftType: c.shiftType, kind: 'override', withPatternId: e.patternId || null });
      } else if (e.patternId && c.patternId && String(e.patternId) !== String(c.patternId)) {
        conflicts.push({ date: c.date, shiftType: c.shiftType, kind: 'other_pattern', withPatternId: e.patternId });
      }
    }
  }

  // Candidate vs candidate — two different patterns claiming one slot in this run.
  const seen = new Map(); // slot -> first patternId
  for (const c of candidates) {
    const k = key(c);
    if (seen.has(k)) {
      const firstPid = seen.get(k);
      if (String(firstPid) !== String(c.patternId)) {
        conflicts.push({ date: c.date, shiftType: c.shiftType, kind: 'double_apply', withPatternId: firstPid });
      }
    } else {
      seen.set(k, c.patternId != null ? c.patternId : null);
    }
  }

  return conflicts;
}

module.exports = {
  PATTERN_PRESETS,
  isPreset,
  resolvePatternConfig,
  isOnDutyForDate,
  detectConflicts,
};
