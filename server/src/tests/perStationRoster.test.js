'use strict';
// Phase 2.1a (HARDEN THE TAIL) — per-station roster grain (migration 0072). The daily
// riding board was re-keyed from (department, date) to (department, STATION, date): each
// firehouse publishes its own board. Before the re-key, a department's second station
// clobbered the first the moment both published the same date — a shared department-wide
// row per date was the market-wrong grain.
//
// This suite is the MULTI-HOUSE ADVERSARIAL test for the re-key: ONE department, TWO
// stations, and it proves the exact collision the re-key prevents plus cross-station crew
// isolation. Every case could actually fail (lesson #29). DB cases are opt-in via
// TENANCY_TEST_DB like the sibling suites.

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[perStationRoster] TENANCY_TEST_DB not set — skipping live-DB 2.1a suite.');
  test('2.1a per-station roster grain (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;

  test('2.1a — two stations, one department: distinct boards, cross-station crew isolation, idempotent republish', async () => {
    const db = require('../db');
    const { pool } = db;
    const { publishSnapshot, deriveCrewFromAssignments } = require('../utils/runListPublish');
    const MARK = 'PSR-2_1a';

    async function cleanup() {
      await pool.query(`DELETE FROM run_lists WHERE payload::text LIKE '%${MARK}%'`);
      await pool.query(`DELETE FROM apparatus_assignments WHERE position_name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM apparatus_positions WHERE position_name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM apparatus WHERE designation LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM members WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }

    try {
      await cleanup();
      // ONE department running TWO firehouses.
      const dept = (await pool.query(`INSERT INTO departments (name) VALUES ('${MARK} Dept') RETURNING id`)).rows[0].id;
      const stnA = (await pool.query(
        `INSERT INTO stations (department_id, name, address, city, state) VALUES ($1, '${MARK} Station A', '', '', '') RETURNING id`,
        [dept])).rows[0].id;
      const stnB = (await pool.query(
        `INSERT INTO stations (department_id, name, address, city, state) VALUES ($1, '${MARK} Station B', '', '', '') RETURNING id`,
        [dept])).rows[0].id;

      // A rig at each house. Real station_ids so the BEFORE-INSERT trigger stamps each
      // assignment's station_id from its apparatus.
      const appA = (await pool.query(
        `INSERT INTO apparatus (designation, type, year, department_id, station_id) VALUES ('${MARK} E1', 'Engine', 2020, $1, $2) RETURNING id`,
        [dept, stnA])).rows[0].id;
      const appB = (await pool.query(
        `INSERT INTO apparatus (designation, type, year, department_id, station_id) VALUES ('${MARK} E2', 'Engine', 2020, $1, $2) RETURNING id`,
        [dept, stnB])).rows[0].id;

      // A rider riding at each house.
      const memA = (await pool.query(
        `INSERT INTO members ("memberNumber", name, rank, role, joined, status, department_id, station_id)
         VALUES ('${MARK}-A', '${MARK} Member A', 'Captain', 'Officer', '2026-01-01', 'Active', $1, $2) RETURNING id`,
        [dept, stnA])).rows[0].id;
      const memB = (await pool.query(
        `INSERT INTO members ("memberNumber", name, rank, role, joined, status, department_id, station_id)
         VALUES ('${MARK}-B', '${MARK} Member B', 'Firefighter', 'Member', '2026-01-01', 'Active', $1, $2) RETURNING id`,
        [dept, stnB])).rows[0].id;

      const D = '2099-07-01';

      // Seat each rider on its house's rig. station_id is left to the trigger (stamped
      // from the apparatus) — the exact write path the web/board uses.
      await pool.query(
        `INSERT INTO apparatus_assignments (apparatus_id, position_id, member_id, department_id, position_name, date)
         VALUES ($1,NULL,$2,$3,$4,$5)`, [appA, memA, dept, `${MARK} Officer A`, D]);
      await pool.query(
        `INSERT INTO apparatus_assignments (apparatus_id, position_id, member_id, department_id, position_name, date)
         VALUES ($1,NULL,$2,$3,$4,$5)`, [appB, memB, dept, `${MARK} Officer B`, D]);

      // (a) NO COLLISION — same department, same date, two stations → TWO distinct rows.
      const pA = await publishSnapshot(pool, dept, stnA, D, { source: 'published' });
      const pB = await publishSnapshot(pool, dept, stnB, D, { source: 'published' });
      const total = (await pool.query(
        'SELECT count(*)::int n FROM run_lists WHERE department_id=$1 AND date=$2', [dept, D])).rows[0].n;
      assert.equal(total, 2, 'two stations publish the same date without clobbering — the re-key fix');
      assert.notEqual(Number(pA.row.station_id), Number(pB.row.station_id), 'the two rows key on different stations');
      assert.equal(Number(pA.row.station_id), Number(stnA), 'station A row keyed on station A');
      assert.equal(Number(pB.row.station_id), Number(stnB), 'station B row keyed on station B');

      // (b) CROSS-STATION ISOLATION — each station's crew is only its own house's rider.
      assert.equal(pA.crew.length, 1, 'station A board has exactly one rider');
      assert.equal(pA.crew[0].member_id, memA, 'station A board shows station A rider');
      assert.equal(pB.crew.length, 1, 'station B board has exactly one rider');
      assert.equal(pB.crew[0].member_id, memB, 'station B board shows station B rider');
      const crewA = await deriveCrewFromAssignments(pool, dept, stnA, D);
      assert.deepEqual(crewA.map((c) => c.member_id), [memA], 'derive for station A returns only station A rider');
      const crewB = await deriveCrewFromAssignments(pool, dept, stnB, D);
      assert.deepEqual(crewB.map((c) => c.member_id), [memB], 'derive for station B returns only station B rider');

      // (c) IDEMPOTENT REPUBLISH — republishing station A upserts, never duplicates its row.
      await publishSnapshot(pool, dept, stnA, D, { source: 'published' });
      const cntA = (await pool.query(
        'SELECT count(*)::int n FROM run_lists WHERE department_id=$1 AND station_id=$2 AND date=$3', [dept, stnA, D])).rows[0].n;
      assert.equal(cntA, 1, 'republish upserts station A, never a second row for (dept, station, date)');
      const stillTwo = (await pool.query(
        'SELECT count(*)::int n FROM run_lists WHERE department_id=$1 AND date=$2', [dept, D])).rows[0].n;
      assert.equal(stillTwo, 2, 'station A republish left station B untouched — still two rows total');

      // (d) DEPARTMENT ROLLUP (2.1b) — GET /api/run-list/all returns every station's roster
      //     for the date. Replicate its exact query and assert both houses appear with counts.
      const roll = await pool.query(
        `SELECT s.id AS station_id, s.name AS station_name, rl.payload
           FROM stations s
           LEFT JOIN LATERAL (
             SELECT payload FROM run_lists WHERE department_id = $1 AND station_id = s.id AND date = $2
              ORDER BY submitted_at DESC LIMIT 1
           ) rl ON true
          WHERE s.department_id = $1
          ORDER BY s.name`, [dept, D]);
      const rollStations = roll.rows.filter((r) => (r.station_name || '').startsWith(MARK));
      assert.equal(rollStations.length, 2, 'rollup lists both houses of the department');
      const counts = rollStations.map((r) => (Array.isArray(r.payload && r.payload.crew) ? r.payload.crew.length : 0));
      assert.deepEqual(counts, [1, 1], 'rollup shows each house its own crew count');

      // (e) DETAIL / MOVE-UP (2.2): a rider whose HOME station differs from the board's
      //     station is flagged as a detail; a rider at their home station is not.
      await pool.query('UPDATE members SET home_station_id = $1 WHERE id = $2', [stnB, memA]); // memA home = B, riding A
      const rowA = (await deriveCrewFromAssignments(pool, dept, stnA, D)).find((c) => c.member_id === memA);
      assert.equal(rowA.detailed, true, 'a rider off their home station is flagged as a detail');
      assert.equal(Number(rowA.home_station_id), Number(stnB), 'the detail carries the home station id');
      await pool.query('UPDATE members SET home_station_id = $1 WHERE id = $2', [stnB, memB]); // memB home = B, riding B
      const rowB = (await deriveCrewFromAssignments(pool, dept, stnB, D)).find((c) => c.member_id === memB);
      assert.equal(rowB.detailed, false, 'a rider at their home station is not a detail');

      // (f) PER-STATION MIN-STAFFING (2.4): station A's rig seat is filled; station B's rig
      //     has an OPEN seat → the per-station rollup groups seats by station and flags B short.
      const { apparatusVerdict } = require('../utils/staffingScore');
      await pool.query('INSERT INTO apparatus_positions (apparatus_id, position_name, department_id) VALUES ($1,$2,$3)',
        [appA, `${MARK} Officer A`, dept]);
      await pool.query('INSERT INTO apparatus_positions (apparatus_id, position_name, department_id) VALUES ($1,$2,$4),($1,$3,$4)',
        [appB, `${MARK} Officer B`, `${MARK} FF B`, dept]); // two seats; only 'Officer B' is filled (memB), 'FF B' open
      const posRows = (await pool.query(
        `SELECT ap.apparatus_id, ap.position_name, a.station_id FROM apparatus_positions ap
           JOIN apparatus a ON a.id = ap.apparatus_id WHERE ap.department_id = $1 AND ap.position_name LIKE '${MARK}%'`,
        [dept])).rows;
      const asg = (await pool.query(
        'SELECT apparatus_id, position_name FROM apparatus_assignments WHERE department_id = $1 AND date = $2', [dept, D])).rows;
      const filledSet = new Set(asg.map((a) => `${a.apparatus_id}::${a.position_name}`));
      const byApp = new Map();
      for (const p of posRows) {
        if (!byApp.has(p.apparatus_id)) byApp.set(p.apparatus_id, { stationId: p.station_id, seats: [] });
        byApp.get(p.apparatus_id).seats.push({ filled: filledSet.has(`${p.apparatus_id}::${p.position_name}`) });
      }
      assert.equal(byApp.get(appA).seats.filter((s) => !s.filled).length, 0, 'station A rig is fully staffed');
      assert.ok(byApp.get(appB).seats.filter((s) => !s.filled).length > 0, 'station B rig has an open seat — understaffed');
      assert.equal(apparatusVerdict(byApp.get(appA).seats), 'staffed', 'station A rig verdict is staffed');
      assert.notEqual(apparatusVerdict(byApp.get(appB).seats), 'staffed', 'station B rig verdict is not staffed');
    } finally {
      await cleanup();
      await pool.end().catch(() => {});
    }
  });
}
