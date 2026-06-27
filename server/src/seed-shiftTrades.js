'use strict';
/**
 * seed-shiftTrades.js — Populate shift_trades table
 * Schema: requesting_member_id, covering_member_id, original_shift_id (FK→shifts),
 *         payback_shift_id, trade_date, payback_date, status, ot_impact_hours,
 *         flsa_period_hours_requester, flsa_period_hours_coverer, notes, approved_by
 * Looks up real member IDs and shift IDs to avoid FK violations.
 */

const { pool } = require('./db');

module.exports = async function seedShiftTrades() {
  const countResult = await pool.query('SELECT COUNT(*) FROM shift_trades WHERE station_id = $1', [1]);
  const count = parseInt(countResult.rows[0].count, 10);
  if (count > 0) { console.log('Shift trades seed: already seeded, skipping.'); return; }

  // Look up actual member IDs
  const { rows: members } = await pool.query('SELECT id FROM members WHERE station_id = 1 ORDER BY id LIMIT 6');
  if (members.length < 4) { console.log('Shift trades seed: not enough members, skipping.'); return; }
  const mid = (idx) => members[Math.min(idx, members.length - 1)].id;

  // Look up actual shift IDs
  const { rows: shifts } = await pool.query('SELECT id FROM shifts WHERE station_id = 1 ORDER BY id LIMIT 3');
  if (shifts.length < 1) { console.log('Shift trades seed: no shifts found, skipping.'); return; }
  const sid = (idx) => shifts[Math.min(idx, shifts.length - 1)].id;

  const SEED = [
    {
      requesting_mIdx: 0, covering_mIdx: 2, original_shift_idx: 0, payback_shift_idx: 1,
      trade_date: '2026-03-15', payback_date: '2026-03-22',
      status: 'completed', notes: 'Personal commitment on 3/15 — covering 3/22 to compensate',
      approved_by: 'Sarah Chen',
    },
    {
      requesting_mIdx: 1, covering_mIdx: 3, original_shift_idx: 1, payback_shift_idx: 2,
      trade_date: '2026-04-10', payback_date: '2026-04-17',
      status: 'approved', notes: 'Doctor appointment — unable to reschedule',
      approved_by: 'Nathan McGee',
    },
    {
      requesting_mIdx: 4, covering_mIdx: 5, original_shift_idx: 2, payback_shift_idx: null,
      trade_date: '2026-03-20', payback_date: '',
      status: 'pending', notes: 'Family event — mutual agreement between members',
      approved_by: '',
    },
    {
      requesting_mIdx: 2, covering_mIdx: 1, original_shift_idx: 0, payback_shift_idx: null,
      trade_date: '2026-04-05', payback_date: '',
      status: 'denied', notes: 'Request denied — minimum staffing requirement not met for proposed date',
      approved_by: 'Nathan McGee',
    },
    {
      requesting_mIdx: 3, covering_mIdx: 4, original_shift_idx: 1, payback_shift_idx: null,
      trade_date: '2026-03-25', payback_date: '',
      status: 'cancelled', notes: 'Trade cancelled by mutual agreement — covering member unable to cover due to illness',
      approved_by: 'Sarah Chen',
    },
    {
      requesting_mIdx: 5, covering_mIdx: 0, original_shift_idx: 2, payback_shift_idx: null,
      trade_date: '2026-03-18', payback_date: '',
      status: 'completed', notes: 'Emergency coverage trade — emergency mutual aid response required for request shift',
      approved_by: 'Nathan McGee',
    },
    {
      requesting_mIdx: 1, covering_mIdx: 4, original_shift_idx: 0, payback_shift_idx: 2,
      trade_date: '2026-07-04', payback_date: '2026-07-11',
      status: 'approved', notes: 'Holiday shift swap for Independence Day — member on vacation, covering payback before summer',
      approved_by: 'Sarah Chen',
    },
    {
      requesting_mIdx: 3, covering_mIdx: 5, original_shift_idx: 1, payback_shift_idx: null,
      trade_date: '2026-02-14', payback_date: '2026-02-21',
      status: 'completed', notes: 'Payback shift completed — member fulfilled earlier trade obligation satisfactorily',
      approved_by: 'Nathan McGee',
    },
  ];

  let inserted = 0;
  for (const row of SEED) {
    await pool.query(
      `INSERT INTO shift_trades (station_id, requesting_member_id, covering_member_id, original_shift_id, payback_shift_id, trade_date, payback_date, status, notes, approved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT DO NOTHING`,
      [
        1,
        mid(row.requesting_mIdx),
        mid(row.covering_mIdx),
        sid(row.original_shift_idx),
        row.payback_shift_idx !== null ? sid(row.payback_shift_idx) : null,
        row.trade_date,
        row.payback_date,
        row.status,
        row.notes,
        row.approved_by,
      ]
    );
    inserted++;
  }
  console.log(`Shift trades seed: ${inserted} trades inserted.`);
};
