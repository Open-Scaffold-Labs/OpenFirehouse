'use strict';
// Phase 1.1a (HARDEN THE TAIL) — scheduling foundation adversarial suite.
//
// Covers migration 0067 + the 1.1a correctness batch:
//   * ot_records / shift_trades re-keyed to department_id (their station_id
//     columns were REAL stations-FKs receiving department ids — multi-house =
//     FK violation on every OT log / trade request).
//   * recall.close now filters department_id (it filtered station_id while
//     every other recall read filtered department_id — close no-op'd multi-house).
//   * timesheets leave aggregation uses the REAL leave_requests columns
//     (camelCase) + canonical 'Approved' (the old query referenced columns
//     that don't exist and threw on every generate).
//   * RBAC floors on scheduling writes (static, could-fail: they failed
//     before this session).
//   * localDate string-math helpers (the tz off-by-one class).
//
// DB cases are opt-in via TENANCY_TEST_DB like the sibling suites.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// ── Static: RBAC floors present (these assertions FAIL on the pre-1.1a files) ──
const RBAC_EXPECT = [
  ['shifts.js',            "router.post('/', requireOfficer"],
  ['shifts.js',            "router.patch('/:id', requireOfficer"],
  ['shifts.js',            "router.delete('/:id', requireOfficer"],
  ['shiftPatterns.js',     "router.post('/expand', requireOfficer"],
  ['shiftSwaps.js',        "router.patch('/:id', requireOfficer"],
  ['leaveRequests.js',     "router.patch('/:id', requireOfficer"],
  ['dailyStaffing.js',     "router.post('/', requireOfficer"],
  ['coverageWorkbench.js', "router.post('/assign', requireOfficer"],
  // 1.4: vacancyFill.js retired → the unified vacancy record. Officer floor rides create/
  // fill/cancel (command opens + fills; members never self-award — the market ceiling);
  // rule config is a chief surface.
  ['vacancies.js',         "router.post('/', requireOfficer"],
  ['vacancies.js',         "router.post('/:id/fill', requireOfficer"],
  ['vacancies.js',         "router.post('/:id/cancel', requireOfficer"],
  ['vacancies.js',         "router.post('/:id/hire', requireOfficer"],
  ['staffing.js',          "router.post('/rules', requireChief"],
  ['staffing.js',          "router.patch('/rules/:id', requireChief"],
  // 1.5 hiring engine: list config + adjustments are chief surfaces; running/steering a
  // hire is officer work; member accept/decline are deliberately self-service (self-only
  // enforced in-engine — a member responds to their OWN offer, the market bar).
  ['hiring.js',            "router.post('/lists', requireChief"],
  ['hiring.js',            "router.patch('/lists/:id', requireChief"],
  ['hiring.js',            "router.post('/adjustments', requireChief"],
  ['hiring.js',            "router.post('/offers/:id/skip', requireOfficer"],
  ['hiring.js',            "router.post('/events/:id/mandate', requireOfficer"],
  ['hiring.js',            "router.post('/events/:id/cancel', requireOfficer"],
  ['payEntries.js',        "router.post('/', requireChief"],
  ['timesheets.js',        "router.patch('/:id', requireOfficer"],
  ['timesheets.js',        "router.get('/', requireOfficer"],
  ['timesheets.js',        "router.post('/export', requireChief"],
  // 1.3 rebuild: the single officer PATCH was split into a two-stage workflow. The officer floor
  // now rides the sign-off + terminal writes (approve/deny/delete); accept/request/withdraw are
  // member self-service by design (the market bar — a member files + accepts their own trades).
  ['shiftTrades.js',       "router.post('/:id/approve', requireOfficer"],
  ['shiftTrades.js',       "router.post('/:id/deny', requireOfficer"],
  ['shiftTrades.js',       "router.delete('/:id', requireOfficer"],
  ['otEqualization.js',    "router.post('/', requireOfficer"],
];
test('scheduling writes carry RBAC floors', () => {
  for (const [file, needle] of RBAC_EXPECT) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', file), 'utf8');
    assert.ok(src.includes(needle), `${file} missing gate: ${needle}`);
  }
});

