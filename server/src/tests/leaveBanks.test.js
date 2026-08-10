// Phase 1.2a (HARDEN THE TAIL) — leave banks foundation (migration 0076).
// Adversarial suite (of-module-hardening §4): every case could actually fail.
// Proves, at the API level against a REAL Postgres, plus DB-level grant checks:
//   1. First-read seeding + the market bank set (COMP=FLSA 480 cap, KELLY=shift unit).
//   2. Cross-tenant refusal — dept B cannot see or mutate dept A's banks (list + patch).
//   3. Role gate — a plain member cannot create a bank type or post to the ledger.
//   4. Ledger-post + balance parity — balance cache == Σ ledger by construction.
//   5. Bounds — a decrement can't breach the negative floor; a grant can't exceed the
//      cap (the FLSA comp 480); a reversal bypasses bounds.
//   6. Append-only at the DB layer — of_app has no UPDATE/DELETE on the ledger, and an
//      UPDATE as of_app is refused (42501).
//   7. Accrual-run idempotency — the (dept,type,member,period_key) unique index refuses
//      a double-post (the guard 1.2d relies on).
//   8. Member self-scope — a member sees only their own balances; a client-sent memberId
//      is ignored.
//
// OPT-IN via TENANCY_TEST_DB, like the sibling live-DB suites. Skips clean without it.

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[leaveBanks] TENANCY_TEST_DB not set — skipping live-DB 1.2a suite.');
  test('1.2a leave banks (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('1.2a — leave banks: seeding, tenancy, role gate, parity, bounds, append-only, idempotency', async () => {
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

    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;

    async function api(method, path, token, body) {
      const res = await fetch(base + path, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null;
      try { json = await res.json(); } catch { /* non-JSON */ }
      return { status: res.status, json };
    }

    const MARK = 'LB-1_2a';
    let deptA, deptB, stnA, stnB, chiefAId, memberAId, chiefBId, memberARow;

    async function cleanup() {
      // FK-safe: ledger/balances before leave_types (RESTRICT); then members/mappings/users/stations/depts.
      const depts = [deptA, deptB].filter(Boolean);
      if (depts.length) {
        await pool.query(`DELETE FROM leave_accrual_ledger WHERE department_id = ANY($1)`, [depts]);
        await pool.query(`DELETE FROM leave_balances     WHERE department_id = ANY($1)`, [depts]);
        await pool.query(`DELETE FROM leave_types         WHERE department_id = ANY($1)`, [depts]);
      }
      await pool.query(`DELETE FROM members WHERE "memberNumber" LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'lb_1_2a_%')`);
      await pool.query(`DELETE FROM users    WHERE username LIKE 'lb_1_2a_%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }

    try {
      // Wait for lazy-init DB gate.
      let ready = false;
      for (let i = 0; i < 30; i++) {
        try { const r = await fetch(`${base}/api/setup-status`); if (r.status === 200) { ready = true; break; } }
        catch { /* warming */ }
        await new Promise((r2) => setTimeout(r2, 1000));
      }
      assert.ok(ready, 'DB never became ready');

      // ── Fixtures: two departments, decoupled from station ids via of_user_departments ──
      deptA = await mkAlignedDeptStation(pool, `${MARK} Dept A`);
      deptB = await mkAlignedDeptStation(pool, `${MARK} Dept B`);
      stnA = deptA;
      stnB = deptB;

      async function mkUser(username, stationId, role, deptId) {
        const uid = (await pool.query(
          `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
           VALUES ($1, $2, 'LB', $3, 'not-a-real-hash', $4) RETURNING id`,
          [username, `Leave Bank ${username}`, role, stationId])).rows[0].id;
        await pool.query(
          `INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, department_id) DO NOTHING`, [uid, deptId, role]);
        return uid;
      }
      chiefAId  = await mkUser('lb_1_2a_chief_a',  stnA, 'chief',  deptA);
      memberAId = await mkUser('lb_1_2a_member_a', stnA, 'member', deptA);
      chiefBId  = await mkUser('lb_1_2a_chief_b',  stnB, 'chief',  deptB);
      // memberA needs a members row (user_id → member_id) for self-scope resolution.
      memberARow = (await pool.query(
        `INSERT INTO members ("memberNumber", name, rank, role, status, joined, station_id, department_id, user_id)
         VALUES ('${MARK}-M1', 'Bank Member A', 'Firefighter', 'member', 'Active', '2020-01-01', $1, $2, $3) RETURNING id`,
        [stnA, deptA, memberAId])).rows[0].id;

      const sign = (id, username, role) => jwt.sign({ sub: id, username, role }, ACCESS_SECRET, { expiresIn: '15m' });
      const chiefA  = sign(chiefAId,  'lb_1_2a_chief_a',  'chief');
      const memberA = sign(memberAId, 'lb_1_2a_member_a', 'member');
      const chiefB  = sign(chiefBId,  'lb_1_2a_chief_b',  'chief');

      // ── 1. First-read seeding + market set ───────────────────────────────
      const listA = await api('GET', '/api/leave-types', chiefA);
      assert.equal(listA.status, 200, 'chiefA lists bank types');
      const codes = listA.json.data.map((r) => r.code);
      for (const c of ['VAC', 'SICK', 'PERS', 'HOL', 'COMP', 'ONCALL', 'KELLY', 'IOD', 'FMLA']) {
        assert.ok(codes.includes(c), `seeded default bank ${c} present`);
      }
      const comp = listA.json.data.find((r) => r.code === 'COMP');
      assert.equal(comp.is_flsa_comp, true, 'COMP is the FLSA comp bank');
      assert.equal(Number(comp.accrual_cap), 480, 'COMP carries the 480-hour public-safety cap');
      const kelly = listA.json.data.find((r) => r.code === 'KELLY');
      assert.equal(kelly.unit, 'shifts', 'KELLY is tracked in shift units');
      const vacA = listA.json.data.find((r) => r.code === 'VAC');

      // Re-read is idempotent (no duplicate seed).
      const listA2 = await api('GET', '/api/leave-types', chiefA);
      assert.equal(listA2.json.data.length, listA.json.data.length, 're-read does not re-seed');

      // ── 2. Cross-tenant refusal ──────────────────────────────────────────
      const bTypes = await api('GET', '/api/leave-types', chiefB);   // seeds dept B independently
      assert.equal(bTypes.status, 200);
      const custom = await api('POST', '/api/leave-types', chiefB, { code: 'ZZCUSTOM', name: 'B Only Bank' });
      assert.equal(custom.status, 201, 'chiefB creates a custom bank in dept B');
      const bCustomId = custom.json.data.id;
      const listA3 = await api('GET', '/api/leave-types', chiefA);
      assert.ok(!listA3.json.data.some((r) => r.code === 'ZZCUSTOM'), 'dept A never sees dept B custom bank');
      // chiefA cannot patch dept B's bank (404, not a silent cross-tenant write).
      const crossPatch = await api('PATCH', `/api/leave-types/${bCustomId}`, chiefA, { name: 'HIJACK' });
      assert.equal(crossPatch.status, 404, 'cross-tenant PATCH is 404');
      const stillB = await pool.query('SELECT name FROM leave_types WHERE id = $1', [bCustomId]);
      assert.equal(stillB.rows[0].name, 'B Only Bank', 'dept B bank unchanged by cross-tenant attempt');

      // ── 3. Role gate ─────────────────────────────────────────────────────
      const memberCreate = await api('POST', '/api/leave-types', memberA, { code: 'NOPE', name: 'x' });
      assert.equal(memberCreate.status, 403, 'member cannot create a bank type');
      const memberLedger = await api('POST', '/api/leave-types/ledger', memberA,
        { memberId: memberARow, leaveTypeId: vacA.id, deltaHours: 8, reason: 'grant' });
      assert.equal(memberLedger.status, 403, 'member cannot post to the ledger');

      // M1 — ledger-post re-validates the member belongs to the dept (never trust a client id).
      const foreignMember = await api('POST', '/api/leave-types/ledger', chiefA,
        { memberId: 999999, leaveTypeId: vacA.id, deltaHours: 8, reason: 'grant' });
      assert.equal(foreignMember.status, 404, 'ledger-post to a non-dept member is refused');
      assert.equal(foreignMember.json.code, 'MEMBER_NOT_FOUND');

      // ── 4. Ledger-post + balance parity ─────────────────────────────────
      const g1 = await api('POST', '/api/leave-types/ledger', chiefA,
        { memberId: memberARow, leaveTypeId: vacA.id, deltaHours: 40, reason: 'grant', note: 'annual grant' });
      assert.equal(g1.status, 201, 'grant posts');
      assert.equal(Number(g1.json.data.balance_hours), 40, 'balance after +40 is 40');
      const g2 = await api('POST', '/api/leave-types/ledger', chiefA,
        { memberId: memberARow, leaveTypeId: vacA.id, deltaHours: 8, reason: 'adjustment' });
      assert.equal(Number(g2.json.data.balance_hours), 48, 'balance after +8 is 48');
      // Parity: cache == Σ ledger.
      const sum = await pool.query(
        'SELECT COALESCE(SUM(delta_hours),0)::numeric AS s FROM leave_accrual_ledger WHERE department_id=$1 AND member_id=$2 AND leave_type_id=$3',
        [deptA, memberARow, vacA.id]);
      const cache = await pool.query(
        'SELECT balance_hours FROM leave_balances WHERE department_id=$1 AND member_id=$2 AND leave_type_id=$3',
        [deptA, memberARow, vacA.id]);
      assert.equal(Number(sum.rows[0].s), 48, 'ledger sum is 48');
      assert.equal(Number(cache.rows[0].balance_hours), 48, 'cache equals ledger sum (parity)');

      // ── 5. Bounds ────────────────────────────────────────────────────────
      const floor = await api('POST', '/api/leave-types/ledger', chiefA,
        { memberId: memberARow, leaveTypeId: vacA.id, deltaHours: -100, reason: 'adjustment' });
      assert.equal(floor.status, 422, 'decrement below floor refused');
      assert.equal(floor.json.code, 'NEGATIVE_FLOOR');
      const compA = listA.json.data.find((r) => r.code === 'COMP');
      const cap = await api('POST', '/api/leave-types/ledger', chiefA,
        { memberId: memberARow, leaveTypeId: compA.id, deltaHours: 500, reason: 'grant' });
      assert.equal(cap.status, 422, 'grant above the 480 comp cap refused');
      assert.equal(cap.json.code, 'ACCRUAL_CAP');
      // A reversal bypasses bounds (it restores) — drive VAC negative via reversal is allowed.
      const rev = await api('POST', '/api/leave-types/ledger', chiefA,
        { memberId: memberARow, leaveTypeId: vacA.id, deltaHours: -100, reason: 'reversal' });
      assert.equal(rev.status, 201, 'reversal bypasses the floor');
      assert.equal(Number(rev.json.data.balance_hours), -52, 'reversal applied (48 - 100)');

      // ── 6. Append-only at the DB layer ──────────────────────────────────
      // The grant/REVOKE enforcement is a non-owner (of_app / Supabase) concern; it only
      // exists where the of_app role does (prod + the local freestation dev DB). CI runs
      // as the owner of_ci with no of_app role, so scope these checks to that role's
      // presence — where of_app exists they must hold (and they were also verified live on
      // prod: of_app UPDATE/DELETE on the ledger = false).
      const hasOfApp = (await pool.query("SELECT 1 FROM pg_roles WHERE rolname='of_app'")).rows.length > 0;
      if (hasOfApp) {
        const priv = await pool.query(
          `SELECT has_table_privilege('of_app','public.leave_accrual_ledger','UPDATE') AS u,
                  has_table_privilege('of_app','public.leave_accrual_ledger','DELETE') AS d,
                  has_table_privilege('of_app','public.leave_types','DELETE') AS td`);
        assert.equal(priv.rows[0].u, false, 'of_app lacks UPDATE on the ledger');
        assert.equal(priv.rows[0].d, false, 'of_app lacks DELETE on the ledger');
        assert.equal(priv.rows[0].td, false, 'of_app lacks DELETE on leave_types');
        // An UPDATE attempted AS of_app is physically refused (42501). Uses a dedicated
        // connection so SET ROLE/RESET can't leak into the pool.
        const c = await pool.connect();
        try {
          await c.query('SET ROLE of_app');
          let denied = false;
          try { await c.query('UPDATE leave_accrual_ledger SET delta_hours = 0 WHERE department_id = $1', [deptA]); }
          catch (e) { denied = e.code === '42501'; }
          assert.ok(denied, 'UPDATE on the ledger as of_app is refused (42501)');
        } finally { await c.query('RESET ROLE').catch(() => {}); c.release(); }
      } else {
        console.log('[leaveBanks] of_app role absent (CI/owner) — DB-grant append-only checks skipped (verified on prod).');
      }

      // ── 7. Accrual-run idempotency (the 1.2d guard) ─────────────────────
      await pool.query(
        `INSERT INTO leave_accrual_ledger (department_id, member_id, leave_type_id, delta_hours, reason, source_kind, period_key)
         VALUES ($1,$2,$3, 3.08, 'accrual', 'accrual_run', '2026-P15')`, [deptA, memberARow, vacA.id]);
      let dup = false;
      try {
        await pool.query(
          `INSERT INTO leave_accrual_ledger (department_id, member_id, leave_type_id, delta_hours, reason, source_kind, period_key)
           VALUES ($1,$2,$3, 3.08, 'accrual', 'accrual_run', '2026-P15')`, [deptA, memberARow, vacA.id]);
      } catch (e) { dup = e.code === '23505'; }
      assert.ok(dup, 'a second accrual post for the same (dept,type,member,period) is refused (unique)');

      // ── 8. Member self-scope ────────────────────────────────────────────
      const mineNoArg = await api('GET', '/api/leave-types/balances', memberA);
      assert.equal(mineNoArg.status, 200);
      assert.ok(mineNoArg.json.data.every((r) => r.member_id === memberARow), 'member sees only their own balances');
      // A client-sent memberId is ignored for a plain member (still only own rows).
      const mineForged = await api('GET', `/api/leave-types/balances?memberId=999999`, memberA);
      assert.ok(mineForged.json.data.every((r) => r.member_id === memberARow), 'forged memberId ignored for a member');

      console.log('[leaveBanks] all 1.2a adversarial cases passed.');
    } finally {
      await cleanup();
      await new Promise((r) => server.close(r));
    }
  });
}
