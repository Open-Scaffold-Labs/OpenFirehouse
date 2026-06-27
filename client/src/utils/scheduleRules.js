/**
 * scheduleRules.js — Scheduling rules engine for OpenFirehouse
 *
 * Provides conflict detection, minimum crew validation,
 * double-booking checks, and scheduling warnings.
 *
 * Hard-block mode: when stationConfig.min_staffing_block is true,
 * minimum crew violations become errors (blocking) instead of warnings.
 */

import { MIN_CREW, SHIFT_TIMES } from '../data/schedule';

// ── Shift time overlap detection ─────────────────────────────────────────────

/**
 * Check if two shift types have overlapping time ranges.
 * Night (18:00–06:00) overlaps with 24-Hour (08:00–08:00) and Duty Officer (00:00–23:59).
 */
function shiftsOverlap(typeA, typeB) {
  if (typeA === typeB) return true;

  const a = SHIFT_TIMES[typeA];
  const b = SHIFT_TIMES[typeB];
  if (!a || !b) return false;

  // Duty Officer and 24-Hour overlap with everything
  if (typeA === 'Duty Officer' || typeB === 'Duty Officer') return true;
  if (typeA === '24-Hour' || typeB === '24-Hour') return true;

  // Day (06:00–18:00) and Night (18:00–06:00) don't overlap
  if ((typeA === 'Day' && typeB === 'Night') || (typeA === 'Night' && typeB === 'Day')) return false;

  return true; // conservative default
}

// ── Validation Rules ─────────────────────────────────────────────────────────

/**
 * Validate a shift against all scheduling rules.
 *
 * @param {Object} shift - The shift being created/edited { date, shiftType, crew }
 * @param {Array}  allShifts - All existing shifts (from the API)
 * @param {Array}  leaveRequests - Approved leave requests
 * @param {Array}  members - All members list
 * @param {Object} [stationConfig] - Optional station config { min_staffing_block, minCrew }
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateShift(shift, allShifts = [], leaveRequests = [], members = [], stationConfig = null) {
  const errors = [];
  const warnings = [];

  if (!shift.date || !shift.shiftType) {
    errors.push('Date and shift type are required');
    return { errors, warnings };
  }

  const sameDayShifts = allShifts.filter(
    s => s.date === shift.date && s.id !== shift.id
  );

  // ── Rule 1: Duplicate shift type on same day ───────────────────────────
  const duplicateType = sameDayShifts.find(s => s.shiftType === shift.shiftType);
  if (duplicateType) {
    warnings.push(`A ${shift.shiftType} shift already exists on ${shift.date}. This will create a duplicate.`);
  }

  // ── Rule 2: Minimum crew check ─────────────────────────────────────────
  // When stationConfig.min_staffing_block is true, understaffed shifts are
  // blocked (error) rather than warned — career departments can't go below
  // minimum manning per FLSA/ISO requirements.
  const effectiveMin = stationConfig?.minCrew || MIN_CREW;
  const hardBlock = stationConfig?.min_staffing_block === true;

  if (shift.crew.length < effectiveMin) {
    const msg = shift.crew.length === 0
      ? `No crew assigned. Minimum crew requirement is ${effectiveMin}.`
      : `Only ${shift.crew.length} crew member${shift.crew.length === 1 ? '' : 's'} assigned. Minimum is ${effectiveMin}.`;

    if (hardBlock) {
      errors.push(msg + ' (Hard-block: shift cannot be saved below minimum staffing.)');
    } else {
      warnings.push(msg);
    }
  }

  // ── Rule 3: Double-booking — member on overlapping shift same day ──────
  const crewSet = new Set(shift.crew);
  for (const existing of sameDayShifts) {
    if (!shiftsOverlap(shift.shiftType, existing.shiftType)) continue;
    for (const name of existing.crew) {
      if (crewSet.has(name)) {
        warnings.push(`${name} is already on the ${existing.shiftType} shift this day.`);
      }
    }
  }

  // ── Rule 4: Member on approved leave ───────────────────────────────────
  const approvedLeave = leaveRequests.filter(
    l => l.status === 'Approved' && l.startDate <= shift.date && l.endDate >= shift.date
  );
  for (const name of shift.crew) {
    const onLeave = approvedLeave.find(l => l.memberName === name);
    if (onLeave) {
      errors.push(`${name} is on approved ${onLeave.type} leave on ${shift.date}.`);
    }
  }

  // ── Rule 5: Officer requirement ────────────────────────────────────────
  if (shift.shiftType !== 'Duty Officer' && shift.crew.length > 0) {
    // Check if at least one crew member is an officer
    const officerRanks = ['Chief', 'Assistant Chief', 'Captain', 'Lieutenant'];
    const hasOfficer = shift.crew.some(name => {
      const member = members.find(m => m.name === name);
      return member && officerRanks.includes(member.rank);
    });
    if (!hasOfficer) {
      warnings.push('No officer assigned to this shift. Consider adding someone with officer rank.');
    }
  }

  // ── Rule 6: Consecutive shift warning ──────────────────────────────────
  // Check if any crew member is on an adjacent day shift (fatigue risk)
  const prevDate = adjacentDate(shift.date, -1);
  const nextDate = adjacentDate(shift.date, 1);
  const adjacentShifts = allShifts.filter(
    s => (s.date === prevDate || s.date === nextDate) && s.id !== shift.id
  );
  for (const name of shift.crew) {
    const consecutive = adjacentShifts.filter(s => s.crew.includes(name));
    if (consecutive.length >= 2) {
      warnings.push(`${name} is scheduled for 3+ consecutive days. Watch for fatigue.`);
    }
  }

  return { errors, warnings };
}

/**
 * Validate a leave request against existing shifts.
 * Checks if the member is scheduled during the requested leave period.
 */
