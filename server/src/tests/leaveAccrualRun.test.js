// Phase 1.2d — accrual + carryover RUNS against a REAL Postgres via the API. Adversarial:
//   1. A per-period run credits each member at their tenure-tier rate; a mid-period hire is
//      skipped by the waiting-period rule.
//   2. Re-running the SAME period_key is idempotent — no double-accrual (the 0076 unique index).
//   3. The accrual is CLAMPED to the bank cap (credit the portion that fits, not the whole amount).
//   4. Role gate — a member cannot trigger a run.
//   5. Carryover run forfeits the excess above carryover_cap as a negative adjustment — and
//      FLSA §7(o) COMP banks are EXEMPT (never forfeited).
//   6. Balance parity (cache == Σ ledger) holds throughout.
//
// OPT-IN via TENANCY_TEST_DB.

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[leaveAccrualRun] TENANCY_TEST_DB not set — skipping live-DB 1.2d suite.');
  test('1.2d accrual run (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('1.2d — accrual + carryover runs: tenure, waiting-period, idempotency, clamp, comp-exempt, parity', async () => {
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

    const MARK = 'LB-1_2d';
    let deptA, stnA, chiefId, memberId, seniorId, juniorId;
    async function cleanup() {
      if (deptA) {
        await pool.query(`DELETE FROM leave_accrual_ledger WHERE department_id = $1`, [deptA]);
        await pool.query(`DELETE FROM leave_balances WHERE department_id = $1`, [deptA]);
        await pool.query(`DELETE FROM leave_types WHERE department_id = $1`, [deptA]);
      }
      await pool.query(`DELETE FROM members WHERE "memberNumber" LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'lb_1_2d_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'lb_1_2d_%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }
    async function bal(mId, typeId) {
      const r = await pool.query('SELECT COALESCE(SUM(delta_hours),0)::numeric AS s FROM leave_accrual_ledger WHERE department_id=$1 AND member_id=$2 AND leave_type_id=$3', [deptA, mId, typeId]);
      return Number(r.rows[0].s);
    }
    async function cache(mId, typeId) {
      const r = await pool.query('SELECT balance_hours FROM leave_balances WHERE department_id=$1 AND member_id=$2 AND leave_type_id=$3', [deptA, mId, typeId]);
      return r.rows.length ? Number(r.rows[0].balance_hours) : 0;
    }

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) { try { const r = await fetch(`${baseUrl}/api/setup-status`); if (r.status === 200) { ready = true; break; } } catch {} await new Promise((x) => setTimeout(x, 1000)); }
      assert.ok(ready, 'DB never ready');
      await cleanup();

      deptA = await mkAlignedDeptStation(pool, `${MARK} Dept`);
      stnA = deptA;
      chiefId = (await pool.query(`INSERT INTO users (username,name,initials,role,"passwordHash",station_id) VALUES ('lb_1_2d_chief','Chief D','CD','chief','x',$1) RETURNING id`, [stnA])).rows[0].id;
      const memberUid = (await pool.query(`INSERT INTO users (username,name,initials,role,"passwordHash",station_id) VALUES ('lb_1_2d_member','Mem D','MD','member','x',$1) RETURNING id`, [stnA])).rows[0].id;
      await pool.query(`INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,'chief') ON CONFLICT DO NOTHING`, [chiefId, deptA]);
      await pool.query(`INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING`, [memberUid, deptA]);
      // Senior: hired 2018-01-01 (>5yr → tier rate). Junior: hired mid-period (waiting-period skip).
      seniorId = (await pool.query(`INSERT INTO members ("memberNumber",name,rank,role,status,joined,hire_date,station_id,department_id) VALUES ('${MARK}-S','Senior FF','Firefighter','member','Active','2018-01-01','2018-01-01',$1,$2) RETURNING id`, [stnA, deptA])).rows[0].id;
      juniorId = (await pool.query(`INSERT INTO members ("memberNumber",name,rank,role,status,joined,hire_date,station_id,department_id) VALUES ('${MARK}-J','Junior FF','Firefighter','member','Active','2026-07-10','2026-07-10',$1,$2) RETURNING id`, [stnA, deptA])).rows[0].id;
      memberId = seniorId;

      const chief = jwt.sign({ sub: chiefId, username: 'lb_1_2d_chief', role: 'chief' }, ACCESS_SECRET, { expiresIn: '15m' });
      const member = jwt.sign({ sub: memberUid, username: 'lb_1_2d_member', role: 'member' }, ACCESS_SECRET, { expiresIn: '15m' });

      const types = await api('GET', '/api/leave-types', chief);
      const vac = types.json.data.find((t) => t.code === 'VAC');
      const comp = types.json.data.find((t) => t.code === 'COMP');
      // Configure VAC: per-period base 3, a 5-year tier @ 6.
      await api('PATCH', `/api/leave-types/${vac.id}`, chief, {
        accrual_method: 'per_period', accrual_rate: 3, period: 'biweekly', tenure_tiers: [{ years: 5, rate: 6 }] });

      // ── 4. Role gate ─────────────────────────────────────────────────────
      const memberRun = await api('POST', '/api/leave-types/accrual-run', member, { periodKey: 'X', periodEnd: '2026-07-14' });
      assert.equal(memberRun.status, 403, 'a member cannot trigger an accrual run');

      // ── 1. Per-period run: tenure tier + waiting-period skip ──────────────
      const run1 = await api('POST', '/api/leave-types/accrual-run', chief, {
        periodKey: '2026-P13', periodStart: '2026-07-01', periodEnd: '2026-07-14', leaveTypeId: vac.id });
      assert.equal(run1.status, 200, 'accrual run succeeds');
      assert.equal(await bal(seniorId, vac.id), 6, 'senior (8yr) accrues at the 5yr tier rate (6)');
      assert.equal(await bal(juniorId, vac.id), 0, 'junior hired mid-period is skipped (waiting period)');
      assert.equal(await cache(seniorId, vac.id), 6, 'cache == ledger');

      // ── 2. Idempotent re-run ─────────────────────────────────────────────
      const run2 = await api('POST', '/api/leave-types/accrual-run', chief, {
        periodKey: '2026-P13', periodStart: '2026-07-01', periodEnd: '2026-07-14', leaveTypeId: vac.id });
      assert.equal(run2.status, 200);
      assert.equal(run2.json.data.credited, 0, 're-run credits nobody (idempotent)');
      assert.equal(await bal(seniorId, vac.id), 6, 'balance unchanged by the re-run');

      // ── 3. Cap clamp: set cap 8, run a new period → senior at 6 gets +2, not +6 ──
      await api('PATCH', `/api/leave-types/${vac.id}`, chief, { accrual_cap: 8 });
      const run3 = await api('POST', '/api/leave-types/accrual-run', chief, {
        periodKey: '2026-P14', periodStart: '2026-07-15', periodEnd: '2026-07-28', leaveTypeId: vac.id });
      assert.equal(run3.status, 200);
      assert.equal(await bal(seniorId, vac.id), 8, 'accrual clamps to the 8h cap (6 + clamp(6→2))');
      const clampRow = await pool.query(
        `SELECT delta_hours FROM leave_accrual_ledger WHERE department_id=$1 AND member_id=$2 AND leave_type_id=$3 AND period_key='2026-P14'`,
        [deptA, seniorId, vac.id]);
      assert.equal(Number(clampRow.rows[0].delta_hours), 2, 'the clamped credit is exactly 2, not 6');

      // ── 5. Carryover run: forfeit VAC excess; COMP is EXEMPT ─────────────
      await api('PATCH', `/api/leave-types/${vac.id}`, chief, { carryover_cap: 5 });      // VAC forfeits above 5
      await api('PATCH', `/api/leave-types/${comp.id}`, chief, { carryover_cap: 40 });    // COMP has a cap but is comp → exempt
      await api('POST', '/api/leave-types/ledger', chief, { memberId: seniorId, leaveTypeId: comp.id, deltaHours: 100, reason: 'grant' });
      assert.equal(await bal(seniorId, comp.id), 100, 'senior COMP granted 100');

      const carry = await api('POST', '/api/leave-types/carryover-run', chief, { year: 2026 });
      assert.equal(carry.status, 200, 'carryover run succeeds');
      assert.ok(carry.json.data.comp_banks_exempted >= 1, 'the comp bank was exempted');
      assert.equal(await bal(seniorId, vac.id), 5, 'VAC forfeited down to the carryover cap (8 → 5)');
      assert.equal(await bal(seniorId, comp.id), 100, 'COMP is NOT forfeited (FLSA §7(o) exemption)');
      assert.equal(await cache(seniorId, vac.id), 5, 'cache == ledger after forfeiture');

      // Idempotent carryover re-run: no double forfeiture.
      const carry2 = await api('POST', '/api/leave-types/carryover-run', chief, { year: 2026 });
      assert.equal(carry2.status, 200);
      assert.equal(await bal(seniorId, vac.id), 5, 're-running carryover does not double-forfeit');

      // ── 6. Dry-run preview (1.2e-d): computes a plan, posts NOTHING ──────
      const balBefore = await bal(seniorId, vac.id); // 5 (cap 8, so clamp(6,5,8)=3)
      const dry = await api('POST', '/api/leave-types/accrual-run', chief, {
        periodKey: '2026-P20', periodStart: '2026-08-01', periodEnd: '2026-08-14', leaveTypeId: vac.id, dryRun: true });
      assert.equal(dry.status, 200);
      assert.equal(dry.json.data.dryRun, true, 'response marked as a dry run');
      const seniorRow = dry.json.data.preview.find((r) => r.member_id === seniorId);
      assert.ok(seniorRow, 'senior appears in the preview');
      assert.equal(seniorRow.amount, 3, 'preview shows the cap-clamped amount (5→8 cap, credit 3)');
      assert.equal(seniorRow.already_accrued, false, 'a new period is not yet accrued');
      assert.equal(await bal(seniorId, vac.id), balBefore, 'the dry run posted NOTHING');

      // A dry-run of an ALREADY-accrued period flags it and credits nobody.
      const dryDup = await api('POST', '/api/leave-types/accrual-run', chief, {
        periodKey: '2026-P13', periodStart: '2026-07-01', periodEnd: '2026-07-14', leaveTypeId: vac.id, dryRun: true });
      const dupRow = dryDup.json.data.preview.find((r) => r.member_id === seniorId);
      assert.equal(dupRow.already_accrued, true, 'the already-accrued P13 is flagged in the preview');
      assert.equal(dryDup.json.data.willCredit, 0, 'an already-accrued period credits nobody in preview');

      // ── 7. Resumable CHUNKING (#3, 2026-07-25): limit + afterMemberId cursor ──────
      // Two eligible members (senior id < junior id). limit=1 processes one per request; the
      // returned nextCursor resumes the next chunk. Idempotent: re-running a chunk credits none.
      const CK = '2026-CHUNK';
      const jBefore = await bal(juniorId, vac.id);   // junior already accrued in earlier periods
      const c1 = await api('POST', '/api/leave-types/accrual-run', chief, {
        periodKey: CK, periodStart: '2026-09-01', periodEnd: '2026-09-14', leaveTypeId: vac.id, limit: 1 });
      assert.equal(c1.status, 200);
      assert.equal(c1.json.data.members, 1, 'chunk 1 processed exactly one member');
      assert.equal(c1.json.data.credited, 1, 'chunk 1 credited the first member');
      assert.equal(c1.json.data.nextCursor, seniorId, 'chunk 1 returns the senior id as the cursor');
      assert.equal(await bal(juniorId, vac.id), jBefore, 'the junior is untouched by chunk 1');

      const c2 = await api('POST', '/api/leave-types/accrual-run', chief, {
        periodKey: CK, periodStart: '2026-09-01', periodEnd: '2026-09-14', leaveTypeId: vac.id, limit: 1, afterMemberId: seniorId });
      assert.equal(c2.json.data.members, 1, 'chunk 2 processed the next member');
      assert.equal(c2.json.data.credited, 1, 'chunk 2 credited the junior');
      assert.equal(await bal(juniorId, vac.id), jBefore + 3, 'junior accrued the base rate (3) in chunk 2');

      // A chunk past the last member returns nothing and a null cursor (loop terminates).
      const c3 = await api('POST', '/api/leave-types/accrual-run', chief, {
        periodKey: CK, periodStart: '2026-09-01', periodEnd: '2026-09-14', leaveTypeId: vac.id, limit: 1, afterMemberId: juniorId });
      assert.equal(c3.json.data.members, 0, 'no members past the last id');
      assert.equal(c3.json.data.nextCursor, null, 'null cursor ends the loop');

      // Re-running chunk 1 for the SAME period is idempotent (no double-credit).
      const c1again = await api('POST', '/api/leave-types/accrual-run', chief, {
        periodKey: CK, periodStart: '2026-09-01', periodEnd: '2026-09-14', leaveTypeId: vac.id, limit: 1 });
      assert.equal(c1again.json.data.credited, 0, 'replaying a chunk credits nobody (idempotent)');

      console.log('[leaveAccrualRun] all 1.2d + 1.2e-d + chunking cases passed.');
    } finally {
      await cleanup();
      await new Promise((r) => server.close(r));
    }
  });
}
