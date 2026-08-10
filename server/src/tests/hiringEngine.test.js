// Phase 1.5 — ordered hiring engine + grievance audit (migration 0081).
// Part A (always runs): PURE ordering/eligibility math — reset windows, the three rule
// families + tie-break chains (total order, TEXT-'' hire_date trap), mandate ordering
// (count ascending + REVERSE seniority), classification reasons.
// Part B (opt-in via TENANCY_TEST_DB, adversarial, against a REAL Postgres via the API):
//   1. Role gates: member/officer cannot write lists; member cannot open a hiring run.
//   2. Sequential open: the FIRST offer goes to the lowest in-window balance.
//   3. Decline advances to the next candidate; officer skip requires a reason.
//   4. Blast accept race: two concurrent accepts → exactly one award (event-status gate);
//      the loser's offer is 'superseded'; the vacancy fills once; 'worked' charged ONCE.
//   5. Self-only: a member cannot accept another member's offer; cross-tenant refused.
//   6. Mandate: refused on a voluntary list; on a mandatory list awards + charges
//      'mandate_hold'; a member outside the snapshot is refused.
//   7. Exhausted: declining every offer exhausts the run — no auto-mandate.
//   8. Bypass: a by-person vacancy fill during an open run closes it 'assigned_bypass'.
//   9. Chief adjustment requires a reason and posts an 'adjustment' ledger entry.
// Every case could actually fail (lesson #29).

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

// ── Part A — pure ordering lib ───────────────────────────────────────────────
const {
  resetWindowStart, classify, orderCandidates, orderMandatory,
} = require('../utils/hiringOrder');
const { normalizeRank } = require('../utils/staffingRules');

test('1.5 order — reset windows: annual anchor before/after, none = epoch', () => {
  const annual = { reset_period: 'annual', reset_anchor: '01-01' };
  assert.equal(resetWindowStart(annual, '2026-07-25T12:00:00Z'), '2026-01-01T00:00:00Z');
  const july = { reset_period: 'annual', reset_anchor: '07-01' };
  assert.equal(resetWindowStart(july, '2026-06-15T12:00:00Z'), '2025-07-01T00:00:00Z', 'before the anchor → last year');
  assert.equal(resetWindowStart(july, '2026-07-15T12:00:00Z'), '2026-07-01T00:00:00Z', 'after the anchor → this year');
  assert.equal(resetWindowStart({ reset_period: 'none' }, '2026-07-25T12:00:00Z'), '1970-01-01T00:00:00Z');
});

test('1.5 order — hours_asc with tie chain; TEXT-empty hire_date sorts last; total order', () => {
  const list = { order_method: 'hours_asc', tie_breakers: '["seniority","member_id"]' };
  const out = orderCandidates([
    { member_id: 3, balance: 10, hire_date: '2010-01-01', seniority_number: 1 },
    { member_id: 1, balance: 0,  hire_date: '',           seniority_number: 0 },  // '' = unknown → after known
    { member_id: 2, balance: 0,  hire_date: '2015-06-01', seniority_number: 2 },
  ], list);
  assert.deepEqual(out.map((m) => m.member_id), [2, 1, 3],
    'tie on balance broken by seniority (known hire_date first); highest balance last');
  assert.equal(out[0].position, 1);
  assert.equal(out[0].factors.method, 'hours_asc');
  // Determinism: same inputs → same order (grievance re-derivation).
  const again = orderCandidates([
    { member_id: 3, balance: 10, hire_date: '2010-01-01', seniority_number: 1 },
    { member_id: 1, balance: 0,  hire_date: '',           seniority_number: 0 },
    { member_id: 2, balance: 0,  hire_date: '2015-06-01', seniority_number: 2 },
  ], list);
  assert.deepEqual(again.map((m) => m.member_id), [2, 1, 3]);
});

test('1.5 order — rotation: never-awarded (NULL) goes first; manual honors manual_order', () => {
  const rot = orderCandidates([
    { member_id: 1, last_awarded_at: '2026-07-01T00:00:00Z' },
    { member_id: 2, last_awarded_at: null },
    { member_id: 3, last_awarded_at: '2026-06-01T00:00:00Z' },
  ], { order_method: 'rotation', tie_breakers: [] });
  assert.deepEqual(rot.map((m) => m.member_id), [2, 3, 1]);
  const man = orderCandidates([
    { member_id: 1, manual_order: 5 }, { member_id: 2, manual_order: 1 },
  ], { order_method: 'manual', tie_breakers: [] });
  assert.deepEqual(man.map((m) => m.member_id), [2, 1]);
});

