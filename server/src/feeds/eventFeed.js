'use strict';
/**
 * eventFeed.js — Calendar feed for department events (drills, meetings, training,
 * fundraisers, community events, special details, inspections).
 */
const { pool } = require('../db');
const { expandRRule } = require('../utils/rrule');

module.exports = async function eventFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT id, title, type, date, start_time, end_time, location, organizer, description, rrule, recurrence_id, original_date, is_cancelled
    FROM events
    WHERE department_id = $1
    ORDER BY date, start_time
  `, [options.stationId]);

  const TYPE_CATEGORY = {
    'Drill': 'training', 'Meeting': 'meetings', 'Training': 'training',
    'Fundraiser': 'finance', 'Community Event': 'community',
    'Special Detail': 'shifts', 'Inspection': 'compliance', 'Other': 'meetings',
  };

  const TYPE_ICON = {
    'Drill': 'flame', 'Meeting': 'message-square', 'Training': 'book-open',
    'Fundraiser': 'dollar-sign', 'Community Event': 'heart',
    'Special Detail': 'siren', 'Inspection': 'shield', 'Other': 'calendar',
  };

  const TYPE_COLOR = {
    'Drill': 'orange', 'Meeting': 'slate', 'Training': 'indigo',
    'Fundraiser': 'pink', 'Community Event': 'green',
    'Special Detail': 'amber', 'Inspection': 'red', 'Other': 'gray',
  };

  // Build maps of cancelled and modified occurrences
  const cancelledMap = new Map();
  const modifiedMap = new Map();

  for (const row of rows) {
    if (row.recurrence_id) {
      const key = `${row.recurrence_id}-${row.original_date}`;
      if (row.is_cancelled) {
        cancelledMap.set(key, true);
      } else {
        modifiedMap.set(key, row);
      }
    }
  }

  // Process events and expand recurring ones
  const events = [];
  for (const r of rows) {
    // Skip modification/cancellation records - they're handled separately
    if (r.recurrence_id) continue;

    if (r.rrule) {
      // Expand recurring event
      try {
        const occurrences = expandRRule(r.rrule, r.date, start, end);
        for (const occDate of occurrences) {
          const dateStr = occDate.toISOString().split('T')[0];
          const key = `${r.id}-${dateStr}`;

          // Check if this occurrence is cancelled
          if (cancelledMap.has(key)) {
            continue;
          }

          // Check if there's a modified version
          let eventRow = r;
          if (modifiedMap.has(key)) {
            eventRow = modifiedMap.get(key);
          }

          events.push({
            ...eventRow,
            date: dateStr,
          });
        }
      } catch (e) {
        console.error('Error expanding RRULE:', e);
        // Fall back to single event
        if (r.date >= start && r.date <= end) {
          events.push(r);
        }
      }
    } else {
      // Non-recurring event
      if (r.date >= start && r.date <= end) {
        events.push(r);
      }
    }
  }

  return events.map(r => ({
    id: `event-${r.id}`,
    source_module: 'events',
    source_record_id: r.id,
    entry_type: 'event',
    category: TYPE_CATEGORY[r.type] || 'meetings',
    title: r.title,
    subtitle: r.organizer || '',
    date: typeof r.date === 'string' ? r.date : r.date?.toISOString?.()?.slice(0, 10),
    end_date: null,
    time: r.start_time || null,
    end_time: r.end_time || null,
    location: r.location || null,
    urgency: 'info',
    visibility: ['all'],
    member_ids: [],
    clickthrough: '/events',
    icon: TYPE_ICON[r.type] || 'calendar',
    color: TYPE_COLOR[r.type] || 'gray',
  }));
};
