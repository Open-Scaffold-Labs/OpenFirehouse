'use strict';
/**
 * seed-trainingPlans.js — Populate training_plans table.
 * Skips if already seeded.
 */

const { pool } = require('./db');

module.exports = async function seedTrainingPlans() {
  const result = await pool.query('SELECT COUNT(*) FROM training_plans WHERE station_id = $1', [1]);
  if (result.rows[0].count > 0) {
    console.log('Training plans seed: already seeded, skipping.');
    return;
  }

  const records = [
    {
      station_id: 1,
      title: '2026 Annual Compliance Training Plan',
      year: 2026,
      description: 'Mandatory annual training covering all required certifications, skills refreshers, and compliance hours for active members. Designed to meet or exceed NFPA 1001 and state requirements.',
      category: 'general',
      target_hours: 60,
      completed_hours: 12,
      objectives: JSON.stringify([
        'Meet NFPA 1001 firefighter requirements',
        'Annual certifications and renewals',
        'Skills validation and drills'
      ]),
      schedule: JSON.stringify([
        { month: 'January', event: 'SCBA annual fit test' },
        { month: 'March', event: 'Live fire training' },
        { month: 'June', event: 'Hazmat refresher' }
      ]),
      assigned_to: JSON.stringify(['All Active Members']),
      status: 'active',
      priority: 'high',
      created_by: 'Training Officer K. Osei',
    },
    {
      station_id: 1,
      title: '2026 Probationary Firefighter Program',
      year: 2026,
      description: 'Comprehensive 12-month program for new volunteer firefighters. Covers Firefighter I certification, apparatus operations, station procedures, and mentorship.',
      category: 'fire',
      target_hours: 120,
      completed_hours: 0,
      objectives: JSON.stringify([
        'Firefighter I certification completion',
        'Apparatus operations mastery',
        'Station integration and culture'
      ]),
      schedule: JSON.stringify([
        { month: 'January-May', event: 'Firefighter I Course (40 hours)' },
        { month: 'February-December', event: 'Apparatus orientation (16 hours)' },
        { month: 'Ongoing', event: 'Monthly live drills (20 hours)' }
      ]),
      assigned_to: JSON.stringify(['Probationary Members']),
      status: 'planned',
      priority: 'critical',
      created_by: 'Chief Sarah Chen',
    },
    {
      station_id: 1,
      title: '2026 EMS Training Track',
      year: 2026,
      description: 'Specialized EMS training for members pursuing EMT and paramedic certifications. CPR/AED refresher and field clinical skills.',
      category: 'ems',
      target_hours: 40,
      completed_hours: 0,
      objectives: JSON.stringify([
        'EMT-Basic certification renewal',
        'Advanced life support training',
        'Patient care protocol updates'
      ]),
      schedule: JSON.stringify([
        { month: 'March', event: 'CPR/AED recertification (4 hours)' },
        { month: 'April', event: 'EMT-Basic refresher (16 hours)' },
        { month: 'Ongoing', event: 'Clinical rotations' }
      ]),
      assigned_to: JSON.stringify(['Nathan McGee', 'Lisa Fontaine']),
      status: 'planned',
      priority: 'normal',
      created_by: 'Training Officer K. Osei',
    },
  ];

  let inserted = 0;
  for (const rec of records) {
    await pool.query(
      `INSERT INTO training_plans (station_id, title, year, description, category, target_hours, completed_hours, objectives, schedule, assigned_to, status, priority, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
       ON CONFLICT DO NOTHING`,
      [
        rec.station_id, rec.title, rec.year, rec.description, rec.category, rec.target_hours,
        rec.completed_hours, rec.objectives, rec.schedule, rec.assigned_to, rec.status,
        rec.priority, rec.created_by,
      ]
    );
    inserted++;
  }

  console.log(`Training plans seed complete: ${inserted} inserted.`);
};
