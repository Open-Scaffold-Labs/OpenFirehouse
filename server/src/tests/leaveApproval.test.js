// Phase 1.2b (HARDEN THE TAIL) — leave approval writes the bank ledger (migrations 0076/0077).
// Adversarial suite: every case could fail. Proves, against a REAL Postgres via the real API:
//   1. Approving a banked leave posts ONE `usage` debit (balance = granted − hours), linked to the request.
//   2. Idempotent — re-PATCHing an already-Approved request does NOT double-debit.
//   3. Cancelling an approved leave (Approved→Denied) posts a `reversal` that restores the balance.
//   4. Denying a PENDING request posts no ledger movement (audit only).
//   5. Insufficient balance refuses the approval (422 INSUFFICIENT_BALANCE) with no state change.
//   6. A legacy request with no bank/hours approves normally with no ledger movement.
//   7. Deleting an approved banked leave posts a reversal (restores the balance).
//   8. Balance parity holds throughout (cache == Σ ledger).
//
// OPT-IN via TENANCY_TEST_DB, like the sibling suites. Skips clean without it.

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[leaveApproval] TENANCY_TEST_DB not set — skipping live-DB 1.2b suite.');
  test('1.2b leave approval (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('1.2b — leave approval: usage debit, idempotency, reversal, insufficient-balance, legacy, delete', async () => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => {
      const tmr = realSetInterval(...args);
      if (tmr && typeof tmr.unref === 'function') tmr.unref();
      return tmr;
    };
    let app;
    try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');

    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    async function api(method, path, token, body) {
      const res = await fetch(baseUrl + path, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
      return { status: res.status, json };
    }

    const MARK = 'LB-1_2b';
    let deptA, stnA, chiefAId, memberRow;
    async function cleanup() {
      if (deptA) {
        await pool.query(`DELETE FROM leave_accrual_ledger WHERE department_id = $1`, [deptA]);
        await pool.query(`DELETE FROM leave_requests WHERE department_id = $1 AND "memberName" LIKE '${MARK}%'`, [deptA]);
        await pool.query(`DELETE FROM leave_balances WHERE department_id = $1`, [deptA]);
        await pool.query(`DELETE FROM leave_types WHERE department_id = $1`, [deptA]);
      }
      await pool.query(`DELETE FROM members WHERE "memberNumber" LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'lb_1_2b_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'lb_1_2b_%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }

    async function ledgerBalance(typeId) {
      const r = await pool.query(
        'SELECT COALESCE(SUM(delta_hours),0)::numeric AS s FROM leave_accrual_ledger WHERE department_id=$1 AND member_id=$2 AND leave_type_id=$3',
        [deptA, memberRow, typeId]);
      return Number(r.rows[0].s);
    }
    async function cacheBalance(typeId) {
      const r = await pool.query(
        'SELECT balance_hours FROM leave_balances WHERE department_id=$1 AND member_id=$2 AND leave_type_id=$3',
        [deptA, memberRow, typeId]);
      return r.rows.length ? Number(r.rows[0].balance_hours) : 0;
    }

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) {
        try { const r = await fetch(`${baseUrl}/api/setup-status`); if (r.status === 200) { ready = true; break; } } catch {}
        await new Promise((r2) => setTimeout(r2, 1000));
      }
      assert.ok(ready, 'DB never became ready');
      await cleanup(); // pre-clean any leftovers from a crashed previous run

      deptA = await mkAlignedDeptStation(pool, `${MARK} Dept`);
      stnA = deptA;
      chiefAId = (await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", station_id) VALUES ('lb_1_2b_chief', 'Chief B', 'CB', 'chief', 'x', $1) RETURNING id`, [stnA])).rows[0].id;
      await pool.query(`INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1,$2,'chief') ON CONFLICT DO NOTHING`, [chiefAId, deptA]);
      memberRow = (await pool.query(
        `INSERT INTO members ("memberNumber", name, rank, role, status, joined, station_id, department_id) VALUES ('${MARK}-M1', 'Bank Member', 'Firefighter', 'member', 'Active', '2020-01-01', $1, $2) RETURNING id`,
        [stnA, deptA])).rows[0].id;
      const chief = jwt.sign({ sub: chiefAId, username: 'lb_1_2b_chief', role: 'chief' }, ACCESS_SECRET, { expiresIn: '15m' });

      // Seed banks, grab VAC, grant 40h to the member.
      const types = await api('GET', '/api/leave-types', chief);
      const vac = types.json.data.find((t) => t.code === 'VAC');
      await api('POST', '/api/leave-types/ledger', chief, { memberId: memberRow, leaveTypeId: vac.id, deltaHours: 40, reason: 'grant' });
      assert.equal(await ledgerBalance(vac.id), 40, 'granted 40h VAC');

      // ── 0. a BANKED create re-validates the member belongs to the dept (M3/N2) ──
      const badMember = await api('POST', '/api/leave', chief, {
        memberId: 999999, memberName: `${MARK} X`, type: 'Vacation',
        startDate: '2026-09-01', endDate: '2026-09-01', leaveTypeId: vac.id, hours: 8 });
      assert.equal(badMember.status, 400, 'banked create rejects a non-dept member');
      assert.equal(badMember.json.code, 'INVALID_MEMBER');
      // A NON-banked create for a non-roster member is still allowed (legacy behavior / N2).
      const legacyOk = await api('POST', '/api/leave', chief, {
        memberId: 999999, memberName: `${MARK} Legacy`, type: 'PTO', startDate: '2026-09-01', endDate: '2026-09-01' });
      assert.equal(legacyOk.status, 201, 'non-banked create is unaffected by the member gate');

      // ── 1. Approve → one usage debit ─────────────────────────────────────
      const req1 = await api('POST', '/api/leave', chief, {
        memberId: memberRow, memberName: `${MARK} Member`, type: 'Vacation',
        startDate: '2026-09-01', endDate: '2026-09-01', leaveTypeId: vac.id, hours: 24 });
      assert.equal(req1.status, 201, 'create banked leave request');
      const leaveId = req1.json.data.id;
      const ap = await api('PATCH', `/api/leave/${leaveId}`, chief, { status: 'Approved' });
      assert.equal(ap.status, 200, 'approve succeeds');
      assert.equal(ap.json.bank && ap.json.bank.movement, 'usage', 'approval reports a usage movement');
      assert.equal(await ledgerBalance(vac.id), 16, 'balance after 24h usage is 16');
      assert.equal(await cacheBalance(vac.id), 16, 'cache == ledger (parity)');
      const usageRows = await pool.query(
        `SELECT count(*)::int AS n FROM leave_accrual_ledger WHERE source_kind='leave_request' AND source_id=$1 AND reason='usage'`, [leaveId]);
      assert.equal(usageRows.rows[0].n, 1, 'exactly one usage entry linked to the request');

      // ── 2. Idempotent re-approve ─────────────────────────────────────────
      const ap2 = await api('PATCH', `/api/leave/${leaveId}`, chief, { status: 'Approved' });
      assert.equal(ap2.status, 200);
      assert.equal(await ledgerBalance(vac.id), 16, 're-PATCH of an approved request does NOT double-debit');

      // ── 3. Cancel after approve → reversal restores ──────────────────────
      const dn = await api('PATCH', `/api/leave/${leaveId}`, chief, { status: 'Denied' });
      assert.equal(dn.status, 200);
      assert.equal(dn.json.bank && dn.json.bank.movement, 'reversal', 'cancel reports a reversal');
      assert.equal(await ledgerBalance(vac.id), 40, 'reversal restores the balance to 40');

      // ── 3b. Re-approve (debits again), then cancel via a NON-'Denied' status → reversal (H2) ──
      const reap = await api('PATCH', `/api/leave/${leaveId}`, chief, { status: 'Approved' });
      assert.equal(reap.status, 200);
      assert.equal(await ledgerBalance(vac.id), 16, 're-approve after reversal debits again → 16');
      const cancel = await api('PATCH', `/api/leave/${leaveId}`, chief, { status: 'Cancelled' });
      assert.equal(cancel.status, 200);
      assert.equal(cancel.json.bank && cancel.json.bank.movement, 'reversal', 'a non-Denied un-approval still reverses (H2)');
      assert.equal(await ledgerBalance(vac.id), 40, 'cancel restores to 40');

      // ── 3c. Bank fields are FROZEN once approved (H3/freeze) ─────────────
      const frz = await api('POST', '/api/leave', chief, {
        memberId: memberRow, memberName: `${MARK} Member`, type: 'Vacation',
        startDate: '2026-09-03', endDate: '2026-09-03', leaveTypeId: vac.id, hours: 8 });
      await api('PATCH', `/api/leave/${frz.json.data.id}`, chief, { status: 'Approved' });
      const frozen = await api('PATCH', `/api/leave/${frz.json.data.id}`, chief, { hours: 4 });
      assert.equal(frozen.status, 409, 'editing hours on an approved leave is frozen');
      assert.equal(frozen.json.code, 'BANK_FROZEN');
      await api('DELETE', `/api/leave/${frz.json.data.id}`, chief); // reversal restores → 40
      assert.equal(await ledgerBalance(vac.id), 40, 'freeze case cleaned back to 40');

      // ── 3d. Cannot approve AND re-bank in one PATCH (N1) ────────────────
      const n1 = await api('POST', '/api/leave', chief, {
        memberId: memberRow, memberName: `${MARK} Member`, type: 'Vacation',
        startDate: '2026-09-04', endDate: '2026-09-04', leaveTypeId: vac.id, hours: 8 });
      const combined = await api('PATCH', `/api/leave/${n1.json.data.id}`, chief, { status: 'Approved', hours: 4 });
      assert.equal(combined.status, 409, 'approve + change-hours in one PATCH is refused');
      assert.equal(combined.json.code, 'BANK_CHANGE_ON_APPROVE');
      assert.equal(await ledgerBalance(vac.id), 40, 'the refused combined PATCH debited nothing');

      // ── 4. Deny a PENDING request → no ledger movement ───────────────────
      const req2 = await api('POST', '/api/leave', chief, {
        memberId: memberRow, memberName: `${MARK} Member`, type: 'Vacation',
        startDate: '2026-09-05', endDate: '2026-09-05', leaveTypeId: vac.id, hours: 8 });
      const before4 = await ledgerBalance(vac.id);
      const dn2 = await api('PATCH', `/api/leave/${req2.json.data.id}`, chief, { status: 'Denied' });
      assert.equal(dn2.status, 200);
      assert.equal(dn2.json.bank, null, 'denying a pending request posts no bank movement');
      assert.equal(await ledgerBalance(vac.id), before4, 'balance unchanged by denying a pending request');

      // ── 5. Insufficient balance blocks approval ──────────────────────────
      const req3 = await api('POST', '/api/leave', chief, {
        memberId: memberRow, memberName: `${MARK} Member`, type: 'Vacation',
        startDate: '2026-09-10', endDate: '2026-09-10', leaveTypeId: vac.id, hours: 100 });
      const balBefore5 = await ledgerBalance(vac.id);
      const ap5 = await api('PATCH', `/api/leave/${req3.json.data.id}`, chief, { status: 'Approved' });
      assert.equal(ap5.status, 422, 'approval refused when balance insufficient');
      assert.equal(ap5.json.code, 'INSUFFICIENT_BALANCE');
      assert.equal(await ledgerBalance(vac.id), balBefore5, 'no debit on a refused approval');
      const stillPending = await api('GET', `/api/leave/${req3.json.data.id}`, chief);
      assert.equal(stillPending.json.data.status, 'Pending', 'request stays Pending after a refused approval');

      // ── 6. Legacy request (no bank/hours) approves with no ledger ─────────
      const legacy = await api('POST', '/api/leave', chief, {
        memberId: memberRow, memberName: `${MARK} Member`, type: 'PTO', startDate: '2026-09-15', endDate: '2026-09-15' });
      const balBefore6 = await ledgerBalance(vac.id);
      const ap6 = await api('PATCH', `/api/leave/${legacy.json.data.id}`, chief, { status: 'Approved' });
      assert.equal(ap6.status, 200, 'legacy leave approves');
      assert.equal(ap6.json.bank, null, 'legacy leave posts no bank movement');
      assert.equal(await ledgerBalance(vac.id), balBefore6, 'legacy approval does not touch the ledger');

      // ── 7. Delete an approved banked leave → reversal ────────────────────
      const req7 = await api('POST', '/api/leave', chief, {
        memberId: memberRow, memberName: `${MARK} Member`, type: 'Vacation',
        startDate: '2026-09-20', endDate: '2026-09-20', leaveTypeId: vac.id, hours: 12 });
      await api('PATCH', `/api/leave/${req7.json.data.id}`, chief, { status: 'Approved' });
      const afterDebit = await ledgerBalance(vac.id);
      const del = await api('DELETE', `/api/leave/${req7.json.data.id}`, chief);
      assert.equal(del.status, 200, 'delete succeeds');
      assert.equal(await ledgerBalance(vac.id), afterDebit + 12, 'deleting an approved banked leave restores the 12h');
      assert.equal(await cacheBalance(vac.id), await ledgerBalance(vac.id), 'cache == ledger after delete-reversal');

      console.log('[leaveApproval] all 1.2b adversarial cases passed.');
    } finally {
      await cleanup();
      await new Promise((r) => server.close(r));
    }
  });
}
