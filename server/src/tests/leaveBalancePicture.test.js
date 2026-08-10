// Phase 1.2e-a — the member's TRUE leave picture on GET /api/leave-types/balances.
// Proves the market "two numbers" are exact AND that the debit-at-approval model is not
// double-counted: because approving a leave debits the bank immediately (1.2b), posted_balance
// already excludes approved-future ("scheduled") leave, so available_to_request = posted −
// pending ONLY. scheduled (future) and used (past) are shown separately.
//   Setup: grant 40 VAC; approve a FUTURE 8h leave (posted 40→32, scheduled 8); approve a
//   PAST 4h leave (posted 32→28, used 4); leave a PENDING 6h request (not debited).
//   Expect: posted 28, scheduled 8, used 4, pending 6, available_to_request = 28 − 6 = 22.
// OPT-IN via TENANCY_TEST_DB.

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[leaveBalancePicture] TENANCY_TEST_DB not set — skipping live-DB 1.2e-a suite.');
  test('1.2e-a balance picture (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('1.2e-a — balances picture: posted/pending/scheduled/used + available_to_request (no double-count)', async () => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...a) => { const t = realSetInterval(...a); if (t && t.unref) t.unref(); return t; };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    async function api(method, path, token, body) {
      const res = await fetch(baseUrl + path, {
        method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined });
      let json = null; try { json = await res.json(); } catch {}
      return { status: res.status, json };
    }

    const MARK = 'LB-1_2e';
    let deptA, stnA, chiefId, memberUid, memberRow;
    async function cleanup() {
      if (deptA) {
        await pool.query(`DELETE FROM leave_accrual_ledger WHERE department_id = $1`, [deptA]);
        await pool.query(`DELETE FROM leave_requests WHERE department_id = $1`, [deptA]);
        await pool.query(`DELETE FROM leave_balances WHERE department_id = $1`, [deptA]);
        await pool.query(`DELETE FROM leave_types WHERE department_id = $1`, [deptA]);
      }
      await pool.query(`DELETE FROM members WHERE "memberNumber" LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'lb_1_2e_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'lb_1_2e_%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) { try { const r = await fetch(`${baseUrl}/api/setup-status`); if (r.status === 200) { ready = true; break; } } catch {} await new Promise((x) => setTimeout(x, 1000)); }
      assert.ok(ready, 'DB never ready');
      await cleanup();

      deptA = await mkAlignedDeptStation(pool, `${MARK} Dept`);
      stnA = deptA;
      chiefId = (await pool.query(`INSERT INTO users (username,name,initials,role,"passwordHash",station_id) VALUES ('lb_1_2e_chief','Chief E','CE','chief','x',$1) RETURNING id`, [stnA])).rows[0].id;
      memberUid = (await pool.query(`INSERT INTO users (username,name,initials,role,"passwordHash",station_id) VALUES ('lb_1_2e_member','Mem E','ME','member','x',$1) RETURNING id`, [stnA])).rows[0].id;
      await pool.query(`INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,'chief') ON CONFLICT DO NOTHING`, [chiefId, deptA]);
      await pool.query(`INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING`, [memberUid, deptA]);
      memberRow = (await pool.query(`INSERT INTO members ("memberNumber",name,rank,role,status,joined,station_id,department_id,user_id) VALUES ('${MARK}-M','Pic Member','Firefighter','member','Active','2019-01-01',$1,$2,$3) RETURNING id`, [stnA, deptA, memberUid])).rows[0].id;

      const chief = jwt.sign({ sub: chiefId, username: 'lb_1_2e_chief', role: 'chief' }, ACCESS_SECRET, { expiresIn: '15m' });
      const member = jwt.sign({ sub: memberUid, username: 'lb_1_2e_member', role: 'member' }, ACCESS_SECRET, { expiresIn: '15m' });

      const types = await api('GET', '/api/leave-types', chief);
      const vac = types.json.data.find((t) => t.code === 'VAC');

      // Grant 40 VAC.
      await api('POST', '/api/leave-types/ledger', chief, { memberId: memberRow, leaveTypeId: vac.id, deltaHours: 40, reason: 'grant' });

      // A BANKED leave cannot be created directly as Approved (it would skip the ledger debit,
      // drifting scheduled/used from posted) — it must go Pending → approve.
      const directApproved = await api('POST', '/api/leave', chief, {
        memberId: memberRow, memberName: `${MARK} M`, type: 'Vacation',
        startDate: '2027-11-01', endDate: '2027-11-01', leaveTypeId: vac.id, hours: 5, status: 'Approved' });
      assert.equal(directApproved.status, 400, 'banked leave cannot be created directly as Approved');
      assert.equal(directApproved.json.code, 'BANKED_MUST_BE_PENDING');

      // Approve a FUTURE 8h leave (debits → posted 32; scheduled 8).
      const fut = await api('POST', '/api/leave', chief, { memberId: memberRow, memberName: `${MARK} M`, type: 'Vacation', startDate: '2027-09-01', endDate: '2027-09-01', leaveTypeId: vac.id, hours: 8 });
      await api('PATCH', `/api/leave/${fut.json.data.id}`, chief, { status: 'Approved' });

      // Approve a PAST 4h leave (debits → posted 28; used 4).
      const past = await api('POST', '/api/leave', chief, { memberId: memberRow, memberName: `${MARK} M`, type: 'Vacation', startDate: '2020-01-01', endDate: '2020-01-01', leaveTypeId: vac.id, hours: 4 });
      await api('PATCH', `/api/leave/${past.json.data.id}`, chief, { status: 'Approved' });

      // A PENDING 6h request (not debited; reduces available_to_request).
      await api('POST', '/api/leave', chief, { memberId: memberRow, memberName: `${MARK} M`, type: 'Vacation', startDate: '2027-10-01', endDate: '2027-10-01', leaveTypeId: vac.id, hours: 6 });

      // The member sees their own enriched picture.
      const res = await api('GET', '/api/leave-types/balances', member);
      assert.equal(res.status, 200);
      const row = res.json.data.find((r) => r.leave_type_id === vac.id);
      assert.ok(row, 'VAC balance row present for the member');
      assert.equal(Number(row.balance_hours), 28, 'posted balance = 40 − 8 (future) − 4 (past), both debited at approval');
      assert.equal(row.scheduled_hours, 8, 'scheduled = approved-future 8h');
      assert.equal(row.used_hours, 4, 'used = approved-past 4h');
      assert.equal(row.pending_hours, 6, 'pending = the submitted-not-approved 6h');
      assert.equal(row.available_to_request, 22, 'available = posted 28 − pending 6 = 22 (scheduled NOT subtracted again)');

      // ── 1.2e-b: member self-service endpoints ───────────────────────────
      // GET /api/leave/mine → the member's OWN requests only.
      const mine = await api('GET', '/api/leave/mine', member);
      assert.equal(mine.status, 200);
      assert.ok(mine.json.data.length >= 3, 'member sees their own requests');
      assert.ok(mine.json.data.every((l) => l.memberId === memberRow), 'mine returns only the caller\'s requests');

      // A member can self-file with NO memberId — the server resolves them from the JWT.
      const selfReq = await api('POST', '/api/leave', member, {
        type: 'Vacation', startDate: '2027-12-01', endDate: '2027-12-01', leaveTypeId: vac.id, hours: 2 });
      assert.equal(selfReq.status, 201, 'member self-files without a memberId');
      assert.equal(selfReq.json.data.memberId, memberRow, 'server resolved the caller as the member');

      // A member cannot file for someone else.
      const foreign = await api('POST', '/api/leave', member, {
        memberId: 999999, memberName: 'X', type: 'Vacation', startDate: '2027-12-02', endDate: '2027-12-02' });
      assert.equal(foreign.status, 403, 'member cannot file for another member');
      assert.equal(foreign.json.code, 'SELF_ONLY');

      // A member cannot self-APPROVE — status is clamped to Pending on the self-service path.
      const selfApprove = await api('POST', '/api/leave', member, {
        type: 'Personal', startDate: '2027-12-05', endDate: '2027-12-05', status: 'Approved', approvedBy: 'Chief' });
      assert.equal(selfApprove.status, 201);
      assert.equal(selfApprove.json.data.status, 'Pending', 'member self-request is clamped to Pending (no self-approve)');

      console.log('[leaveBalancePicture] all 1.2e-a + 1.2e-b cases passed.');
    } finally {
      await cleanup();
      await new Promise((r) => server.close(r));
    }
  });
}
