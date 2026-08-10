'use strict';
/**
 * ridingBoardAuth.test.js — the authorization fence on the riding board. (2026-07-27)
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `routes/apparatusAssignments.js` shipped with NO role gate on any write, so **any
 * authenticated department member could seat or unseat anyone** — decide who rides the
 * engine tomorrow, or pull a firefighter out of a seat.
 *
 * The tell was that the OTHER door into the same table was already gated:
 * `POST /api/daily-staffing` is `requireOfficer`, and since migration 0070 folded
 * `daily_staffing` into `apparatus_assignments`, both routes write the same rows.
 * **Same table, two doors, one locked.**
 *
 * That is the third time this repo has produced the identical shape:
 *   - 2026-07-14: an inspection answered 422 on `/complete` and **200 OK** on `PATCH`,
 *     and a building was recorded as passing with an unabated violation.
 *   - Phase 3 R6: `routes/fiPermits.js` never imported `fiAuth`, so any member could
 *     issue a permit in production.
 *   - here.
 * **A guard that exists on one route and not another is not a guard.**
 *
 * WHAT THIS SUITE ASSERTS, AND WHY BOTH DIRECTIONS MATTER
 * ------------------------------------------------------
 * A refusal test alone is worthless — it passes just as happily against a route that is
 * broken for everyone. So every case here is paired: the member is REFUSED **and the
 * officer still SUCCEEDS**. And every refusal re-reads the table afterwards to prove
 * nothing was written, because a 403 with a mutation behind it is worse than no gate.
 *
 * MARKET NOTE: role-gated roster editing is the universal posture, and a member
 * self-assigning to an arbitrary seat is absent from the products reachable — the
 * member-facing pattern is *claiming an open slot*, supervisor-approved. That path does
 * NOT come through this route (it goes through `utils/vacancyEngine.js`, the 1.4 fill
 * door), which is why gating here does not take a capability away from anyone.
 */
