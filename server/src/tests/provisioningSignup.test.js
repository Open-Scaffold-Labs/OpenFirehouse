'use strict';
/**
 * provisioningSignup.test.js — P4.2 self-serve signup, end-to-end over HTTP.
 *
 * OPT-IN via TENANCY_TEST_DB (same gate as the other tenancy suites). Boots the
 * real Express app with P4_SIGNUP=on and drives POST /api/auth/signup, proving a
 * brand-new department is created with ZERO SQL, is fully isolated from another
 * signed-up department, and that a failed signup leaves no orphan rows.
 */
const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[provisioningSignup] TENANCY_TEST_DB not set — skipping P4.2 signup suite.');
  test('P4.2 signup (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  process.env.P4_SIGNUP = 'on';          // dark-launch flag — on for the test
  delete process.env.PORT;

  test('P4.2 — self-serve signup creates an isolated department; failure leaves no orphan', async (t) => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => {
      const tmr = realSetInterval(...args);
      if (tmr && typeof tmr.unref === 'function') tmr.unref();
      return tmr;
    };
    let app;
    try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');

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

    async function cleanup() {
      const depts = (await pool.query("SELECT id FROM departments WHERE name LIKE 'P4SGN%'")).rows.map(r => r.id);
      await pool.query("DELETE FROM users WHERE username LIKE 'p4sgn\\_%'");
      if (depts.length) {
        await pool.query('DELETE FROM audit_log WHERE station_id = ANY($1) OR department_id = ANY($1)', [depts]);
        await pool.query('DELETE FROM stations WHERE department_id = ANY($1)', [depts]);
      }
      await pool.query("DELETE FROM departments WHERE name LIKE 'P4SGN%'");
    }

    try {
      // wait for the lazy-init DB gate
      let ready = false;
      for (let i = 0; i < 30; i++) {
        try { const r = await fetch(`${base}/api/setup-status`); if (r.status === 200) { ready = true; break; } }
        catch { /* warming up */ }
        await new Promise((r2) => setTimeout(r2, 1000));
      }
      assert.ok(ready, 'DB never became ready');
      await cleanup();

      const A = { departmentName: 'P4SGN Dept A', chiefUsername: 'p4sgn_a', chiefName: 'Chief A', chiefEmail: 'chiefa@p4sgn.test',
                  chiefPassword: 'correct-horse-battery', attestedMembers: 12, attestedStations: 1, attestedBudgetUsd: 400000 };
      const B = { departmentName: 'P4SGN Dept B', chiefUsername: 'p4sgn_b', chiefName: 'Chief B', chiefEmail: 'chiefb@p4sgn.test',
                  chiefPassword: 'correct-horse-battery', attestedMembers: 120, attestedStations: 5, attestedBudgetUsd: 6000000 };

      // ── signup creates a department end-to-end, zero SQL ──────────────────────
      const ra = await api('POST', '/api/auth/signup', null, A);
      assert.strictEqual(ra.status, 201, `signup A failed: ${JSON.stringify(ra.json)}`);
      assert.ok(ra.json.token, 'signup A returns an access token');
      assert.ok(ra.json.department?.id, 'signup A returns a department id');
      assert.strictEqual(ra.json.department.plan_tier, 'independent', 'small dept A → independent tier');
      const tokenA = ra.json.token, deptA = ra.json.department.id;

      const rb = await api('POST', '/api/auth/signup', null, B);
      assert.strictEqual(rb.status, 201, `signup B failed: ${JSON.stringify(rb.json)}`);
      assert.notStrictEqual(rb.json.department.plan_tier, 'independent', 'larger dept B → a paid tier');
      const tokenB = rb.json.token, deptB = rb.json.department.id;
      assert.notStrictEqual(Number(deptA), Number(deptB), 'A and B must be distinct departments');

      // ── isolation: each chief sees only their own department ──────────────────
      await t.test('each new chief is scoped to their own department', async () => {
        const meA = await api('GET', '/api/departments/me', tokenA);
        const meB = await api('GET', '/api/departments/me', tokenB);
        assert.strictEqual(meA.status, 200); assert.strictEqual(meB.status, 200);
        assert.strictEqual(Number(meA.json.data.id), Number(deptA), 'A sees dept A');
        assert.strictEqual(Number(meB.json.data.id), Number(deptB), 'B sees dept B');
      });

      await t.test('a chief cannot edit another department', async () => {
        const cross = await api('PATCH', `/api/departments/${deptA}`, tokenB, { name: 'PWNED' });
        assert.strictEqual(cross.status, 404, 'cross-department PATCH must 404');
        const ownEdit = await api('PATCH', `/api/departments/${deptB}`, tokenB, { attestedMembers: 10, attestedStations: 1, attestedBudgetUsd: 100000 });
        assert.strictEqual(ownEdit.status, 200, 'chief can edit own department');
        assert.strictEqual(ownEdit.json.tier_advisory?.effective_at, 'next_renewal', 're-attest is advisory, not blocking');
        const row = (await pool.query('SELECT name FROM departments WHERE id=$1', [deptA])).rows[0];
        assert.strictEqual(row.name, 'P4SGN Dept A', 'dept A name must be unchanged by the cross attempt');

        // P4.3 wizard shift step: shift_pattern persists on departments + reflects in /me.
        const shiftEdit = await api('PATCH', `/api/departments/${deptB}`, tokenB, { shift_pattern: '24/48' });
        assert.strictEqual(shiftEdit.status, 200, 'chief can set shift_pattern');
        const meB = await api('GET', '/api/departments/me', tokenB);
        assert.strictEqual(meB.json.data.shift_pattern, '24/48', 'shift_pattern persists + reflects in /me (wizard shift step)');
      });

      // ── failed signup leaves NO orphan dept/user/station ──────────────────────
      await t.test('a failed signup (duplicate username) leaves no orphan rows', async () => {
        // Counts are scoped to THIS suite's P4SGN marker: node runs test files
        // concurrently against the shared DB, so a global count(*) drifts when a
        // sibling suite (e.g. provisioningIsolation) writes during this window. A
        // real orphan from the dup signup is still a P4SGN dept / p4sgn_ user / a
        // station under a P4SGN dept, so the scoped check catches it precisely.
        const countSql = `SELECT
          (SELECT count(*) FROM departments WHERE name LIKE 'P4SGN%')::int d,
          (SELECT count(*) FROM users WHERE username LIKE 'p4sgn\\_%')::int u,
          (SELECT count(*) FROM stations WHERE department_id IN (SELECT id FROM departments WHERE name LIKE 'P4SGN%'))::int s`;
        const before = (await pool.query(countSql)).rows[0];
        const dup = await api('POST', '/api/auth/signup', null, { ...A, departmentName: 'P4SGN Dept Dup' });
        assert.strictEqual(dup.status, 409, 'duplicate username must 409');
        assert.strictEqual(dup.json.code, 'USERNAME_TAKEN',
          'a real duplicate username must be classified USERNAME_TAKEN — not a generic 23505 mislabel');
        const after = (await pool.query(countSql)).rows[0];
        assert.deepStrictEqual(after, before, 'a failed signup must not create a department, user, or station');
      });

      // ── dark-launch: when P4_SIGNUP is off, the route is a 404 for ALL inputs ──
      await t.test('P4.5 tier-status advisory: paid tier surfaces buy/activate, never a hard cap', async () => {
        // Re-attest B to a clearly paid size (advisory recompute), then read tier-status.
        await api('PATCH', `/api/departments/${deptB}`, tokenB, { attestedMembers: 250, attestedStations: 12, attestedBudgetUsd: 20000000 });
        const tsB = await api('GET', '/api/departments/tier-status', tokenB);
        assert.strictEqual(tsB.status, 200, `tier-status B: ${JSON.stringify(tsB.json)}`);
        assert.strictEqual(tsB.json.data.paid_tier, true, 'dept B is a paid tier after re-attest');
        assert.strictEqual(tsB.json.data.hard_caps, false, 'tier status is NEVER a hard cap (EULA)');
        assert.strictEqual(tsB.json.data.advisory?.kind, 'needs_license', 'paid + unlicensed → needs_license advisory');
        // Dept A attested small → free tier → no advisory.
        const tsA = await api('GET', '/api/departments/tier-status', tokenA);
        assert.strictEqual(tsA.json.data.paid_tier, false, 'dept A is the free (independent) tier');
        assert.strictEqual(tsA.json.data.advisory, null, 'free tier has no advisory');
        // Storage metering: real usage measured vs the tier's quota — advisory only.
        assert.strictEqual(tsB.json.data.storage.quota_gb, 1024, 'metro tier → 1 TB storage quota');
        assert.ok(tsB.json.data.storage.used_gb >= 0, 'storage usage is measured (bytes summed from file tables)');
        assert.strictEqual(tsB.json.data.storage.over_quota, false, 'fresh dept is under quota — no overage');
        assert.strictEqual(tsA.json.data.storage.quota_gb, 5, 'independent tier → 5 GB storage quota');
      });

      await t.test('self-serve signup writes an audit_log entry (P4.6 audit coverage)', async () => {
        const rows = (await pool.query(
          "SELECT 1 FROM audit_log WHERE table_name='departments' AND action='create' AND (station_id=$1 OR department_id=$1)",
          [deptA])).rows;
        assert.ok(rows.length >= 1, 'the self-serve signup of dept A is audited');
      });

      await t.test('signup marks the chief unverified; verify-email flips it [EV]', async () => {
        const u0 = (await pool.query("SELECT email_verified, email_verify_token_hash FROM users WHERE username='p4sgn_a'")).rows[0];
        assert.strictEqual(u0.email_verified, false, 'new chief starts email_verified=false');
        assert.ok(u0.email_verify_token_hash, 'a verification token hash was issued at signup');
        // Simulate the emailed link with a known token (the raw token is only emailed,
        // never returned), then hit the public verify endpoint.
        const { hashInviteToken } = require('../utils/inviteToken');
        const tok = 'EVTEST-' + Date.now();
        await pool.query("UPDATE users SET email_verify_token_hash=$1, email_verify_sent_at=now(), email_verified=false WHERE username='p4sgn_a'", [hashInviteToken(tok)]);
        const vr = await api('GET', '/api/auth/verify-email?token=' + encodeURIComponent(tok), null);
        assert.strictEqual(vr.status, 200, 'verify-email returns 200 for a valid token');
        const u1 = (await pool.query("SELECT email_verified, email_verify_token_hash FROM users WHERE username='p4sgn_a'")).rows[0];
        assert.strictEqual(u1.email_verified, true, 'email is verified after the link is clicked');
        assert.strictEqual(u1.email_verify_token_hash, null, 'token is cleared (single-use) after verification');
        // A bad token is rejected.
        assert.strictEqual((await api('GET', '/api/auth/verify-email?token=NOPE', null)).status, 400, 'invalid token → 400');
      });

      await t.test('signup is dark when P4_SIGNUP is off (404, no endpoint-existence leak)', async () => {
        process.env.P4_SIGNUP = 'off';
        try {
          const validBody   = await api('POST', '/api/auth/signup', null, { ...A, chiefUsername: 'p4sgn_dark' });
          const invalidBody = await api('POST', '/api/auth/signup', null, { bad: true });
          assert.strictEqual(validBody.status, 404, 'valid signup must 404 when flag off');
          assert.strictEqual(invalidBody.status, 404, 'invalid signup must ALSO 404 when off (gate runs before validation — no info leak)');
        } finally {
          process.env.P4_SIGNUP = 'on';
        }
      });

    } finally {
      await cleanup();
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    }
  });
}
