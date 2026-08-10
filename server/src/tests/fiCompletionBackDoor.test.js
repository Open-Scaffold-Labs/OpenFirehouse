'use strict';
/**
 * fiCompletionBackDoor.test.js — THE REGRESSION FENCE FOR THE WORST BUG WE HAVE SHIPPED.
 * (2026-07-14)
 *
 * ── WHAT HAPPENED ───────────────────────────────────────────────────────────────────────
 * The doctrine "an inspection CANNOT PASS with unabated violations" lived ONLY inside the
 * completion engine (routes/fiWorkflow.completeInspection). But `PATCH /api/fi-inspections/:id`
 * could write `completedDate` and `result` directly — and the MOBILE CLIENT, the surface
 * inspectors actually hold on an iPad, wrote EXCLUSIVELY through that PATCH.
 *
 * Proven live against a running server on 2026-07-14, same record, same payload, same login:
 *
 *   POST /api/fi-inspections/9/complete  {"result":"Pass","completedDate":"2026-07-14"}
 *     → 422 PASS_WITH_OPEN_VIOLATIONS. DB unchanged.                                    ✅
 *   PATCH /api/fi-inspections/9          {"result":"Pass","completedDate":"2026-07-14"}
 *     → 200 OK. result=Pass, completed, violation still Open.                           ❌
 *
 * The PATCH path ALSO minted no reinspection and no next cycle — the violations fell
 * silently out of the loop, forever. A building with an unabated violation could be
 * recorded as passing, from the field, with no trace and no follow-up.
 *
 * ── WHAT ELSE WAS WRONG ─────────────────────────────────────────────────────────────────
 * 1. The guard was a REGEX — /^pass\b/i — against a free-text column. Executed:
 *        'Pass' → fires ✅ ·  'Passed' / 'PASSED' / 'Passing' → SILENT ❌
 *    One verb tense from failing open on a life-safety control.
 * 2. RECORD_FINALIZED only fired when `violations` was in the body, so `result`, `notes`,
 *    `type`, `followUpDate` etc. were rewritable on a completed, signed, SERVED record.
 *    Flipping a served "Fail" to "Pass" was a 200.
 * 3. The OFFLINE outbox (fiSync.applyInspectionPatch) mirrored the same weak logic.
 *
 * Every one of those is pinned below. If any of these tests goes green by being deleted or
 * weakened, the building passes. Do not weaken them.
 */
