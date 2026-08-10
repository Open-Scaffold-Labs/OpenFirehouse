'use strict';
/**
 * apparatusOOSFeed.js — Calendar feed for apparatus out-of-service periods.
 */
const { pool } = require('../db');

module.exports = async function apparatusOOSFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT oos.id, oos.apparatus_id, oos.reason, oos.start_date, oos.end_date,
           oos.status,
           a.designation AS apparatus_name
    FROM apparatus_oos oos
    LEFT JOIN apparatus a ON a.id = oos.apparatus_id
    WHERE oos.department_id = $3
      AND oos.start_date <= $2
      AND (oos.end_date IS NULL OR oos.end_date >= $1)
    ORDER BY oos.start_date
  `, [start, end, options.stationId]);

  return rows.map(r => {
    const sd = typeof r.start_date === 'string'
      ? r.start_date : r.start_date?.toISOString?.()?.slice(0, 10);
    const ed = r.end_date
      ? (typeof r.end_date === 'string' ? r.end_date : r.end_date?.toISOString?.()?.slice(0, 10))
      : null;
    return {
      id: `oos-${r.id}`,
      source_module: 'apparatus-oos',
      source_record_id: r.id,
      entry_type: 'block',
      category: 'equipment',
      title: `OOS — ${r.apparatus_name || 'Apparatus'}`,
      subtitle: r.reason?.slice(0, 60) || '',
      date: sd,
      end_date: ed,
      time: null,
      end_time: null,
      location: null,
      urgency: 'critical',
      visibility: ['all'],
      member_ids: [],
      clickthrough: '/apparatus',
      icon: 'truck',
      color: 'red',
    };
  });
};
