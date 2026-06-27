'use strict';
/**
 * seed-shiftPatterns.js — Populate shift_patterns table
 * Schema uses camelCase quoted columns:
 *   name, "shiftType", "startDate", "endDate", "repeatRule", "repeatDays",
 *   "memberIds", "minCrew", "isActive", notes, station_id
 * Skips if already seeded.
 */

const { pool } = require('./db');

module.exports = async function seedShiftPatterns() {
  const countResult = await pool.query('SELECT COUNT(*) FROM shift_patterns WHERE station_id = $1', [1]);
  const count = parseInt(countResult.rows[0].count, 10);
  if (count > 0) { console.log('Shift patterns seed: already seeded, skipping.'); return; }

  const SEED = [
    {
      name: '24/48 Rotation',
      shiftType: '24-hour',
      startDate: '2026-01-01',
      endDate: null,
      repeatRule: 'custom',
      repeatDays: JSON.stringify([1, 2, 3]),
      memberIds: JSON.stringify([]),
      minCrew: 4,
      isActive: true,
      notes: 'Standard 24 hours on, 48 hours off rotation. Typical career schedule.',
    },
    {
      name: 'Kelly Schedule',
      shiftType: '24-hour',
      startDate: '2026-02-01',
      endDate: null,
      repeatRule: 'custom',
      repeatDays: JSON.stringify([1, 2, 3, 4, 5, 6]),
      memberIds: JSON.stringify([]),
      minCrew: 3,
      isActive: true,
      notes: '24 on, 24 off, 24 on, 24 off, 24 on, then 96 off. Balances coverage with longer breaks.',
    },
  ];

  let inserted = 0;
  for (const row of SEED) {
    await pool.query(
      `INSERT INTO shift_patterns (station_id, name, "shiftType", "startDate", "endDate", "repeatRule", "repeatDays", "memberIds", "minCrew", "isActive", notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT DO NOTHING`,
      [1, row.name, row.shiftType, row.startDate, row.endDate, row.repeatRule, row.repeatDays, row.memberIds, row.minCrew, row.isActive, row.notes]
    );
    inserted++;
  }
  console.log(`Shift patterns seed: ${inserted} patterns inserted.`);
};