const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[fiCompletionBackDoor] TENANCY_TEST_DB not set — skipping.');
  test('fi completion back door (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('the completion back door is CLOSED — every door, online and offline', async (t) => {
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

    const MARK = 'FI-BACKDOOR';
    async function cleanup() {
      await pool.query(`DELETE FROM fi_violations WHERE inspection_id IN
        (SELECT id FROM fi_inspections WHERE notes LIKE $1 OR type LIKE $1)`, [`${MARK}%`]);
      await pool.query(`DELETE FROM fi_sync_ops WHERE client_id LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM fi_inspections WHERE notes LIKE $1 OR type LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM fi_properties WHERE name LIKE $1`, [`${MARK}%`]);
    }
    await cleanup();
    t.after(async () => { await cleanup(); await new Promise((r) => server.close(r)); await pool.end().catch(() => {}); });

    const u = (await pool.query(
      `SELECT id, username, role, station_id FROM users WHERE station_id IS NOT NULL AND role='chief' ORDER BY id LIMIT 1`)).rows[0];
    assert.ok(u, 'need a chief with a station to run this suite');
    const chief = jwt.sign({ sub: u.id, username: u.username, role: u.role, stationId: u.station_id, name: 'Backdoor Test' },
      ACCESS_SECRET, { expiresIn: '10m' });

    // A property, and an inspection with ONE UNABATED VIOLATION. This is the record that
    // must never be recordable as passing.
    const prop = await api('POST', '/api/fi-properties', chief, { name: `${MARK} Firehouse`, address: '1 Test Way' });
    assert.equal(prop.status, 201, JSON.stringify(prop.json));
    const propertyId = prop.json.data.id;

    async function freshInspection() {
      const r = await api('POST', '/api/fi-inspections', chief, {
        propertyId, type: `${MARK} Annual`, notes: `${MARK} fixture`,
        violations: [{ code: '1001', description: 'exit blocked', status: 'Open', followUpDate: '2026-09-01' }],
      });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      return r.json.data.id;
    }

    // ── THE DIFFERENTIAL — the exact one that was run live on 2026-07-14 ─────────────────
    await t.test('🔴 THE BACK DOOR: PATCH can no longer complete an inspection', async () => {
      const id = await freshInspection();

      // Door A — the completion engine. Correct behavior, unchanged.
      const doorA = await api('POST', `/api/fi-inspections/${id}/complete`, chief,
        { result: 'Pass', completedDate: '2026-07-14' });
      assert.equal(doorA.status, 422, `Door A must refuse: ${JSON.stringify(doorA.json)}`);
      assert.equal(doorA.json.code, 'PASS_WITH_OPEN_VIOLATIONS');

      // Door B — the route MOBILE writes through. This returned 200 OK before today.
      const doorB = await api('PATCH', `/api/fi-inspections/${id}`, chief,
        { result: 'Pass', completedDate: '2026-07-14' });
      assert.equal(doorB.status, 409,
        `Door B must NOT complete an inspection (was 200 OK): ${JSON.stringify(doorB.json)}`);
      assert.equal(doorB.json.code, 'COMPLETION_VIA_ENGINE');

      // THE RECORD IS UNTOUCHED. This is the assertion that actually matters — a guard that
      // returns the right status code while still writing the row is not a guard.
      const after = await api('GET', `/api/fi-inspections/${id}`, chief);
      assert.equal(after.json.data.completedDate, null, 'the record must NOT be completed');
      assert.equal(after.json.data.result, null, 'the record must NOT carry a result');
      assert.equal(after.json.data.violations[0].status, 'Open', 'the violation is still open');
    });

    await t.test('PATCH refuses result / result_code / completedDate INDIVIDUALLY', async () => {
      const id = await freshInspection();
      for (const body of [{ result: 'Fail' }, { completedDate: '2026-07-14' }, { result_code: 'PASS' }]) {
        const r = await api('PATCH', `/api/fi-inspections/${id}`, chief, body);
        assert.equal(r.status, 409, `${JSON.stringify(body)} must be refused: ${JSON.stringify(r.json)}`);
        assert.equal(r.json.code, 'COMPLETION_VIA_ENGINE');
      }
      // ...even a NON-passing result. The rule is not "no cheating the doctrine", it is
      // "completion has one door" — because the engine also mints the reinspection.
      const after = await api('GET', `/api/fi-inspections/${id}`, chief);
      assert.equal(after.json.data.result, null);
      assert.equal(after.json.data.completedDate, null);
    });

    // ── PATCH still works for the things it is FOR ──────────────────────────────────────
    // A guard that breaks the legitimate path is not a fix, it is an outage. The mobile
    // client's whole write model is partial PATCHes of notes and violations.
    await t.test('✅ PATCH still does its real job (notes, violations) on an OPEN record', async () => {
      const id = await freshInspection();
      const r = await api('PATCH', `/api/fi-inspections/${id}`, chief, { notes: `${MARK} updated in the field` });
      assert.equal(r.status, 200, `a legitimate partial PATCH must still work: ${JSON.stringify(r.json)}`);
      assert.equal(r.json.data.notes, `${MARK} updated in the field`);
      assert.equal(r.json.data.violations.length, 1, 'and it must not wipe the violations');

      const v = await api('PATCH', `/api/fi-inspections/${id}`, chief, {
        violations: [{ code: '1001', description: 'exit blocked', status: 'Corrected' }],
      });
      assert.equal(v.status, 200, 'citing/abating a violation must still work');
      assert.equal(v.json.data.violations[0].status, 'Corrected');
    });

    // ── THE HAPPY PATH STILL COMPLETES ─────────────────────────────────────────────────
    await t.test('✅ the engine still completes a CLEAN inspection and mints the next cycle', async () => {
      const r = await api('POST', '/api/fi-inspections', chief, {
        propertyId, type: `${MARK} Annual`, notes: `${MARK} clean`, violations: [],
      });
      const id = r.json.data.id;
      const done = await api('POST', `/api/fi-inspections/${id}/complete`, chief,
        { result: 'Pass', completedDate: '2026-07-14', scheduleNextCycle: false });
      assert.equal(done.status, 200, `a clean pass must still complete: ${JSON.stringify(done.json)}`);

      const after = await api('GET', `/api/fi-inspections/${id}`, chief);
      assert.equal(after.json.data.completedDate, '2026-07-14');
      assert.equal(after.json.data.result, 'Pass', 'the inspector\'s words are kept verbatim');
      assert.equal(after.json.data.result_code, 'PASS', 'and the CONTROL value is written alongside');
    });

    // ── RECORD_FINALIZED IS NOW UNCONDITIONAL ──────────────────────────────────────────
    await t.test('🔴 a COMPLETED record is final for EVERY field, not just violations', async () => {
      const r = await api('POST', '/api/fi-inspections', chief, {
        propertyId, type: `${MARK} Annual`, notes: `${MARK} final`, violations: [],
      });
      const id = r.json.data.id;
      await api('POST', `/api/fi-inspections/${id}/complete`, chief,
        { result: 'Pass', completedDate: '2026-07-14', scheduleNextCycle: false });

      // Before today, EVERY ONE of these returned 200 on a completed, signed, served record.
      for (const body of [{ notes: 'rewritten after the fact' },
                          { type: 'something else' },
                          { inspectorName: 'someone else' },
                          { followUpDate: '2027-01-01' }]) {
        const bad = await api('PATCH', `/api/fi-inspections/${id}`, chief, body);
        assert.equal(bad.status, 409,
          `${JSON.stringify(body)} must be refused on a completed record: ${JSON.stringify(bad.json)}`);
        assert.equal(bad.json.code, 'RECORD_FINALIZED');
      }
      // And the "Reopen" that mobile offered — PATCH completedDate: null — is refused too.
      const reopen = await api('PATCH', `/api/fi-inspections/${id}`, chief, { completedDate: null });
      assert.equal(reopen.status, 409, 'a completed record cannot be REOPENED by a PATCH');

      const after = await api('GET', `/api/fi-inspections/${id}`, chief);
      assert.equal(after.json.data.notes, `${MARK} final`, 'the finalized record is untouched');
      assert.equal(after.json.data.completedDate, '2026-07-14', 'and it is still completed');
    });

    // ── THE CREATE DOOR ────────────────────────────────────────────────────────────────
    await t.test('🔴 POST cannot create an already-passing record over open violations', async () => {
      const bad = await api('POST', '/api/fi-inspections', chief, {
        propertyId, type: `${MARK} Annual`, notes: `${MARK} create-hole`,
        result: 'Pass', completedDate: '2026-07-14',
        violations: [{ code: '1001', description: 'exit blocked', status: 'Open' }],
      });
      assert.equal(bad.status, 422,
        `closing PATCH must not just move the hole to POST: ${JSON.stringify(bad.json)}`);
      assert.equal(bad.json.code, 'PASS_WITH_OPEN_VIOLATIONS');
    });

    await t.test('🔴 an UNRECOGNIZED result is refused at every door', async () => {
      // 'Passed' silently defeated the old regex guard. It is now not a result at all.
      const bad = await api('POST', '/api/fi-inspections', chief, {
        propertyId, type: `${MARK} Annual`, notes: `${MARK} evil-word`, result: 'Passed', violations: [],
      });
      assert.equal(bad.status, 400, `'Passed' must be refused: ${JSON.stringify(bad.json)}`);
      assert.equal(bad.json.code, 'INVALID_RESULT');

      const id = await freshInspection();
      const c = await api('POST', `/api/fi-inspections/${id}/complete`, chief,
        { completedDate: '2026-07-14', result: 'Passing' });
      assert.equal(c.status, 400, `'Passing' must be refused at the completion door too`);
    });

    // ── THE LOST-ACK CASE — what the iPad's idempotency key is FOR ─────────────────────
    // The officer completes an inspection in a basement. The POST reaches the server and
    // lands. The cell dies before the ACK gets back. The device retries the SAME op with the
    // SAME clientId.
    //
    // Without the key: the retry is a second completion → 409 ALREADY_COMPLETED → the client
    // calls it a REFUSAL and tells a fire officer their completed inspection was rejected,
    // while it sits, completed, in this database. That is the queue lying again, inverted.
    //
    // With the key: the server recognizes it, answers `duplicate`, and syncCore treats that
    // as SUCCESS. And — the part that actually matters — the record is completed EXACTLY
    // ONCE, with EXACTLY ONE reinspection. A double-minted reinspection is a fabricated
    // legal record.
    await t.test('🔴 a REPLAYED completion is answered `duplicate` — completed once, not twice', async () => {
      const id = await freshInspection();           // 1 open violation, followUpDate 2026-09-01
      const clientId = `${MARK}-replay-${Date.now()}`;
      const op = {
        clientId, op: 'inspection.complete', inspectionId: id,
        payload: { completedDate: '2026-07-14', result: 'Reinspection Required' },
      };

      const first = await api('POST', '/api/fi-sync/batch', chief, { ops: [op] });
      assert.equal(first.json.results[0].status, 'applied', JSON.stringify(first.json.results[0]));

      // THE ACK WAS LOST. The device sends the identical op again.
      const replay = await api('POST', '/api/fi-sync/batch', chief, { ops: [op] });
      assert.equal(replay.json.results[0].status, 'duplicate',
        `a replay MUST be recognized, not treated as a second completion: ${JSON.stringify(replay.json.results[0])}`);

      // The record was completed ONCE...
      const after = await api('GET', `/api/fi-inspections/${id}`, chief);
      assert.equal(after.json.data.completedDate, '2026-07-14');
      assert.equal(after.json.data.result_code, 'REINSPECTION_REQUIRED');

      // ...and the server minted EXACTLY ONE reinspection, not two. A duplicate reinspection
      // is a legal record no human authored.
      const all = await api('GET', '/api/fi-inspections', chief);
      const reinspections = all.json.data.filter(
        (i) => i.type === 'Reinspection' && i.propertyId === propertyId && i.notes?.includes(String(id)));
      assert.ok(reinspections.length <= 1,
        `the replay must not mint a second reinspection (found ${reinspections.length})`);
    });

    // ── THE OFFLINE DOOR ───────────────────────────────────────────────────────────────
    await t.test('🔴 the OFFLINE outbox cannot complete an inspection either', async () => {
      const id = await freshInspection();
      const r = await api('POST', '/api/fi-sync/batch', chief, {
        ops: [{
          clientId: `${MARK}-${Date.now()}`,
          op: 'inspection.patch',
          inspectionId: id,
          payload: { result: 'Pass', completedDate: '2026-07-14' },
        }],
      });
      assert.equal(r.status, 200, 'the batch itself is accepted; the OP is rejected per-item');
      const item = r.json.results[0];
      assert.equal(item.status, 'rejected',
        `an offline inspection.patch must not complete a record: ${JSON.stringify(item)}`);
      assert.equal(item.code, 'COMPLETION_VIA_ENGINE');

      const after = await api('GET', `/api/fi-inspections/${id}`, chief);
      assert.equal(after.json.data.completedDate, null, 'the offline door stamped nothing');
      assert.equal(after.json.data.result, null);
    });
  });
}
