// Phase 1.3 — shift trades with payback, adversarial, against a REAL Postgres via the API.
// Proves the market-bar failure modes are guarded:
//   1. Member request self-service + foreign member-id rejected (tenancy).
//   2. Give-away open board → ATOMIC single-winner claim (a second accept on a claimed shift 409s).
//   3. Officer approval required by default; self-approve BLOCKED; approval applies the roster change.
//   4. Payback trade → append-only ledger 'incurred' on approve; settle decrements; pairNet correct.
//   5. Reversal on deny-after-approve restores the balance (append-only, never an edit).
//   6. Per-dept trades_require_approval=false → acceptance auto-approves.
// OPT-IN via TENANCY_TEST_DB.

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[shiftTrades] TENANCY_TEST_DB not set — skipping live-DB 1.3 suite.');
  test('1.3 shift trades (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('1.3 — trades: self-service, single-winner claim, self-approve block, payback ledger, reversal, approval flag', async () => {
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

    const MARK = 'TR-1_3';
    let dept, stn;
    async function cleanup() {
      if (dept) {
        await pool.query('DELETE FROM shift_trade_ledger WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM shift_trades WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM shifts WHERE department_id = $1', [dept]);
      }
      await pool.query(`DELETE FROM members WHERE "memberNumber" LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'tr_1_3_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'tr_1_3_%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }
    // user + linked member; role sets the JWT + of_user_departments role.
    async function mkUserMember(uname, role, mname) {
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
    async function pairNet(a, b) {
      const r = await pool.query(
        `SELECT COALESCE(SUM(delta_hours) FILTER (WHERE owed_by_member_id=$2 AND owed_to_member_id=$3),0)
              - COALESCE(SUM(delta_hours) FILTER (WHERE owed_by_member_id=$3 AND owed_to_member_id=$2),0) AS net
           FROM shift_trade_ledger WHERE department_id=$1`, [dept, a, b]);
      return Number(r.rows[0].net);
    }

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) { try { const r = await fetch(`${baseUrl}/api/setup-status`); if (r.status === 200) { ready = true; break; } } catch {} await new Promise((x) => setTimeout(x, 1000)); }
      assert.ok(ready, 'DB never ready');
      await cleanup();

      dept = await mkAlignedDeptStation(pool, `${MARK} Dept`);
      stn = dept;

      const chief = await mkUserMember('tr_1_3_chief', 'chief', 'Chief T');
      const A = await mkUserMember('tr_1_3_a', 'member', 'Alice T');   // requester
      const B = await mkUserMember('tr_1_3_b', 'member', 'Bob T');     // coverer
      const C = await mkUserMember('tr_1_3_c', 'member', 'Carl T');    // racer

      // A shift on a future date with A riding (memberIds authoritative → crew derived).
      const shiftId = (await pool.query(
        `INSERT INTO shifts (department_id, station_id, date, "shiftType", crew, "memberIds")
         VALUES ($1,$1,'2026-10-01','24-Hour','[]',$2) RETURNING id`, [dept, JSON.stringify([A.mid, B.mid, C.mid])])).rows[0].id;

      // ── 1. member self-service + foreign-id rejection ──────────────────────
      const foreign = await api('POST', '/api/shift-trades', A.token,
        { trade_type: 'give_away', covering_member_id: 999999, original_shift_id: shiftId });
      assert.equal(foreign.status, 400, 'a foreign covering_member_id is rejected');

      // A files an OPEN give-away (no coverer). Requester resolved from JWT.
      const open = await api('POST', '/api/shift-trades', A.token,
        { trade_type: 'give_away', original_shift_id: shiftId, client_key: `${MARK}-k1` });
      assert.equal(open.status, 201, 'open give-away created');
      assert.equal(open.json.data.status, 'open', 'no coverer → open board');
      assert.equal(Number(open.json.data.requesting_member_id), A.mid, 'requester resolved from JWT');
      const tId = open.json.data.id;

      // Idempotent replay of the same client_key returns the same row, no duplicate.
      const replay = await api('POST', '/api/shift-trades', A.token,
        { trade_type: 'give_away', original_shift_id: shiftId, client_key: `${MARK}-k1` });
      assert.equal(replay.json.duplicate, true, 'same client_key is an idempotent no-op');

      // ── 2. ATOMIC single-winner claim ─────────────────────────────────────
      const bAccept = await api('POST', `/api/shift-trades/${tId}/accept`, B.token);
      assert.equal(bAccept.status, 200, 'B claims the open shift');
      assert.equal(bAccept.json.data.status, 'pending_approval', 'default dept requires officer approval');
      const cAccept = await api('POST', `/api/shift-trades/${tId}/accept`, C.token);
      assert.equal(cAccept.status, 409, 'C cannot claim an already-claimed shift (single-winner)');
      assert.ok(['ALREADY_CLAIMED', 'NOT_ACCEPTABLE'].includes(cAccept.json.code), 'refused with a single-winner code');

      // ── 3. self-approve blocked; officer approve applies the roster ────────
      // A is the requester (a member — can't hit requireOfficer anyway); make the chief approve.
      // First prove self-approve is blocked: a trade filed BY the chief, accepted by B, chief approve → 403.
      const chiefShift = (await pool.query(
        `INSERT INTO shifts (department_id, station_id, date, "shiftType", crew, "memberIds")
         VALUES ($1,$1,'2026-10-02','24-Hour','[]',$2) RETURNING id`, [dept, JSON.stringify([chief.mid, B.mid])])).rows[0].id;
      const chiefTrade = await api('POST', '/api/shift-trades', chief.token,
        { trade_type: 'give_away', requesting_member_id: chief.mid, original_shift_id: chiefShift });
      await api('POST', `/api/shift-trades/${chiefTrade.json.data.id}/accept`, B.token);
      const selfApprove = await api('POST', `/api/shift-trades/${chiefTrade.json.data.id}/approve`, chief.token);
      assert.equal(selfApprove.status, 403, 'the chief cannot approve a trade they are part of');
      assert.equal(selfApprove.json.code, 'SELF_APPROVE');

      // Now approve A↔B trade as the chief (not a party) → roster changes.
      const approve = await api('POST', `/api/shift-trades/${tId}/approve`, chief.token);
      assert.equal(approve.status, 200, 'chief approves A→B trade');
      assert.equal(approve.json.data.status, 'approved');
      const shiftAfter = await pool.query('SELECT "memberIds" FROM shifts WHERE id = $1', [shiftId]);
      const idsAfter = JSON.parse(shiftAfter.rows[0].memberIds || '[]').map(Number);
      assert.ok(!idsAfter.includes(A.mid), 'requester removed from the covered shift');
      assert.ok(idsAfter.includes(B.mid), 'coverer still on the shift');

      // ── 4. payback ledger: incurred on approve, settle decrements, pairNet ──
      const pbShift = (await pool.query(
        `INSERT INTO shifts (department_id, station_id, date, "shiftType", crew, "memberIds")
         VALUES ($1,$1,'2026-10-03','24-Hour','[]',$2) RETURNING id`, [dept, JSON.stringify([A.mid, B.mid])])).rows[0].id;
      const pb = await api('POST', '/api/shift-trades', A.token,
        { trade_type: 'payback', covering_member_id: B.mid, original_shift_id: pbShift });
      assert.equal(pb.json.data.status, 'pending_accept', 'directed payback → pending_accept');
      await api('POST', `/api/shift-trades/${pb.json.data.id}/accept`, B.token);
      const pbApprove = await api('POST', `/api/shift-trades/${pb.json.data.id}/approve`, chief.token);
      assert.equal(pbApprove.status, 200);
      const owed = await pairNet(A.mid, B.mid);
      assert.equal(owed, 24, 'A owes B one 24-hour tour after the payback is approved (incurred)');

      // Re-approve is idempotent at the ledger (no double-incur) — approve again is NOT_APPROVABLE now.
      const reApprove = await api('POST', `/api/shift-trades/${pb.json.data.id}/approve`, chief.token);
      assert.equal(reApprove.status, 409, 'an approved trade cannot be re-approved');
      assert.equal(await pairNet(A.mid, B.mid), 24, 'no double-incur');

      // Settle 24 → balance zero, trade completed.
      const settle = await api('POST', `/api/shift-trades/${pb.json.data.id}/settle`, A.token, { hours: 24 });
      assert.equal(settle.status, 200);
      assert.equal(settle.json.data.remaining, 0, 'payback fully settled');
      assert.equal(await pairNet(A.mid, B.mid), 0, 'balance back to zero after settle');

      // ── 5. an APPROVED trade can't be DENIED (roster already moved) — remove restores it ────
      const pb2Shift = (await pool.query(
        `INSERT INTO shifts (department_id, station_id, date, "shiftType", crew, "memberIds")
         VALUES ($1,$1,'2026-10-04','24-Hour','[]',$2) RETURNING id`, [dept, JSON.stringify([A.mid, B.mid])])).rows[0].id;
      const pb2 = await api('POST', '/api/shift-trades', A.token, { trade_type: 'payback', covering_member_id: B.mid, original_shift_id: pb2Shift });
      await api('POST', `/api/shift-trades/${pb2.json.data.id}/accept`, B.token);
      await api('POST', `/api/shift-trades/${pb2.json.data.id}/approve`, chief.token);
      assert.equal(await pairNet(A.mid, B.mid), 24, 'incurred again');
      const afterApprove = JSON.parse((await pool.query('SELECT "memberIds" FROM shifts WHERE id=$1', [pb2Shift])).rows[0].memberIds || '[]').map(Number);
      assert.ok(!afterApprove.includes(A.mid), 'requester moved off the shift on approve');
      // deny on an approved trade is refused (the roster already changed).
      const denyApproved = await api('POST', `/api/shift-trades/${pb2.json.data.id}/deny`, chief.token, { reason: 'nope' });
      assert.equal(denyApproved.status, 409, 'an approved trade cannot be denied');
      assert.equal(denyApproved.json.code, 'NOT_DENIABLE');
      // Remove (delete) an approved trade → reverses the IOU AND restores the roster.
      const del = await api('DELETE', `/api/shift-trades/${pb2.json.data.id}`, chief.token);
      assert.equal(del.status, 200);
      assert.equal(await pairNet(A.mid, B.mid), 0, 'delete-after-approve reversed the incurred (append-only)');
      const afterDelete = JSON.parse((await pool.query('SELECT "memberIds" FROM shifts WHERE id=$1', [pb2Shift])).rows[0].memberIds || '[]').map(Number);
      assert.ok(afterDelete.includes(A.mid), 'requester restored to the shift on remove');
      // The ledger is append-only: incurred + reversal are TWO rows, never an edit/delete of a row.
      const rows = await pool.query('SELECT reason FROM shift_trade_ledger WHERE department_id=$1 AND source_id=$2 ORDER BY id', [dept, pb2.json.data.id]);
      assert.deepEqual(rows.rows.map((x) => x.reason), ['incurred', 'reversal'], 'two append-only rows, never a delete');

      // ── 5b. over-settle is clamped to the outstanding balance ──────────────
      const pb3Shift = (await pool.query(
        `INSERT INTO shifts (department_id, station_id, date, "shiftType", crew, "memberIds")
         VALUES ($1,$1,'2026-10-06','24-Hour','[]',$2) RETURNING id`, [dept, JSON.stringify([A.mid, B.mid])])).rows[0].id;
      const pb3 = await api('POST', '/api/shift-trades', A.token, { trade_type: 'payback', covering_member_id: B.mid, original_shift_id: pb3Shift });
      await api('POST', `/api/shift-trades/${pb3.json.data.id}/accept`, B.token);
      await api('POST', `/api/shift-trades/${pb3.json.data.id}/approve`, chief.token);
      const overSettle = await api('POST', `/api/shift-trades/${pb3.json.data.id}/settle`, A.token, { hours: 100 });
      assert.equal(overSettle.json.data.settled, 24, 'settle is clamped to the 24h outstanding, not 100');
      assert.equal(overSettle.json.data.remaining, 0);

      // ── 6. per-dept approval flag OFF → acceptance auto-approves ───────────
      await pool.query('UPDATE departments SET trades_require_approval = FALSE WHERE id = $1', [dept]);
      const naShift = (await pool.query(
        `INSERT INTO shifts (department_id, station_id, date, "shiftType", crew, "memberIds")
         VALUES ($1,$1,'2026-10-05','24-Hour','[]',$2) RETURNING id`, [dept, JSON.stringify([A.mid, B.mid])])).rows[0].id;
      const na = await api('POST', '/api/shift-trades', A.token, { trade_type: 'give_away', original_shift_id: naShift });
      const naAccept = await api('POST', `/api/shift-trades/${na.json.data.id}/accept`, B.token);
      assert.equal(naAccept.json.autoApproved, true, 'no-approval dept: accept finalizes');
      assert.equal(naAccept.json.data.status, 'approved', 'auto-approved on accept');

      console.log('[shiftTrades] all 1.3 cases passed.');
    } finally {
      await cleanup();
      await new Promise((r) => server.close(r));
    }
  });
}
