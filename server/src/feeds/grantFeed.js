'use strict';
/**
 * grantFeed.js — Calendar feed for grant deadlines (application, reporting, expiry).
 */
const { pool } = require('../db');

module.exports = async function grantFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT id, title, status, deadline, reporting_deadline, end_date
    FROM grants
    WHERE department_id = $3
      AND (deadline BETWEEN $1 AND $2
           OR reporting_deadline BETWEEN $1 AND $2
           OR end_date BETWEEN $1 AND $2)
    ORDER BY COALESCE(deadline, reporting_deadline, end_date)
  `, [start, end, options.stationId]);

  const entries = [];
  for (const r of rows) {
    const fmt = d => typeof d === 'string' ? d : d?.toISOString?.()?.slice(0, 10);

    if (r.deadline && fmt(r.deadline) >= start && fmt(r.deadline) <= end) {
      entries.push({
        id: `grant-dl-${r.id}`,
        source_module: 'grants',
        source_record_id: r.id,
        entry_type: 'deadline',
        category: 'finance',
        title: `Grant Deadline — ${r.title || ''}`,
        subtitle: `Status: ${r.status || 'pending'}`,
        date: fmt(r.deadline),
        end_date: null, time: null, end_time: null, location: null,
        urgency: 'critical',
        visibility: ['officer', 'station'],
        member_ids: [],
        clickthrough: '/grants',
        icon: 'dollar-sign',
        color: 'emerald',
      });
    }
    if (r.reporting_deadline && fmt(r.reporting_deadline) >= start && fmt(r.reporting_deadline) <= end) {
      entries.push({
        id: `grant-rpt-${r.id}`,
        source_module: 'grants',
        source_record_id: r.id,
        entry_type: 'deadline',
        category: 'finance',
        title: `Grant Report Due — ${r.title || ''}`,
        subtitle: '',
        date: fmt(r.reporting_deadline),
        end_date: null, time: null, end_time: null, location: null,
        urgency: 'warning',
        visibility: ['officer', 'station'],
        member_ids: [],
        clickthrough: '/grants',
        icon: 'file-text',
        color: 'emerald',
      });
    }
  }
  return entries;
};
