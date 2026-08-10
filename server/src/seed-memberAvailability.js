'use strict';
const db = require('./db');

// Rewritten 2026-07-16 to match the real member_availability schema:
// user_id / member_name / available (boolean). The old seed wrote
// member_id/status/notes — none of which exist on the table — so it never
// inserted a row. (The vacancyFill read route still SELECTs member_id/status;
// that route is broken against prod too and is flagged separately for Matt.)
module.exports = async function seedMemberAvailability() {
  const { rows } = await db.query('SELECT COUNT(*) as c FROM member_availability WHERE station_id = 1');
  if (parseInt(rows[0].c) > 0) { console.log('Member availability seed: already seeded.'); return; }
  console.log('Member availability seed: inserting demo data...');
  const members = await db.query("SELECT id, name FROM members WHERE station_id = 1 AND status = 'Active'");
  if (!members.rows.length) { console.log('No active members found.'); return; }

  // Demo mix — most members available, a couple out (unavailable).
  const availability = [true, true, true, true, true, false, true, true, true, false, true, true];

  let count = 0;
  for (let i = 0; i < members.rows.length; i++) {
    const m = members.rows[i];
    await db.query(
      `INSERT INTO member_availability (station_id, user_id, member_name, available, updated_at)
       VALUES ($1,$2,$3,$4,NOW())`,
      [1, m.id, m.name, availability[i % availability.length]]
    );
    count++;
  }
  console.log(`Member availability seed: inserted ${count} entries.`);
};
