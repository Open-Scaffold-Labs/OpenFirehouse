'use strict';
/**
 * drillFeed.js — Calendar feed for drills (separate from events drills).
 */
const { pool } = require('../db');

module.exports = async function drillFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT id, title, type AS drill_type, date, "startTime" AS start_time,
           location, instructor AS lead_instructor
    FROM drills
    WHERE department_id = $3 AND date BETWEEN $1 AND $2
    ORDER BY date, "startTime"
  `, [start, end, options.stationId]);

  return rows.map(r => {
    const dt = typeof r.date === 'string'
      ? r.date : r.date?.toISOString?.()?.slice(0, 10);
    return {
      id: `drill-${r.id}`,
      source_module: 'drills',
      source_record_id: r.id,
      entry_type: 'event',
      category: 'training',
      title: r.title || `${r.drill_type || 'Drill'}`,
      subtitle: r.lead_instructor ? `Lead: ${r.lead_instructor}` : '',
      date: dt,
      end_date: null,
      time: r.start_time || null,
      end_time: r.end_time || null,
      location: r.location || 'Station 14',
      urgency: 'info',
      visibility: ['all'],
      member_ids: [],
      clickthrough: '/drills',
      icon: 'flame',
      color: 'orange',
    };
  });
};
