'use strict';
const db = require('./db');
module.exports = async function seedShiftSwaps() {
  const { rows } = await db.query('SELECT COUNT(*) as c FROM shift_swaps WHERE station_id = 1');
  if (parseInt(rows[0].c) > 0) { console.log('Shift swaps seed: already seeded.'); return; }
  console.log('Shift swaps seed: inserting demo data...');

  const members = await db.query("SELECT id, name FROM members WHERE station_id = 1 AND status = 'Active' LIMIT 8");
  if (members.rows.length < 4) { console.log('Not enough members for shift swaps.'); return; }
  const m = members.rows;

  // shift_swaps.shiftId is NOT NULL — anchor each swap to a real recent shift.
  const shiftRows = await db.query('SELECT id FROM shifts ORDER BY date DESC, id DESC LIMIT 8');
  if (shiftRows.rows.length === 0) { console.log('Shift swaps seed: no shifts to anchor to; skipping.'); return; }
  const sid = (i) => shiftRows.rows[i % shiftRows.rows.length].id;
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

  // Real columns: "shiftId", "requesterId", "requesterName", "coveredById",
  // "coveredByName", status, reason, notes, "createdAt", "updatedAt". Dates are
  // relative to now so the data stays current; the previous version wrote
  // requester_id/requested_id/shift_date, which do not exist and threw silently.
  const SWAPS = [
    { req: 2, cov: 4, reason: 'Family obligation — daughter’s graduation',      status: 'pending',  createdDaysAgo: 2 },
    { req: 5, cov: 1, reason: 'Medical appointment',                                  status: 'approved', createdDaysAgo: 5 },
    { req: 3, cov: 6, reason: 'Training conflict — NJ Fire Academy course',           status: 'approved', createdDaysAgo: 4 },
    { req: 7, cov: 0, reason: 'Personal day',                                         status: 'pending',  createdDaysAgo: 1 },
    { req: 1, cov: 5, reason: 'Anniversary dinner with spouse',                       status: 'approved', createdDaysAgo: 8 },
    { req: 4, cov: 3, reason: 'Child soccer tournament — out of state',               status: 'approved', createdDaysAgo: 12 },
    { req: 6, cov: 2, reason: 'Home renovation — final inspection day',               status: 'denied',   createdDaysAgo: 15 },
    { req: 0, cov: 7, reason: 'County fire chiefs meeting',                           status: 'approved', createdDaysAgo: 9 },
  ];

  let inserted = 0;
  for (let i = 0; i < SWAPS.length; i++) {
    const s = SWAPS[i];
    const requester = m[s.req];
    const covered = m[s.cov];
    if (!requester || !covered) continue;
    const ts = daysAgo(s.createdDaysAgo);
    await db.query(
      `INSERT INTO shift_swaps
         (station_id, "shiftId", "requesterId", "requesterName", "coveredById", "coveredByName", status, reason, notes, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [1, sid(i), requester.id, requester.name, covered.id, covered.name, s.status, s.reason, '', ts, ts]
    );
    inserted++;
  }
  console.log(`Shift swaps seed: inserted ${inserted} swaps.`);
};