const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[ridingBoardAuth] TENANCY_TEST_DB not set — skipping.');
  test('riding board authorization (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('riding board: every write is officer-gated, and reads are not', async (t) => {
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
    const base = `http://127.0.0.1:${server.address().port}`;
    async function api(method, path, token, body) {
      const res = await fetch(base + path, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null; try { json = await res.json(); } catch { /* */ }
      return { status: res.status, json };
    }

    const MARK = 'RB-AUTH';
    // Registered FIRST, before any fixture that can throw — otherwise the http server
    // stays listening and the suite hangs forever under --test-timeout=0.
    t.after(async () => {
      try { await cleanup(); } finally {
        await new Promise((r) => server.close(r));
        await pool.end().catch(() => {});
      }
    });

    async function cleanup() {
      await pool.query(`DELETE FROM apparatus_assignments WHERE position_name LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM apparatus_positions WHERE position_name LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM members WHERE name LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM users WHERE username LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM apparatus WHERE designation LIKE $1`, [`${MARK}%`]);
    }
    await cleanup();

    const u = (await pool.query(
      `SELECT id, username, role, station_id FROM users WHERE station_id IS NOT NULL AND role='chief' ORDER BY id LIMIT 1`)).rows[0];
    assert.ok(u, 'need a chief with a station to run this suite');

    // Resolve the chief's REAL department from their station rather than assuming
    // station_id == department_id. That equality holds for the EXPAND-phase mirror
    // stations (and for CI's seeded dept 1 / station 1), but it is exactly the
    // id-space conflation migration 0020 introduced of_station_department to stop
    // relying on — and it silently breaks the moment a department runs a 2nd house.
    const deptId = Number((await pool.query(
      `SELECT department_id FROM stations WHERE id = $1`, [u.station_id])).rows[0]?.department_id);
    assert.ok(Number.isInteger(deptId), 'the chief\'s station must resolve to a department');
    const officer = jwt.sign({ sub: u.id, username: u.username, role: u.role, stationId: u.station_id, name: 'Board Chief' },
      ACCESS_SECRET, { expiresIn: '15m' });

    const memberRow = (await pool.query(
      `INSERT INTO users (username, name, initials, "passwordHash", role, station_id)
       VALUES ($1, 'Probationary FF', 'PF', 'x', 'member', $2) RETURNING id, username`,
      [`${MARK}-member-${Date.now()}`, deptId])).rows[0];
    const member = jwt.sign({ sub: memberRow.id, username: memberRow.username, role: 'member', stationId: deptId, name: 'Probationary FF' },
      ACCESS_SECRET, { expiresIn: '15m' });

    // A real member row to seat, and a real rig to seat them on.
    const crew = (await pool.query(
      `INSERT INTO members ("memberNumber", name, rank, role, joined, status, department_id)
       VALUES ($1, $2, 'Firefighter', 'Member', '2026-01-01', 'Active', $3) RETURNING id`,
      [`${MARK}-1`, `${MARK} Rider`, deptId])).rows[0].id;
    // Own the rig rather than borrowing one. This assertion is what failed CI on the
    // first run after the pipeline was unblocked: db/ci-seed.sql seeds a department, a
    // station and a chief, but NO apparatus, so `LIMIT 1` returned nothing and the
    // suite died at setup. Depending on ambient seed data is the fragile class the
    // alignedTenant helper exists to avoid — a fixture that only passes where someone
    // else's data happens to exist tells you nothing on a fresh database.
    let rig = (await pool.query(
      `SELECT id FROM apparatus WHERE department_id = $1 ORDER BY id LIMIT 1`, [deptId])).rows[0];
    if (!rig) {
      // NOTE: apparatus.year is NOT NULL with no default (verified against prod's
      // information_schema, not assumed) — omitting it fails 23502.
      rig = (await pool.query(
        `INSERT INTO apparatus (designation, type, year, station_id, department_id)
         VALUES ($1, 'Engine', 2020, $2, $3) RETURNING id`,
        [`${MARK}-E1`, u.station_id, deptId])).rows[0];
    }
    assert.ok(rig, 'need an apparatus in the department to seat someone on');

    const DATE = '2026-07-27';
    const seatBody = (pos) => ({ date: DATE, apparatus_id: rig.id, member_id: crew, position_name: pos });
    const seatsFor = async (pos) => (await pool.query(
      `SELECT * FROM apparatus_assignments WHERE department_id = $1 AND date = $2 AND position_name = $3`,
      [deptId, DATE, pos])).rows;

    // ══ A MEMBER CANNOT SEAT ANYONE — AND NOTHING IS WRITTEN ════════════════════════════
    await t.test('a member cannot seat anyone, and the refusal writes nothing', async () => {
      const pos = `${MARK} Nozzle`;
      const res = await api('POST', '/api/apparatus-assignments', member, seatBody(pos));
      assert.equal(res.status, 403, JSON.stringify(res.json));
      assert.equal(res.json.code, 'FORBIDDEN_ROLE');

      // THE HALF THAT MATTERS. A 403 with a mutation behind it is worse than no gate,
      // because it is a gate you now trust.
      assert.equal((await seatsFor(pos)).length, 0, 'a refused seat assignment must write NOTHING');
    });

    // ══ THE CONTROL — WITHOUT THIS, THE TEST ABOVE PASSES AGAINST A BROKEN ROUTE ═════════
    await t.test('an officer CAN seat someone (the control)', async () => {
      const pos = `${MARK} Officer Seat`;
      const res = await api('POST', '/api/apparatus-assignments', officer, seatBody(pos));
      assert.ok(res.status === 200 || res.status === 201, JSON.stringify(res.json));
      assert.equal((await seatsFor(pos)).length, 1, 'the officer path must actually write');
    });

    // ══ A MEMBER CANNOT UNSEAT ANYONE ═══════════════════════════════════════════════════
    await t.test('a member cannot remove an assignment, and the row survives', async () => {
      const pos = `${MARK} Backstep`;
      const created = await api('POST', '/api/apparatus-assignments', officer, seatBody(pos));
      assert.ok(created.status === 200 || created.status === 201, JSON.stringify(created.json));
      const row = (await seatsFor(pos))[0];
      assert.ok(row, 'fixture: the officer seat must exist before the removal attempt');

      const res = await api('DELETE', `/api/apparatus-assignments/${row.id}`, member);
      assert.equal(res.status, 403, JSON.stringify(res.json));
      assert.equal(res.json.code, 'FORBIDDEN_ROLE');
      assert.equal((await seatsFor(pos)).length, 1,
        'pulling a firefighter out of a seat must not happen on a refused request');

      // Control: the officer can.
      const ok = await api('DELETE', `/api/apparatus-assignments/${row.id}`, officer);
      assert.ok(ok.status >= 200 && ok.status < 300, JSON.stringify(ok.json));
      assert.equal((await seatsFor(pos)).length, 0);
    });

    // ══ SEAT TEMPLATES ARE CONFIGURATION — SAME BAR ═════════════════════════════════════
    await t.test('a member cannot create, edit or delete a seat template', async () => {
      const posBody = { apparatus_id: rig.id, position_name: `${MARK} Tillerman`, seat_order: 9 };
      const denied = await api('POST', '/api/apparatus-assignments/positions', member, posBody);
      assert.equal(denied.status, 403, JSON.stringify(denied.json));
      assert.equal(
        (await pool.query(`SELECT 1 FROM apparatus_positions WHERE position_name = $1`, [posBody.position_name])).rows.length,
        0, 'a refused template create must write nothing');

      // Control + the edit/delete bar, through the officer.
      const made = await api('POST', '/api/apparatus-assignments/positions', officer, posBody);
      assert.ok(made.status === 200 || made.status === 201, JSON.stringify(made.json));
      const id = made.json?.data?.id ?? made.json?.id;
      assert.ok(id, `expected an id back from the template create: ${JSON.stringify(made.json)}`);

      const patch = await api('PATCH', `/api/apparatus-assignments/positions/${id}`, member, { position_name: `${MARK} Hijacked` });
      assert.equal(patch.status, 403);
      const del = await api('DELETE', `/api/apparatus-assignments/positions/${id}`, member);
      assert.equal(del.status, 403);
      assert.equal(
        (await pool.query(`SELECT position_name FROM apparatus_positions WHERE id = $1`, [id])).rows[0]?.position_name,
        posBody.position_name, 'neither refused write may have altered the template');
    });

    // ══ READS STAY OPEN — THE CREW HAS TO SEE THE BOARD ═════════════════════════════════
    // The gate is on WRITES only. A crew that cannot read the riding board cannot find out
    // what they are riding, which would be a worse product and is not the market posture.
    await t.test('a member can still READ the board and the position templates', async () => {
      const list = await api('GET', `/api/apparatus-assignments?shift_id=0`, member);
      assert.notEqual(list.status, 403, 'reading the riding board must not require officer');
      const positions = await api('GET', '/api/apparatus-assignments/positions', member);
      assert.notEqual(positions.status, 403, 'reading seat templates must not require officer');
    });

    // ══ UNAUTHENTICATED IS STILL REFUSED ════════════════════════════════════════════════
    await t.test('an unauthenticated caller is refused outright', async () => {
      const res = await api('POST', '/api/apparatus-assignments', null, seatBody(`${MARK} Anon`));
      assert.equal(res.status, 401);
      assert.equal((await seatsFor(`${MARK} Anon`)).length, 0);
    });
  });
}
