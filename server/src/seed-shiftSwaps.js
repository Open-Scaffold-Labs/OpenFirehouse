'use strict';
const db = require('./db');
module.exports = async function seedShiftSwaps() {
  const { rows } = await db.query('SELECT COUNT(*) as c FROM shift_swaps WHERE station_id = 1');
  if (parseInt(rows[0].c) > 0) { console.log('Shift swaps seed: already seeded.'); return; }
  console.log('Shift swaps seed: inserting demo data...');
  const members = await db.query("SELECT id, name FROM members WHERE station_id = 1 AND status = 'Active' LIMIT 8");
  if (members.rows.length < 4) { console.log('Not enough members for shift swaps.'); return; }
  const m = members.rows;
  const SWAPS = [
    { requester_id: m[2]?.id, requested_id: m[4]?.id, shift_date: '2026-03-20', reason: 'Family obligation — daughter graduation', status: 'pending' },
    { requester_id: m[5]?.id, requested_id: m[1]?.id, shift_date: '2026-03-22', reason: 'Medical appointment', status: 'approved' },
    { requester_id: m[3]?.id, requested_id: m[6]?.id, shift_date: '2026-03-18', reason: 'Training conflict — NJ Fire Academy course', status: 'approved' },
    { requester_id: m[7]?.id, requested_id: m[0]?.id, shift_date: '2026-03-25', reason: 'Personal day', status: 'pending' },
    { requester_id: m[1]?.id, requested_id: m[5]?.id, shift_date: '2026-02-14', reason: 'Anniversary dinner with spouse', status: 'approved' },
    { requester_id: m[4]?.id, requested_id: m[3]?.id, shift_date: '2026-03-15', reason: 'Child soccer tournament — out of state', status: 'approved' },
    { requester_id: m[6]?.id, requested_id: m[2]?.id, shift_date: '2026-03-28', reason: 'Home renovation project — final inspection day', status: 'denied' },
    { requester_id: m[0]?.id, requested_id: m[7]?.id, shift_date: '2026-03-08', reason: 'Chief appearance at county fire chiefs meeting', status: 'approved' },
  ];
  let inserted = 0;
  for (const s of SWAPS) {
    if (!s.requester_id || !s.requested_id) continue;
    await db.query(
      `INSERT INTO shift_swaps (station_id, requester_id, requested_id, shift_date, reason, status)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [1, s.requester_id, s.requested_id, s.shift_date, s.reason, s.status]
    );
    inserted++;
  }
  console.log(`Shift swaps seed: inserted ${inserted} swaps.`);
};
