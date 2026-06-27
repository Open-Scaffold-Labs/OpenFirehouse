'use strict';
/**
 * identityLinkHttp.test.js — HTTP-level coverage for the P5 confirm-link surface
 * (GET /api/members/unlinked, POST /api/members/:id/link, GET /api/members/:id/history).
 *
 * Boots the real Express app (mirrors provisioningIsolation.test.js) and drives the
 * endpoints through real auth tokens. OPT-IN via TENANCY_TEST_DB; skips otherwise.
 * All test rows are prefixed IDLINKHTTP and torn down FK-safely.
 *
 * Run:
 *   cd server && TENANCY_TEST_DB='postgresql://matthewlavin@localhost:5432/freestation' \
 *     node --test src/tests/identityLinkHttp.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[identityLinkHttp] TENANCY_TEST_DB not set — skipping.');
  test('identity link HTTP (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('P5 confirm-link endpoints — unlinked / link / history (HTTP)', async (t) => {
    const { pool } = require('../db');
    const MARK = 'IDLINKHTTP';
    let httpServer = null;

    async function cleanup() {
      const depts = (await pool.query(`SELECT id FROM departments WHERE name LIKE '${MARK}%'`)).rows.map(r => r.id);
      const userIds = (await pool.query(`SELECT id FROM users WHERE username LIKE 'idlinkhttp\\_%'`)).rows.map(r => r.id);
      if (depts.length) {
        await pool.query('DELETE FROM incident_responses WHERE department_id = ANY($1)', [depts]);
        await pool.query('DELETE FROM members WHERE department_id = ANY($1)', [depts]);
        await pool.query('DELETE FROM apparatus WHERE department_id = ANY($1)', [depts]);
      }
      const allUserIds = userIds.slice();
      if (depts.length) {
        const mu = (await pool.query('SELECT user_id FROM of_user_departments WHERE department_id = ANY($1)', [depts])).rows.map(r => r.user_id);
        for (const id of mu) if (!allUserIds.includes(id)) allUserIds.push(id);
        await pool.query('DELETE FROM of_user_departments WHERE department_id = ANY($1)', [depts]);
      }
      if (allUserIds.length) await pool.query('DELETE FROM of_user_departments WHERE user_id = ANY($1)', [allUserIds]);
      if (allUserIds.length) await pool.query('DELETE FROM audit_log WHERE department_id = ANY($1)', [depts.length ? depts : [-1]]);
      if (allUserIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1)', [allUserIds]);
      if (depts.length) await pool.query('DELETE FROM stations WHERE department_id = ANY($1)', [depts]);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }

    const pre = (await pool.query(`SELECT
      EXISTS(SELECT 1 FROM pg_roles WHERE rolname='of_app') AS has_of_app,
      EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='of_user_departments') AS has_oud`)).rows[0];
    if (!pre.has_of_app || !pre.has_oud) {
      console.log('[identityLinkHttp] enforced-RLS env not present — skipping.');
      await pool.end();
      t.skip('requires the of_app + of_user_departments environment');
      return;
    }

    await cleanup();
    try {
      process.env.P4_SIGNUP = 'on';
      const realSetInterval = global.setInterval;
      global.setInterval = (...args) => { const tmr = realSetInterval(...args); if (tmr && tmr.unref) tmr.unref(); return tmr; };
      let app;
      try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
      httpServer = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
      const base = `http://127.0.0.1:${httpServer.address().port}`;
      async function api(method, path, token, body) {
        const res = await fetch(base + path, {
          method,
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
        return { status: res.status, json };
      }
      for (let i = 0; i < 30; i++) {
        try { const r = await fetch(`${base}/api/setup-status`); if (r.status === 200) break; } catch { /* warming */ }
        await new Promise((r2) => setTimeout(r2, 1000));
      }

      // Dept + founding chief (chief is also a rostered member via 0030).
      const sgn = await api('POST', '/api/auth/signup', null, {
        departmentName: `${MARK} Dept`, chiefUsername: 'idlinkhttp_chief', chiefName: 'Link Chief',
        chiefEmail: 'chief@idlinkhttp.test', chiefPassword: 'correct-horse-battery',
        attestedMembers: 10, attestedStations: 1, attestedBudgetUsd: 100000 });
      assert.strictEqual(sgn.status, 201, `signup failed: ${JSON.stringify(sgn.json)}`);
      const chiefToken = sgn.json.token;
      const deptId = (await pool.query(`SELECT id FROM departments WHERE name = '${MARK} Dept'`)).rows[0].id;
      const stationId = (await pool.query('SELECT id FROM stations WHERE department_id = $1 ORDER BY id LIMIT 1', [deptId])).rows[0].id;

      // Two UNLINKED members. memberX shares an email with login Y (stable evidence).
      const SHARED = 'jordan.vega@idlinkhttp.test';
      const mkX = await api('POST', '/api/members', chiefToken,
        { name: 'Jordan Vega', rank: 'Firefighter', role: 'Firefighter', joined: '2024-01-01', station_email: SHARED });
      assert.strictEqual(mkX.status, 201, `add member X: ${JSON.stringify(mkX.json)}`);
      const memberX = mkX.json.data.id;
      const mkX2 = await api('POST', '/api/members', chiefToken,
        { name: 'Riley Stone', rank: 'Firefighter', role: 'Firefighter', joined: '2024-01-01' });
      assert.strictEqual(mkX2.status, 201, `add member X2: ${JSON.stringify(mkX2.json)}`);
      const memberX2 = mkX2.json.data.id;

      // Login Y: a dept login NOT bound to any member (email matches X). role=member.
      const yHash = bcrypt.hashSync('yankee-correct-horse', 10);
      const yIns = await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", email, station_id)
         VALUES ('idlinkhttp_y','Jordan Vega','JV','member',$1,$2,$3) RETURNING id`,
        [yHash, SHARED, stationId]);
      const userY = yIns.rows[0].id;
      await pool.query(`SELECT public.of_link_member($1,$2,$3,'member')`,
        [(await pool.query(`SELECT id FROM users WHERE username='idlinkhttp_chief'`)).rows[0].id, userY, deptId]);

      // User Z: exists but NOT in this department (cross-dept target).
      const zIns = await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", email, station_id)
         VALUES ('idlinkhttp_z','Zed Outsider','ZO','member',$1,'',$2) RETURNING id`,
        [bcrypt.hashSync('zulu', 10), stationId]);
      const userZ = zIns.rows[0].id;

      await t.test('GET /unlinked lists the unlinked members with stable-key evidence', async () => {
        const r = await api('GET', '/api/members/unlinked', chiefToken);
        assert.strictEqual(r.status, 200, JSON.stringify(r.json));
        const x = r.json.data.find((m) => m.id === memberX);
        assert.ok(x, 'member X is listed as unlinked');
        const cand = (x.candidates || []).find((c) => c.userId === userY);
        assert.ok(cand, 'login Y is suggested for X');
        assert.ok(cand.matchedOn.includes('email'), 'the suggestion carries email evidence');
        assert.strictEqual(x.hasStableMatch, true, 'X has a stable (email) match');
        // The founding chief (already linked) must NOT be a candidate.
        assert.ok(!r.json.data.some((m) => (m.candidates||[]).some((c) => c.username === 'idlinkhttp_chief')),
          'an already-linked login is never a candidate');
      });

      await t.test('POST /:id/link binds the member (chief)', async () => {
        const r = await api('POST', `/api/members/${memberX}/link`, chiefToken, { userId: userY });
        assert.strictEqual(r.status, 200, JSON.stringify(r.json));
        const row = (await pool.query('SELECT user_id FROM members WHERE id = $1', [memberX])).rows[0];
        assert.strictEqual(Number(row.user_id), Number(userY), 'members.user_id is now Y');
      });

      await t.test('POST /:id/link rejects a login already linked to another member (409)', async () => {
        const r = await api('POST', `/api/members/${memberX2}/link`, chiefToken, { userId: userY });
        assert.strictEqual(r.status, 409, JSON.stringify(r.json));
        assert.strictEqual(r.json.code, 'LOGIN_TAKEN');
      });

      await t.test('POST /:id/link rejects a login from another department (404)', async () => {
        const r = await api('POST', `/api/members/${memberX2}/link`, chiefToken, { userId: userZ });
        assert.strictEqual(r.status, 404, JSON.stringify(r.json));
        assert.strictEqual(r.json.code, 'USER_NOT_IN_DEPT');
      });

      await t.test('GET /:id/history returns the link audit row', async () => {
        const r = await api('GET', `/api/members/${memberX}/history`, chiefToken);
        assert.strictEqual(r.status, 200, JSON.stringify(r.json));
        const linked = r.json.data.some((row) => {
          const d = typeof row.detail === 'string' ? (() => { try { return JSON.parse(row.detail); } catch { return {}; } })() : (row.detail || {});
          return d.action === 'link_login' && Number(d.user_id) === Number(userY);
        });
        assert.ok(linked, 'the link is recorded in the append-only audit trail');
      });

      await t.test('a non-chief login cannot use the confirm-link surface (403)', async () => {
        const login = await api('POST', '/api/auth/login', null, { username: 'idlinkhttp_y', password: 'yankee-correct-horse' });
        assert.strictEqual(login.status, 200, `Y login: ${JSON.stringify(login.json)}`);
        const yToken = login.json.token;
        assert.strictEqual((await api('GET', '/api/members/unlinked', yToken)).status, 403, 'member cannot list unlinked');
        assert.strictEqual((await api('POST', `/api/members/${memberX2}/link`, yToken, { userId: userZ })).status, 403, 'member cannot link');
      });
    } finally {
      if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
      await cleanup();
      await pool.end();
    }
  });
}
