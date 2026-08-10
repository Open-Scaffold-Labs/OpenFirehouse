'use strict';
// Phase 1.1c-b (HARDEN THE TAIL) — daily_staffing folded into the date-keyed riding
// board (migration 0070). Adversarial FLSA/hours regression: the on-duty assignment IS
// the timecard line ("the timecard flows from the seat/assignment you rode"), a
// seatless-but-paid assignment (apparatus_id NULL) is first-class, and the market
// invariant is multi-rig-per-day allowed + seat-capacity enforced (NOT one-rig-per-day).
//
// Every live-DB case here was first run as a manual probe this session; this file makes
// them permanent and could-actually-fail (lesson #29). DB cases are opt-in via
// TENANCY_TEST_DB like the sibling suites.

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[ridingBoardHours] TENANCY_TEST_DB not set — skipping live-DB 1.1c-b suite.');
  test('1.1c-b riding-board hours (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;

  test('1.1c-b — hours fold: parity, seatless-paid, multi-rig/day, seat-capacity, cross-tenant', async () => {
    const db = require('../db');
    const { pool } = db;
    const MARK = 'RBH-1_1cb';

    // The EXACT payroll read timesheets.js runs after the fold (0070).
    const timesheetHours = (deptId, memberId, start, end) => pool.query(
      `SELECT COALESCE(SUM(hours),0) AS total FROM apparatus_assignments
       WHERE department_id = $1 AND member_id = $2 AND date BETWEEN $3 AND $4`,
      [deptId, memberId, start, end]
    ).then(r => Number(r.rows[0].total));

    const ins = (dept, member, app, pos, date, hours) => pool.query(
      `INSERT INTO apparatus_assignments (department_id, date, member_id, apparatus_id, position_name, hours, status)
       VALUES ($1,$2,$3,$4,$5,$6,'on_duty')`, [dept, date, member, app, pos, hours]);

    async function cleanup() {
      await pool.query(`DELETE FROM apparatus_assignments WHERE position_name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM apparatus WHERE designation LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM members WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }

    try {
      await cleanup();
      const deptA = (await pool.query(`INSERT INTO departments (name) VALUES ('${MARK} A') RETURNING id`)).rows[0].id;
      const deptB = (await pool.query(`INSERT INTO departments (name) VALUES ('${MARK} B') RETURNING id`)).rows[0].id;
      // Per-station roster grain (0072): case 8's crew derivation filters by station_id, so the
      // apparatus must carry a real station_id for the trigger to stamp its assignments.
      const stnA = (await pool.query(
        `INSERT INTO stations (department_id, name, address, city, state) VALUES ($1, '${MARK} Station', '', '', '') RETURNING id`,
        [deptA])).rows[0].id;

      const mkMember = async (dept, n, rank = 'Firefighter') => (await pool.query(
        `INSERT INTO members ("memberNumber", name, rank, role, joined, status, department_id, station_id)
         VALUES ($1,$2,$3,'Member','2026-01-01','Active',$4,NULL) RETURNING id`,
        [`${MARK}-${n}`, `${MARK} M${n}`, rank, dept])).rows[0].id;
      const memA = await mkMember(deptA, 1, 'Captain');
      const memA2 = await mkMember(deptA, 2);
      const memB = await mkMember(deptB, 3);

      const mkApp = async (dept, n, stationId = null) => (await pool.query(
        `INSERT INTO apparatus (designation, type, year, department_id, station_id) VALUES ($1,'Engine',2020,$2,$3) RETURNING id`,
        [`${MARK} E${n}`, dept, stationId])).rows[0].id;
      const e1 = await mkApp(deptA, 1, stnA);
      const e2 = await mkApp(deptA, 2, stnA);

      const D1 = '2099-05-01', D2 = '2099-05-02';

      // 1) PARITY — a seat's hours sum into the member's timecard across the period.
      await ins(deptA, memA, e1, `${MARK} Officer`, D1, 24);
      await ins(deptA, memA, e1, `${MARK} Officer`, D2, 12);
      assert.equal(await timesheetHours(deptA, memA, '2099-05-01', '2099-05-31'), 36, 'seat hours sum into the timecard');

      // 2) SEATLESS-BUT-PAID — apparatus_id NULL (duty cmd / floater / admin) still accrues.
      await ins(deptA, memA, null, `${MARK} Duty Officer`, '2099-05-03', 8);
      assert.equal(await timesheetHours(deptA, memA, '2099-05-01', '2099-05-31'), 44, 'seatless on-duty hours count');

      // 3) MULTI-RIG PER DAY ALLOWED (market invariant) — same member, 2nd rig, same day,
      //    both count. The board does NOT enforce one-rig-per-day.
      await ins(deptA, memA, e2, `${MARK} Officer`, D1, 6);
      assert.equal(await timesheetHours(deptA, memA, '2099-05-01', '2099-05-01'), 30, 'member on two rigs same day: both hours count');

      // 4) SEAT-CAPACITY still enforced — one person per seat per rig per day.
      let blocked = false;
      try { await ins(deptA, memA2, e1, `${MARK} Officer`, D1, 24); }
      catch (e) { blocked = (e.code === '23505'); }
      assert.ok(blocked, 'uq_apparatus_assignments_seat blocks two members in one seat that day');

      // 5) CROSS-TENANT — a department's payroll read never sees another dept's hours.
      await ins(deptB, memB, null, `${MARK} FF`, D1, 24);
      assert.equal(await timesheetHours(deptA, memB, '2099-05-01', '2099-05-31'), 0, 'dept A read excludes dept B member');
      assert.equal(await timesheetHours(deptB, memA, '2099-05-01', '2099-05-31'), 0, 'dept B read excludes dept A member');
      assert.equal(await timesheetHours(deptB, memB, '2099-05-01', '2099-05-31'), 24, 'dept B sees its own member hours');

      // 6) IMPORT-SAFE (0070 write-path regression) — a roster import restates SEATS only
      //    and must NEVER erase or reattribute recorded hours. Replays importRunList's exact
      //    statements: delete pure seat rows (hours IS NULL), then guarded upsert.
      const D9 = '2099-05-09';
      const memC = await mkMember(deptA, 4);
      await ins(deptA, memC, e1, `${MARK} Seat`, D9, 24); // memC: 24h recorded on E1/Seat
      await pool.query(
        `DELETE FROM apparatus_assignments WHERE department_id=$1 AND date=$2 AND hours IS NULL`, [deptA, D9]);
      await pool.query(
        `INSERT INTO apparatus_assignments (apparatus_id, position_id, member_id, department_id, position_name, date)
         VALUES ($1,NULL,$2,$3,$4,$5)
         ON CONFLICT (department_id, date, apparatus_id, position_name)
           DO UPDATE SET member_id = EXCLUDED.member_id WHERE apparatus_assignments.hours IS NULL`,
        [e1, memA2, deptA, `${MARK} Seat`, D9]);
      assert.equal(await timesheetHours(deptA, memC, D9, D9), 24, 'import did not erase memC recorded hours');
      const seatOwner = (await pool.query(
        `SELECT member_id FROM apparatus_assignments WHERE department_id=$1 AND date=$2 AND apparatus_id=$3 AND position_name=$4`,
        [deptA, D9, e1, `${MARK} Seat`])).rows[0].member_id;
      assert.equal(seatOwner, memC, 'import did not reattribute the hours-bearing seat to another member');

      // 7) REASSIGN-SAFE — the run-list seat-move per-member delete must not erase hours.
      await pool.query(
        `DELETE FROM apparatus_assignments WHERE department_id=$1 AND date=$2 AND member_id=$3 AND hours IS NULL`,
        [deptA, D9, memC]);
      assert.equal(await timesheetHours(deptA, memC, D9, D9), 24, 'seat-move did not erase memC recorded hours');

      // 8) CREW ONE-PER-TOUR (1.1c-c) — after reconciliation a member-tour is ONE row, so
      //    the crew derivation lists the member once; a GENUINE multi-rig day (two seated
      //    hours rows) still lists both seats (market invariant preserved).
      const { deriveCrewFromAssignments } = require('../utils/runListPublish');
      const DA = '2099-05-20';
      await ins(deptA, memA, e1, `${MARK} Ofc`, DA, 24); // one reconciled tour: seat + hours in one row
      let crew = await deriveCrewFromAssignments(pool, deptA, stnA, DA);
      assert.equal(crew.filter((c) => c.member_id === memA).length, 1, 'a reconciled tour lists the member once');
      await ins(deptA, memA, e2, `${MARK} Ofc`, DA, 6); // genuine multi-rig: 2nd rig, also with hours
      crew = await deriveCrewFromAssignments(pool, deptA, stnA, DA);
      assert.equal(crew.filter((c) => c.member_id === memA).length, 2, 'genuine multi-rig day still lists both seats');
    } finally {
      await cleanup();
      await pool.end().catch(() => {});
    }
  });
}
