'use strict';
/**
 * maintenanceFeed.js — Calendar feed for apparatus/equipment maintenance.
 * Shows scheduled maintenance as events and overdue items as deadlines.
 */
const { pool } = require('../db');

module.exports = async function maintenanceFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT mt.id, mt.apparatus_id, mt.type, mt.description,
           mt.scheduled_date, mt.completed_date, mt.status,
           a.name AS apparatus_name
    FROM maintenance mt
    LEFT JOIN apparatus a ON a.id = mt.apparatus_id
    WHERE mt.department_id = $3
      AND (mt.scheduled_date BETWEEN $1 AND $2
           OR (mt.status = 'overdue' AND mt.scheduled_date <= $2))
    ORDER BY mt.scheduled_date
  `, [start, end, options.stationId]);

  return rows.map(r => {
    const dt = typeof r.scheduled_date === 'string'
      ? r.scheduled_date
      : r.scheduled_date?.toISOString?.()?.slice(0, 10);
    const isOverdue = r.status === 'overdue';
    return {
      id: `maint-${r.id}`,
      source_module: 'maintenance',
      source_record_id: r.id,
      entry_type: isOverdue ? 'deadline' : 'event',
      category: 'equipment',
      title: `${r.type || 'Maintenance'} — ${r.apparatus_name || 'Equipment'}`,
      subtitle: r.description?.slice(0, 80) || '',
      date: dt,
      end_date: null,
      time: null,
      end_time: null,
      location: null,
      urgency: isOverdue ? 'critical' : r.status === 'scheduled' ? 'info' : 'warning',
      visibility: ['officer', 'station'],
      member_ids: [],
      clickthrough: '/maintenance',
      icon: 'wrench',
      color: isOverdue ? 'red' : 'yellow',
    };
  });
};
