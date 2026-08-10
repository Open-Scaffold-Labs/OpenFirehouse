'use strict';
/**
 * leaveFeed.js — Calendar feed for leave / time-off requests.
 * Shows approved leave as time-blocked entries visible to officers.
 */
const { pool } = require('../db');

module.exports = async function leaveFeed(start, end, options) {
  // leave_requests uses quoted camelCase columns ("memberId","startDate","endDate")
  // and a canonical Title-Case status ('Approved') — see 0067. The old snake_case /
  // lowercase query silently matched nothing, so approved leave never reached the
  // calendar feed (the same defect class 1.1a fixed in timesheets). Alias back to the
  // snake_case shape the mapper below expects.
  const { rows } = await pool.query(`
    SELECT lr.id, lr."memberId" AS member_id, lr.type AS leave_type,
           lr."startDate" AS start_date, lr."endDate" AS end_date,
           lr.status, lr.reason,
           m.name AS member_name
    FROM leave_requests lr
    LEFT JOIN members m ON m.id = lr."memberId"
    WHERE lr.department_id = $3
      AND lr.status = 'Approved'
      AND lr."startDate" <= $2 AND lr."endDate" >= $1
    ORDER BY lr."startDate"
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
