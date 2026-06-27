'use strict';
/**
 * seed-fillStations.js — Populate fill_stations table
 * Skips if already seeded.
 */

const { pool } = require('./db');

module.exports = async function seedFillStations() {
  const countResult = await pool.query('SELECT COUNT(*) FROM fill_stations WHERE station_id = $1', [1]);
  const count = parseInt(countResult.rows[0].count, 10);
  if (count > 0) { console.log('Fill stations seed: already seeded, skipping.'); return; }

  const SEED = [
    {
      station_id: 1,
      name: 'Main Station Compressor',
      location: 'Engine Bay 1 — Main Station',
      compressor_model: 'Nuvair NU-7000 Series',
      max_psi: 4500,
      last_service_date: '2026-02-15',
      next_service_date: '2026-08-15',
      status: 'operational',
      notes: 'Primary fill station for all SCBA cylinders. Capacity: 7000 PSI compressor with moisture separator.',
      created_at: new Date().toISOString(),
    },
    {
      station_id: 1,
      name: 'Backup Cascade System',
      location: 'Storage Area — Building 2',
      compressor_model: 'Cascade Bottle Bank — 3x 4500 PSI bottles',
      max_psi: 4500,
      last_service_date: '2026-01-20',
      next_service_date: '2026-07-20',
      status: 'operational',
      notes: 'Backup system for emergency fills. Manual regulation, bottle change-out required every 3-4 months.',
      created_at: new Date().toISOString(),
    },
  ];

  let inserted = 0;
  for (const row of SEED) {
    await pool.query(
      `INSERT INTO fill_stations (station_id, name, location, compressor_model, max_psi, last_service_date, next_service_date, status, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT DO NOTHING`,
      [
        row.station_id,
        row.name,
        row.location,
        row.compressor_model,
        row.max_psi,
        row.last_service_date,
        row.next_service_date,
        row.status,
        row.notes,
        row.created_at,
      ]
    );
    inserted++;
  }
  console.log(`Fill stations seed: ${inserted} stations inserted.`);
};
