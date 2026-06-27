'use strict';
/**
 * seed-volunteerHours.js — Populate volunteer hours with dynamic member lookups.
 * Covers all 12 members with realistic activities across Q1 2026.
 */

const { pool } = require('./db');

module.exports = async function seedVolunteerHours() {
  // Check if already seeded
  const check = await pool.query('SELECT COUNT(*) FROM volunteer_hours WHERE station_id = 1');
  if (parseInt(check.rows[0].count) > 0) {
    console.log('Volunteer hours seed: already seeded, skipping.');
    return;
  }

  // Dynamic member lookup
  const { rows: members } = await pool.query('SELECT id, name FROM members WHERE station_id = 1 ORDER BY id');
  if (members.length === 0) {
    console.log('No members found, skipping.');
    return;
  }

  // Helper function to look up member by name
  const m = (name) => members.find(r => r.name === name);

  const yr = new Date().getFullYear();
  const d = (mo, day) => `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const SEED = [
    // ── January ──────────────────────────────────────────────────────────────
    // Structure fire, 2nd alarm — mutual aid to Riverside VFD
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', date: d(1, 8), activityType: 'Incident Response', hours: 4.5, description: 'Structure fire, 2nd alarm — IC and mutual aid coordination with Riverside VFD', reference: 'INC-2026-0001' },
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', date: d(1, 8), activityType: 'Incident Response', hours: 4.5, description: 'Structure fire, 2nd alarm — division chief', reference: 'INC-2026-0001' },
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', date: d(1, 8), activityType: 'Incident Response', hours: 4.5, description: 'Structure fire, 2nd alarm — interior attack crew leader', reference: 'INC-2026-0001' },
    { memberId: m('Sandra Kim').id, memberName: 'Sandra Kim', date: d(1, 8), activityType: 'Incident Response', hours: 4.5, description: 'Engine operator', reference: 'INC-2026-0001' },
    { memberId: m('James Ortega').id, memberName: 'James Ortega', date: d(1, 8), activityType: 'Incident Response', hours: 4.5, description: 'Interior attack crew', reference: 'INC-2026-0001' },
    { memberId: m('Tracy Benson').id, memberName: 'Tracy Benson', date: d(1, 8), activityType: 'Incident Response', hours: 4.5, description: 'Interior attack crew', reference: 'INC-2026-0001' },
    { memberId: m('Mike Harrington').id, memberName: 'Mike Harrington', date: d(1, 8), activityType: 'Incident Response', hours: 4.5, description: 'RIT assignment', reference: 'INC-2026-0001' },

    // Duty shifts
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', date: d(1, 5), activityType: 'Duty Shift', hours: 12, description: 'Day shift — Duty Officer', reference: '' },
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', date: d(1, 5), activityType: 'Duty Shift', hours: 12, description: 'Day shift — Duty Officer', reference: '' },
    { memberId: m('Sandra Kim').id, memberName: 'Sandra Kim', date: d(1, 5), activityType: 'Duty Shift', hours: 12, description: 'Day shift crew', reference: '' },
    { memberId: m('Kevin Marsh').id, memberName: 'Kevin Marsh', date: d(1, 12), activityType: 'Duty Shift', hours: 12, description: 'Night shift — driver/engineer', reference: '' },
    { memberId: m('Carlos Ruiz').id, memberName: 'Carlos Ruiz', date: d(1, 12), activityType: 'Duty Shift', hours: 12, description: 'Night shift crew — probationary observation', reference: '' },
    { memberId: m('Amy Winters').id, memberName: 'Amy Winters', date: d(1, 12), activityType: 'Duty Shift', hours: 12, description: 'Night shift crew — probationary training', reference: '' },

    // Monthly general meeting
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', date: d(1, 14), activityType: 'Meeting', hours: 2, description: 'Monthly general meeting', reference: '' },
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', date: d(1, 14), activityType: 'Meeting', hours: 2, description: 'Monthly general meeting', reference: '' },
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', date: d(1, 14), activityType: 'Meeting', hours: 2, description: 'Monthly general meeting', reference: '' },
    { memberId: m('Sandra Kim').id, memberName: 'Sandra Kim', date: d(1, 14), activityType: 'Meeting', hours: 2, description: 'Monthly general meeting', reference: '' },
    { memberId: m('James Ortega').id, memberName: 'James Ortega', date: d(1, 14), activityType: 'Meeting', hours: 2, description: 'Monthly general meeting', reference: '' },
    { memberId: m('Tracy Benson').id, memberName: 'Tracy Benson', date: d(1, 14), activityType: 'Meeting', hours: 2, description: 'Monthly general meeting', reference: '' },
    { memberId: m('Mike Harrington').id, memberName: 'Mike Harrington', date: d(1, 14), activityType: 'Meeting', hours: 2, description: 'Monthly general meeting', reference: '' },
    { memberId: m('Kevin Marsh').id, memberName: 'Kevin Marsh', date: d(1, 14), activityType: 'Meeting', hours: 2, description: 'Monthly general meeting', reference: '' },

    // ── February ─────────────────────────────────────────────────────────────
    // Monthly drill
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', date: d(2, 5), activityType: 'Drill / Training Exercise', hours: 3, description: 'Monthly drill — pump operations & relay pumping', reference: '' },
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', date: d(2, 5), activityType: 'Drill / Training Exercise', hours: 3, description: 'Monthly drill — pump operations', reference: '' },
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', date: d(2, 5), activityType: 'Drill / Training Exercise', hours: 3, description: 'Monthly drill — pump operations', reference: '' },
    { memberId: m('Sandra Kim').id, memberName: 'Sandra Kim', date: d(2, 5), activityType: 'Drill / Training Exercise', hours: 3, description: 'Monthly drill — pump operations (lead instructor)', reference: '' },
    { memberId: m('James Ortega').id, memberName: 'James Ortega', date: d(2, 5), activityType: 'Drill / Training Exercise', hours: 3, description: 'Monthly drill', reference: '' },
    { memberId: m('Mike Harrington').id, memberName: 'Mike Harrington', date: d(2, 5), activityType: 'Drill / Training Exercise', hours: 3, description: 'Monthly drill', reference: '' },
    { memberId: m('Carlos Ruiz').id, memberName: 'Carlos Ruiz', date: d(2, 5), activityType: 'Drill / Training Exercise', hours: 3, description: 'Monthly drill — probationary training', reference: '' },

    // 2nd alarm commercial structure fire
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', date: d(2, 3), activityType: 'Incident Response', hours: 5.5, description: '2nd alarm commercial structure fire — IC', reference: 'INC-2026-0006' },
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', date: d(2, 3), activityType: 'Incident Response', hours: 5.5, description: '2nd alarm — division chief', reference: 'INC-2026-0006' },
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', date: d(2, 3), activityType: 'Incident Response', hours: 5.5, description: '2nd alarm — water supply operations', reference: 'INC-2026-0006' },
    { memberId: m('Sandra Kim').id, memberName: 'Sandra Kim', date: d(2, 3), activityType: 'Incident Response', hours: 5.5, description: 'Engine operator', reference: 'INC-2026-0006' },
    { memberId: m('Mike Harrington').id, memberName: 'Mike Harrington', date: d(2, 3), activityType: 'Incident Response', hours: 5.5, description: 'RIT team', reference: 'INC-2026-0006' },
    { memberId: m('Lisa Fontaine').id, memberName: 'Lisa Fontaine', date: d(2, 3), activityType: 'Incident Response', hours: 5.5, description: 'EMS — medical support and rehab', reference: 'INC-2026-0006' },

    // Duty shifts
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', date: d(2, 9), activityType: 'Duty Shift', hours: 12, description: 'Duty Officer shift', reference: '' },
    { memberId: m('James Ortega').id, memberName: 'James Ortega', date: d(2, 9), activityType: 'Duty Shift', hours: 12, description: 'Day shift crew', reference: '' },
    { memberId: m('Kevin Marsh').id, memberName: 'Kevin Marsh', date: d(2, 9), activityType: 'Duty Shift', hours: 12, description: 'Day shift — driver/engineer', reference: '' },
    { memberId: m('Amy Winters').id, memberName: 'Amy Winters', date: d(2, 16), activityType: 'Duty Shift', hours: 12, description: 'Night shift — probationary', reference: '' },
    { memberId: m('Diane Tolliver').id, memberName: 'Diane Tolliver', date: d(2, 16), activityType: 'Duty Shift', hours: 12, description: 'Night shift — driver/engineer', reference: '' },

    // Formal training and maintenance
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', date: d(2, 15), activityType: 'Formal Training / Class', hours: 24, description: 'HazMat Operations certification course', reference: '' },
    { memberId: m('Kevin Marsh').id, memberName: 'Kevin Marsh', date: d(2, 22), activityType: 'Station Maintenance', hours: 4, description: 'Bay floor cleaning, hose testing, equipment inspection', reference: '' },
    { memberId: m('Diane Tolliver').id, memberName: 'Diane Tolliver', date: d(2, 22), activityType: 'Station Maintenance', hours: 4, description: 'Equipment inventory and storage organization', reference: '' },
    { memberId: m('Carlos Ruiz').id, memberName: 'Carlos Ruiz', date: d(2, 20), activityType: 'Station Maintenance', hours: 3, description: 'General station maintenance and grounds keeping', reference: '' },

    // Monthly meeting
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', date: d(2, 11), activityType: 'Meeting', hours: 2, description: 'Monthly general meeting', reference: '' },
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', date: d(2, 11), activityType: 'Meeting', hours: 2, description: 'Monthly general meeting', reference: '' },
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', date: d(2, 11), activityType: 'Meeting', hours: 2, description: 'Monthly general meeting', reference: '' },
    { memberId: m('Kevin Marsh').id, memberName: 'Kevin Marsh', date: d(2, 11), activityType: 'Meeting', hours: 2, description: 'Monthly general meeting', reference: '' },
    { memberId: m('Lisa Fontaine').id, memberName: 'Lisa Fontaine', date: d(2, 11), activityType: 'Meeting', hours: 2, description: 'Monthly general meeting', reference: '' },

    // ── March ────────────────────────────────────────────────────────────────
    // Swift water rescue
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', date: d(3, 1), activityType: 'Incident Response', hours: 3.5, description: 'Swift water rescue — 2 subjects, advanced rescue operations', reference: 'INC-2026-0009' },
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', date: d(3, 1), activityType: 'Incident Response', hours: 3.5, description: 'Swift water rescue — command support', reference: 'INC-2026-0009' },
    { memberId: m('James Ortega').id, memberName: 'James Ortega', date: d(3, 1), activityType: 'Incident Response', hours: 3.5, description: 'Swift water rescue — entry team', reference: 'INC-2026-0009' },
    { memberId: m('Mike Harrington').id, memberName: 'Mike Harrington', date: d(3, 1), activityType: 'Incident Response', hours: 3.5, description: 'Swift water rescue — safety and shore team', reference: 'INC-2026-0009' },

    // Fundraising and community events
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', date: d(3, 2), activityType: 'Fundraising', hours: 5, description: 'Annual pancake breakfast fundraiser — organizer', reference: '' },
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', date: d(3, 2), activityType: 'Fundraising', hours: 5, description: 'Annual pancake breakfast fundraiser', reference: '' },
    { memberId: m('Kevin Marsh').id, memberName: 'Kevin Marsh', date: d(3, 2), activityType: 'Community Event', hours: 5, description: 'Pancake breakfast — public education booth', reference: '' },
    { memberId: m('Lisa Fontaine').id, memberName: 'Lisa Fontaine', date: d(3, 2), activityType: 'Community Event', hours: 5, description: 'Pancake breakfast — fire safety demonstrations', reference: '' },
    { memberId: m('Amy Winters').id, memberName: 'Amy Winters', date: d(3, 2), activityType: 'Community Event', hours: 5, description: 'Pancake breakfast — setup and food service', reference: '' },

    // Duty shifts
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', date: d(3, 3), activityType: 'Duty Shift', hours: 12, description: 'Day shift — Duty Officer', reference: '' },
    { memberId: m('Sandra Kim').id, memberName: 'Sandra Kim', date: d(3, 3), activityType: 'Duty Shift', hours: 12, description: 'Day shift — engine operator', reference: '' },
    { memberId: m('James Ortega').id, memberName: 'James Ortega', date: d(3, 3), activityType: 'Duty Shift', hours: 12, description: 'Day shift crew', reference: '' },
    { memberId: m('Diane Tolliver').id, memberName: 'Diane Tolliver', date: d(3, 5), activityType: 'Duty Shift', hours: 12, description: 'Night shift — driver/engineer', reference: '' },

    // Advanced training courses
    { memberId: m('Tracy Benson').id, memberName: 'Tracy Benson', date: d(3, 5), activityType: 'Formal Training / Class', hours: 16, description: 'Wildland Firefighter certification — state forestry', reference: '' },
    { memberId: m('Lisa Fontaine').id, memberName: 'Lisa Fontaine', date: d(3, 8), activityType: 'Formal Training / Class', hours: 32, description: 'Technical Rescue – Rope — advanced certification renewal', reference: '' },
    { memberId: m('Carlos Ruiz').id, memberName: 'Carlos Ruiz', date: d(3, 15), activityType: 'Formal Training / Class', hours: 40, description: 'Firefighter I Practical Exam Preparation', reference: '' },
  ];

  let n = 0;
  for (const row of SEED) {
    await pool.query(
      `INSERT INTO volunteer_hours ("memberId", "memberName", date, "activityType", hours, description, reference, station_id, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT DO NOTHING`,
      [row.memberId, row.memberName, row.date, row.activityType, row.hours, row.description, row.reference, 1]
    );
    n++;
  }

  console.log(`Volunteer hours seed: ${n} entries inserted.`);
};
