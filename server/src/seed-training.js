'use strict';
/**
 * seed-training.js — 24 initial training records.
 * Safe to run multiple times (checks count and skips if already seeded).
 * Uses dynamic member lookups to ensure IDs match the members table.
 */

const { pool } = require('./db');

module.exports = async function seedTraining() {
  // Check if already seeded
  const check = await pool.query('SELECT COUNT(*) FROM training WHERE station_id = 1');
  if (parseInt(check.rows[0].count) > 0) {
    console.log('Training seed: already seeded, skipping.');
    return;
  }

  // Dynamic member lookup
  const { rows: members } = await pool.query('SELECT id, name, rank FROM members WHERE station_id = 1 ORDER BY id');
  if (members.length === 0) {
    console.log('No members found, skipping.');
    return;
  }

  // Helper function to look up member by name
  const m = (name) => members.find(r => r.name === name);

  const SEED = [
    // Sarah Chen (ID 1, Fire Chief) — Advanced certifications, leadership track
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', courseName: 'Fire Officer II', type: 'Certification', status: 'Passed', completedDate: '2019-04-12', expiresDate: null, hours: 160, instructor: 'State Fire Academy', location: 'State Fire Academy – Harrisburg', notes: 'Completed with highest distinction.' },
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', courseName: 'SCBA Fit Test', type: 'Safety', status: 'Passed', completedDate: '2026-02-04', expiresDate: '2027-01-05', hours: 1, instructor: 'Maria Delgado', location: 'Station 14', notes: '' },
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', courseName: 'CPR/AED', type: 'EMS/Medical', status: 'Passed', completedDate: '2025-01-31', expiresDate: '2027-01-30', hours: 4, instructor: 'County EMS', location: 'County Training Center', notes: 'Renewal current.' },

    // Maria Delgado (ID 2, Captain) — Officer-level certifications
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', courseName: 'Fire Officer I', type: 'Certification', status: 'Passed', completedDate: '2021-06-20', expiresDate: null, hours: 120, instructor: 'State Fire Academy', location: 'State Fire Academy – Harrisburg', notes: '' },
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', courseName: 'CPR/AED', type: 'EMS/Medical', status: 'Passed', completedDate: '2026-01-05', expiresDate: '2027-01-05', hours: 4, instructor: 'County EMS', location: 'County Training Center', notes: '' },
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', courseName: 'HazMat Operations', type: 'HazMat', status: 'Passed', completedDate: '2026-02-19', expiresDate: '2027-02-19', hours: 24, instructor: 'Regional HazMat Team', location: 'Regional Training Center', notes: '' },

    // Nathan McGee (ID 3, Lieutenant) — Senior firefighter certifications
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', courseName: 'Firefighter II', type: 'Certification', status: 'Passed', completedDate: '2018-09-05', expiresDate: null, hours: 200, instructor: 'State Fire Academy', location: 'State Fire Academy – Harrisburg', notes: '' },
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', courseName: 'Driver/Operator – Pumper', type: 'Certification', status: 'Passed', completedDate: '2020-03-14', expiresDate: null, hours: 80, instructor: 'State Fire Academy', location: 'Station 14', notes: '' },
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', courseName: 'SCBA Fit Test', type: 'Safety', status: 'Passed', completedDate: '2026-02-14', expiresDate: '2027-02-14', hours: 1, instructor: 'Sarah Chen', location: 'Station 14', notes: '' },

    // Sandra Kim (ID 4, Firefighter/EMT) — EMS and technical certs
    { memberId: m('Sandra Kim').id, memberName: 'Sandra Kim', courseName: 'Driver/Operator – Pumper', type: 'Certification', status: 'Passed', completedDate: '2022-07-18', expiresDate: null, hours: 80, instructor: 'State Fire Academy', location: 'Station 14', notes: '' },
    { memberId: m('Sandra Kim').id, memberName: 'Sandra Kim', courseName: 'EMT-Basic', type: 'EMS/Medical', status: 'Passed', completedDate: '2022-11-20', expiresDate: '2026-11-20', hours: 120, instructor: 'County EMS', location: 'County Training Center', notes: 'Renewal pending — schedule for summer 2026.' },
    { memberId: m('Sandra Kim').id, memberName: 'Sandra Kim', courseName: 'CPR/AED', type: 'EMS/Medical', status: 'Passed', completedDate: '2026-02-09', expiresDate: '2027-02-09', hours: 4, instructor: 'Maria Delgado', location: 'Station 14', notes: 'Renewal current.' },

    // James Ortega (ID 5, Firefighter) — Intermediate certifications
    { memberId: m('James Ortega').id, memberName: 'James Ortega', courseName: 'Firefighter II', type: 'Certification', status: 'Passed', completedDate: '2020-11-30', expiresDate: null, hours: 200, instructor: 'State Fire Academy', location: 'State Fire Academy – Harrisburg', notes: '' },
    { memberId: m('James Ortega').id, memberName: 'James Ortega', courseName: 'Technical Rescue – Rope', type: 'Technical Rescue', status: 'Passed', completedDate: '2025-01-20', expiresDate: '2026-01-20', hours: 32, instructor: 'Regional Technical Rescue Team', location: 'Regional Training Center', notes: 'Renewal overdue — schedule immediately.' },
    { memberId: m('James Ortega').id, memberName: 'James Ortega', courseName: 'CPR/AED', type: 'EMS/Medical', status: 'Passed', completedDate: '2025-03-15', expiresDate: '2026-03-15', hours: 4, instructor: 'County EMS', location: 'County Training Center', notes: 'Renewal current.' },

    // Tracy Benson (ID 6, Firefighter/EMT) — Wildland and EMS certs
    { memberId: m('Tracy Benson').id, memberName: 'Tracy Benson', courseName: 'Firefighter II', type: 'Certification', status: 'Passed', completedDate: '2021-08-15', expiresDate: null, hours: 200, instructor: 'State Fire Academy', location: 'State Fire Academy – Harrisburg', notes: '' },
    { memberId: m('Tracy Benson').id, memberName: 'Tracy Benson', courseName: 'Wildland Firefighter', type: 'Wildland/Brush', status: 'Passed', completedDate: '2025-12-06', expiresDate: '2026-11-06', hours: 16, instructor: 'State Forestry Division', location: 'Maplewood County Fairgrounds', notes: '' },
    { memberId: m('Tracy Benson').id, memberName: 'Tracy Benson', courseName: 'HazMat Operations', type: 'HazMat', status: 'Passed', completedDate: '2023-06-10', expiresDate: '2027-06-10', hours: 24, instructor: 'Regional HazMat Team', location: 'Regional Training Center', notes: '' },

    // Mike Harrington (ID 7, Firefighter) — Core firefighter certs
    { memberId: m('Mike Harrington').id, memberName: 'Mike Harrington', courseName: 'Firefighter I', type: 'Certification', status: 'Passed', completedDate: '2019-05-10', expiresDate: null, hours: 120, instructor: 'State Fire Academy', location: 'State Fire Academy – Harrisburg', notes: '' },
    { memberId: m('Mike Harrington').id, memberName: 'Mike Harrington', courseName: 'NIMS IS-700', type: 'NIMS Training', status: 'Passed', completedDate: '2026-02-24', expiresDate: null, hours: 3, instructor: 'FEMA Online', location: 'Online', notes: 'FEMA certificate on file.' },
    { memberId: m('Mike Harrington').id, memberName: 'Mike Harrington', courseName: 'CPR/AED', type: 'EMS/Medical', status: 'Passed', completedDate: '2025-08-20', expiresDate: '2026-08-20', hours: 4, instructor: 'County EMS', location: 'County Training Center', notes: 'Renewal pending — schedule for summer 2026.' },

    // Lisa Fontaine (ID 8, Firefighter/Paramedic) — Advanced EMS and technical
    { memberId: m('Lisa Fontaine').id, memberName: 'Lisa Fontaine', courseName: 'Firefighter II', type: 'Certification', status: 'Passed', completedDate: '2020-09-18', expiresDate: null, hours: 200, instructor: 'State Fire Academy', location: 'State Fire Academy – Harrisburg', notes: '' },
    { memberId: m('Lisa Fontaine').id, memberName: 'Lisa Fontaine', courseName: 'Paramedic', type: 'EMS/Medical', status: 'Passed', completedDate: '2021-12-03', expiresDate: '2026-12-03', hours: 200, instructor: 'County EMS', location: 'County Training Center', notes: 'Renewal pending — schedule for fall 2026.' },
    { memberId: m('Lisa Fontaine').id, memberName: 'Lisa Fontaine', courseName: 'Technical Rescue – Rope', type: 'Technical Rescue', status: 'Passed', completedDate: '2022-04-15', expiresDate: null, hours: 32, instructor: 'Regional Technical Rescue Team', location: 'Regional Training Center', notes: '' },

    // Carlos Ruiz (ID 9, Probationary FF) — Entry-level training in progress
    { memberId: m('Carlos Ruiz').id, memberName: 'Carlos Ruiz', courseName: 'Firefighter I', type: 'Certification', status: 'In Progress', completedDate: null, expiresDate: null, hours: 80, instructor: 'State Fire Academy', location: 'State Fire Academy – Harrisburg', notes: 'Expected completion: April 2026. Probationary requirement.' },
    { memberId: m('Carlos Ruiz').id, memberName: 'Carlos Ruiz', courseName: 'CPR/AED', type: 'EMS/Medical', status: 'Passed', completedDate: '2026-02-01', expiresDate: '2027-02-01', hours: 4, instructor: 'County EMS', location: 'County Training Center', notes: '' },

    // February Monthly Drill — all applicable members
    { memberId: m('Sarah Chen').id, memberName: 'Sarah Chen', courseName: 'February Monthly Drill – Pump Operations', type: 'Drill', status: 'Passed', completedDate: '2026-02-05', expiresDate: null, hours: 3, instructor: 'Nathan McGee', location: 'Station 14', notes: 'All hands drill. Focus: drafting operations and relay pumping.' },
    { memberId: m('Maria Delgado').id, memberName: 'Maria Delgado', courseName: 'February Monthly Drill – Pump Operations', type: 'Drill', status: 'Passed', completedDate: '2026-02-05', expiresDate: null, hours: 3, instructor: 'Nathan McGee', location: 'Station 14', notes: '' },
    { memberId: m('Nathan McGee').id, memberName: 'Nathan McGee', courseName: 'February Monthly Drill – Pump Operations', type: 'Drill', status: 'Passed', completedDate: '2026-02-05', expiresDate: null, hours: 3, instructor: 'Sandra Kim', location: 'Station 14', notes: '' },
  ];

  let inserted = 0;
  for (const rec of SEED) {
    await pool.query(
      `INSERT INTO training ("memberId", "memberName", "courseName", type, status, "completedDate", "expiresDate", hours, instructor, location, notes, station_id, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       ON CONFLICT DO NOTHING`,
      [rec.memberId, rec.memberName, rec.courseName, rec.type, rec.status, rec.completedDate, rec.expiresDate, rec.hours, rec.instructor, rec.location, rec.notes, 1]
    );
    inserted++;
  }

  console.log(`Training seed complete: ${inserted} inserted.`);
};
