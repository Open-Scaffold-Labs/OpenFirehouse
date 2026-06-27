'use strict';
/**
 * scbaFeed.js — Calendar feed for SCBA cylinder hydro-test and flow-test due dates.
 */
const { pool } = require('../db');

module.exports = async function scbaFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT id, serial_number, cylinder_type, next_hydro_date, next_flow_date, status
    FROM cylinders
    WHERE department_id = $3
      AND (next_hydro_date BETWEEN $1 AND $2
           OR next_flow_date BETWEEN $1 AND $2)
    ORDER BY COALESCE(next_hydro_date, next_flow_date)
  `, [start, end, options.stationId]);

  const entries = [];
  const fmt = d => typeof d === 'string' ? d : d?.toISOString?.()?.slice(0, 10);

  for (const r of rows) {
    if (r.next_hydro_date && fmt(r.next_hydro_date) >= start && fmt(r.next_hydro_date) <= end) {
      entries.push({
        id: `scba-hydro-${r.id}`,
        source_module: 'cylinders',
        source_record_id: r.id,
        entry_type: 'deadline',
        category: 'equipment',
        title: `Hydro Test Due — ${r.serial_number || 'Cylinder'}`,
        subtitle: r.cylinder_type || '',
        date: fmt(r.next_hydro_date),
        end_date: null, time: null, end_time: null, location: null,
        urgency: 'warning',
        visibility: ['officer', 'station'],
        member_ids: [],
        clickthrough: '/scba',
        icon: 'wind',
        color: 'sky',
      });
    }
    if (r.next_flow_date && fmt(r.next_flow_date) >= start && fmt(r.next_flow_date) <= end) {
      entries.push({
        id: `scba-flow-${r.id}`,
        source_module: 'cylinders',
        source_record_id: r.id,
        entry_type: 'deadline',
        category: 'equipment',
        title: `Flow Test Due — ${r.serial_number || 'Cylinder'}`,
        subtitle: r.cylinder_type || '',
        date: fmt(r.next_flow_date),
        end_date: null, time: null, end_time: null, location: null,
        urgency: 'warning',
        visibility: ['officer', 'station'],
        member_ids: [],
        clickthrough: '/scba',
        icon: 'wind',
        color: 'sky',
      });
    }
  }
  return entries;
};
