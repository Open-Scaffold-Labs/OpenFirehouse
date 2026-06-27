'use strict';
/**
 * wellnessFeed.js — Calendar feed for wellness checks and physicals.
 */
const { pool } = require('../db');

module.exports = async function wellnessFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT w.id, w.member_id, w.check_type, w.scheduled_date, w.status,
           m.name AS member_name
    FROM wellness w
    LEFT JOIN members m ON m.id = w.member_id
    WHERE w.department_id = $3
      AND w.scheduled_date BETWEEN $1 AND $2
    ORDER BY w.scheduled_date
  `, [start, end, options.stationId]);

  return rows.map(r => {
    const dt = typeof r.scheduled_date === 'string'
      ? r.scheduled_date : r.scheduled_date?.toISOString?.()?.slice(0, 10);
    return {
      id: `wellness-${r.id}`,
      source_module: 'wellness',
      source_record_id: r.id,
      entry_type: 'event',
      category: 'personnel',
      title: `${r.check_type || 'Wellness Check'} — ${r.member_name || 'Member'}`,
      subtitle: r.status || '',
      date: dt,
      end_date: null, time: null, end_time: null,
      location: null,
      urgency: r.status === 'overdue' ? 'warning' : 'info',
      visibility: ['officer', 'station'],
      member_ids: r.member_id ? [r.member_id] : [],
      clickthrough: '/wellness',
      icon: 'heart-pulse',
      color: 'teal',
    };
  });
};
