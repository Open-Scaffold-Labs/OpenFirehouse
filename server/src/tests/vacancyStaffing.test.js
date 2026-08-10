// Phase 1.4 — min-staffing rules + unified vacancy detection (migration 0080).
// Part A (always runs): the PURE rule engine — window math incl. midnight wrap, effective
// dating, days-of-week, rank normalization (exact, never substring), layered grains,
// umbrella fallback, rollup severity.
// Part B (opt-in via TENANCY_TEST_DB, adversarial, against a REAL Postgres via the API):
//   1. Role gates: member cannot create/fill/cancel a vacancy; officer cannot write rules.
//   2. Cross-tenant refusal: dept B cannot see or fill dept A's vacancy.
//   3. ATOMIC single-winner fill: two concurrent fills → exactly one 200, one 409; the
//      winner's riding-board assignment exists.
//   4. Terminal finality: cancel-after-fill 409s; cancel requires a recorded reason.
//   5. Mint idempotency: the same causing record can never double-mint (partial unique
//      index, engine returns null on the second attempt).
//   6. The unified island: an approved leave that drops a shift below minimum mints a
//      VACANCY (cause leave_request) — not a shift_swap.
//   7. Coverage view: explicit rank_count shortfall surfaces as a short verdict.
// Every case could actually fail (lesson #29).

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

// ── Part A — pure engine ─────────────────────────────────────────────────────
const {
  intervalsOverlap, ruleAppliesOnDate, ruleCoversShift, evaluateStaffing, normalizeRank,
} = require('../utils/staffingRules');

test('1.4 engine — clock windows overlap correctly, including midnight wrap', () => {
  // Night tour (18:00→06:00) vs an 02:00–04:00 window → overlaps (the wrap case).
  assert.equal(ruleCoversShift(
    { time_start: '02:00', time_end: '04:00' }, { shiftType: 'Night' }), true);
  // Day tour (06:00–18:00) vs the same small-hours window → no overlap.
  assert.equal(ruleCoversShift(
    { time_start: '02:00', time_end: '04:00' }, { shiftType: 'Day' }), false);
  // A window that itself wraps midnight (22:00→02:00) overlaps Night, not Day.
  assert.equal(ruleCoversShift(
    { time_start: '22:00', time_end: '02:00' }, { shiftType: 'Night' }), true);
  assert.equal(ruleCoversShift(
    { time_start: '22:00', time_end: '02:00' }, { shiftType: 'Day' }), false);
  // Shift-type scoping is case-insensitive and exact.
  assert.equal(ruleCoversShift({ shift_type: 'day' }, { shiftType: 'Day' }), true);
  assert.equal(ruleCoversShift({ shift_type: 'Night' }, { shiftType: 'Day' }), false);
  // Raw interval sanity: adjacency is NOT overlap.
  assert.equal(intervalsOverlap(360, 1080, 1080, 1200), false);
});

test('1.4 engine — effective dating + days_of_week gate rule applicability', () => {
  const rule = { active: true, effective_from: '2026-07-01', effective_to: '2026-07-31' };
  assert.equal(ruleAppliesOnDate(rule, '2026-07-15'), true);
  assert.equal(ruleAppliesOnDate(rule, '2026-08-01'), false, 'past effective_to');
  assert.equal(ruleAppliesOnDate(rule, '2026-06-30'), false, 'before effective_from');
  assert.equal(ruleAppliesOnDate({ active: false }, '2026-07-15'), false, 'inactive');
  // 2026-07-25 is a Saturday (dow 6).
  assert.equal(ruleAppliesOnDate({ active: true, days_of_week: '[6]' }, '2026-07-25'), true);
  assert.equal(ruleAppliesOnDate({ active: true, days_of_week: '[1,2,3]' }, '2026-07-25'), false);
});

test('1.4 engine — rank matching is normalized and exact, never substring', () => {
  assert.equal(normalizeRank('FF'), 'firefighter');
  assert.equal(normalizeRank(' Capt '), 'captain');
  // 'Battalion Chief' must NOT satisfy a 'chief' target (the substring trap).
  assert.notEqual(normalizeRank('Battalion Chief'), normalizeRank('Chief'));
});

