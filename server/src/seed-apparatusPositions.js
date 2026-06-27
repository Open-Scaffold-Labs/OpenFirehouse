'use strict';
/**
 * seed-apparatusPositions.js — Populate apparatus_positions table.
 * Defines the required crew positions for each apparatus type.
 * Uses actual apparatus designations from the DB (Engine 1, Ladder 1, etc.)
 */

const { pool } = require('./db');

module.exports = async function seedApparatusPositions() {
  const { rows } = await pool.query('SELECT COUNT(*) FROM apparatus_positions WHERE station_id = $1', [1]);
  if (parseInt(rows[0].count) > 0) {
    console.log('Apparatus positions seed: already seeded, skipping.');
    return;
  }

  // Column is "designation", not "name"
  const { rows: appRows } = await pool.query('SELECT id, designation, type FROM apparatus WHERE station_id = $1 ORDER BY id', [1]);
  if (appRows.length === 0) {
    console.log('Apparatus positions seed: no apparatus found, skipping.');
    return;
  }

  const appMap = {};
  for (const a of appRows) {
    appMap[a.designation] = a.id;
  }

  // required_certs hold CANONICAL CERT CODES (constants/certs.js) — the staffing
  // scorer matches code-to-code against member_qualifications.cert_type.
  const positions = [
    { apparatus: 'Engine 1', position_name: 'Driver/Engineer', required_certs: JSON.stringify(['driver_operator_pumper', 'cdl_b']), min_rank: 'Engineer', sort_order: 1 },
    { apparatus: 'Engine 1', position_name: 'Officer', required_certs: JSON.stringify(['fire_officer_1']), min_rank: 'Lieutenant', sort_order: 2 },
    { apparatus: 'Engine 1', position_name: 'Nozzle', required_certs: JSON.stringify(['firefighter_2', 'interior_qualified']), min_rank: 'Firefighter', sort_order: 3 },
    { apparatus: 'Engine 1', position_name: 'Backup/Utility', required_certs: JSON.stringify(['firefighter_1']), min_rank: 'Firefighter', sort_order: 4 },

    { apparatus: 'Engine 2', position_name: 'Driver/Engineer', required_certs: JSON.stringify(['driver_operator_pumper', 'cdl_b']), min_rank: 'Engineer', sort_order: 1 },
    { apparatus: 'Engine 2', position_name: 'Officer', required_certs: JSON.stringify(['fire_officer_1']), min_rank: 'Lieutenant', sort_order: 2 },
    { apparatus: 'Engine 2', position_name: 'Nozzle', required_certs: JSON.stringify(['firefighter_2']), min_rank: 'Firefighter', sort_order: 3 },

    { apparatus: 'Ladder 1', position_name: 'Driver/Engineer', required_certs: JSON.stringify(['driver_operator_aerial', 'cdl_b']), min_rank: 'Engineer', sort_order: 1 },
    { apparatus: 'Ladder 1', position_name: 'Officer', required_certs: JSON.stringify(['fire_officer_1']), min_rank: 'Lieutenant', sort_order: 2 },
    { apparatus: 'Ladder 1', position_name: 'Outside Vent/Forcible Entry', required_certs: JSON.stringify(['firefighter_2', 'forcible_entry']), min_rank: 'Firefighter', sort_order: 3 },
    { apparatus: 'Ladder 1', position_name: 'Roof/Search', required_certs: JSON.stringify(['firefighter_2']), min_rank: 'Firefighter', sort_order: 4 },

    { apparatus: 'Rescue 1', position_name: 'Driver/Engineer', required_certs: JSON.stringify(['driver_operator_pumper', 'cdl_b']), min_rank: 'Engineer', sort_order: 1 },
    { apparatus: 'Rescue 1', position_name: 'Officer', required_certs: JSON.stringify(['fire_officer_1', 'tech_rescue_awareness']), min_rank: 'Lieutenant', sort_order: 2 },
    { apparatus: 'Rescue 1', position_name: 'Rescue Tech', required_certs: JSON.stringify(['tech_rescue_operations', 'confined_space_rescue']), min_rank: 'Firefighter', sort_order: 3 },

    { apparatus: 'Medic 1', position_name: 'Driver/Attendant', required_certs: JSON.stringify(['emt_basic', 'evoc']), min_rank: 'Firefighter', sort_order: 1 },
    { apparatus: 'Medic 1', position_name: 'Paramedic', required_certs: JSON.stringify(['paramedic', 'acls', 'pals']), min_rank: 'Firefighter', sort_order: 2 },

    { apparatus: 'Tanker 1', position_name: 'Driver/Engineer', required_certs: JSON.stringify(['driver_operator_tanker', 'cdl_b']), min_rank: 'Engineer', sort_order: 1 },
    { apparatus: 'Tanker 1', position_name: 'Pump Operator', required_certs: JSON.stringify(['driver_operator_pumper']), min_rank: 'Firefighter', sort_order: 2 },

    { apparatus: 'Utility 1', position_name: 'Battalion Chief', required_certs: JSON.stringify(['fire_officer_2', 'incident_safety_officer']), min_rank: 'Chief', sort_order: 1 },
  ];

  let inserted = 0;
  for (const pos of positions) {
    const appId = appMap[pos.apparatus];
    if (!appId) { console.warn(`  ⚠️  Apparatus "${pos.apparatus}" not found, skipping`); continue; }

    await pool.query(
      `INSERT INTO apparatus_positions (station_id, apparatus_id, position_name, required_certs, min_rank, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [1, appId, pos.position_name, pos.required_certs, pos.min_rank, pos.sort_order]
    );
    inserted++;
  }

  console.log(`Apparatus positions seed complete: ${inserted} inserted.`);
};
