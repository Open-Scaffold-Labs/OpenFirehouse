'use strict';
/**
 * leaveFeed.js — Calendar feed for leave / time-off requests.
 * Shows approved leave as time-blocked entries visible to officers.
 */
const { pool } = require('../db');

module.exports = async function leaveFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT lr.id, lr.member_id, lr.leave_type, lr.start_date, lr.end_date,
           lr.status, lr.reason,
           m.name AS member_name
    FROM leave_requests lr
    LEFT JOIN members m ON m.id = lr.member_id
    WHERE lr.department_id = $3
      AND lr.status = 'approved'
      AND lr.start_date <= $2 AND lr.end_date >= $1
    ORDER BY lr.start_date
  `, [start, end, options.stationId]);

  return rows.map(r => {
    const sd = typeof r.start_date === 'string'
      ? r.start_date : r.start_date?.toISOString?.()?.slice(0, 10);
    const ed = typeof r.end_date === 'string'
      ? r.end_date : r.end_date?.toISOString?.()?.slice(0, 10);
    return {
      id: `leave-${r.id}`,
      source_module: 'leave-requests',
      source_record_id: r.id,
      entry_type: 'block',
      category: 'personnel',
      title: `${r.leave_type || 'Leave'} — ${r.member_name || 'Member'}`,
      subtitle: r.reason?.slice(0, 60) || '',
      date: sd,
      end_date: ed,
      time: null,
      end_time: null,
      location: null,
      urgency: 'info',
      visibility: ['officer', 'station'],
      member_ids: r.member_id ? [r.member_id] : [],
      clickthrough: '/schedule?tab=leave',
      icon: 'calendar-off',
      color: 'purple',
    };
  });
};