test('1.4 engine — layered grains, umbrella fallback, rollup severity', () => {
  const date = '2026-07-25';
  const membersById = {
    '1': { id: 1, name: 'A', rank: 'Captain' },
    '2': { id: 2, name: 'B', rank: 'FF' },
    '3': { id: 3, name: 'C', rank: 'Firefighter' },
  };
  const membersByName = Object.fromEntries(Object.values(membersById).map((m) => [m.name, m]));
  const shift = { id: 10, date, shiftType: 'Day', crew: ['A', 'B', 'C'], memberIds: [1, 2, 3] };

  // No explicit rules → the 0075 umbrella evaluates: 3 riding vs fallback 3 → ok.
  let r = evaluateStaffing({ date, rules: [], minCrewFallback: 3, shifts: [shift], membersById, membersByName });
  assert.equal(r.rollup, 'ok');
  assert.equal(r.verdicts.length, 1);
  assert.equal(r.verdicts[0].implicit, true);

  // Explicit shift_count 4 SUPPRESSES the umbrella and flags short-by-1.
  r = evaluateStaffing({
    date, minCrewFallback: 3, shifts: [shift], membersById, membersByName,
    rules: [{ id: 5, name: 'Four on Day', rule_type: 'shift_count', min_count: 4, active: true }],
  });
  assert.equal(r.verdicts.length, 1);
  assert.equal(r.verdicts[0].implicit, false);
  assert.equal(r.verdicts[0].short, 1);
  assert.equal(r.rollup, 'short');

  // rank_count: 1 captain required (has one, via alias-normalized match on 'Capt').
  // cert_count: 2 EMT required (only member 2 holds it) → short, actual 1.
  r = evaluateStaffing({
    date, minCrewFallback: 3, shifts: [shift], membersById, membersByName,
    activeCertsByMemberId: { '2': ['EMT'] },
    rules: [
      { id: 6, name: 'Officer coverage', rule_type: 'rank_count', target: 'Capt', min_count: 1, active: true },
      { id: 7, name: 'ALS coverage', rule_type: 'cert_count', target: 'EMT', min_count: 2, active: true },
    ],
  });
  const rank = r.verdicts.find((v) => v.ruleId === 6);
  const cert = r.verdicts.find((v) => v.ruleId === 7);
  assert.equal(rank.ok, true);
  assert.equal(cert.actual, 1);
  assert.equal(cert.short, 1);

  // apparatus_seats rides the board (deduped by member): 2 distinct on rig 9 vs min 3 → short.
  r = evaluateStaffing({
    date, minCrewFallback: 0, shifts: [shift], membersById, membersByName,
    boardRows: [
      { apparatus_id: 9, member_id: 1 }, { apparatus_id: 9, member_id: 2 },
      { apparatus_id: 9, member_id: 2 },   // duplicate row must not double-count
      { apparatus_id: 8, member_id: 3 },   // other rig doesn't count
    ],
    rules: [{ id: 8, name: 'Engine 1 crew', rule_type: 'apparatus_seats', target: '9', min_count: 3, active: true }],
  });
  assert.equal(r.verdicts[0].actual, 2);
  assert.equal(r.verdicts[0].short, 1);

  // Empty shift → actual 0 → critical rollup.
  r = evaluateStaffing({
    date, minCrewFallback: 3, membersById, membersByName,
    shifts: [{ id: 11, date, shiftType: 'Day', crew: [], memberIds: [] }],
    rules: [],
  });
  assert.equal(r.rollup, 'critical');

  // No schedule at all → no_schedule, not a wall of criticals.
  r = evaluateStaffing({ date, rules: [], minCrewFallback: 3, shifts: [] });
  assert.equal(r.rollup, 'no_schedule');
});

