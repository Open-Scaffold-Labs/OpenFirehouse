'use strict';
/**
 * seed-apparatusOOS.js — Populate apparatus_oos table.
 * Skips if already seeded.
 */

const { pool } = require('./db');

module.exports = async function seedApparatusOOS() {
  const result = await pool.query('SELECT COUNT(*) FROM apparatus_oos WHERE station_id = $1', [1]);
  if (result.rows[0].count > 0) {
    console.log('Apparatus OOS seed: already seeded, skipping.');
    return;
  }

  const records = [
    {
      station_id: 1,
      apparatus_id: 3,
      reason: 'Scheduled annual inspection and preventive maintenance',
      oos_type: 'scheduled',
      start_date: '2026-02-10',
      end_date: '2026-02-15',
      estimated_return: '2026-02-15',
      impact_level: 'low',
      coverage_plan: 'Engine 2 backfill available',
      reported_by: 'Lt. Maria Santos',
      status: 'resolved',
      notes: 'Returned to service 2026-02-15. All inspections passed. New batteries installed. Pump certified.',
    },
    {
      station_id: 1,
      apparatus_id: 5,
      reason: 'Engine overheating issue — cooling system repair required',
      oos_type: 'mechanical',
      start_date: '2026-03-10',
      end_date: null,
      estimated_return: '2026-03-20',
      impact_level: 'moderate',
      coverage_plan: 'Tanker 2 on standby for water supply operations',
      reported_by: 'Chief Sarah Chen',
      status: 'active',
      notes: 'Thermostat and radiator replacement in progress at certified dealer. Parts on order. Estimated completion 2026-03-19.',
    },
  ];

  let inserted = 0;
  for (const rec of records) {
    await pool.query(
      `INSERT INTO apparatus_oos (station_id, apparatus_id, reason, oos_type, start_date, end_date, estimated_return, impact_level, coverage_plan, reported_by, status, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       ON CONFLICT DO NOTHING`,
      [
        rec.station_id, rec.apparatus_id, rec.reason, rec.oos_type, rec.start_date,
        rec.end_date, rec.estimated_return, rec.impact_level, rec.coverage_plan,
        rec.reported_by, rec.status, rec.notes,
      ]
    );
    inserted++;
  }

  console.log(`Apparatus OOS seed complete: ${inserted} inserted.`);
};
