'use strict';
/**
 * seed-dailyStaffing.js — Populate the date-keyed RIDING BOARD (apparatus_assignments)
 * for Jan–Jun 2026. Rotates all 12 members across three apparatus (Engine 1, Ladder 1,
 * Rescue 1). Skips if already seeded.
 *
 * 1.1c-b / migration 0070: daily_staffing was folded into apparatus_assignments (hours
 * live on the on-duty assignment). This seed writes to the board so local dev matches prod.
 */

const { pool } = require('./db');

module.exports = async function seedDailyStaffing() {
  const check = await pool.query(
    "SELECT COUNT(*) FROM apparatus_assignments WHERE date = '2026-01-01' AND hours IS NOT NULL"
  );
  if (parseInt(check.rows[0].count, 10) > 0) {
    console.log('Daily staffing seed: already seeded, skipping.');
    return;
  }

  // Fetch all members for dynamic ID lookup (department_id needed for the board's tenant key)
  const { rows: members } = await pool.query(
    'SELECT id, name, rank, department_id FROM members WHERE station_id = 1 ORDER BY id'
  );
  if (members.length === 0) {
    console.log('Daily staffing seed: no members found, skipping.');
    return;
  }

  const m = (name) => members.find(r => r.name === name);

  // All 12 canonical members
  const roster = [
    'Sarah Chen', 'Maria Delgado', 'Nathan McGee', 'Sandra Kim',
    'James Ortega', 'Tracy Benson', 'Mike Harrington', 'Lisa Fontaine',
    'Carlos Ruiz', 'Amy Winters', 'Kevin Marsh', 'Diane Tolliver',
  ];

  // 3 apparatus assignments: Engine 1 (id 1), Ladder 1 (id 2), Rescue 1 (id 3)
  const apparatus = [
    { id: 1, positions: ['Officer', 'Driver', 'Firefighter'] },
    { id: 2, positions: ['Driver', 'Firefighter'] },
    { id: 3, positions: ['Driver'] },
  ];

  const year = 2026;
  const months = [1, 2, 3, 4, 5, 6];
  const daysPerMonth = [31, 28, 31, 30, 31, 30];

  let inserted = 0;
  let rosterIdx = 0; // Global rotation counter

  for (let mi = 0; mi < months.length; mi++) {
    const month = months[mi];
    const days = daysPerMonth[mi];

    for (let day = 1; day <= days; day++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dow = new Date(year, month - 1, day).getDay();
      const isWeekend = dow === 0 || dow === 6;

      // Weekdays: Engine + Rescue (4 members). Weekends: all 3 apparatus (6 members).
      const todayApparatus = isWeekend
        ? apparatus
        : [apparatus[0], apparatus[2]]; // Engine + Rescue on weekdays

      for (const app of todayApparatus) {
        for (const position of app.positions) {
          const memberName = roster[rosterIdx % roster.length];
          const member = m(memberName);
          if (!member || member.department_id == null) { rosterIdx++; continue; }

          const startTime = isWeekend ? '07:00' : '08:00';
          const endTime = isWeekend ? '19:00' : '17:00';
          const hours = isWeekend ? 12 : 9;

          await pool.query(
            `INSERT INTO apparatus_assignments
               (department_id, station_id, date, member_id, position_name, apparatus_id, status, start_time, end_time, hours, notes, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
             ON CONFLICT (department_id, date, apparatus_id, position_name) DO NOTHING`,
            [member.department_id, 1, date, member.id, position, app.id, 'on_duty', startTime, endTime, hours, '']
          );
          inserted++;
          rosterIdx++;
        }
      }
    }
  }

  console.log(`Daily staffing seed complete: ${inserted} inserted.`);
};