// ── Part B — live-DB adversarial suite ───────────────────────────────────────
const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[vacancyStaffing] TENANCY_TEST_DB not set — skipping live-DB 1.4 suite.');
  test('1.4 vacancies (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('1.4 — vacancies: role gates, cross-tenant, single-winner fill, finality, mint idempotency, leave-mint, coverage', async () => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...a) => { const t = realSetInterval(...a); if (t && t.unref) t.unref(); return t; };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');
    const { mintVacancy } = require('../utils/vacancyEngine');
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    async function api(method, path, token, body) {
      const res = await fetch(baseUrl + path, {
        method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined });
      let json = null; try { json = await res.json(); } catch {}
      return { status: res.status, json };
    }

    const MARK = 'VC-1_4';
    let deptA, deptB, stnA, stnB;
    async function cleanup() {
      for (const dept of [deptA, deptB]) {
        if (!dept) continue;
        await pool.query('DELETE FROM apparatus_assignments WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM vacancies WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM min_staffing_rules WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM leave_requests WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM shifts WHERE department_id = $1', [dept]);
      }
      await pool.query(`DELETE FROM members WHERE "memberNumber" LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'vc_1_4_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'vc_1_4_%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }
    async function mkUserMember(uname, role, mname, stn, dept) {
      const uid = (await pool.query(
        `INSERT INTO users (username,name,initials,role,"passwordHash",station_id) VALUES ($1,$2,'XX',$3,'x',$4) RETURNING id`,
        [uname, mname, role, stn])).rows[0].id;
      await pool.query(`INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [uid, dept, role]);
      const mid = (await pool.query(
        `INSERT INTO members ("memberNumber",name,rank,role,status,joined,user_id,station_id,department_id)
         VALUES ($1,$2,'Firefighter','member','Active',CURRENT_DATE,$3,$4,$5) RETURNING id`,
        [`${MARK}-${uname}`, mname, uid, stn, dept])).rows[0].id;
      const token = jwt.sign({ sub: uid, username: uname, role }, ACCESS_SECRET, { expiresIn: '15m' });
      return { uid, mid, token, name: mname };
    }

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) { try { const r = await fetch(`${baseUrl}/api/setup-status`); if (r.status === 200) { ready = true; break; } } catch {} await new Promise((x) => setTimeout(x, 1000)); }
      assert.ok(ready, 'DB never ready');
      await cleanup();

      deptA = await mkAlignedDeptStation(pool, `${MARK} Dept A`);
      deptB = await mkAlignedDeptStation(pool, `${MARK} Dept B`);
      stnA = deptA;
      stnB = deptB;

      const memberA  = await mkUserMember('vc_1_4_member', 'member', 'Vac Member', stnA, deptA);
      const officerA = await mkUserMember('vc_1_4_officer', 'officer', 'Vac Officer', stnA, deptA);
      const chiefA   = await mkUserMember('vc_1_4_chief', 'chief', 'Vac Chief', stnA, deptA);
      const fillerA  = await mkUserMember('vc_1_4_filler', 'member', 'Vac Filler', stnA, deptA);
      const filler2A = await mkUserMember('vc_1_4_filler2', 'member', 'Vac Filler Two', stnA, deptA);
      const officerB = await mkUserMember('vc_1_4_officerb', 'officer', 'Vac Officer B', stnB, deptB);

      const DATE = '2026-08-01';

      // 1 · Role gates.
      let r = await api('POST', '/api/vacancies', memberA.token, { shift_date: DATE });
      assert.equal(r.status, 403, 'member cannot create a vacancy');
      r = await api('POST', '/api/staffing/rules', officerA.token,
        { name: 'X', rule_type: 'shift_count', min_count: 3 });
      assert.equal(r.status, 403, 'officer cannot write staffing rules (chief surface)');

      // 2 · Officer creates a manual vacancy (the BC-opens flow).
      r = await api('POST', '/api/vacancies', officerA.token,
        { shift_date: DATE, position_name: 'Firefighter', priority: 1, cause: 'sick_callout', hours: 24 });
      assert.equal(r.status, 201, `create failed: ${JSON.stringify(r.json)}`);
      const vacId = r.json.data.id;

      // 3 · Cross-tenant: dept B sees nothing, and cannot fill dept A's vacancy.
      r = await api('GET', '/api/vacancies', officerB.token);
      assert.equal(r.status, 200);
      assert.equal(r.json.data.some((v) => v.id === vacId), false, 'dept B must not see dept A vacancies');
      r = await api('POST', `/api/vacancies/${vacId}/fill`, officerB.token, { member_id: officerB.mid });
      assert.equal(r.status, 409, 'cross-tenant fill must find no open row (guarded update)');

      // 4 · Atomic single-winner: two concurrent fills → exactly one 200, one 409.
      const [f1, f2] = await Promise.all([
        api('POST', `/api/vacancies/${vacId}/fill`, officerA.token, { member_id: fillerA.mid }),
        api('POST', `/api/vacancies/${vacId}/fill`, officerA.token, { member_id: filler2A.mid }),
      ]);
      const statuses = [f1.status, f2.status].sort();
      assert.deepEqual(statuses, [200, 409], `single-winner violated: ${f1.status}/${f2.status}`);
      const winner = f1.status === 200 ? f1 : f2;
      assert.equal(winner.json.data.status, 'filled');
      // The winner's riding-board assignment exists (fill writes the board in-txn).
      const board = await pool.query(
        `SELECT member_id FROM apparatus_assignments WHERE department_id = $1 AND date = $2`,
        [deptA, DATE]);
      assert.equal(board.rows.length, 1, 'exactly one board row from the fill');
      assert.equal(String(board.rows[0].member_id), String(winner.json.data.filled_by_member_id));

      // 5 · Finality: a filled vacancy cannot be cancelled; cancel requires a reason.
      r = await api('POST', `/api/vacancies/${vacId}/cancel`, officerA.token, { reason: 'test' });
      assert.equal(r.status, 409, 'terminal status is final');
      r = await api('POST', '/api/vacancies', officerA.token, { shift_date: DATE, position_name: 'Extra' });
      const vac2 = r.json.data.id;
      r = await api('POST', `/api/vacancies/${vac2}/cancel`, officerA.token, {});
      assert.equal(r.status, 400, 'cancel without a reason refused');
      r = await api('POST', `/api/vacancies/${vac2}/cancel`, officerA.token, { reason: 'covered by trade' });
      assert.equal(r.status, 200);
      assert.equal(r.json.data.cancelled_reason, 'covered by trade');

      // 6 · Mint idempotency at the engine (the partial unique index, same live cause).
      const m1 = await mintVacancy(deptA, {
        shift_date: DATE, position_name: 'Idem', cause: 'leave',
        cause_kind: 'leave_request', cause_id: 424242,
      });
      const m2 = await mintVacancy(deptA, {
        shift_date: DATE, position_name: 'Idem', cause: 'leave',
        cause_kind: 'leave_request', cause_id: 424242,
      });
      assert.ok(m1, 'first mint lands');
      assert.equal(m2, null, 'second mint of the same live cause is a no-op');

      // 7 · The unified island: approving leave that drops a 3-crew shift below the
      //     default minimum mints a VACANCY (cause leave_request) — not a shift_swap.
      const LDATE = '2026-08-02';
      await pool.query(
        `INSERT INTO shifts (date, "shiftType", crew, "memberIds", station_id, department_id)
         VALUES ($1, 'Day', $2, $3, $4, $5)`,
        [LDATE, JSON.stringify([memberA.name, fillerA.name, filler2A.name]),
         JSON.stringify([memberA.mid, fillerA.mid, filler2A.mid]), stnA, deptA]);
      r = await api('POST', '/api/leave', officerA.token, {
        memberId: memberA.mid, memberName: memberA.name, type: 'Vacation',
        startDate: LDATE, endDate: LDATE, reason: '1.4 test',
      });
      assert.equal(r.status, 201, `leave create failed: ${JSON.stringify(r.json)}`);
      const leaveId = r.json.data.id;
      r = await api('PATCH', `/api/leave/${leaveId}`, officerA.token, { status: 'Approved' });
      assert.equal(r.status, 200, `approve failed: ${JSON.stringify(r.json)}`);
      assert.equal(r.json.workflow.vacanciesCreated, 1, 'approval minted exactly one vacancy');
      const minted = await pool.query(
        `SELECT * FROM vacancies WHERE department_id = $1 AND cause_kind = 'leave_request' AND cause_id = $2`,
        [deptA, leaveId]);
      assert.equal(minted.rows.length, 1);
      assert.equal(minted.rows[0].cause, 'leave');
      const swaps = await pool.query(
        `SELECT 1 FROM shift_swaps WHERE "requesterId" = $1 AND status = 'Open'`, [memberA.mid]);
      assert.equal(swaps.rows.length, 0, 'the auto-swap island is retired — no swap minted');

      // 8 · Coverage view: chief adds a rank_count rule the shift cannot meet → short.
      r = await api('POST', '/api/staffing/rules', chiefA.token,
        { name: 'Officer on duty', rule_type: 'rank_count', target: 'Captain', min_count: 1 });
      assert.equal(r.status, 201, `rule create failed: ${JSON.stringify(r.json)}`);
      r = await api('GET', `/api/staffing/coverage?date=${LDATE}`, officerA.token);
      assert.equal(r.status, 200);
      const cov = r.json.data;
      const rankVerdict = cov.verdicts.find((v) => v.ruleType === 'rank_count');
      assert.ok(rankVerdict, 'rank rule evaluated');
      assert.equal(rankVerdict.ok, false, 'no captain riding → short');
      assert.ok(['short', 'critical'].includes(cov.rollup));
      assert.ok(cov.vacancies.some((v) => String(v.cause_id) === String(leaveId)),
        'the leave-minted vacancy rides the coverage payload');
    } finally {
      try { await cleanup(); } catch (e) { console.error('cleanup failed:', e.message); }
      server.close();
      const { pool: p } = require('../db');
      await p.end().catch(() => {});
    }
  });
}