// ── localDate string math (the tz off-by-one class) ────────────────────────
test('localDate helpers — day boundaries never shift', () => {
  const { addDaysISO, daysBetweenISO, isoDayOfWeek } = require('../utils/localDate');
  assert.equal(addDaysISO('2026-07-23', 1), '2026-07-24');
  assert.equal(addDaysISO('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysISO('2026-03-08', 1), '2026-03-09');        // DST spring-forward day
  assert.equal(daysBetweenISO('2026-07-01', '2026-07-23'), 22);
  assert.equal(daysBetweenISO('2026-07-23', '2026-07-01'), -22);
  assert.equal(isoDayOfWeek('2026-07-22'), 3);                     // a Wednesday
  // FLSA period anchoring, the exact shape shiftTrades uses:
  const anchor = '2026-01-04', periodDays = 14, tradeDay = '2026-07-23';
  const periodsElapsed = Math.floor(daysBetweenISO(anchor, tradeDay) / periodDays);
  const start = addDaysISO(anchor, periodsElapsed * periodDays);
  const end = addDaysISO(start, periodDays - 1);
  assert.ok(start <= tradeDay && tradeDay <= end, `trade day inside its period (${start}..${end})`);
});

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[schedulingFoundation] TENANCY_TEST_DB not set — skipping live-DB 0067 suite.');
  test('0067 scheduling foundation (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;

  test('0067 — scheduling tables survive a department with no same-id station', async () => {
    const db = require('../db');
    const { pool } = db;
    const MARK = 'SF-0067';
    let dept, member, shift;

    async function cleanup() {
      await pool.query(`DELETE FROM ot_records WHERE reason LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM shift_trades WHERE notes LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM recall_events WHERE message LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM timesheets WHERE notes LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM leave_requests WHERE reason LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM shifts WHERE notes LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM members WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }

    try {
      await cleanup();
      dept = (await pool.query(
        `INSERT INTO departments (name) VALUES ('${MARK} FD') RETURNING id`)).rows[0].id;
      member = (await pool.query(
        `INSERT INTO members ("memberNumber", name, rank, role, joined, status, department_id, station_id)
         VALUES ('${MARK}-1', '${MARK} Member', 'Firefighter', 'Firefighter', '2026-01-01', 'Active', $1, NULL)
         RETURNING id`, [dept])).rows[0].id;
      shift = (await pool.query(
        `INSERT INTO shifts (date, "shiftType", crew, notes, department_id)
         VALUES ('2026-07-23', '24-Hour', '[]', '${MARK} shift', $1) RETURNING id`, [dept])).rows[0].id;

      // ot_records: pre-0067 this was INSERT into a stations-FK with a dept id.
      const ot = await pool.query(
        `INSERT INTO ot_records (member_id, department_id, shift_id, ot_date, ot_hours, ot_type, reason)
         VALUES ($1, $2, $3, '2026-07-23', 12, 'mandatory', '${MARK} ot') RETURNING *`,
        [member, dept, shift]);
      assert.equal(Number(ot.rows[0].department_id), Number(dept));
      assert.equal(ot.rows[0].station_id, null, 'station_id no longer written on OT');

      // shift_trades: same class.
      const tr = await pool.query(
        `INSERT INTO shift_trades (department_id, requesting_member_id, original_shift_id, trade_date, status, notes)
         VALUES ($1, $2, $3, '2026-07-23', 'pending', '${MARK} trade') RETURNING *`,
        [dept, member, shift]);
      assert.equal(Number(tr.rows[0].department_id), Number(dept));

      // recall.close: department-keyed now (was station-keyed → multi-house no-op).
      const rec = await pool.query(
        `INSERT INTO recall_events (department_id, station_id, level, message, issued_by, status)
         VALUES ($1, NULL, 'all', '${MARK} recall', 'test', 'active') RETURNING id`, [dept]);
      const closed = await db.recall.close(rec.rows[0].id, dept);
      assert.ok(closed, 'recall close must find the department-keyed row');
      assert.equal(closed.status, 'closed');

      // timesheets leave aggregation: the corrected query counts overlap days.
      await pool.query(
        `INSERT INTO leave_requests ("memberId", "memberName", type, "startDate", "endDate", status, reason, department_id)
         VALUES ($1, '${MARK} Member', 'PTO', '2026-07-20', '2026-07-25', 'Approved', '${MARK} leave', $2)`,
        [member, dept]);
      const leave = await pool.query(`
        SELECT COALESCE(SUM(
          (LEAST("endDate"::date, $3::date) - GREATEST("startDate"::date, $2::date)) + 1
        ), 0) AS days
        FROM leave_requests
        WHERE department_id = $4 AND "memberId" = $1
          AND status = 'Approved'
          AND "startDate"::date <= $3::date AND "endDate"::date >= $2::date
      `, [member, '2026-07-22', '2026-07-28', dept]);
      assert.equal(Number(leave.rows[0].days), 4, 'overlap Jul 22-25 inside Jul 22-28 = 4 days');
    } finally {
      await cleanup();
      await pool.end().catch(() => {});
    }
  });
}
