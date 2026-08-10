'use strict';
/**
 * fundraisingFeed.js — Calendar feed for fundraising campaign milestones.
 */
const { pool } = require('../db');

module.exports = async function fundraisingFeed(start, end, options) {
  const { rows } = await pool.query(`
    SELECT id, name AS title, start_date, end_date, status, goal_amount, raised_amount
    FROM fundraising_campaigns
    WHERE department_id = $3
      AND (start_date BETWEEN $1 AND $2
           OR end_date BETWEEN $1 AND $2)
    ORDER BY start_date
  `, [start, end, options.stationId]);

  const entries = [];
  const fmt = d => typeof d === 'string' ? d : d?.toISOString?.()?.slice(0, 10);

  for (const r of rows) {
    if (r.start_date && fmt(r.start_date) >= start && fmt(r.start_date) <= end) {
      entries.push({
        id: `fund-start-${r.id}`,
        source_module: 'fundraising',
        source_record_id: r.id,
        entry_type: 'event',
        category: 'finance',
        title: `Campaign Start — ${r.title || ''}`,
        subtitle: r.goal_amount ? `Goal: $${Number(r.goal_amount).toLocaleString()}` : '',
        date: fmt(r.start_date),
        end_date: null, time: null, end_time: null, location: null,
        urgency: 'info',
        visibility: ['all'],
        member_ids: [],
        clickthrough: '/fundraising',
        icon: 'heart-handshake',
        color: 'pink',
      });
    }
    if (r.end_date && fmt(r.end_date) >= start && fmt(r.end_date) <= end) {
      entries.push({
        id: `fund-end-${r.id}`,
        source_module: 'fundraising',
        source_record_id: r.id,
        entry_type: 'deadline',
        category: 'finance',
        title: `Campaign Ends — ${r.title || ''}`,
        subtitle: r.raised_amount ? `Raised: $${Number(r.raised_amount).toLocaleString()}` : '',
        date: fmt(r.end_date),
        end_date: null, time: null, end_time: null, location: null,
        urgency: 'warning',
        visibility: ['all'],
        member_ids: [],
        clickthrough: '/fundraising',
        icon: 'heart-handshake',
        color: 'pink',
      });
    }
  }
  return entries;
};