export function validateLeaveRequest(request, allShifts = []) {
  const warnings = [];

  const affectedShifts = allShifts.filter(
    s => s.date >= request.startDate && s.date <= request.endDate &&
         s.crew.includes(request.memberName)
  );

  if (affectedShifts.length > 0) {
    warnings.push(
      `${request.memberName} is scheduled for ${affectedShifts.length} shift${affectedShifts.length === 1 ? '' : 's'} during this period. ` +
      `Coverage will need to be arranged.`
    );
  }

  return { warnings };
}

/**
 * Calculate coverage analysis for a date range.
 *
 * @param {Array} shifts - Shifts in the range
 * @param {Array} leaveRequests - Approved leave in the range
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {{ dates: Object[], summary: Object }}
 */
export function analyzeCoverage(shifts, leaveRequests, startDate, endDate, stationConfig = null) {
  const dates = [];
  let cur = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  let totalGood = 0, totalOk = 0, totalLow = 0, totalNone = 0;

  while (cur <= end) {
    const dateStr = cur.toISOString().slice(0, 10);
    const dayShifts = shifts.filter(s => s.date === dateStr);
    const dayLeave = leaveRequests.filter(
      l => l.startDate <= dateStr && l.endDate >= dateStr
    );

    const totalCrew = dayShifts.reduce((sum, s) => sum + s.crew.length, 0);
    const onLeave = dayLeave.length;
    const minReq = stationConfig?.minCrew || MIN_CREW;

    let level;
    if (totalCrew === 0) { level = 'none'; totalNone++; }
    else if (totalCrew < minReq) { level = 'low'; totalLow++; }
    else if (totalCrew < minReq * 2) { level = 'ok'; totalOk++; }
    else { level = 'good'; totalGood++; }

    dates.push({ date: dateStr, shifts: dayShifts.length, crew: totalCrew, onLeave, level });
    cur.setDate(cur.getDate() + 1);
  }

  return {
    dates,
    summary: {
      good: totalGood,
      ok: totalOk,
      low: totalLow,
      none: totalNone,
      total: dates.length,
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function adjacentDate(dateStr, offset) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}
