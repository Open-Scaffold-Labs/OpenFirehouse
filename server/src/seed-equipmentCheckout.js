'use strict';
/**
 * seed-equipmentCheckout.js — Populate equipment_checkout table with sample data.
 * Covers multiple item types, conditions, statuses (checked out, returned, overdue).
 * Skips if already seeded.
 */

const { pool } = require('./db');

module.exports = async function seedEquipmentCheckout() {
  const result = await pool.query('SELECT COUNT(*) FROM equipment_checkout WHERE station_id = $1', [1]);
  if (result.rows[0].count > 0) {
    console.log('Equipment checkout seed: already seeded, skipping.');
    return;
  }

  // Dynamic member lookup
  const { rows: members } = await pool.query('SELECT id, name FROM members WHERE station_id = 1 ORDER BY id');
  if (members.length === 0) { console.log('Equipment checkout seed: no members found, skipping.'); return; }
  const m = (name) => { const found = members.find(r => r.name === name); return found ? found.id : null; };

  const records = [
    // Currently checked out items
    {
      station_id: 1,
      item_name: 'Portable Radio — Motorola APX 6000',
      item_type: 'portable_radio',
      serial_number: 'APX6K-2024-0147',
      asset_tag: 'RAD-014-07',
      checked_out_by: m('Nathan McGee'),
      checked_out_at: '2026-03-10T08:00:00Z',
      expected_return: '2026-03-17T08:00:00Z',
      returned_at: null,
      returned_to: null,
      condition_out: 'good',
      condition_in: null,
      purpose: 'Weekend duty coverage — portable radio for officer duty bag',
      notes: '',
      status: 'checked_out',
    },
    {
      station_id: 1,
      item_name: 'Thermal Imaging Camera — FLIR K55',
      item_type: 'thermal_imager',
      serial_number: 'FLIR-K55-2023-0892',
      asset_tag: 'TIC-014-02',
      checked_out_by: m('Maria Delgado'),
      checked_out_at: '2026-03-08T07:30:00Z',
      expected_return: '2026-03-08T14:00:00Z',
      returned_at: null,
      returned_to: null,
      condition_out: 'good',
      condition_in: null,
      purpose: 'Multi-agency MCI drill at Maplewood High School',
      notes: 'Signed out for drill use. Return to Engine 14 compartment after.',
      status: 'checked_out',
    },
    {
      station_id: 1,
      item_name: 'Department Laptop — Dell Latitude 5540',
      item_type: 'laptop',
      serial_number: 'DL5540-MFD-003',
      asset_tag: 'IT-014-03',
      checked_out_by: m('Sandra Kim'),
      checked_out_at: '2026-02-15T09:00:00Z',
      expected_return: '2026-03-01T09:00:00Z',
      returned_at: null,
      returned_to: null,
      condition_out: 'good',
      condition_in: null,
      purpose: 'AFG grant quarterly reporting — working from home',
      notes: 'OVERDUE — notified. Extended use approved verbally by Chief.',
      status: 'checked_out',
    },
    {
      station_id: 1,
      item_name: 'Gas Meter — MSA Altair 5X',
      item_type: 'gas_meter',
      serial_number: 'MSA5X-2024-0312',
      asset_tag: 'HAZ-014-04',
      checked_out_by: m('Carlos Ruiz'),
      checked_out_at: '2026-03-12T06:45:00Z',
      expected_return: '2026-03-12T18:00:00Z',
      returned_at: null,
      returned_to: null,
      condition_out: 'good',
      condition_in: null,
      purpose: 'Hazmat awareness class — demonstration unit',
      notes: 'Calibration current through April 2026.',
      status: 'checked_out',
    },
    {
      station_id: 1,
      item_name: 'Station Keys — Master Set',
      item_type: 'keys',
      serial_number: null,
      asset_tag: 'KEY-014-MASTER-02',
      checked_out_by: m('Mike Harrington'),
      checked_out_at: '2026-03-01T07:00:00Z',
      expected_return: '2026-03-31T23:59:00Z',
      returned_at: null,
      returned_to: null,
      condition_out: 'good',
      condition_in: null,
      purpose: 'March duty officer key set',
      notes: 'Monthly key rotation per SOG 500.02.',
      status: 'checked_out',
    },

    // Returned items
    {
      station_id: 1,
      item_name: 'AED Trainer — Philips HeartStart',
      item_type: 'aed',
      serial_number: 'PHS-TRAIN-2024-005',
      asset_tag: 'EMS-014-09',
      checked_out_by: m('Nathan McGee'),
      checked_out_at: '2026-01-28T08:00:00Z',
      expected_return: '2026-01-28T14:00:00Z',
      returned_at: '2026-01-28T13:30:00Z',
      returned_to: 'Maria Delgado',
      condition_out: 'good',
      condition_in: 'good',
      purpose: 'CPR/AED recertification class',
      notes: 'All pads and batteries accounted for on return.',
      status: 'returned',
    },
    {
      station_id: 1,
      item_name: 'Portable Radio — Motorola APX 6000',
      item_type: 'portable_radio',
      serial_number: 'APX6K-2024-0148',
      asset_tag: 'RAD-014-08',
      checked_out_by: m('James Ortega'),
      checked_out_at: '2026-02-20T08:00:00Z',
      expected_return: '2026-02-27T08:00:00Z',
      returned_at: '2026-02-27T07:45:00Z',
      returned_to: 'Mike Harrington',
      condition_out: 'good',
      condition_in: 'good',
      purpose: 'Duty shift coverage — personal radio assignment',
      notes: '',
      status: 'returned',
    },
    {
      station_id: 1,
      item_name: 'Digital Camera — Canon EOS R50',
      item_type: 'camera',
      serial_number: 'CAN-R50-2024-1103',
      asset_tag: 'IT-014-05',
      checked_out_by: m('Tracy Benson'),
      checked_out_at: '2026-02-08T06:00:00Z',
      expected_return: '2026-02-08T14:00:00Z',
      returned_at: '2026-02-08T13:00:00Z',
      returned_to: 'Sandra Kim',
      condition_out: 'good',
      condition_in: 'fair',
      purpose: 'Pancake breakfast event photography',
      notes: 'Minor scuff on lens cap. Otherwise fine. 342 photos taken — uploaded to department drive.',
      status: 'returned',
    },
    {
      station_id: 1,
      item_name: 'PPE Set — Spare Turnout Gear (Size L)',
      item_type: 'ppe_set',
      serial_number: null,
      asset_tag: 'PPE-014-SPARE-03',
      checked_out_by: m('Lisa Fontaine'),
      checked_out_at: '2026-02-11T17:00:00Z',
      expected_return: '2026-02-11T21:30:00Z',
      returned_at: '2026-02-11T21:15:00Z',
      returned_to: 'Maria Delgado',
      condition_out: 'good',
      condition_in: 'good',
      purpose: 'SCBA confidence course drill — spare set while primary gear cleaned',
      notes: 'Primary gear returned from cleaning on Feb 14.',
      status: 'returned',
    },
    {
      station_id: 1,
      item_name: 'Tablet — iPad Pro 12.9"',
      item_type: 'tablet',
      serial_number: 'IPAD-2024-MFD-002',
      asset_tag: 'IT-014-07',
      checked_out_by: m('Sarah Chen'),
      checked_out_at: '2026-01-21T07:30:00Z',
      expected_return: '2026-01-21T12:00:00Z',
      returned_at: '2026-01-21T12:15:00Z',
      returned_to: 'Sandra Kim',
      condition_out: 'good',
      condition_in: 'good',
      purpose: 'Annual apparatus inspection — digital checklist entry',
      notes: 'Used for state inspection documentation. All forms synced.',
      status: 'returned',
    },
  ];

  let inserted = 0;
  for (const rec of records) {
    if (!rec.checked_out_by) { console.warn(`  ⚠️  Skipping "${rec.item_name}": member not found`); continue; }
    await pool.query(
      `INSERT INTO equipment_checkout (station_id, item_name, item_type, serial_number, asset_tag, checked_out_by, checked_out_at, expected_return, returned_at, returned_to, condition_out, condition_in, purpose, notes, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [
        rec.station_id, rec.item_name, rec.item_type, rec.serial_number, rec.asset_tag,
        rec.checked_out_by, rec.checked_out_at, rec.expected_return, rec.returned_at,
        rec.returned_to, rec.condition_out, rec.condition_in, rec.purpose, rec.notes, rec.status,
      ]
    );
    inserted++;
  }

  console.log(`Equipment checkout seed complete: ${inserted} inserted.`);
};
