'use strict';
/**
 * mfaAuth.test.js — Phase 5 / 0111. The BYPASS tests.
 *
 * totp.test.js proves the algorithm is correct against RFC 6238's own published
 * vectors. This file proves the surrounding auth FLOW cannot be walked around,
 * which is where real MFA implementations actually fail. Every case here is a
 * way an attacker — or a careless client — could try to skip the second factor.
 *
 * Follows the existing tenancy-suite convention: boots the real app on an
 * ephemeral port and drives it over HTTP with fetch. Runs only when
 * TENANCY_TEST_DB is set; skips cleanly otherwise.
 */

const assert = require('node:assert');
const { test } = require('node:test');

const DB = process.env.TENANCY_TEST_DB;
if (DB) process.env.DATABASE_URL = DB;

// This suite signs in dozens of times from one IP, which trips authLimiter's
// 30-per-15-minutes brute-force guard and turns real assertions into 429s. That
// is exactly the case the limiter's OPENFIREHOUSE_DEMO skip exists for (see the
// comment on authLimiter in index.js). PRODUCTION NEVER SETS THIS, so the
// brute-force protection is untouched where it matters.
process.env.OPENFIREHOUSE_DEMO = 'true';

const MARK = 'MFA0111';

test('MFA login flow: enrolment, bypass resistance, replay, recovery, mandate', { skip: !DB && 'TENANCY_TEST_DB not set' }, async (t) => {
  // Keep the app's background intervals from holding the process open.
  const realSetInterval = global.setInterval;
  global.setInterval = (...args) => {
    const tmr = realSetInterval(...args);
    if (tmr && typeof tmr.unref === 'function') tmr.unref();
    return tmr;
  };
  let app;
  try { app = require('../index'); } finally { global.setInterval = realSetInterval; }

  const { pool } = require('../db');
  const bcrypt = require('bcrypt');
  const jwt = require('jsonwebtoken');
  const totp = require('../utils/totp');
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

  const USERNAME = `${MARK.toLowerCase()}_chief`;
  const PASSWORD = 'correct-horse-battery-staple-12';
  const login = () => api('POST', '/api/auth/login', null, { username: USERNAME, password: PASSWORD });

  // The replay guard records the time step each successful verification consumed,
  // and a TOTP step lasts 30s. Tests run in milliseconds, so without this every
  // test after the first would collide with its predecessor's step and be
  // (correctly) refused as a replay. Only the REPLAY test omits this — for that
  // one, the collision IS the assertion.
  const clearStep = () => pool.query('UPDATE users SET mfa_last_step = NULL WHERE id = $1', [userId]);

  async function cleanup() {
    const depts = (await pool.query(`SELECT id FROM departments WHERE name LIKE '${MARK}%'`)).rows.map(r => r.id);
    await pool.query(`DELETE FROM users WHERE username LIKE '${MARK.toLowerCase()}\\_%'`);
    if (depts.length) {
      await pool.query('DELETE FROM audit_log WHERE station_id = ANY($1) OR department_id = ANY($1)', [depts]);
      await pool.query('DELETE FROM stations WHERE department_id = ANY($1)', [depts]);
    }
    await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
  }

  let stationId, deptId, userId, SECRET;

  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try { const r = await fetch(`${base}/api/setup-status`); if (r.status === 200) { ready = true; break; } }
      catch { /* warming up */ }
      await new Promise((r2) => setTimeout(r2, 1000));
    }
    assert.ok(ready, 'DB never became ready');
    await cleanup();

    // ── fixture ──────────────────────────────────────────────────────────────
    deptId = (await pool.query('INSERT INTO departments (name) VALUES ($1) RETURNING id', [`${MARK} FD`])).rows[0].id;
    stationId = (await pool.query('INSERT INTO stations (name, department_id) VALUES ($1,$2) RETURNING id', [`${MARK} Station`, deptId])).rows[0].id;
    userId = (await pool.query(
      `INSERT INTO users (username, "passwordHash", name, initials, role, station_id)
       VALUES ($1,$2,$3,$4,'chief',$5) RETURNING id`,
      [USERNAME, bcrypt.hashSync(PASSWORD, 10), `${MARK} Chief`, 'MC', stationId]
    )).rows[0].id;
    await pool.query(
      `INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1,$2,'chief') ON CONFLICT DO NOTHING`,
      [userId, deptId]
    );

    // ── baseline: an un-enrolled user is entirely unaffected ─────────────────
    await t.test('login without MFA returns a session exactly as before', async () => {
      const res = await login();
      assert.strictEqual(res.status, 200);
      assert.ok(res.json.token, 'issues an access token');
      assert.strictEqual(res.json.mfaRequired, undefined, 'no challenge for an un-enrolled user');
    });

    // ── enrolment is two-phase ───────────────────────────────────────────────
    await t.test('enrolment does NOT activate MFA until a code is confirmed', async () => {
      const { json: { token } } = await login();
      const enroll = await api('POST', '/api/mfa/enroll', token);
      assert.strictEqual(enroll.status, 200);
      assert.ok(enroll.json.secret);
      assert.ok(enroll.json.otpauthUri.startsWith('otpauth://totp/'));
      SECRET = enroll.json.secret;

      // A secret now exists — but login must STILL not challenge, or abandoning
      // enrolment would lock the member out of their own account.
      const relogin = await login();
      assert.strictEqual(relogin.json.mfaRequired, undefined,
        'an abandoned enrolment must never lock anyone out');
      assert.ok(relogin.json.token);
    });

    await t.test('confirm activates MFA; recovery codes are returned once and stored only as hashes', async () => {
      const { json: { token } } = await login();

      const bad = await api('POST', '/api/mfa/confirm', token, { code: '000000' });
      assert.strictEqual(bad.status, 401, 'a wrong code must not activate MFA');

      const ok = await api('POST', '/api/mfa/confirm', token, { code: totp.generate(SECRET) });
      assert.strictEqual(ok.status, 200);
      assert.strictEqual(ok.json.enabled, true);
      assert.strictEqual(ok.json.recoveryCodes.length, 10);

      const { rows } = await pool.query('SELECT mfa_recovery_codes FROM users WHERE id = $1', [userId]);
      const stored = JSON.stringify(rows[0].mfa_recovery_codes);
      for (const c of ok.json.recoveryCodes) {
        assert.ok(!stored.includes(c), 'plaintext recovery code must NEVER be stored');
      }
    });

    // ── THE BYPASS TESTS ─────────────────────────────────────────────────────
    await t.test('login with MFA active issues NO session token, only a challenge', async () => {
      const res = await login();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.mfaRequired, true);
      assert.ok(res.json.mfaToken);
      assert.strictEqual(res.json.token, undefined, 'MUST NOT issue an access token');
      assert.strictEqual(res.json.user, undefined, 'MUST NOT leak the user record');
    });

    await t.test('BYPASS: the challenge token cannot authenticate a normal route', async () => {
      const { json: { mfaToken } } = await login();
      // The challenge is signed with ACCESS_SECRET and carries a real `sub`, so
      // without an explicit guard requireAuth would accept it — and a client
      // could simply never render the code prompt.
      const res = await api('GET', '/api/departments/me', mfaToken);
      assert.strictEqual(res.status, 401, 'a pending challenge is NOT a session');
      assert.strictEqual(res.json.code, 'MFA_REQUIRED');
    });

    await t.test('BYPASS: a token without the pending claim cannot be exchanged', async () => {
      const forged = jwt.sign({ sub: userId, username: USERNAME }, ACCESS_SECRET, { expiresIn: '5m' });
      const res = await api('POST', '/api/auth/mfa', null, { mfaToken: forged, code: totp.generate(SECRET) });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.json.code, 'MFA_BAD_CHALLENGE');
    });

    await t.test('BYPASS: a challenge signed with the WRONG secret is refused', async () => {
      const forged = jwt.sign({ sub: userId, mfa: 'pending' }, 'not-the-real-secret', { expiresIn: '5m' });
      const res = await api('POST', '/api/auth/mfa', null, { mfaToken: forged, code: totp.generate(SECRET) });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.json.code, 'MFA_CHALLENGE_EXPIRED');
    });

    await t.test('a valid code exchanges the challenge for a working session', async () => {
      await clearStep();
      const { json: { mfaToken } } = await login();
      const res = await api('POST', '/api/auth/mfa', null, { mfaToken, code: totp.generate(SECRET) });
      assert.strictEqual(res.status, 200);
      assert.ok(res.json.token);
      assert.strictEqual(res.json.user.username, USERNAME);

      const me = await api('GET', '/api/departments/me', res.json.token);
      assert.strictEqual(me.status, 200, 'the exchanged token works on a real route');
    });

    await t.test('REPLAY: the same TOTP code cannot be used twice', async () => {
      await clearStep();
      const code = totp.generate(SECRET);

      const a = await api('POST', '/api/auth/mfa', null, { mfaToken: (await login()).json.mfaToken, code });
      assert.strictEqual(a.status, 200, 'first use succeeds');

      // A TOTP stays cryptographically valid for its whole window. Without the
      // consumed-step check this second exchange would ALSO succeed — the bug
      // that leaves a shoulder-surfed code usable for ~90 seconds.
      const b = await api('POST', '/api/auth/mfa', null, { mfaToken: (await login()).json.mfaToken, code });
      assert.strictEqual(b.status, 401, 'replay MUST be refused');
      assert.strictEqual(b.json.code, 'MFA_CODE_REPLAYED');
    });

    await t.test('a wrong code produces no session', async () => {
      const { json: { mfaToken } } = await login();
      const res = await api('POST', '/api/auth/mfa', null, { mfaToken, code: '000000' });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.json.code, 'MFA_INVALID_CODE');
      assert.strictEqual(res.json.token, undefined);
    });

    await t.test('a recovery code works exactly once', async () => {
      await clearStep();
      const sess = await api('POST', '/api/auth/mfa', null,
        { mfaToken: (await login()).json.mfaToken, code: totp.generate(SECRET) });
      const regen = await api('POST', '/api/mfa/recovery/regenerate', sess.json.token, { password: PASSWORD });
      assert.strictEqual(regen.status, 200);
      const recovery = regen.json.recoveryCodes[0];

      const use1 = await api('POST', '/api/auth/mfa', null,
        { mfaToken: (await login()).json.mfaToken, code: recovery });
      assert.strictEqual(use1.status, 200, 'recovery code signs in');
      assert.strictEqual(use1.json.usedRecoveryCode, true);

      const use2 = await api('POST', '/api/auth/mfa', null,
        { mfaToken: (await login()).json.mfaToken, code: recovery });
      assert.strictEqual(use2.status, 401, 'a recovery code is SINGLE use');
    });

    // ── the department mandate ───────────────────────────────────────────────
    await t.test('a member cannot disable MFA while their department mandates it', async () => {
      await clearStep();
      await pool.query('UPDATE departments SET mfa_required = TRUE WHERE id = $1', [deptId]);
      try {
        const sess = await api('POST', '/api/auth/mfa', null,
          { mfaToken: (await login()).json.mfaToken, code: totp.generate(SECRET) });
        const res = await api('POST', '/api/mfa/disable', sess.json.token, { password: PASSWORD });
        assert.strictEqual(res.status, 403);
        assert.strictEqual(res.json.code, 'MFA_REQUIRED_BY_DEPARTMENT');
      } finally {
        await pool.query('UPDATE departments SET mfa_required = FALSE WHERE id = $1', [deptId]);
      }
    });

    await t.test('disabling MFA requires the PASSWORD, not merely a session', async () => {
      await clearStep();
      const sess = await api('POST', '/api/auth/mfa', null,
        { mfaToken: (await login()).json.mfaToken, code: totp.generate(SECRET) });

      // An unattended browser must not be able to strip the second factor.
      const wrong = await api('POST', '/api/mfa/disable', sess.json.token, { password: 'not-the-password' });
      assert.strictEqual(wrong.status, 401);
      assert.strictEqual(wrong.json.code, 'BAD_PASSWORD');

      const ok = await api('POST', '/api/mfa/disable', sess.json.token, { password: PASSWORD });
      assert.strictEqual(ok.status, 200);
      assert.strictEqual(ok.json.enabled, false);

      const after = await login();
      assert.strictEqual(after.json.mfaRequired, undefined, 'back to a plain session');
      assert.ok(after.json.token);
    });
  } finally {
    await cleanup();
    await new Promise((r) => server.close(r));
  }
});
