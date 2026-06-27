/**
 * OpenFirehouse Scheduling Engine
 *
 * Prototype: constraint-based scheduling logic that runs client-side.
 * Production: this logic moves server-side and is augmented by the Claude API,
 * which handles natural language parsing and complex constraint reasoning.
 */

import { initialMembers } from '../data/members';

const OFFICERS = ['Chief', 'Deputy Chief', 'Assistant Chief', 'Captain', 'Lieutenant'];
const DRIVERS  = ['Engineer', 'Firefighter II', 'Firefighter I'];

function getActiveMembers() {
  return initialMembers.filter((m) => m.status === 'Active' || m.status === 'Probationary');
}

function isOfficer(member) {
  return OFFICERS.includes(member.rank);
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function nextWeekdayDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function getUpcomingDates(count, startOffset = 1) {
  return Array.from({ length: count }, (_, i) => nextWeekdayDate(startOffset + i));
}

function getWeekendDates(weeksAhead = 0) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilSat = ((6 - dayOfWeek) + 7 * weeksAhead) % 7 || (weeksAhead > 0 ? 7 * weeksAhead : 7);
  const sat = new Date(today);
  sat.setDate(today.getDate() + daysUntilSat);
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return [sat.toISOString().slice(0, 10), sun.toISOString().slice(0, 10)];
}

function getNextWeekDates() {
  return getUpcomingDates(7, 7 - new Date().getDay() + 1);
}

function formatDateLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// ── Constraint-based crew builder ─────────────────────────────────────────────

function buildCrew(members, excludeNames = [], minSize = 3, requireOfficer = true) {
  const available = members.filter((m) => !excludeNames.includes(m.name));
  const officers  = available.filter(isOfficer);
  const crew      = [];

  // Always try to include at least one officer
  if (requireOfficer && officers.length > 0) {
    const officer = officers[Math.floor(Math.random() * officers.length)];
    crew.push(officer.name);
  }

  // Fill remaining slots
  const remaining = available.filter((m) => !crew.includes(m.name));
  const shuffled  = [...remaining].sort(() => Math.random() - 0.5);
  while (crew.length < minSize && shuffled.length > 0) {
    crew.push(shuffled.pop().name);
  }

  return crew;
}

// ── Intent parser ─────────────────────────────────────────────────────────────

function parseIntent(input) {
  const text = input.toLowerCase();

  const intent = {
    dates:          [],
    excludeNames:   [],
    minCrew:        3,
    requireOfficer: true,
    shiftTypes:     ['Day', 'Night'],
    raw:            input,
  };

  // Date resolution
  if (text.includes('this weekend') || text.includes('weekend')) {
    intent.dates = getWeekendDates(0);
    intent.shiftTypes = ['Day', 'Night', 'Duty Officer'];
  } else if (text.includes('next weekend')) {
    intent.dates = getWeekendDates(1);
    intent.shiftTypes = ['Day', 'Night', 'Duty Officer'];
  } else if (text.includes('next week')) {
    intent.dates = getNextWeekDates().slice(0, 7);
  } else if (text.includes('tomorrow')) {
    intent.dates = [nextWeekdayDate(1)];
  } else if (text.includes('today')) {
    intent.dates = [nextWeekdayDate(0)];
  } else {
    // Default: next 3 days
    intent.dates = getUpcomingDates(3, 1);
  }

  // Exclusions — scan for member last names mentioned with conflict language
  const conflictPhrases = ['conflict', 'unavailable', 'out', 'off', 'away', "can't", 'cannot'];
  const hasConflict = conflictPhrases.some((p) => text.includes(p));
  if (hasConflict) {
    getActiveMembers().forEach((m) => {
      const lastName = m.name.split(' ').slice(-1)[0].toLowerCase();
      const firstName = m.name.split(' ')[0].toLowerCase();
      if (text.includes(lastName) || text.includes(firstName)) {
        intent.excludeNames.push(m.name);
      }
    });
  }

  // Minimum crew size
  const crewMatch = text.match(/(\d+)\s*(people|members|firefighters|crew|ff)/);
  if (crewMatch) intent.minCrew = parseInt(crewMatch[1], 10);
  if (text.includes('full crew') || text.includes('fully staffed')) intent.minCrew = 5;

  // Officer requirement
  if (text.includes('officer') || text.includes('at least one officer')) {
    intent.requireOfficer = true;
  }

  // Shift type overrides
  if (text.includes('day shift') && !text.includes('night')) intent.shiftTypes = ['Day'];
  if (text.includes('night shift') && !text.includes('day')) intent.shiftTypes = ['Night'];
  if (text.includes('24') || text.includes('twenty-four')) intent.shiftTypes = ['24-Hour'];

  return intent;
}

// ── Schedule generator ────────────────────────────────────────────────────────

export function generateSchedule(userInput) {
  const members = getActiveMembers();
  const intent  = parseIntent(userInput);
  const schedule = [];

  // Track who's been assigned to balance workload
  const assignmentCount = {};
  members.forEach((m) => { assignmentCount[m.name] = 0; });

  for (const date of intent.dates) {
    const dayShifts = [];

    for (const shiftType of intent.shiftTypes) {
      // Sort members by fewest assignments so far for fairness
      const sortedMembers = [...members].sort((a, b) =>
        (assignmentCount[a.name] || 0) - (assignmentCount[b.name] || 0)
      );

      const crew = buildCrew(
        sortedMembers,
        intent.excludeNames,
        intent.minCrew,
        intent.requireOfficer,
      );

      crew.forEach((name) => {
        assignmentCount[name] = (assignmentCount[name] || 0) + 1;
      });

      dayShifts.push({ date, shiftType, crew, notes: '' });
    }

    schedule.push({ date, dateLabel: formatDateLabel(date), shifts: dayShifts });
  }

  return { schedule, intent };
}

// ── Response builder ──────────────────────────────────────────────────────────

export function buildAIResponse(userInput) {
  const { schedule, intent } = generateSchedule(userInput);

  let intro = '';

  if (intent.excludeNames.length > 0) {
    intro = `Got it — I've excluded ${intent.excludeNames.join(' and ')} from all shifts. `;
  }

  const dateRange = schedule.length === 1
    ? `for ${schedule[0].dateLabel}`
    : `for ${schedule[0].dateLabel} through ${schedule[schedule.length - 1].dateLabel}`;

  intro += `Here's a schedule ${dateRange} with at least ${intent.minCrew} personnel per shift${intent.requireOfficer ? ', including an officer on each' : ''}.`;

  const warnings = [];
  schedule.forEach(({ dateLabel, shifts }) => {
    shifts.forEach(({ crew, shiftType }) => {
      if (crew.length < intent.minCrew) {
        warnings.push(`⚠️ ${dateLabel} ${shiftType}: only ${crew.length} available (minimum ${intent.minCrew} requested)`);
      }
      const hasOfficer = crew.some((name) => {
        const m = initialMembers.find((mem) => mem.name === name);
        return m && isOfficer(m);
      });
      if (intent.requireOfficer && !hasOfficer) {
        warnings.push(`⚠️ ${dateLabel} ${shiftType}: no officer available to assign`);
      }
    });
  });

  return { intro, schedule, warnings };
}
