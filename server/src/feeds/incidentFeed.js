'use strict';
/**
 * incidentFeed.js — Calendar feed for incidents (historical record entries).
 */
const { pool } = require('../db');

module.exports = async function incidentFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT id, incident_number, type, date, time, location, status
    FROM incidents
    WHERE department_id = $3 AND date BETWEEN $1 AND $2 AND deleted_at IS NULL
    ORDER BY date, time
  `, [start, end, options.stationId]);

  return rows.map(r => {
    const dt = typeof r.date === 'string'
      ? r.date : r.date?.toISOString?.()?.slice(0, 10);
    return {
      id: `incident-${r.id}`,
      source_module: 'incidents',
      source_record_id: r.id,
      entry_type: 'incident',
      category: 'incidents',
      title: `${r.type || 'Incident'} — ${r.incident_number || ''}`,
      subtitle: r.location || '',
      date: dt,
      end_date: null,
      time: r.time || null,
      end_time: null,
      location: r.location || null,
      urgency: 'info',
      visibility: ['all'],
      member_ids: [],
      clickthrough: '/incidents',
      icon: 'siren',
      color: 'red',
    };
  });
};
