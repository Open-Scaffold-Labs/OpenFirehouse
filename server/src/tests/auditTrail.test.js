'use strict';
/**
 * auditTrail.test.js — Phase 5 / 5.4.
 *
 * Adversarial, not happy-path. This route READS AN AUDIT LOG, so the failure
 * modes that matter are (a) reading another department's history, (b) escaping
 * the table allowlist, and (c) a member seeing a compliance surface. Each test
 * below is one of those.
 */

const assert = require('node:assert');
const { test } = require('node:test');

const DB = process.env.TENANCY_TEST_DB;
if (DB) process.env.DATABASE_URL = DB;
process.env.OPENFIREHOUSE_DEMO = 'true'; // authLimiter skip; prod never sets this

const MARK = 'AUD54';

test('audit trail: cross-tenant refusal, allowlist, role gate, retention', { skip: !DB && 'TENANCY_TEST_DB not set' }, async (t) => {
  const realSetInterval = global.setInterval;
  global.setInterval = (...a) => { const tm = realSetInterval(...a); if (tm && tm.unref) tm.unref(); return tm; };
  let app;
  try { app = require('../index'); } finally { global.setInterval = realSetInterval; }

  const { pool } = require('../db');
  const bcrypt = require('bcrypt');

  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, path, token, body) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  }

  async function cleanup() {
    const d = (await pool.query(`SELECT id FROM departments WHERE name LIKE '${MARK}%'`)).rows.map(r => r.id);
    await pool.query(`DELETE FROM users WHERE username LIKE '${MARK.toLowerCase()}\\_%'`);
    if (d.length) {
      await pool.query('DELETE FROM audit_log WHERE department_id = ANY($1) OR station_id = ANY($1)', [d]);
      await pool.query('DELETE FROM stations WHERE department_id = ANY($1)', [d]);
    }
    await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
  }

  const mk = async (suffix, role) => {
    const dept = (await pool.query('INSERT INTO departments (name) VALUES ($1) RETURNING id', [`${MARK} ${suffix}`])).rows[0].id;
    const st = (await pool.query('INSERT INTO stations (name, department_id) VALUES ($1,$2) RETURNING id', [`${MARK} St ${suffix}`, dept])).rows[0].id;
    const un = `${MARK.toLowerCase()}_${suffix.toLowerCase()}`;
    const uid = (await pool.query(
      `INSERT INTO users (username,"passwordHash",name,initials,role,station_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [un, bcrypt.hashSync('pw-for-audit-trail-tests-12', 10), `${MARK} ${suffix}`, 'AU', role, st]
    )).rows[0].id;
    await pool.query(`INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [uid, dept, role]);
    const login = await api('POST', '/api/auth/login', null, { username: un, password: 'pw-for-audit-trail-tests-12' });
    return { dept, st, uid, un, token: login.json?.token };
  };

  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try { const r = await fetch(`${base}/api/setup-status`); if (r.status === 200) { ready = true; break; } } catch {}
      await new Promise((r2) => setTimeout(r2, 1000));
    }
    assert.ok(ready, 'DB never became ready');
    await cleanup();

    const A = await mk('DeptA', 'chief');
    const B = await mk('DeptB', 'chief');
    const M = await mk('DeptAMember', 'member');
    // Put the member in A's department so the role gate is the only thing refusing them.
    await pool.query('UPDATE users SET station_id = $1 WHERE id = $2', [A.st, M.uid]);
    await pool.query('UPDATE of_user_departments SET department_id = $1 WHERE user_id = $2', [A.dept, M.uid]);
    const mLogin = await api('POST', '/api/auth/login', null, { username: M.un, password: 'pw-for-audit-trail-tests-12' });
    M.token = mLogin.json.token;

    // One audited incident in EACH department, deliberately sharing record_id 4242.
    for (const D of [A, B]) {
      await pool.query(
        `INSERT INTO audit_log (station_id, department_id, user_id, user_name, action, table_name, record_id, detail)
         VALUES ($1,$2,$3,$4,'create','incidents',4242,$5)`,
        [D.st, D.dept, D.uid, `${MARK} ${D === A ? 'A' : 'B'} author`, JSON.stringify({ nature: D === A ? 'A-ONLY-NATURE' : 'B-ONLY-NATURE' })]
      );
    }

    await t.test('a chief sees their OWN department history for the record', async () => {
      const res = await api('GET', '/api/audit/record/incidents/4242', A.token);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.data.entries.length, 1);
      assert.strictEqual(res.json.data.entries[0].actionLabel, 'Created');
      assert.strictEqual(res.json.data.entries[0].detail.nature, 'A-ONLY-NATURE');
    });

    await t.test('CROSS-TENANT: the same record id in another dept is invisible', async () => {
      // B's chief asks for record 4242 — which exists in BOTH departments. B must
      // see exactly one entry, and it must be B's. If department scoping were
      // missing this returns two, and leaks A's incident nature.
      const res = await api('GET', '/api/audit/record/incidents/4242', B.token);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.data.entries.length, 1, 'must NOT see the other department row');
      assert.strictEqual(res.json.data.entries[0].detail.nature, 'B-ONLY-NATURE');
      const body = JSON.stringify(res.json);
      assert.ok(!body.includes('A-ONLY-NATURE'), 'no trace of the other tenant anywhere in the payload');
    });

    await t.test('ALLOWLIST: a table outside the list is refused, even a real one', async () => {
      // `users` is a real table with real audit rows in other contexts. It is not
      // on the allowlist, so it must be refused rather than queried.
      const res = await api('GET', '/api/audit/record/users/1', A.token);
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.json.code, 'RECORD_TYPE_NOT_VIEWABLE');
    });

    await t.test('ALLOWLIST: injection-shaped table names are refused, not executed', async () => {
      for (const bad of ['incidents;DROP TABLE users', "incidents' OR '1'='1", 'pg_tables', 'audit_log']) {
        const res = await api('GET', `/api/audit/record/${encodeURIComponent(bad)}/1`, A.token);
        assert.strictEqual(res.status, 404, `must refuse ${bad}`);
      }
      // And the database is unharmed.
      const still = await pool.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename='users'");
      assert.strictEqual(still.rows[0].n, 1, 'users table still exists');
    });

    await t.test('a non-numeric record id is a 400, not a query', async () => {
      const res = await api('GET', '/api/audit/record/incidents/abc', A.token);
      assert.strictEqual(res.status, 400);
    });

    await t.test('ROLE GATE: a member of the SAME department is refused', async () => {
      const res = await api('GET', '/api/audit/record/incidents/4242', M.token);
      assert.strictEqual(res.status, 403, 'audit trail is officer+; a member must not read it');
    });

    await t.test('unauthenticated access is refused', async () => {
      const res = await api('GET', '/api/audit/record/incidents/4242', null);
      assert.strictEqual(res.status, 401);
    });

    await t.test('an unaudited record returns an empty history, not a 404', async () => {
      // 404 would leak whether the record exists in some other department.
      const res = await api('GET', '/api/audit/record/incidents/99999999', A.token);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.json.data.entries, []);
    });

    await t.test('the retention commitment is stated, not implied', async () => {
      const res = await api('GET', '/api/audit/retention', A.token);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.policy, 'life-of-record');
      assert.strictEqual(res.json.appendOnly, true);
      assert.ok(res.json.viewableRecordTypes.length > 0);
    });
  } finally {
    await cleanup();
    await new Promise((r) => server.close(r));
  }
});
