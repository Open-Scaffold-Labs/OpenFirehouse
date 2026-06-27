'use strict';
const db = require('./db');
module.exports = async function seedVacancyFill() {
  const { rows } = await db.query('SELECT COUNT(*) as c FROM vacancy_fill WHERE station_id = 1');
  if (parseInt(rows[0].c) > 0) { console.log('Vacancy fill seed: already seeded.'); return; }
  console.log('Vacancy fill seed: inserting demo data...');
  const ITEMS = [
    { shift_date: '2026-03-18', shift_name: 'A Shift', position: 'Firefighter', callout_member_name: 'Carlos Ruiz', callout_reason: 'Sick — flu symptoms', status: 'filled', priority: 'high', filled_by_name: 'Mike Harrington', filled_at: '2026-03-17T14:30:00Z', created_by: 'Sarah Chen' },
    { shift_date: '2026-03-20', shift_name: 'B Shift', position: 'Driver/Engineer', callout_member_name: 'Kevin Marsh', callout_reason: 'Family emergency', status: 'filled', priority: 'critical', filled_by_name: 'Tracy Benson', filled_at: '2026-03-19T09:15:00Z', created_by: 'Maria Delgado' },
    { shift_date: '2026-03-22', shift_name: 'A Shift', position: 'Firefighter', callout_member_name: 'Amy Winters', callout_reason: 'College exam conflict', status: 'open', priority: 'normal', created_by: 'Sarah Chen' },
    { shift_date: '2026-03-25', shift_name: 'Night Shift', position: 'Officer', callout_member_name: 'Maria Delgado', callout_reason: 'Training — NJ Fire Academy Mayday course', status: 'open', priority: 'high', created_by: 'Sarah Chen' },
  ];
  for (const item of ITEMS) {
    await db.query(
      `INSERT INTO vacancy_fill (station_id, shift_date, shift_name, position, callout_member_name,
        callout_reason, status, priority, filled_by_name, filled_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [1, item.shift_date, item.shift_name, item.position, item.callout_member_name,
       item.callout_reason, item.status, item.priority, item.filled_by_name || null,
       item.filled_at || null, item.created_by]
    );
  }
  console.log(`Vacancy fill seed: inserted ${ITEMS.length} entries.`);
};
