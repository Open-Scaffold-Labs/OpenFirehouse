'use strict';
/**
 * radioWsAuth.test.js — the /ws/radio auth resolver (radio/wsAuth.js).
 *
 * Proves the closed cross-tenant subscription hole and the TV-PIN keying fix:
 *   1. a VERIFIED JWT  → the user's department_id (derived, not claimed)
 *   2. a forged/garbage token → rejected (null)
 *   3. a client-claimed {stationId:N} → IGNORED (null) — the old hole
 *   4. a valid TV PIN  → the PIN'd house's department_id (multi-house fix)
 *   5. a wrong TV PIN  → rejected (null)
 *
 * DB-backed: skips cleanly without TENANCY_TEST_DB.
 */
const test   = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('radio WS auth resolver (skipped — set TENANCY_TEST_DB)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL || TENANCY_TEST_DB;
  const jwt = require('jsonwebtoken');
  const { ACCESS_SECRET } = require('../config/jwtSecret');
  const { hashTvPin } = require('../config/tvPin');
  const db = require('../db');
  const { resolveRadioWsTenant } = require('../radio/wsAuth');

  test('radio WS auth: verified JWT and TV PIN resolve to department; client-claimed id and bad creds rejected', async () => {
    const { pool } = db;
    const MARK = 'WSAUTH-' + Date.now();
    const PIN  = 'TPIN' + (Date.now() % 10000);
    let deptId, stationId, userId;

    try {
      // ── Fixture: 1 department, 1 house (with TV PIN), 1 member mapped to it ──
      // Create the station first (department_id backfilled below), then the
      // department — looping until its id differs from the station's. OF's model
      // is 1-station = 1-dept with dept.id == station.id, so after sequence
      // reconciliation the dept and station sequences run in LOCKSTEP and a naive
      // create yields deptId == stationId, which would make the "PIN keys by
      // DEPARTMENT, not station" assertion below meaningless. This guarantees the
      // precondition deterministically (no reliance on incidental id allocation).
      stationId = (await pool.query(
        'INSERT INTO stations (name, department_id, tv_pin) VALUES ($1, NULL, $2) RETURNING id',
        [MARK + ' Station 1', hashTvPin(PIN)]
      )).rows[0].id;
      do {
        deptId = (await pool.query('INSERT INTO departments (name) VALUES ($1) RETURNING id', [MARK + ' Fire'])).rows[0].id;
      } while (Number(deptId) === Number(stationId));
      await pool.query('UPDATE stations SET department_id = $1 WHERE id = $2', [deptId, stationId]);
      userId    = (await pool.query(
        'INSERT INTO users (username, name, initials, role, "passwordHash", station_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [MARK.toLowerCase() + '-u', MARK + ' User', 'WU', 'member', 'x', stationId]
      )).rows[0].id;
      await pool.query(
        'INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1,$2,$3)',
        [userId, deptId, 'member']
      );

      const token = jwt.sign({ sub: userId, username: MARK.toLowerCase() + '-u', role: 'member' }, ACCESS_SECRET);

      // 1. Verified JWT → the user's department (derived server-side, not claimed)
      const fromToken = await resolveRadioWsTenant({ type: 'auth', token });
      assert.strictEqual(Number(fromToken), Number(deptId), 'valid JWT resolves to the user department_id');

      // 2. Forged/garbage token → rejected
      assert.strictEqual(await resolveRadioWsTenant({ type: 'auth', token: 'not.a.valid.jwt' }), null, 'garbage token is rejected');

      // 3. Client-claimed station/department id → IGNORED (the closed hole).
      //    No token, no pin: a raw {stationId} must never authenticate.
      assert.strictEqual(await resolveRadioWsTenant({ type: 'auth', stationId: deptId }),     null, 'client-claimed stationId is ignored');
      assert.strictEqual(await resolveRadioWsTenant({ type: 'auth', stationId: 999999999 }),  null, 'arbitrary client-claimed id is ignored');

      // 4. Valid TV PIN → the PIN'd house's DEPARTMENT (multi-house keying fix).
      //    deptId !== stationId here, so this proves it keys by department, not station.
      const fromPin = await resolveRadioWsTenant({ type: 'auth', pin: PIN });
      assert.strictEqual(Number(fromPin), Number(deptId), 'valid TV PIN resolves to the house department_id');
      assert.notStrictEqual(Number(deptId), Number(stationId), 'sanity: dept and station ids differ (so the PIN assertion is meaningful)');

      // 5. Wrong TV PIN → rejected
      assert.strictEqual(await resolveRadioWsTenant({ type: 'auth', pin: 'NOPE9999' }), null, 'wrong TV PIN is rejected');

      // 6. Non-auth / empty messages → rejected
      assert.strictEqual(await resolveRadioWsTenant({ type: 'radio' }), null, 'non-auth message rejected');
      assert.strictEqual(await resolveRadioWsTenant(null),              null, 'null message rejected');
    } finally {
      // Tear down in reverse-FK order.
      if (userId)    await pool.query('DELETE FROM of_user_departments WHERE user_id = $1', [userId]).catch(() => {});
      if (userId)    await pool.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
      if (stationId) await pool.query('DELETE FROM stations WHERE id = $1', [stationId]).catch(() => {});
      if (deptId)    await pool.query('DELETE FROM departments WHERE id = $1', [deptId]).catch(() => {});
      await pool.end().catch(() => {});
    }
  });
}
