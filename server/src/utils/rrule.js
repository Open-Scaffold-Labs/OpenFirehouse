'use strict';

/**
 * rrule.js - Simple RRULE parser and expander for fire department event patterns
 * Supports: DAILY, WEEKLY, MONTHLY, YEARLY with INTERVAL, BYDAY, BYMONTHDAY, BYMONTH, COUNT, UNTIL
 */

function parseRRule(rruleString) {
  if (!rruleString) return null;

  const parts = {};
  const items = rruleString.split(';').map(s => s.trim());

  items.forEach(item => {
    const [key, value] = item.split('=');
    if (!key || !value) return;

    const k = key.toUpperCase();
    if (k === 'FREQ') {
      parts.freq = value.toUpperCase();
    } else if (k === 'INTERVAL') {
      parts.interval = parseInt(value, 10) || 1;
    } else if (k === 'BYDAY') {
      parts.byday = value.split(',').map(s => s.trim());
    } else if (k === 'BYMONTHDAY') {
      parts.bymonthday = value.split(',').map(v => parseInt(v, 10));
    } else if (k === 'BYMONTH') {
      parts.bymonth = value.split(',').map(v => parseInt(v, 10));
    } else if (k === 'COUNT') {
      parts.count = parseInt(value, 10);
    } else if (k === 'UNTIL') {
      parts.until = new Date(value);
    }
  });

  return parts;
}

function describeRRule(rruleString) {
  if (!rruleString) return 'No recurrence';

  const rule = parseRRule(rruleString);
  if (!rule) return 'No recurrence';

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const ordinalNames = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth'];

  let desc = '';

  if (rule.interval && rule.interval > 1) {
    desc += `Every ${rule.interval} `;
  } else {
    desc += 'Every ';
  }

  if (rule.freq === 'DAILY') {
    desc += 'day';
  } else if (rule.freq === 'WEEKLY') {
    if (rule.byday && rule.byday.length > 0) {
      const days = rule.byday.map(d => {
        const dayMap = { 'SU': 'Sunday', 'MO': 'Monday', 'TU': 'Tuesday', 'WE': 'Wednesday',
                         'TH': 'Thursday', 'FR': 'Friday', 'SA': 'Saturday' };
        return dayMap[d] || d;
      });
      desc += days.join(', ');
    } else {
      desc += 'week';
    }
  } else if (rule.freq === 'MONTHLY') {
    if (rule.byday && rule.byday.length > 0) {
      // First Tuesday of month pattern like "1TU"
      const pattern = rule.byday[0];
      const ordinal = parseInt(pattern[0], 10);
      const dayCode = pattern.substring(1);
      const dayMap = { 'SU': 'Sunday', 'MO': 'Monday', 'TU': 'Tuesday', 'WE': 'Wednesday',
                       'TH': 'Thursday', 'FR': 'Friday', 'SA': 'Saturday' };
      const day = dayMap[dayCode] || 'day';
      desc += `${ordinalNames[ordinal] || ordinal} ${day} of month`;
    } else if (rule.bymonthday && rule.bymonthday.length > 0) {
      desc += `${rule.bymonthday[0]}${['st', 'nd', 'rd'][rule.bymonthday[0] % 10 - 1] || 'th'} of month`;
    } else {
      desc += 'month';
    }
  } else if (rule.freq === 'YEARLY') {
    if (rule.bymonth && rule.bymonth.length > 0) {
      const months = rule.bymonth.map(m => monthNames[m - 1]);
      desc += months.join(', ');
      if (rule.bymonthday && rule.bymonthday.length > 0) {
        desc += ` ${rule.bymonthday[0]}`;
      }
    } else {
      desc += 'year';
    }
  }

  if (rule.until) {
    desc += ` until ${rule.until.toLocaleDateString()}`;
  } else if (rule.count) {
    desc += ` (${rule.count} times)`;
  }

  return desc;
}

function getDayOfWeekCode(dayNum) {
  const codes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  return codes[dayNum];
}

function parseByDayPattern(pattern) {
  // Parse patterns like "1TU" (first Tuesday), "FR" (any Friday)
  if (pattern.length === 2) {
    // Just day of week: "TU"
    return { dayCode: pattern, occurrence: null };
  }
  // Ordinal + day: "1TU", "3MO", etc.
  const match = pattern.match(/^(-?\d+)([A-Z]{2})$/);
  if (match) {
    return { dayCode: match[2], occurrence: parseInt(match[1], 10) };
  }
  return null;
}

function dayCodeToNum(code) {
  const map = { 'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6 };
  return map[code];
}

function getDatesInMonth(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const dates = [];
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }
  return dates;
}

