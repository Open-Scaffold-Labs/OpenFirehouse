'use strict';
/**
 * seed-exposureRecords.js — Populate exposure_records table.
 * Uses null-safe dynamic member lookups.
 */

const { pool } = require('./db');

module.exports = async function seedExposureRecords() {
  const result = await pool.query('SELECT COUNT(*) FROM exposure_records WHERE station_id = $1', [1]);
  if (parseInt(result.rows[0].count) > 0) {
    console.log('Exposure records seed: already seeded, skipping.');
    return;
  }

  const { rows: members } = await pool.query('SELECT id, name FROM members WHERE station_id = 1 ORDER BY id');
  if (members.length === 0) { console.log('Exposure records seed: no members found, skipping.'); return; }
  const m = (name) => { const found = members.find(r => r.name === name); return found ? found.id : null; };

  // Get incident IDs if available
  const { rows: incidents } = await pool.query('SELECT id FROM incidents WHERE station_id = 1 ORDER BY id LIMIT 5');

  const records = [
    {
      member_id: m('Sarah Chen'),
      incident_id: incidents[0]?.id || null,
      exposure_date: '2026-02-28',
      exposure_type: 'smoke_inhalation',
      substance: 'Combustion products / wood and synthetic materials',
      duration_minutes: 45,
      ppe_worn: JSON.stringify(['SCBA', 'Structural gear', 'Gloves', 'Helmet']),
      symptoms: 'Mild cough post-incident. Resolved within 2 hours.',
      medical_followup: false,
      followup_date: '',
      followup_notes: '',
      reported_by: 'Sarah Chen',
      status: 'cleared',
    },
    {
      member_id: m('Maria Delgado'),
      incident_id: incidents[1]?.id || null,
      exposure_date: '2026-03-05',
      exposure_type: 'chemical_exposure',
      substance: 'Vehicle fluids (gasoline, coolant, hydraulic fluid)',
      duration_minutes: 20,
      ppe_worn: JSON.stringify(['Nitrile gloves', 'Structural gear', 'Helmet']),
      symptoms: 'Skin irritation on contact area. Decontamination performed.',
      medical_followup: false,
      followup_date: '',
      followup_notes: '',
      reported_by: 'Maria Delgado',
      status: 'cleared',
    },
    {
      member_id: m('Nathan McGee'),
      incident_id: incidents[2]?.id || null,
      exposure_date: '2026-03-01',
      exposure_type: 'bloodborne_pathogen',
      substance: 'Blood and body fluids',
      duration_minutes: 10,
      ppe_worn: JSON.stringify(['Nitrile gloves', 'Face shield', 'Gown']),
      symptoms: 'No immediate symptoms. Baseline established for tracking.',
      medical_followup: true,
      followup_date: '2026-03-15',
      followup_notes: 'Serology at 6 weeks and 3 months pending.',
      reported_by: 'Nathan McGee',
      status: 'monitoring',
    },
    {
      member_id: m('Sandra Kim'),
      incident_id: incidents[3]?.id || null,
      exposure_date: '2026-02-10',
      exposure_type: 'smoke_inhalation',
      substance: 'Heavy smoke from vehicle fire — tractor-trailer fuel vapors',
      duration_minutes: 60,
      ppe_worn: JSON.stringify(['SCBA', 'Structural gear', 'Helmet', 'Gloves']),
      symptoms: 'Throat irritation noted post-incident. Monitored for 2 hours. Resolved.',
      medical_followup: false,
      followup_date: '',
      followup_notes: '',
      reported_by: 'Sandra Kim',
      status: 'cleared',
    },
    {
      member_id: m('James Ortega'),
      incident_id: incidents[4]?.id || null,
      exposure_date: '2026-03-08',
      exposure_type: 'chemical_exposure',
      substance: 'Natural gas — potential mercaptan odor exposure',
      duration_minutes: 15,
      ppe_worn: JSON.stringify(['Half-mask respirator', 'Structural gear', 'Helmet']),
      symptoms: 'Transient eye irritation. No respiratory symptoms.',
      medical_followup: false,
      followup_date: '',
      followup_notes: '',
      reported_by: 'Nathan McGee',
      status: 'cleared',
    },
    {
      member_id: m('Lisa Fontaine'),
      incident_id: incidents[2]?.id || null,
      exposure_date: '2026-03-01',
      exposure_type: 'bloodborne_pathogen',
      substance: 'Blood exposure during patient care',
      duration_minutes: 8,
      ppe_worn: JSON.stringify(['Double nitrile gloves', 'Face shield', 'Surgical gown', 'Helmet']),
      symptoms: 'Possible needle stick injury to left thumb during transport. Immediately reported.',
      medical_followup: true,
      followup_date: '2026-03-08',
      followup_notes: 'Baseline bloodwork completed. Follow-up serology scheduled at 6 weeks.',
      reported_by: 'Lisa Fontaine',
      status: 'monitoring',
    },
  ];

  let inserted = 0;
  for (const rec of records) {
    if (!rec.member_id) { console.warn('  ⚠️  Skipping exposure record: member not found'); continue; }
    await pool.query(
      `INSERT INTO exposure_records (member_id, station_id, incident_id, exposure_date, exposure_type, substance, duration_minutes, ppe_worn, symptoms, medical_followup, followup_date, followup_notes, reported_by, status, created_at)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
       ON CONFLICT DO NOTHING`,
      [
        rec.member_id, rec.incident_id, rec.exposure_date, rec.exposure_type,
        rec.substance, rec.duration_minutes, rec.ppe_worn, rec.symptoms, rec.medical_followup,
        rec.followup_date, rec.followup_notes, rec.reported_by, rec.status,
      ]
    );
    inserted++;
  }

  console.log(`Exposure records seed complete: ${inserted} inserted.`);
};
