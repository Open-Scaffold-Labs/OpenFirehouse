'use strict';
/**
 * hydrantFeed.js — Calendar feed for hydrant flow-test due dates.
 */
const { pool } = require('../db');

module.exports = async function hydrantFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT id, hydrant_number, location, next_test_date, status
    FROM hydrants
    WHERE department_id = $3
      AND next_test_date BETWEEN $1 AND $2
    ORDER BY next_test_date
  `, [start, end, options.stationId]);

  return rows.map(r => {
    const dt = typeof r.next_test_date === 'string'
      ? r.next_test_date : r.next_test_date?.toISOString?.()?.slice(0, 10);
    return {
      id: `hydrant-${r.id}`,
      source_module: 'hydrants',
      source_record_id: r.id,
      entry_type: 'deadline',
      category: 'compliance',
      title: `Hydrant Test Due — ${r.hydrant_number || ''}`,
      subtitle: r.location || '',
      date: dt,
      end_date: null, time: null, end_time: null,
      location: r.location || null,
      urgency: r.status === 'out_of_service' ? 'critical' : 'warning',
      visibility: ['officer', 'station'],
      member_ids: [],
      clickthrough: '/hydrants',
      icon: 'droplet',
      color: 'cyan',
    };
  });
};
