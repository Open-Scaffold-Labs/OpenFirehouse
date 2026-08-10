'use strict';
/**
 * fiPermitsHardening.test.js — the fence for Phase 3 module 3.0. (2026-07-26)
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────────────────
 * routes/fiPermits.js was 63 lines of bare CRUD that NEVER imported middleware/fiAuth.
 * The prevention module has carried a designation model since Phase 2.4 — inspector /
 * prevention_admin, granted per department — and the permits routes ignored it entirely.
 * Any authenticated department member could issue, edit and soft-delete permits.
 *
 * The root cause was structural, not a missing line: permits were never wired into
 * Prevention Center, so they never inherited its gate. (Spec R6 moves the client surface
 * in; this file proves the server half.)
 *
 * Three more integrity holes, all live, all now closed by migration 0090 + this route:
 *   - "permitNumber" was neither unique nor indexed. Duplicate permit numbers were ACCEPTED,
 *     on the human-facing identifier the whole record is looked up by.
 *   - "propertyId" had NO foreign key. Integrity was one route-level check.
 *   - `status` was FREE TEXT on the server and a hard-coded literal on the client — the
 *     third occurrence of the drift that produced the iPad's phantom 'Conditional' and
 *     the `/^pass\b/i` regex that let "Passed" through.
 *
 * ── WHAT THIS SUITE PROVES, PRECISELY ───────────────────────────────────────────────────
 * Read the gate before reading the assertions, because the honest claim is narrower than
 * "members are now locked out". fiAuth resolves isInspector as:
 *
 *     isPreventionAdmin  OR  has('inspector')  OR  fi_settings.allow_crew_inspections
 *
 * and allow_crew_inspections DEFAULTS TO TRUE (the incumbent engine-company workflow).
 * So on a default department, a member can still write a permit — BY THE DEPARTMENT'S OWN
 * CONFIGURED CHOICE, exactly as for inspections. What changed is that the routes now HONOR
 * that choice instead of being blind to it: flip the toggle off and the same member is
 * refused. That is what the first two tests below actually assert, in both directions.
 *
 * DELETE is deliberately stricter than fiInspections' delete — prevention_admin only,
 * regardless of the crew toggle. A permit is a legal instrument, and published municipal
 * audits sample VOIDED permits first (one 2025 state comptroller audit pulled *all* voided
 * permits and *all* zero-fee permits as its frame). Retiring one is a bureau act.
 *
 * If any of these goes green by being deleted or weakened, the gate is decorative again.
 * Do not weaken them.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[fiPermitsHardening] TENANCY_TEST_DB not set — skipping.');
  test('fi permits hardening (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('fi_permits: authorization, vocabulary and integrity are enforced', async (t) => {
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

    const MARK = 'FI-PERMIT-HARD';
    let otherDeptId = null;
    let priorSetting = null;
    let deptId = null;
    // Registered FIRST, before anything that can throw. A failure during fixture setup
    // used to leave the http server listening and the suite hung forever (node --test
    // runs with --test-timeout=0), which turns a legible assertion failure into a
    // mystery. Teardown must never depend on setup having succeeded.
    t.after(async () => {
      try {
        if (deptId) {
          if (priorSetting) {
            await pool.query(
              `INSERT INTO fi_settings (department_id, allow_crew_inspections) VALUES ($1,$2)
               ON CONFLICT (department_id) DO UPDATE SET allow_crew_inspections = EXCLUDED.allow_crew_inspections`,
              [deptId, priorSetting.allow_crew_inspections]);
          } else {
            await pool.query('DELETE FROM fi_settings WHERE department_id = $1', [deptId]);
          }
        }
        await cleanup();
      } finally {
        await new Promise((r) => server.close(r));
        await pool.end().catch(() => {});
      }
    });

    async function cleanup() {
      await pool.query(`DELETE FROM fi_permits WHERE type LIKE $1 OR notes LIKE $1 OR "permitNumber" LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM fi_properties WHERE name LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM users WHERE username LIKE $1`, [`${MARK}%`]);
      if (otherDeptId) {
        await pool.query('DELETE FROM fi_permits WHERE department_id = $1', [otherDeptId]);
        await pool.query('DELETE FROM fi_properties WHERE department_id = $1', [otherDeptId]);
        await pool.query('DELETE FROM stations WHERE id = $1', [otherDeptId]);
        await pool.query('DELETE FROM departments WHERE id = $1', [otherDeptId]);
      }
    }
    await cleanup();

    const u = (await pool.query(
      `SELECT id, username, role, station_id FROM users WHERE station_id IS NOT NULL AND role='chief' ORDER BY id LIMIT 1`)).rows[0];
    assert.ok(u, 'need a chief with a station to run this suite');
    deptId = u.station_id;
    const chief = jwt.sign({ sub: u.id, username: u.username, role: u.role, stationId: u.station_id, name: 'Permit Hardening Chief' },
      ACCESS_SECRET, { expiresIn: '10m' });

    // A plain member in the SAME department, with NO fi_designations row. This is the
    // probationary firefighter the old routes handed permit-issuing authority to.
    // (name + initials are NOT NULL on users; and `users` is scoped by station_id only —
    // it is the shared OF-owned identity table and carries no department_id column.)
    const memberRow = (await pool.query(
      `INSERT INTO users (username, name, initials, "passwordHash", role, station_id)
       VALUES ($1, 'Probationary FF', 'PF', 'x', 'member', $2) RETURNING id, username`,
      [`${MARK}-member-${Date.now()}`, deptId])).rows[0];
    const member = jwt.sign({ sub: memberRow.id, username: memberRow.username, role: 'member', stationId: deptId, name: 'Probationary FF' },
      ACCESS_SECRET, { expiresIn: '10m' });

    // Preserve and restore the department's real setting — this suite must not leave a
    // department's prevention configuration changed behind it (the t.after above restores).
    priorSetting = (await pool.query(
      'SELECT allow_crew_inspections FROM fi_settings WHERE department_id = $1', [deptId])).rows[0] || null;
    async function setCrewInspections(on) {
      await pool.query(
        `INSERT INTO fi_settings (department_id, allow_crew_inspections) VALUES ($1, $2)
         ON CONFLICT (department_id) DO UPDATE SET allow_crew_inspections = EXCLUDED.allow_crew_inspections`,
        [deptId, on]);
    }

    const prop = await api('POST', '/api/fi-properties', chief, { name: `${MARK} Firehouse`, address: '1 Test Way' });
    assert.equal(prop.status, 201, JSON.stringify(prop.json));
    const propertyId = prop.json.data.id;

    let n = 0;
    const num = () => `${MARK}-${Date.now()}-${++n}`;
    const mkBody = (over = {}) => ({ propertyId, type: `${MARK} Occupancy`, permitNumber: num(), ...over });

    // ── THE GATE, BOTH DIRECTIONS ───────────────────────────────────────────────────────
    await t.test('🔴 a strict bureau (crew inspections OFF) REFUSES a non-designated member', async () => {
      await setCrewInspections(false);

      const create = await api('POST', '/api/fi-permits', member, mkBody());
      assert.equal(create.status, 403, `a member must not issue a permit: ${JSON.stringify(create.json)}`);
      assert.equal(create.json.code, 'FORBIDDEN_FI');

      // NOTHING WAS WRITTEN. A guard that returns 403 while still inserting is not a guard.
      const { rows } = await pool.query(
        `SELECT count(*)::int AS c FROM fi_permits WHERE department_id = $1 AND type = $2`,
        [deptId, `${MARK} Occupancy`]);
      assert.equal(rows[0].c, 0, 'the refused create must have written no row');

      // ...and the chief (prevention admin by role) still can — a guard that breaks the
      // legitimate path is not a fix, it is an outage.
      const ok = await api('POST', '/api/fi-permits', chief, mkBody());
      assert.equal(ok.status, 201, `the chief must still issue: ${JSON.stringify(ok.json)}`);

      const patch = await api('PATCH', `/api/fi-permits/${ok.json.data.id}`, member, { notes: 'nope' });
      assert.equal(patch.status, 403, 'a member must not edit a permit either');
    });

    await t.test('✅ a crew-workflow department (the default) still lets a member write — its own choice', async () => {
      await setCrewInspections(true);
      const create = await api('POST', '/api/fi-permits', member, mkBody());
      assert.equal(create.status, 201,
        `with crew inspections ON the department has chosen this: ${JSON.stringify(create.json)}`);
      // The claim is "the routes HONOR the designation model", not "members are locked out".
    });

    await t.test('🔴 DELETE requires prevention admin even when crew inspections are ON', async () => {
      await setCrewInspections(true);
      const created = await api('POST', '/api/fi-permits', chief, mkBody());
      const id = created.json.data.id;

      const del = await api('DELETE', `/api/fi-permits/${id}`, member);
      assert.equal(del.status, 403,
        `retiring a permit is a bureau act, not a crew act: ${JSON.stringify(del.json)}`);
      assert.equal(del.json.code, 'FORBIDDEN_FI');

      // The permit is STILL THERE — the auditor's first sample is voided permits.
      const still = await api('GET', `/api/fi-permits/${id}`, chief);
      assert.equal(still.status, 200, 'the refused delete must not have retired the permit');

      const ok = await api('DELETE', `/api/fi-permits/${id}`, chief);
      assert.equal(ok.status, 200, 'a prevention admin can retire it');
      const gone = await api('GET', `/api/fi-permits/${id}`, chief);
      assert.equal(gone.status, 404, 'and it soft-deletes out of the read path');
    });

    // ── THE VOCABULARY ──────────────────────────────────────────────────────────────────
    await t.test('🔴 an unrecognized status is REFUSED, never guessed onto the record', async () => {
      for (const status of ['Issued', 'Approved', 'Suspended', 'Inactive', 'active-ish']) {
        const bad = await api('POST', '/api/fi-permits', chief, mkBody({ status }));
        assert.equal(bad.status, 400, `'${status}' must be refused: ${JSON.stringify(bad.json)}`);
        assert.equal(bad.json.code, 'INVALID_PERMIT_STATUS');
        // The refusal must be ACTIONABLE: what was sent (message) and what is allowed
        // (details). A bare "invalid" teaches the caller nothing and gets worked around.
        assert.ok(bad.json.error.includes(status), `the message must name what was sent: ${bad.json.error}`);
        assert.ok(Array.isArray(bad.json.details) && bad.json.details.includes('Active'),
          `and details must carry the allowed set: ${JSON.stringify(bad.json.details)}`);
      }
      const { rows } = await pool.query(
        `SELECT count(*)::int AS c FROM fi_permits WHERE status IN ('Issued','Approved','Suspended','Inactive','active-ish')`);
      assert.equal(rows[0].c, 0, 'no refused status may have reached the table');
    });

    // ⚠ AMENDED BY 3.1a (2026-07-27). This test used to assert that
    // `POST /api/fi-permits { status: '  active ' }` returned 201 and normalized to
    // 'Active'. In 3.0 that was correct: status was just a validated field.
    //
    // 3.1a makes issuance a legal ACT with exactly one door, so a permit can no longer be
    // BORN issued — creating one 'Active' would mint a live instrument with no issuance
    // event and no attributable issuer, which is precisely the hole the door exists to
    // close. The create route is a writer, and a guard on one writer and not another is
    // not a guard (proven live 2026-07-14). The 201 is now a 409.
    //
    // The NORMALIZATION half of the original assertion is still meaningful and is kept —
    // it just now proves that '  active ' is recognized (409, a doctrine refusal) rather
    // than unrecognized (400), which is what distinguishes it from 'Suspended' above.
    await t.test('✅ case/whitespace still normalizes; a permit cannot be CREATED issued', async () => {
      const a = await api('POST', '/api/fi-permits', chief, mkBody({ status: '  active ' }));
      assert.equal(a.status, 409, `a permit cannot be born issued: ${JSON.stringify(a.json)}`);
      assert.equal(a.json.code, 'ISSUANCE_VIA_ENGINE',
        "'  active ' must be RECOGNIZED (409 doctrine) not UNRECOGNIZED (400 malformed) — that is the normalization");

      const pending = await api('POST', '/api/fi-permits', chief, mkBody({ status: ' pending ' }));
      assert.equal(pending.status, 201, 'the default status IS settable on create, normalized');
      assert.equal(pending.json.data.status, 'Pending');

      const b = await api('POST', '/api/fi-permits', chief, mkBody());
      assert.equal(b.json.data.status, 'Pending',
        'a CREATED permit has not been ISSUED — the old db-layer default of Active was the bug');
    });

    // ── THE INTEGRITY FLOOR (migration 0090) ────────────────────────────────────────────
    await t.test('🔴 a duplicate permit number is refused with an honest answer, not a 500', async () => {
      const permitNumber = num();
      const first = await api('POST', '/api/fi-permits', chief, mkBody({ permitNumber }));
      assert.equal(first.status, 201);

      const dup = await api('POST', '/api/fi-permits', chief, mkBody({ permitNumber }));
      assert.equal(dup.status, 409, `duplicates were ACCEPTED before 0090: ${JSON.stringify(dup.json)}`);
      assert.equal(dup.json.code, 'DUPLICATE_PERMIT_NUMBER');

      const { rows } = await pool.query(
        `SELECT count(*)::int AS c FROM fi_permits WHERE "permitNumber" = $1`, [permitNumber]);
      assert.equal(rows[0].c, 1, 'exactly one permit carries that number');
    });

    await t.test('🔴 a soft-deleted permit does NOT free its number for reuse', async () => {
      // The market rule: a document number is consumed once. A reusable number makes a
      // gap indistinguishable from a renumbering, which is the whole point of the sequence.
      const permitNumber = num();
      const created = await api('POST', '/api/fi-permits', chief, mkBody({ permitNumber }));
      await api('DELETE', `/api/fi-permits/${created.json.data.id}`, chief);

      const reuse = await api('POST', '/api/fi-permits', chief, mkBody({ permitNumber }));
      assert.equal(reuse.status, 409,
        `a retired permit's number stays consumed: ${JSON.stringify(reuse.json)}`);
      assert.equal(reuse.json.code, 'DUPLICATE_PERMIT_NUMBER');
    });

    await t.test('🔴 a permit cannot be issued against a property that does not exist', async () => {
      const bad = await api('POST', '/api/fi-permits', chief, mkBody({ propertyId: 999999999 }));
      assert.equal(bad.status, 404, JSON.stringify(bad.json));
      assert.equal(bad.json.code, 'PROPERTY_NOT_FOUND');
    });

    await t.test('✅ fee round-trips as money, not as a float', async () => {
      const r = await api('POST', '/api/fi-permits', chief, mkBody({ fee: 350.5 }));
      assert.equal(r.status, 201);
      assert.equal(Number(r.json.data.fee), 350.5, 'NUMERIC(12,2), not REAL');
      const zero = await api('POST', '/api/fi-permits', chief, mkBody({ fee: 0 }));
      assert.equal(Number(zero.json.data.fee), 0,
        'a ZERO-fee permit is a first-class record — it is the auditor\'s other first sample');
      const neg = await api('POST', '/api/fi-permits', chief, mkBody({ fee: -50 }));
      assert.equal(neg.status, 400, 'a negative fee is not a refund; refunds are their own record');
    });

    // ── VALIDATION ──────────────────────────────────────────────────────────────────────
    await t.test('🔴 unknown fields are refused, not silently dropped', async () => {
      // Silently ignoring an unknown key is how a field "saves" in the UI and vanishes
      // in the database — the user believes something was recorded that was not.
      const bad = await api('POST', '/api/fi-permits', chief, mkBody({ issuedByUserId: 1, revokedReason: 'x' }));
      assert.equal(bad.status, 400, JSON.stringify(bad.json));

      const ok = await api('POST', '/api/fi-permits', chief, mkBody());
      const patch = await api('PATCH', `/api/fi-permits/${ok.json.data.id}`, chief, { totallyMadeUp: 1 });
      assert.equal(patch.status, 400, 'PATCH is strict too');
    });

    await t.test('🔴 a malformed date is refused (the old route stored anything)', async () => {
      for (const issuedDate of ['next tuesday', '07/26/2026', '2026-13-45x']) {
        const bad = await api('POST', '/api/fi-permits', chief, mkBody({ issuedDate }));
        assert.equal(bad.status, 400, `'${issuedDate}' must be refused: ${JSON.stringify(bad.json)}`);
      }
      // ⚠ AMENDED BY 3.1a: `issuedDate` is now engine-owned and refused on create (409),
      // for the same reason as `status` above — a permit cannot be born issued. The date
      // VALIDATION assertions above still stand and still run first (zod rejects the
      // malformed values with 400 before the doctrine guard is ever reached), so this test
      // still proves what it was written to prove.
      const viaCreate = await api('POST', '/api/fi-permits', chief, mkBody({ issuedDate: '2026-07-26' }));
      assert.equal(viaCreate.status, 409, `issuedDate is stamped by the engine: ${JSON.stringify(viaCreate.json)}`);
      assert.equal(viaCreate.json.code, 'ISSUANCE_VIA_ENGINE');

      const ok = await api('POST', '/api/fi-permits', chief, mkBody({ expiresDate: '' }));
      assert.equal(ok.status, 201, 'an empty clear on an ordinary date field still works');
      assert.equal(ok.json.data.expiresDate, null);
    });

    // ⚠ AMENDED BY 3.1a: this used to assert that CREATE populates issued_by_user_id.
    // It did, because in 3.0 create was the only writer — but the column answers "who
    // ISSUED this permit", and at create time nobody has: the record is Pending. Filling
    // it at create names whoever typed the application, who on a legal instrument is a
    // different person with different authority. The issuance engine sets it now, because
    // that is the event it describes. Both halves are asserted below.
    await t.test('✅ issuance is attributable — stamped at ISSUE, not at create, and NOT patchable', async () => {
      const r = await api('POST', '/api/fi-permits', chief, mkBody());
      const { rows } = await pool.query('SELECT issued_by_user_id FROM fi_permits WHERE id = $1', [r.json.data.id]);
      assert.equal(rows[0].issued_by_user_id, null,
        'a Pending permit has no issuer yet — claiming one would be a false attribution');

      const issued = await api('POST', `/api/fi-permits/${r.json.data.id}/issue`, chief, { issuedDate: '2026-07-27' });
      assert.equal(issued.status, 200, JSON.stringify(issued.json));
      const { rows: onIssue } = await pool.query('SELECT issued_by_user_id FROM fi_permits WHERE id = $1', [r.json.data.id]);
      assert.equal(onIssue[0].issued_by_user_id, u.id,
        '"issuedBy" is a typed name string — the user id is the fact, recorded at the moment of issuance');

      // who issued a permit is a fact about an event, not an editable attribute
      const bad = await api('PATCH', `/api/fi-permits/${r.json.data.id}`, chief, { issued_by_user_id: 99999 });
      assert.equal(bad.status, 400, 'issued_by_user_id is not an accepted input');
      const { rows: after } = await pool.query('SELECT issued_by_user_id FROM fi_permits WHERE id = $1', [r.json.data.id]);
      assert.equal(after[0].issued_by_user_id, u.id, 'and it did not change');
    });

    // ── TENANCY ─────────────────────────────────────────────────────────────────────────
    await t.test('🔴 cross-tenant: another department\'s permit is invisible and untouchable', async () => {
      otherDeptId = await mkAlignedDeptStation(pool, `${MARK} Other Dept`);
      const theirProp = (await pool.query(
        `INSERT INTO fi_properties (name, address, station_id, department_id) VALUES ($1,'2 Elsewhere',$2,$2) RETURNING id`,
        [`${MARK} Their Building`, otherDeptId])).rows[0];
      const theirPermit = (await pool.query(
        `INSERT INTO fi_permits ("propertyId", type, "permitNumber", station_id, department_id)
         VALUES ($1,$2,$3,$4,$4) RETURNING id`,
        [theirProp.id, `${MARK} Theirs`, `${MARK}-THEIRS`, otherDeptId])).rows[0];

      const read = await api('GET', `/api/fi-permits/${theirPermit.id}`, chief);
      assert.equal(read.status, 404, 'must not be readable across the tenant boundary');

      const patch = await api('PATCH', `/api/fi-permits/${theirPermit.id}`, chief, { notes: 'mine now' });
      assert.equal(patch.status, 404, 'must not be writable across the tenant boundary');

      const del = await api('DELETE', `/api/fi-permits/${theirPermit.id}`, chief);
      assert.equal(del.status, 404, 'must not be deletable across the tenant boundary');

      const list = await api('GET', '/api/fi-permits', chief);
      assert.ok(!list.json.data.some((p) => p.id === theirPermit.id), 'and must not appear in the list');

      // Their permit is intact — a 404 that still mutated would be the worst outcome.
      const { rows } = await pool.query('SELECT notes, deleted_at FROM fi_permits WHERE id = $1', [theirPermit.id]);
      assert.equal(rows[0].notes, '');
      assert.equal(rows[0].deleted_at, null);

      // The number is scoped PER DEPARTMENT: the other dept may use the same number.
      const sameNumber = await api('POST', '/api/fi-permits', chief, mkBody({ permitNumber: `${MARK}-THEIRS` }));
      assert.equal(sameNumber.status, 201,
        'uniqueness is per department — two departments may each hold permit #1');
    });

    await t.test('🔴 an unauthenticated caller gets nothing', async () => {
      for (const [method, path] of [['GET', '/api/fi-permits'], ['POST', '/api/fi-permits'], ['DELETE', '/api/fi-permits/1']]) {
        const r = await api(method, path, null, method === 'POST' ? mkBody() : undefined);
        assert.ok(r.status === 401 || r.status === 403, `${method} ${path} → ${r.status}`);
      }
    });
  });
}
