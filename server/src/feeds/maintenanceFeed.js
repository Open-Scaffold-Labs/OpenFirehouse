'use strict';
/**
 * maintenanceFeed.js — calendar feed for fleet maintenance (rebuilt in 2.2 / 0083).
 *
 * The pre-0083 version selected columns that never existed (scheduled_date /
 * completed_date / a.name) — every call threw 42703, swallowed by feeds/index.js,
 * so maintenance NEVER reached any calendar. Now reads the real model:
 *  - PM schedules due inside the window (deadline entries; the calendar axis only —
 *    meter axes have no date to plot)
 *  - open work orders (event on created date; urgent/emergency styled as deadlines)
 */
const { pool } = require('../db');

module.exports = async function maintenanceFeed(start, end, options) {
  const entries = [];

  // PM calendar-axis due dates inside the window.
  const pm = await pool.query(`
    SELECT p.id, p.task, p.interval_days, p.last_done_date, a.designation
      FROM pm_schedules p
      JOIN apparatus a ON a.id = p.apparatus_id
     WHERE p.department_id = $1 AND p.deleted_at IS NULL AND p.active = TRUE
       AND p.interval_days IS NOT NULL AND p.last_done_date IS NOT NULL
  `, [options.stationId]);
  for (const r of pm.rows) {
    const last = r.last_done_date instanceof Date
      ? r.last_done_date.toISOString().slice(0, 10) : String(r.last_done_date).slice(0, 10);
    const due = new Date(`${last}T12:00:00Z`);
    due.setUTCDate(due.getUTCDate() + r.interval_days);
    const dueDay = due.toISOString().slice(0, 10);
    if (dueDay < start || dueDay > end) continue;
    entries.push({
      id: `pm-${r.id}`,
      source_module: 'work_orders',
      source_record_id: r.id,
      entry_type: 'deadline',
      category: 'equipment',
      title: `${r.task} — ${r.designation}`,
      subtitle: 'Preventive maintenance due',
      date: dueDay,
      end_date: null, time: null, end_time: null, location: null,
      urgency: 'warning',
      visibility: ['officer', 'station'],
      member_ids: [],
      clickthrough: '/maintenance',
      icon: 'wrench',
      color: 'yellow',
    });
  }

  // Open work orders created inside the window.
  const wos = await pool.query(`
    SELECT w.id, w.title, w.priority, w.status, w.created_at, a.designation
      FROM work_orders w
      LEFT JOIN apparatus a ON a.id = w.apparatus_id
     WHERE w.department_id = $3 AND w.deleted_at IS NULL
       AND w.status IN ('open','in_progress','awaiting_parts')
       AND w.created_at::date BETWEEN $1::date AND $2::date
     ORDER BY w.created_at
  `, [start, end, options.stationId]);
  for (const r of wos.rows) {
    const day = r.created_at instanceof Date
      ? r.created_at.toISOString().slice(0, 10) : String(r.created_at).slice(0, 10);
    const hot = r.priority === 'emergency' || r.priority === 'urgent';
    entries.push({
      id: `wo-${r.id}`,
      source_module: 'work_orders',
      source_record_id: r.id,
      entry_type: hot ? 'deadline' : 'event',
      category: 'equipment',
      title: `WO: ${r.title}${r.designation ? ` — ${r.designation}` : ''}`,
      subtitle: `${r.status.replace('_', ' ')} · ${r.priority}`,
      date: day,
      end_date: null, time: null, end_time: null, location: null,
      urgency: hot ? 'critical' : 'info',
      visibility: ['officer', 'station'],
      member_ids: [],
      clickthrough: '/maintenance',
      icon: 'wrench',
      color: hot ? 'red' : 'yellow',
    });
  }

  return entries;
};
