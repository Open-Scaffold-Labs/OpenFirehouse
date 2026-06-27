'use strict';
/**
 * seed-otRecords.js — Populate ot_records table
 * Schema: member_id, station_id, shift_id, ot_date, ot_hours, ot_type, reason, created_at
 * Looks up real member IDs to avoid FK violations.
 */

const { pool } = require('./db');

module.exports = async function seedOTRecords() {
  const countResult = await pool.query('SELECT COUNT(*) FROM ot_records WHERE station_id = $1', [1]);
  const count = parseInt(countResult.rows[0].count, 10);
  if (count > 0) { console.log('OT records seed: already seeded, skipping.'); return; }

  // Look up actual member IDs for station 1
  const { rows: members } = await pool.query('SELECT id FROM members WHERE station_id = 1 ORDER BY id LIMIT 6');
  if (members.length < 2) { console.log('OT records seed: not enough members, skipping.'); return; }

  const mid = (idx) => members[Math.min(idx, members.length - 1)].id;

  const SEED = [
    { mIdx: 0, ot_date: '2026-02-28', ot_hours: 4, ot_type: 'callback', reason: 'Structure fire with extended operations — 2-alarm incident' },
    { mIdx: 1, ot_date: '2026-02-20', ot_hours: 6, ot_type: 'holdover', reason: 'Day shift holdover — cover for member on sick leave' },
    { mIdx: 2, ot_date: '2026-03-05', ot_hours: 3, ot_type: 'mandatory', reason: 'Community event — County Fire Academy open house' },
    { mIdx: 3, ot_date: '2026-03-08', ot_hours: 8, ot_type: 'callback', reason: 'Multi-vehicle accident with injuries — Route 14 corridor' },
    { mIdx: 4, ot_date: '2026-03-10', ot_hours: 2, ot_type: 'mandatory', reason: 'Training — SCBA refresher certification' },
    { mIdx: 5, ot_date: '2026-03-12', ot_hours: 5, ot_type: 'holdover', reason: 'Mutual aid — neighboring department multi-structure fire' },
    { mIdx: 0, ot_date: '2026-02-10', ot_hours: 3, ot_type: 'callback', reason: 'Vehicle fire (tractor-trailer) — extended suppression and cleanup' },
    { mIdx: 1, ot_date: '2026-03-02', ot_hours: 4, ot_type: 'administrative', reason: 'Administrative review and incident report writing' },
    { mIdx: 2, ot_date: '2026-02-15', ot_hours: 6, ot_type: 'training', reason: 'Advanced life support training and recertification' },
    { mIdx: 3, ot_date: '2026-03-18', ot_hours: 2, ot_type: 'mandatory', reason: 'Equipment inventory and annual inspection' },
    { mIdx: 4, ot_date: '2026-03-20', ot_hours: 7, ot_type: 'callback', reason: 'Structure fire (bedroom fire with entrapment) — search and rescue operations' },
    { mIdx: 5, ot_date: '2026-02-25', ot_hours: 3, ot_type: 'callback', reason: 'False alarm response — steam in commercial kitchen' },
  ];

  let inserted = 0;
  for (const row of SEED) {
    await pool.query(
      `INSERT INTO ot_records (member_id, station_id, ot_date, ot_hours, ot_type, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [mid(row.mIdx), 1, row.ot_date, row.ot_hours, row.ot_type, row.reason]
    );
    inserted++;
  }
  console.log(`OT records seed: ${inserted} records inserted.`);
};
