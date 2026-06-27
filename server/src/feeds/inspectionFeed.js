'use strict';
/**
 * inspectionFeed.js — Calendar feed for fire inspections (scheduled & overdue).
 */
const { pool } = require('../db');

module.exports = async function inspectionFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT fi.id, fi.property_id, fi.inspection_date, fi.next_inspection_date,
           fi.status, fi.inspector_name, fi.result,
           p.name AS property_name
    FROM fire_inspections fi
    LEFT JOIN fi_properties p ON p.id = fi.property_id
    WHERE fi.department_id = $3
      AND (fi.inspection_date BETWEEN $1 AND $2
           OR fi.next_inspection_date BETWEEN $1 AND $2)
    ORDER BY COALESCE(fi.next_inspection_date, fi.inspection_date)
  `, [start, end, options.stationId]);

  const entries = [];
  for (const r of rows) {
    // Past inspection as a record
    const iDate = typeof r.inspection_date === 'string'
      ? r.inspection_date : r.inspection_date?.toISOString?.()?.slice(0, 10);
    if (iDate >= start && iDate <= end) {
      entries.push({
        id: `insp-done-${r.id}`,
        source_module: 'fire-inspections',
        source_record_id: r.id,
        entry_type: 'event',
        category: 'compliance',
        title: `Inspection — ${r.property_name || 'Property'}`,
        subtitle: r.result ? `Result: ${r.result}` : (r.inspector_name || ''),
        date: iDate,
        end_date: null, time: null, end_time: null,
        location: r.property_name || null,
        urgency: r.result === 'fail' ? 'warning' : 'info',
        visibility: ['officer', 'station'],
        member_ids: [],
        clickthrough: '/fire-inspections',
        icon: 'shield',
        color: r.result === 'fail' ? 'red' : 'green',
      });
    }
    // Upcoming next inspection as a deadline
    if (r.next_inspection_date) {
      const nDate = typeof r.next_inspection_date === 'string'
        ? r.next_inspection_date : r.next_inspection_date?.toISOString?.()?.slice(0, 10);
      if (nDate >= start && nDate <= end) {
        entries.push({
          id: `insp-due-${r.id}`,
          source_module: 'fire-inspections',
          source_record_id: r.id,
          entry_type: 'deadline',
          category: 'compliance',
          title: `Inspection Due — ${r.property_name || 'Property'}`,
          subtitle: '',
          date: nDate,
          end_date: null, time: null, end_time: null,
          location: r.property_name || null,
          urgency: 'warning',
          visibility: ['officer', 'station'],
          member_ids: [],
          clickthrough: '/fire-inspections',
          icon: 'shield-alert',
          color: 'amber',
        });
      }
    }
  }
  return entries;
};
