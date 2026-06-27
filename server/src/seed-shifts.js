'use strict';
/**
 * seed-shifts.js — Populate shifts for January through June 2026 (6 months).
 * Skips if already seeded. Uses dynamic member lookups from db.
 * Includes all 12 members in realistic rotation.
 */

const { shifts: db, pool } = require('./db');

module.exports = async function seedShifts() {
  const existing = await db.all(1);
  if (existing.length > 0) {
    console.log('Shifts seed: already seeded, skipping.');
    return;
  }

  // Fetch all members to map names to crew
  const { rows: memberRows } = await pool.query('SELECT id, name FROM members WHERE station_id = 1 ORDER BY id');
  if (memberRows.length === 0) {
    console.log('Shifts seed: no members found, skipping.');
    return;
  }

  // All 12 canonical members for shift scheduling
  const members = [
    'Sarah Chen',
    'Maria Delgado',
    'Nathan McGee',
    'Sandra Kim',
    'James Ortega',
    'Tracy Benson',
    'Mike Harrington',
    'Lisa Fontaine',
    'Carlos Ruiz',
    'Amy Winters',
    'Kevin Marsh',
    'Diane Tolliver',
  ];

  const year = 2026;
  const months = [1, 2, 3, 4, 5, 6]; // Jan through Jun
  const daysPerMonth = [31, 28, 31, 30, 31, 30];

  let inserted = 0;
  let dayCounter = 0; // Global counter for rotating members

  // Holidays and special notes
  const specialNotes = {
    '2026-01-01': 'New Year\'s Day — reduced crew',
    '2026-02-14': 'Valentine\'s Day',
    '2026-02-16': 'Presidents\' Day (Monday) — 3-man crew',
    '2026-03-17': 'St. Patrick\'s Day',
    '2026-05-25': 'Memorial Day — all-staff drill night',
  };

  for (let monthIdx = 0; monthIdx < months.length; monthIdx++) {
    const month = months[monthIdx];
    const daysInMonth = daysPerMonth[monthIdx];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dow = new Date(year, month - 1, day).getDay(); // 0=Sun, 6=Sat
      const specialNote = specialNotes[date] || '';

      // Determine crew size for weekend vs. weekday
      const isWeekend = dow === 0 || dow === 6;
      const crewSize = isWeekend ? 4 : 3;

      // Day shift
      const dayShiftCrew = [];
      for (let i = 0; i < crewSize; i++) {
        dayShiftCrew.push(members[(dayCounter + i) % members.length]);
      }

      await db.create({
        date,
        shiftType: 'Day',
        crew: dayShiftCrew,
        notes: specialNote,
      }, 1);
      inserted++;

      dayCounter += crewSize;

      // Night shift (add extra member on weekends)
      const nightShiftCrew = [];
      for (let i = 0; i < crewSize; i++) {
        nightShiftCrew.push(members[(dayCounter + i) % members.length]);
      }

      await db.create({
        date,
        shiftType: 'Night',
        crew: nightShiftCrew,
        notes: specialNote,
      }, 1);
      inserted++;

      dayCounter += crewSize;

      // Duty Officer — every day
      const dutyOfficer = members[dayCounter % members.length];

      await db.create({
        date,
        shiftType: 'Duty Officer',
        crew: [dutyOfficer],
        notes: specialNote,
      }, 1);
      inserted++;

      dayCounter++;
    }
  }

  console.log(`Shifts seed complete: ${inserted} inserted.`);
};
