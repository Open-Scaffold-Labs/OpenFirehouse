'use strict';
/**
 * seed-cadets.js — Populate cadets table.
 * Skips if already seeded.
 */

const { pool } = require('./db');

module.exports = async function seedCadets() {
  const result = await pool.query('SELECT COUNT(*) FROM cadets WHERE station_id = $1', [1]);
  if (result.rows[0].count > 0) {
    console.log('Cadets seed: already seeded, skipping.');
    return;
  }

  const records = [
    {
      station_id: 1,
      name: 'Michael Santoro',
      date_of_birth: '2009-06-15',
      parent_guardian: 'Anthony Santoro',
      parent_phone: '973-555-0142',
      parent_email: 'asantoro@email.com',
      school: 'Maplewood High School',
      enrolled_date: '2025-09-01',
      status: 'Active',
      rank: 'Cadet',
      notes: 'Strong interest in apparatus operations. Completing Cadet Firefighter I prerequisites.',
      certifications: JSON.stringify([]),
      training_hours: 24,
    },
    {
      station_id: 1,
      name: 'Jessica Chen',
      date_of_birth: '2008-11-22',
      parent_guardian: 'Sarah Chen',
      parent_phone: '973-555-0156',
      parent_email: 'schen@email.com',
      school: 'Maplewood High School',
      enrolled_date: '2025-09-01',
      status: 'Active',
      rank: 'Senior Cadet',
      notes: 'Family member of Chief Chen. Excellent attendance and dedication. Eligible for probationary membership at 18.',
      certifications: JSON.stringify(['CPR/AED', 'First Aid']),
      training_hours: 52,
    },
    {
      station_id: 1,
      name: 'David Chen',
      date_of_birth: '2009-03-08',
      parent_guardian: 'Wei Chen',
      parent_phone: '973-555-0163',
      parent_email: 'wchen@email.com',
      school: 'Maplewood High School',
      enrolled_date: '2025-10-15',
      status: 'Active',
      rank: 'Cadet',
      notes: 'Recent transfer student. Enrolled mid-year. Academically strong.',
      certifications: JSON.stringify([]),
      training_hours: 14,
    },
    {
      station_id: 1,
      name: 'Aisha Williams',
      date_of_birth: '2010-01-30',
      parent_guardian: 'Denise Williams',
      parent_phone: '973-555-0178',
      parent_email: 'dwilliams@email.com',
      school: 'Maplewood Middle School',
      enrolled_date: '2026-01-15',
      status: 'Active',
      rank: 'Junior Cadet',
      notes: 'Youngest cadet in program. Attended Truck Day 2025 and was inspired to join. Very enthusiastic.',
      certifications: JSON.stringify([]),
      training_hours: 6,
    },
    {
      station_id: 1,
      name: 'Ryan Fitzgerald',
      date_of_birth: '2008-05-12',
      parent_guardian: 'Colleen Fitzgerald',
      parent_phone: '973-555-0191',
      parent_email: 'cfitzgerald@email.com',
      school: 'St. Joseph Regional',
      enrolled_date: '2025-09-01',
      status: 'Inactive',
      rank: 'Cadet',
      notes: 'Withdrew from program in January 2026 due to varsity sports schedule conflict. Plans to return in summer.',
      certifications: JSON.stringify(['CPR/AED']),
      training_hours: 18,
    },
    {
      station_id: 1,
      name: 'Sophia Martinez',
      date_of_birth: '2008-09-04',
      parent_guardian: 'Carlos Martinez',
      parent_phone: '973-555-0204',
      parent_email: 'cmartinez@email.com',
      school: 'Maplewood High School',
      enrolled_date: '2024-09-01',
      status: 'Graduated',
      rank: 'Senior Cadet',
      notes: 'Completed cadet program. Turned 18 in September 2026. Applied for probationary membership — accepted. Now MVF-025.',
      certifications: JSON.stringify(['CPR/AED', 'First Aid', 'CERT Basic']),
      training_hours: 96,
    },
  ];

  let inserted = 0;
  for (const rec of records) {
    await pool.query(
      `INSERT INTO cadets (station_id, name, date_of_birth, parent_guardian, parent_phone, parent_email, school, enrolled_date, status, rank, notes, certifications, training_hours, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
       ON CONFLICT DO NOTHING`,
      [
        rec.station_id, rec.name, rec.date_of_birth, rec.parent_guardian, rec.parent_phone,
        rec.parent_email, rec.school, rec.enrolled_date, rec.status, rec.rank, rec.notes,
        rec.certifications, rec.training_hours,
      ]
    );
    inserted++;
  }

  console.log(`Cadets seed complete: ${inserted} inserted.`);
};
