'use strict';
/**
 * meetingFeed.js — Calendar feed for scheduled meeting minutes.
 */
const { pool } = require('../db');

module.exports = async function meetingFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT id, title, meeting_date, meeting_type, status, location,
           linked_module, linked_record_id
    FROM meeting_minutes
    WHERE department_id = $3 AND meeting_date BETWEEN $1 AND $2
    ORDER BY meeting_date
  `, [start, end, options.stationId]);

  const TYPE_COLOR = {
    regular: 'slate', emergency: 'red', budget: 'emerald',
    training: 'indigo', special: 'amber',
  };

  return rows.map(r => {
    const dt = typeof r.meeting_date === 'string'
      ? r.meeting_date
      : r.meeting_date?.toISOString?.()?.slice(0, 10);
    return {
      id: `meeting-${r.id}`,
      source_module: 'meeting-minutes',
      source_record_id: r.id,
      entry_type: 'event',
      category: 'meetings',
      title: r.title || `${(r.meeting_type || 'Department').replace(/^\w/, c => c.toUpperCase())} Meeting`,
      subtitle: r.status === 'approved' ? 'Minutes approved' : 'Draft',
      date: dt,
      end_date: null,
      time: null,
      end_time: null,
      location: r.location || 'Station 14',
      urgency: r.meeting_type === 'emergency' ? 'warning' : 'info',
      visibility: ['all'],
      member_ids: [],
      clickthrough: '/meeting-minutes',
      icon: 'clipboard-list',
      color: TYPE_COLOR[r.meeting_type] || 'slate',
    };
  });
};