function getOccurrenceInMonth(year, month, dayCode, occurrence) {
  // Get the Nth occurrence of a day (1-5, or -1 for last) in a month
  const dates = getDatesInMonth(new Date(year, month, 1));
  const targetDay = dayCodeToNum(dayCode);
  const matching = dates.filter(d => d.getDay() === targetDay);

  if (occurrence > 0 && occurrence <= matching.length) {
    return matching[occurrence - 1];
  }
  if (occurrence === -1 && matching.length > 0) {
    return matching[matching.length - 1];
  }
  return null;
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function addYears(date, years) {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

function dateToString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateString(str) {
  const parts = str.split('-');
  if (parts.length === 3) {
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  return new Date(str);
}

function isSameDay(d1, d2) {
  return dateToString(d1) === dateToString(d2);
}

function expandRRule(rruleString, dtstart, rangeStart, rangeEnd) {
  if (!rruleString) return [];

  const rule = parseRRule(rruleString);
  if (!rule) return [];

  // Parse inputs
  const startDate = typeof dtstart === 'string' ? parseDateString(dtstart) : dtstart;
  const start = typeof rangeStart === 'string' ? parseDateString(rangeStart) : rangeStart;
  const end = typeof rangeEnd === 'string' ? parseDateString(rangeEnd) : rangeEnd;

  // Validate inputs
  if (!startDate || !start || !end) return [];

  const occurrences = [];
  const maxIterations = 10000; // Safety limit
  let iterations = 0;

  if (rule.freq === 'DAILY') {
    const interval = rule.interval || 1;
    let current = new Date(startDate);

    while (current <= end && iterations < maxIterations) {
      iterations++;
      if (current >= start && current <= end) {
        occurrences.push(new Date(current));
        if (rule.count && occurrences.length >= rule.count) break;
      }
      current.setDate(current.getDate() + interval);
      if (rule.until && current > rule.until) break;
    }
  } else if (rule.freq === 'WEEKLY') {
    const interval = rule.interval || 1;
    const byDays = rule.byday || [getDayOfWeekCode(startDate.getDay())];

    let current = new Date(startDate);
    // Align to start of the week containing startDate
    const daysFromMonday = (current.getDay() || 7) - 1;
    current.setDate(current.getDate() - daysFromMonday);

    while (current <= end && iterations < maxIterations) {
      iterations++;
      for (const dayCode of byDays) {
        const dayNum = dayCodeToNum(dayCode);
        const target = new Date(current);
        target.setDate(target.getDate() + (dayNum - target.getDay() + 7) % 7);

        if (target >= start && target <= end) {
          occurrences.push(new Date(target));
          if (rule.count && occurrences.length >= rule.count) break;
        }
        if (rule.until && target > rule.until) break;
      }

      if (rule.count && occurrences.length >= rule.count) break;

      // Move to next week
      current.setDate(current.getDate() + (7 * interval));
      if (rule.until && current > rule.until) break;
    }
  } else if (rule.freq === 'MONTHLY') {
    const interval = rule.interval || 1;
    let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

    while (current <= end && iterations < maxIterations) {
      iterations++;
      let monthOccurrences = [];

      if (rule.byday && rule.byday.length > 0) {
        // Pattern like "1TU" (first Tuesday)
        for (const pattern of rule.byday) {
          const parsed = parseByDayPattern(pattern);
          if (parsed && parsed.occurrence) {
            const date = getOccurrenceInMonth(current.getFullYear(), current.getMonth(), parsed.dayCode, parsed.occurrence);
            if (date) monthOccurrences.push(date);
          }
        }
      } else if (rule.bymonthday && rule.bymonthday.length > 0) {
        // Specific day of month
        for (const day of rule.bymonthday) {
          const date = new Date(current.getFullYear(), current.getMonth(), day);
          if (date.getMonth() === current.getMonth()) {
            monthOccurrences.push(date);
          }
        }
      } else {
        // Same day of month as start date
        monthOccurrences.push(new Date(current.getFullYear(), current.getMonth(), startDate.getDate()));
      }

      for (const date of monthOccurrences) {
        if (date >= start && date <= end) {
          occurrences.push(new Date(date));
          if (rule.count && occurrences.length >= rule.count) break;
        }
      }

      if (rule.count && occurrences.length >= rule.count) break;

      // Move to next month(s)
      current = addMonths(current, interval);
      if (rule.until && current > rule.until) break;
    }
  } else if (rule.freq === 'YEARLY') {
    const interval = rule.interval || 1;
    let current = new Date(startDate.getFullYear(), 0, 1);

    while (current <= end && iterations < maxIterations) {
      iterations++;
      let yearOccurrences = [];

      const months = rule.bymonth || [startDate.getMonth() + 1];
      const days = rule.bymonthday || [startDate.getDate()];

      for (const month of months) {
        for (const day of days) {
          yearOccurrences.push(new Date(current.getFullYear(), month - 1, day));
        }
      }

      for (const date of yearOccurrences) {
        if (date >= start && date <= end) {
          occurrences.push(new Date(date));
          if (rule.count && occurrences.length >= rule.count) break;
        }
      }

      if (rule.count && occurrences.length >= rule.count) break;

      current = addYears(current, interval);
      if (rule.until && current > rule.until) break;
    }
  }

  // Deduplicate and sort
  const unique = [];
  const seen = new Set();
  for (const date of occurrences) {
    const key = dateToString(date);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(date);
    }
  }

  return unique.sort((a, b) => a - b);
}

module.exports = {
  parseRRule,
  describeRRule,
  expandRRule,
};