test('1.5 order — mandate: count ascending, REVERSE seniority tie-break', () => {
  const out = orderMandatory([
    { member_id: 1, mandateCount: 1, hire_date: '2010-01-01', seniority_number: 1 },
    { member_id: 2, mandateCount: 0, hire_date: '2005-01-01', seniority_number: 1 },   // senior
    { member_id: 3, mandateCount: 0, hire_date: '2020-01-01', seniority_number: 9 },   // junior
  ]);
  // Fewest holds first; among ties the LEAST senior (latest hire) is held first.
  assert.deepEqual(out.map((m) => m.member_id), [3, 2, 1]);
  assert.equal(out[0].factors.method, 'mandate_rotation');
});

test('1.5 order — classification reasons: disqualified vs unavailable, normalized rank', () => {
  const req = { targetRank: 'Captain', requiredCerts: [], vacancyCerts: ['EMT'] };
  assert.deepEqual(
    classify({ active: true, rank: 'Battalion Chief', certs: ['EMT'] }, req, normalizeRank),
    { reason: 'rank mismatch (needs Captain)', kind: 'disqualified' },
    'exact normalized rank — BC never satisfies a Captain (or chief) target');
  assert.equal(
    classify({ active: true, rank: 'Capt', certs: ['EMT'] }, req, normalizeRank),
    null, 'alias-normalized match (Capt → captain)');
  assert.deepEqual(
    classify({ active: true, rank: 'Capt', certs: [] }, req, normalizeRank),
    { reason: 'missing certs: EMT', kind: 'disqualified' });
  assert.deepEqual(
    classify({ active: true, rank: 'Capt', certs: ['EMT'], onLeave: true }, req, normalizeRank),
    { reason: 'on approved leave', kind: 'unavailable' });
  assert.deepEqual(
    classify({ active: false, rank: 'Capt', certs: ['EMT'] }, req, normalizeRank),
    { reason: 'inactive member', kind: 'disqualified' });
});

