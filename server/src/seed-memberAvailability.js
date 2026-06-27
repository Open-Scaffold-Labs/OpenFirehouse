'use strict';
const db = require('./db');
module.exports = async function seedMemberAvailability() {
  const { rows } = await db.query('SELECT COUNT(*) as c FROM member_availability WHERE station_id = 1');
  if (parseInt(rows[0].c) > 0) { console.log('Member availability seed: already seeded.'); return; }
  console.log('Member availability seed: inserting demo data...');
  const members = await db.query("SELECT id, name FROM members WHERE station_id = 1 AND status = 'Active'");
  if (!members.rows.length) { console.log('No active members found.'); return; }
  const statuses = ['available', 'available', 'available', 'available', 'available', 'unavailable', 'limited', 'available', 'available', 'unavailable', 'available', 'available'];
  const notes = ['', '', 'At station', '', '', 'On vacation until 3/21', 'Available after 6pm only', '', 'At station — duty crew', 'Medical leave', '', ''];
  let count = 0;
  for (let i = 0; i < members.rows.length; i++) {
    const m = members.rows[i];
    const status = statuses[i % statuses.length];
    const note = notes[i % notes.length];
    await db.query(
      `INSERT INTO member_availability (station_id, member_id, status, notes, updated_at)
       VALUES ($1,$2,$3,$4,NOW())`,
      [1, m.id, status, note]
    );
    count++;
  }
  console.log(`Member availability seed: inserted ${count} entries.`);
};
