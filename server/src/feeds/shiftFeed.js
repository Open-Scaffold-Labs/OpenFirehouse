'use strict';
/**
 * shiftFeed.js — Calendar feed for shift assignments.
 */
const { pool } = require('../db');

module.exports = async function shiftFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT s.id, s.date, s.shift_type, s.start_time, s.end_time,
           s.member_id, m.name AS member_name, s.role AS shift_role
    FROM shifts s
    LEFT JOIN members m ON m.id = s.member_id
    WHERE s.department_id = $3 AND s.date BETWEEN $1 AND $2
    ORDER BY s.date, s.start_time
  `, [start, end, options.stationId]);

  // Group shifts by date + shift_type for a combined entry
  const grouped = {};
  for (const r of rows) {
    const dateStr = typeof r.date === 'string' ? r.date : r.date?.toISOString?.()?.slice(0, 10);
    const key = `${dateStr}-${r.shift_type}`;
    if (!grouped[key]) {
      grouped[key] = {
        date: dateStr,
        shift_type: r.shift_type,
        start_time: r.start_time,
        end_time: r.end_time,
        members: [],
        member_ids: [],
      };
    }
    grouped[key].members.push(r.member_name || 'Unknown');
    if (r.member_id) grouped[key].member_ids.push(r.member_id);
  }

  return Object.entries(grouped).map(([key, g]) => ({
    id: `shift-${key}`,
    source_module: 'shifts',
    source_record_id: null,
    entry_type: 'event',
    category: 'shifts',
    title: `${g.shift_type || 'Duty'} Shift`,
    subtitle: `${g.members.length} member${g.members.length !== 1 ? 's' : ''}: ${g.members.slice(0, 3).join(', ')}${g.members.length > 3 ? '…' : ''}`,
    date: g.date,
    end_date: null,
    time: g.start_time || null,
    end_time: g.end_time || null,
    location: 'Station 14',
    urgency: g.members.length < 3 ? 'warning' : 'info',
    visibility: ['all'],
    member_ids: g.member_ids,
    clickthrough: '/schedule',
    icon: 'users',
    color: 'blue',
  }));
};