// ── Part B — live-DB adversarial suite ───────────────────────────────────────
const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[hiringEngine] TENANCY_TEST_DB not set — skipping live-DB 1.5 suite.');
  test('1.5 hiring engine (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('1.5 — hiring: gates, ordering, race, self-only, mandate, exhaustion, bypass, adjustments', async () => {
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

    const MARK = 'HE-1_5';
    let deptA, deptB, stnA, stnB;
    async function cleanup() {
      for (const dept of [deptA, deptB]) {
        if (!dept) continue;
        await pool.query('DELETE FROM hiring_offers WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM hiring_events WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM hiring_charge_ledger WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM hiring_list_members WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM hiring_lists WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM apparatus_assignments WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM vacancies WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM messages WHERE station_id = $1', [dept]);
      }
      await pool.query(`DELETE FROM members WHERE "memberNumber" LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'he_1_5_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'he_1_5_%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }
    async function mkUserMember(uname, role, mname, stn, dept, rank = 'Firefighter') {
      const uid = (await pool.query(
        `INSERT INTO users (username,name,initials,role,"passwordHash",station_id) VALUES ($1,$2,'XX',$3,'x',$4) RETURNING id`,
        [uname, mname, role, stn])).rows[0].id;
      await pool.query(`INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [uid, dept, role]);
      const mid = (await pool.query(
        `INSERT INTO members ("memberNumber",name,rank,role,status,joined,user_id,station_id,department_id)
         VALUES ($1,$2,$3,'member','Active',CURRENT_DATE,$4,$5,$6) RETURNING id`,
        [`${MARK}-${uname}`, mname, rank, uid, stn, dept])).rows[0].id;
      const token = jwt.sign({ sub: uid, username: uname, role }, ACCESS_SECRET, { expiresIn: '15m' });
      return { uid, mid, token, name: mname };
    }
    async function mkVacancy(token, date, pos) {
      const r = await api('POST', '/api/vacancies', token, { shift_date: date, position_name: pos, hours: 24 });
      assert.equal(r.status, 201, `vacancy create failed: ${JSON.stringify(r.json)}`);
      return r.json.data.id;
    }

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) { try { const r = await fetch(`${baseUrl}/api/setup-status`); if (r.status === 200) { ready = true; break; } } catch {} await new Promise((x) => setTimeout(x, 1000)); }
      assert.ok(ready, 'DB never ready');
      await cleanup();

      // Aligned dept+station pairs (dept.id == station.id — the convention scoped()
      // routes assume). Raw nextval inserts only align by luck; the CI background-seed
      // race drifted the sequences apart and 400'd the member-add on 2026-07-26.
      deptA = await mkAlignedDeptStation(pool, `${MARK} Dept A`);
      deptB = await mkAlignedDeptStation(pool, `${MARK} Dept B`);
      stnA = deptA;
      stnB = deptB;

      const chief   = await mkUserMember('he_1_5_chief', 'chief', 'Hire Chief', stnA, deptA);
      const officer = await mkUserMember('he_1_5_officer', 'officer', 'Hire Officer', stnA, deptA);
      const mLow    = await mkUserMember('he_1_5_low', 'member', 'Low Hours', stnA, deptA);
      const mHigh   = await mkUserMember('he_1_5_high', 'member', 'High Hours', stnA, deptA);
      const mThird  = await mkUserMember('he_1_5_third', 'member', 'Third Member', stnA, deptA);
      const officerB = await mkUserMember('he_1_5_offb', 'officer', 'Officer B', stnB, deptB);

      // 1 · Role gates.
      let r = await api('POST', '/api/hiring/lists', mLow.token, { name: 'X' });
      assert.equal(r.status, 403, 'member cannot create a list');
      r = await api('POST', '/api/hiring/lists', officer.token, { name: 'X' });
      assert.equal(r.status, 403, 'officer cannot create a list (chief surface)');

      // Chief config: an hours_asc voluntary list with all three members.
      r = await api('POST', '/api/hiring/lists', chief.token,
        { name: 'FF OT List', order_method: 'hours_asc', tie_breakers: ['seniority', 'member_id'] });
      assert.equal(r.status, 201, `list create failed: ${JSON.stringify(r.json)}`);
      const listId = r.json.data.id;
      for (const m of [mLow, mHigh, mThird]) {
        r = await api('POST', `/api/hiring/lists/${listId}/members`, chief.token, { member_id: m.mid });
        assert.equal(r.status, 201);
      }
      // Seed balances: High carries 48h, Third 24h, Low 0 → order Low, Third, High.
      await pool.query(
        `INSERT INTO hiring_charge_ledger (department_id, list_id, member_id, delta_hours, reason)
         VALUES ($1,$2,$3,48,'seed'), ($1,$2,$4,24,'seed')`,
        [deptA, listId, mHigh.mid, mThird.mid]);

      // 2 · Sequential open → first offer to the lowest balance; member cannot open.
      const vac1 = await mkVacancy(officer.token, '2026-09-01', 'Firefighter');
      r = await api('POST', `/api/vacancies/${vac1}/hire`, mLow.token, { list_id: listId });
      assert.equal(r.status, 403, 'member cannot open a hiring run');
      r = await api('POST', `/api/vacancies/${vac1}/hire`, officer.token, { list_id: listId });
      assert.equal(r.status, 201, `hire open failed: ${JSON.stringify(r.json)}`);
      const ev1 = r.json.data.id;
      const snap = JSON.parse(r.json.data.list_snapshot);
      assert.deepEqual(snap.candidates.map((c) => c.member_id), [mLow.mid, mThird.mid, mHigh.mid],
        'hours_asc order: 0h, 24h, 48h');
      r = await api('POST', `/api/vacancies/${vac1}/hire`, officer.token, { list_id: listId });
      assert.equal(r.status, 409, 'second live run on the same vacancy refused');
      r = await api('GET', `/api/hiring/events/${ev1}`, officer.token);
      assert.equal(r.json.data.offers.length, 1, 'sequential: exactly one live offer');
      assert.equal(r.json.data.offers[0].member_id, mLow.mid, 'offered to the lowest balance');
      const offer1 = r.json.data.offers[0].id;

      // Cross-tenant: officer B cannot read the event.
      r = await api('GET', `/api/hiring/events/${ev1}`, officerB.token);
      assert.equal(r.status, 404, 'cross-tenant event read refused');

      // 3 · Self-only + decline advances + skip requires reason.
      r = await api('POST', `/api/hiring/offers/${offer1}/accept`, mHigh.token, {});
      assert.equal(r.status, 403, 'cannot accept another member\'s offer');
      r = await api('POST', `/api/hiring/offers/${offer1}/decline`, mLow.token, {});
      assert.equal(r.status, 200, `decline failed: ${JSON.stringify(r.json)}`);
      r = await api('GET', `/api/hiring/events/${ev1}`, officer.token);
      const offers2 = r.json.data.offers;
      assert.equal(offers2.length, 2, 'decline advanced to the next candidate');
      const offer2 = offers2.find((o) => o.outcome === 'pending');
      assert.equal(offer2.member_id, mThird.mid, 'next in order (24h) offered');
      r = await api('POST', `/api/hiring/offers/${offer2.id}/skip`, officer.token, {});
      assert.equal(r.status, 400, 'skip without a reason refused');
      r = await api('POST', `/api/hiring/offers/${offer2.id}/skip`, officer.token, { reason: 'unreachable on shift' });
      assert.equal(r.status, 200);

      // 4 · Exhaustion: decline the last offer → exhausted, never auto-mandated.
      r = await api('GET', `/api/hiring/events/${ev1}`, officer.token);
      const offer3 = r.json.data.offers.find((o) => o.outcome === 'pending');
      assert.equal(offer3.member_id, mHigh.mid);
      r = await api('POST', `/api/hiring/offers/${offer3.id}/decline`, mHigh.token, {});
      assert.equal(r.status, 200);
      r = await api('GET', `/api/hiring/events/${ev1}`, officer.token);
      assert.equal(r.json.data.status, 'exhausted', 'engine stops and reports');
      assert.equal(r.json.data.award_method, null, 'no auto-mandate on exhaustion');

      // 5 · Blast race: two concurrent accepts → exactly one award; charge posted ONCE.
      const vac2 = await mkVacancy(officer.token, '2026-09-02', 'Firefighter');
      r = await api('POST', `/api/vacancies/${vac2}/hire`, officer.token, { list_id: listId, mode: 'blast' });
      assert.equal(r.status, 201);
      const ev2 = r.json.data.id;
      r = await api('GET', `/api/hiring/events/${ev2}`, officer.token);
      const blastOffers = r.json.data.offers;
      assert.equal(blastOffers.length, 3, 'blast mints every offer at once');
      const oLow = blastOffers.find((o) => o.member_id === mLow.mid);
      const oThird = blastOffers.find((o) => o.member_id === mThird.mid);
      const [a1, a2] = await Promise.all([
        api('POST', `/api/hiring/offers/${oLow.id}/accept`, mLow.token, {}),
        api('POST', `/api/hiring/offers/${oThird.id}/accept`, mThird.token, {}),
      ]);
      assert.deepEqual([a1.status, a2.status].sort(), [200, 409],
        `single-winner violated: ${a1.status}/${a2.status}`);
      const winner = a1.status === 200 ? mLow : mThird;
      const vacRow = await pool.query('SELECT status, filled_by_member_id, fill_method FROM vacancies WHERE id = $1', [vac2]);
      assert.equal(vacRow.rows[0].status, 'filled');
      assert.equal(String(vacRow.rows[0].filled_by_member_id), String(winner.mid));
      assert.equal(vacRow.rows[0].fill_method, 'accepted_offer');
      const supers = await pool.query(
        `SELECT COUNT(*)::int AS c FROM hiring_offers WHERE event_id = $1 AND outcome = 'superseded'`, [ev2]);
      assert.equal(supers.rows[0].c, 2, 'loser + unanswered offers superseded');
      const worked = await pool.query(
        `SELECT COUNT(*)::int AS c, COALESCE(SUM(delta_hours),0) AS h FROM hiring_charge_ledger
          WHERE department_id = $1 AND list_id = $2 AND reason = 'worked'`, [deptA, listId]);
      assert.equal(worked.rows[0].c, 1, 'exactly one worked charge');
      assert.equal(Number(worked.rows[0].h), 24, 'charged the vacancy hours');

      // 6 · Mandate: refused on a voluntary list; works on a mandatory list.
      const vac3 = await mkVacancy(officer.token, '2026-09-03', 'Firefighter');
      r = await api('POST', '/api/hiring/lists', chief.token, { name: 'Mandate List', list_type: 'mandatory' });
      const mandListId = r.json.data.id;
      for (const m of [mLow, mHigh]) {
        await api('POST', `/api/hiring/lists/${mandListId}/members`, chief.token, { member_id: m.mid });
      }
      r = await api('POST', `/api/vacancies/${vac3}/hire`, officer.token, { list_id: mandListId });
      assert.equal(r.status, 201);
      const ev3 = r.json.data.id;
      const snap3 = JSON.parse(r.json.data.list_snapshot);
      assert.ok(snap3.candidates.length >= 1, 'mandatory snapshot built');
      r = await api('GET', `/api/hiring/events/${ev3}`, officer.token);
      assert.equal(r.json.data.offers.length, 0, 'mandatory list takes NO offers — mandate is explicit');
      r = await api('POST', `/api/hiring/events/${ev3}/mandate`, officer.token, { member_id: mThird.mid });
      assert.equal(r.status, 422, 'member outside the mandate snapshot refused');
      const holdTarget = snap3.candidates[0].member_id;   // fewest holds, reverse seniority
      r = await api('POST', `/api/hiring/events/${ev3}/mandate`, officer.token, { member_id: holdTarget });
      assert.equal(r.status, 200, `mandate failed: ${JSON.stringify(r.json)}`);
      const holds = await pool.query(
        `SELECT COUNT(*)::int AS c FROM hiring_charge_ledger
          WHERE department_id = $1 AND list_id = $2 AND reason = 'mandate_hold' AND member_id = $3`,
        [deptA, mandListId, holdTarget]);
      assert.equal(holds.rows[0].c, 1, 'mandate_hold charged');

      // Mandate on a voluntary-list event → 422.
      const vac4 = await mkVacancy(officer.token, '2026-09-04', 'Firefighter');
      r = await api('POST', `/api/vacancies/${vac4}/hire`, officer.token, { list_id: listId });
      const ev4 = r.json.data.id;
      r = await api('POST', `/api/hiring/events/${ev4}/mandate`, officer.token, { member_id: mLow.mid });
      assert.equal(r.status, 422, 'mandate refused on a voluntary list');

      // 7 · Bypass: by-person fill during the open run closes it as assigned_bypass.
      r = await api('POST', `/api/vacancies/${vac4}/fill`, officer.token, { member_id: mHigh.mid });
      assert.equal(r.status, 200);
      const ev4row = await pool.query('SELECT status, award_method FROM hiring_events WHERE id = $1', [ev4]);
      assert.equal(ev4row.rows[0].status, 'awarded');
      assert.equal(ev4row.rows[0].award_method, 'assigned_bypass', 'bypass recorded, not prevented');

      // 8 · Chief adjustment: reason required; posts an adjustment entry.
      r = await api('POST', '/api/hiring/adjustments', chief.token,
        { list_id: listId, member_id: mLow.mid, delta_hours: -12 });
      assert.equal(r.status, 400, 'adjustment without a reason refused');
      r = await api('POST', '/api/hiring/adjustments', chief.token,
        { list_id: listId, member_id: mLow.mid, delta_hours: -12, reason_note: 'clerical correction per CBA review' });
      assert.equal(r.status, 201);
      const adj = await pool.query(
        `SELECT note FROM hiring_charge_ledger WHERE department_id = $1 AND reason = 'adjustment'`, [deptA]);
      assert.equal(adj.rows.length, 1);
      assert.match(adj.rows[0].note, /clerical correction/);

      // 9 · Member transparency: my-offers + standing.
      r = await api('GET', '/api/hiring/my-offers', mLow.token);
      assert.equal(r.status, 200);
      assert.ok(r.json.data.offers.length >= 2, 'member sees their own offer history');
      const standing = r.json.data.standing.find((s) => s.list_id === listId);
      assert.ok(standing, 'standing includes the list');
      // The blast winner is nondeterministic: mLow's balance = (24 if they won else 0) − 12 adj.
      const expectLow = (String(winner.mid) === String(mLow.mid) ? 24 : 0) - 12;
      assert.equal(Number(standing.balance), expectLow, `balance = worked − adjustment (${expectLow})`);

      // 10 · The grievance export carries the snapshot + offers + charges.
      r = await api('GET', `/api/hiring/events/${ev2}/export`, officer.token);
      assert.equal(r.status, 200);
      assert.ok(r.json.data.event.list_snapshot.candidates.length === 3);
      assert.ok(r.json.data.offers.length === 3);
      assert.ok(r.json.data.charges.length >= 1);
    } finally {
      try { await cleanup(); } catch (e) { console.error('cleanup failed:', e.message); }
      server.close();
      const { pool: p } = require('../db');
      await p.end().catch(() => {});
    }
  });
}
