'use strict';
/**
 * seed-courses.js — Populate courses table with quoted column names.
 * Skips if already seeded.
 * NOTE: This table does NOT have a station_id column.
 * The attendees field is TEXT storing a JSON array string, NOT JSONB.
 */

const { pool } = require('./db');

module.exports = async function seedCourses() {
  const result = await pool.query('SELECT COUNT(*) FROM courses');
  if (result.rows[0].count > 0) {
    console.log('Courses seed: already seeded, skipping.');
    return;
  }

  const records = [
    {
      courseName: 'Firefighter I Certification Course',
      type: 'Certification',
      provider: 'NJ Fire Academy',
      startDate: '2026-03-16',
      endDate: '2026-05-30',
      location: 'NJ Fire Academy, Lakewood',
      certificationEarned: 'Firefighter I',
      certExpireYears: 5,
      cost: 1200,
      instructor: 'Chief Tom Bradley',
      attendees: JSON.stringify(['Sarah Chen', 'Nathan McGee']),
      notes: 'Full residential program. 120 hours instruction.',
    },
    {
      courseName: 'Hazmat Operations Training',
      type: 'Professional Development',
      provider: 'Regional Hazmat Center',
      startDate: '2026-04-01',
      endDate: '2026-04-15',
      location: 'Secaucus Regional Hazmat Center',
      certificationEarned: 'Hazmat Operations',
      certExpireYears: 3,
      cost: 800,
      instructor: 'Dr. Michael Patel',
      attendees: JSON.stringify(['Sandra Kim', 'Mike Harrington']),
      notes: 'Hands-on hazardous materials identification and response.',
    },
    {
      courseName: 'Driver Operator Certification - Engine',
      type: 'Certification',
      provider: 'NJ Fire Academy',
      startDate: '2026-02-01',
      endDate: '2026-03-14',
      location: 'Station 14, Maplewood',
      certificationEarned: 'Driver Operator - Engine',
      certExpireYears: 4,
      cost: 600,
      instructor: 'Lt. Sarah Chen',
      attendees: JSON.stringify(['Maria Delgado', 'Tracy Benson']),
      notes: 'Local training with state certification. Advanced pump operations.',
    },
    {
      courseName: 'EMS Refresher - BLS/ACLS',
      type: 'Certification Renewal',
      provider: 'American Heart Association',
      startDate: '2026-03-10',
      endDate: '2026-03-11',
      location: 'Station 14, Maplewood',
      certificationEarned: 'BLS/ACLS',
      certExpireYears: 2,
      cost: 150,
      instructor: 'Certified Instructor - Lisa Fontaine',
      attendees: JSON.stringify(['Lisa Fontaine', 'James Ortega']),
      notes: 'Annual recertification. In-station classroom and skills lab.',
    },
  ];

  let inserted = 0;
  for (const rec of records) {
    await pool.query(
      `INSERT INTO courses ("courseName", type, provider, "startDate", "endDate", location, "certificationEarned", "certExpireYears", cost, instructor, attendees, notes, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       ON CONFLICT DO NOTHING`,
      [
        rec.courseName, rec.type, rec.provider, rec.startDate, rec.endDate,
        rec.location, rec.certificationEarned, rec.certExpireYears, rec.cost,
        rec.instructor, rec.attendees, rec.notes,
      ]
    );
    inserted++;
  }

  console.log(`Courses seed complete: ${inserted} inserted.`);
};
