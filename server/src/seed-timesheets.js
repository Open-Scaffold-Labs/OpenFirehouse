'use strict';
/**
 * seed-timesheets.js — Populate timesheets table
 * Schema: station_id, member_id, period_start, period_end, regular_hours, ot_hours,
 *         leave_hours, trade_hours, total_hours, flsa_period, status, approved_by,
 *         approved_at, notes, created_at
 * Looks up real member IDs to avoid FK violations.
 */

const { pool } = require('./db');

module.exports = async function seedTimesheets() {
  const countResult = await pool.query('SELECT COUNT(*) FROM timesheets WHERE station_id = $1', [1]);
  const count = parseInt(countResult.rows[0].count, 10);
  if (count > 0) { console.log('Timesheets seed: already seeded, skipping.'); return; }

  // Look up actual member IDs
  const { rows: members } = await pool.query('SELECT id FROM members WHERE station_id = 1 ORDER BY id LIMIT 4');
  if (members.length < 2) { console.log('Timesheets seed: not enough members, skipping.'); return; }
  const mid = (idx) => members[Math.min(idx, members.length - 1)].id;

  const SEED = [
    {
      mIdx: 0, period_start: '2026-02-23', period_end: '2026-03-08',
      regular_hours: 80, ot_hours: 4, leave_hours: 0, trade_hours: 0, total_hours: 84,
      flsa_period: '2026-Q1-P2', status: 'approved', approved_by: 'Sarah Chen',
      approved_at: '2026-03-09T12:00:00Z', notes: '',
    },
    {
      mIdx: 1, period_start: '2026-02-23', period_end: '2026-03-08',
      regular_hours: 80, ot_hours: 6, leave_hours: 0, trade_hours: 2, total_hours: 88,
      flsa_period: '2026-Q1-P2', status: 'approved', approved_by: 'Nathan McGee',
      approved_at: '2026-03-09T14:00:00Z', notes: '',
    },
    {
      mIdx: 2, period_start: '2026-02-23', period_end: '2026-03-08',
      regular_hours: 80, ot_hours: 3, leave_hours: 8, trade_hours: 0, total_hours: 91,
      flsa_period: '2026-Q1-P2', status: 'submitted', approved_by: '',
      approved_at: null, notes: 'Pending officer review',
    },
    {
      mIdx: 3, period_start: '2026-02-23', period_end: '2026-03-08',
      regular_hours: 80, ot_hours: 8, leave_hours: 0, trade_hours: 0, total_hours: 88,
      flsa_period: '2026-Q1-P2', status: 'draft', approved_by: '',
      approved_at: null, notes: '',
    },
  ];

  let inserted = 0;
  for (const row of SEED) {
    await pool.query(
      `INSERT INTO timesheets (station_id, member_id, period_start, period_end, regular_hours, ot_hours, leave_hours, trade_hours, total_hours, flsa_period, status, approved_by, approved_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT DO NOTHING`,
      [1, mid(row.mIdx), row.period_start, row.period_end, row.regular_hours, row.ot_hours, row.leave_hours, row.trade_hours, row.total_hours, row.flsa_period, row.status, row.approved_by, row.approved_at, row.notes]
    );
    inserted++;
  }
  console.log(`Timesheets seed: ${inserted} timesheets inserted.`);
};
