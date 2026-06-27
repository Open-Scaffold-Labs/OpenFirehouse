'use strict';
/**
 * grievanceFeed.js — Calendar feed for grievance deadlines.
 * Shows step deadlines and hearing dates.
 */
const { pool } = require('../db');

module.exports = async function grievanceFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT id, grievance_number, subject, status, current_step,
           filed_date, next_deadline, hearing_date
    FROM grievances
    WHERE department_id = $3 AND deleted_at IS NULL
      AND (next_deadline BETWEEN $1 AND $2
           OR hearing_date BETWEEN $1 AND $2)
    ORDER BY COALESCE(next_deadline, hearing_date)
  `, [start, end, options.stationId]);

  const entries = [];
  const fmt = d => typeof d === 'string' ? d : d?.toISOString?.()?.slice(0, 10);

  for (const r of rows) {
    if (r.next_deadline && fmt(r.next_deadline) >= start && fmt(r.next_deadline) <= end) {
      entries.push({
        id: `griev-dl-${r.id}`,
        source_module: 'grievances',
        source_record_id: r.id,
        entry_type: 'deadline',
        category: 'personnel',
        title: `Grievance Deadline — ${r.grievance_number || r.subject || ''}`,
        subtitle: `Step ${r.current_step || '?'} — ${r.status || ''}`,
        date: fmt(r.next_deadline),
        end_date: null, time: null, end_time: null, location: null,
        urgency: 'critical',
        visibility: ['officer', 'station'],
        member_ids: [],
        clickthrough: '/grievances',
        icon: 'scale',
        color: 'rose',
      });
    }
    if (r.hearing_date && fmt(r.hearing_date) >= start && fmt(r.hearing_date) <= end) {
      entries.push({
        id: `griev-hear-${r.id}`,
        source_module: 'grievances',
        source_record_id: r.id,
        entry_type: 'event',
        category: 'personnel',
        title: `Grievance Hearing — ${r.grievance_number || ''}`,
        subtitle: r.subject || '',
        date: fmt(r.hearing_date),
        end_date: null, time: null, end_time: null,
        location: 'TBD',
        urgency: 'warning',
        visibility: ['officer', 'station'],
        member_ids: [],
        clickthrough: '/grievances',
        icon: 'gavel',
        color: 'rose',
      });
    }
  }
  return entries;
};
