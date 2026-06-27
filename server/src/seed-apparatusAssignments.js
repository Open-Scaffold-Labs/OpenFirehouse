'use strict';
/**
 * seed-apparatusAssignments.js — Populate apparatus_assignments table.
 * Uses dynamic member/shift/apparatus lookups with null safety.
 */

const { pool } = require('./db');

module.exports = async function seedApparatusAssignments() {
  const result = await pool.query('SELECT COUNT(*) FROM apparatus_assignments WHERE station_id = $1', [1]);
  if (parseInt(result.rows[0].count) > 0) {
    console.log('Apparatus assignments seed: already seeded, skipping.');
    return;
  }

  // Get shifts
  const { rows: shifts } = await pool.query('SELECT id FROM shifts WHERE station_id = $1 ORDER BY id LIMIT 4', [1]);
  if (shifts.length === 0) { console.log('Apparatus assignments seed: no shifts found, skipping.'); return; }

  // Get members by name
  const { rows: members } = await pool.query('SELECT id, name FROM members WHERE station_id = 1 ORDER BY id');
  if (members.length === 0) { console.log('Apparatus assignments seed: no members found, skipping.'); return; }
  const m = (name) => { const found = members.find(r => r.name === name); return found ? found.id : null; };

  // Get apparatus by designation
  const { rows: apparatus } = await pool.query('SELECT id, designation FROM apparatus WHERE station_id = 1 ORDER BY id');
  const a = (des) => { const found = apparatus.find(r => r.designation === des); return found ? found.id : null; };

  const records = [
    { shift_id: shifts[0]?.id, apparatus_id: a('Engine 1'), member_id: m('Sarah Chen'),     position_name: 'Officer' },
    { shift_id: shifts[0]?.id, apparatus_id: a('Engine 1'), member_id: m('Kevin Marsh'),     position_name: 'Driver/Engineer' },
    { shift_id: shifts[0]?.id, apparatus_id: a('Engine 1'), member_id: m('James Ortega'),    position_name: 'Nozzle' },
    { shift_id: shifts[0]?.id, apparatus_id: a('Ladder 1'), member_id: m('Maria Delgado'),   position_name: 'Officer' },
    { shift_id: shifts[0]?.id, apparatus_id: a('Ladder 1'), member_id: m('Diane Tolliver'),  position_name: 'Driver/Engineer' },
    { shift_id: shifts[0]?.id, apparatus_id: a('Rescue 1'), member_id: m('Nathan McGee'),    position_name: 'Officer' },
    { shift_id: shifts[0]?.id, apparatus_id: a('Rescue 1'), member_id: m('Mike Harrington'), position_name: 'Rescue Tech' },
    { shift_id: shifts[0]?.id, apparatus_id: a('Medic 1'),  member_id: m('Lisa Fontaine'),   position_name: 'Paramedic' },
    { shift_id: shifts[0]?.id, apparatus_id: a('Medic 1'),  member_id: m('Tracy Benson'),    position_name: 'Driver/Attendant' },
  ];

  let inserted = 0;
  for (const rec of records) {
    if (!rec.shift_id || !rec.apparatus_id || !rec.member_id) {
      console.warn(`  ⚠️  Skipping assignment: missing shift/apparatus/member for "${rec.position_name}"`);
      continue;
    }
    await pool.query(
      `INSERT INTO apparatus_assignments (shift_id, apparatus_id, position_id, member_id, station_id, position_name, created_at)
       VALUES ($1, $2, NULL, $3, 1, $4, NOW()) ON CONFLICT DO NOTHING`,
      [rec.shift_id, rec.apparatus_id, rec.member_id, rec.position_name]
    );
    inserted++;
  }

  console.log(`Apparatus assignments seed complete: ${inserted} inserted.`);
};
