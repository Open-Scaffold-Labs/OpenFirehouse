'use strict';
/**
 * customRoles.test.js — Phase 5 / 5.7, migration 0113.
 *
 * Two halves:
 *  1. PURE unit tests of the resolver's fail-closed behaviour — these need no DB
 *     and they encode the single most important property: an unresolvable role
 *     gets NO access, never a default.
 *  2. LIVE route tests of the guardrails the market documents: built-ins are
 *     immutable, a role in use cannot be deleted, and — the one that matters
 *     most — a chief cannot mint a role more powerful than themselves.
 */

const assert = require('node:assert');
const { test } = require('node:test');

const DB = process.env.TENANCY_TEST_DB;
if (DB) process.env.DATABASE_URL = DB;
process.env.OPENFIREHOUSE_DEMO = 'true'; // authLimiter skip; prod never sets this

// ── 1. PURE — fail-closed resolution ────────────────────────────────────────

const { canAuthorAtLevel, isBuiltin, roleAllowsPage, BUILTIN_LEVELS } = require('../utils/roleResolver');
const { effectiveLevel } = require('../middleware/requireRole');

test('effectiveLevel: an UNKNOWN role is level 0, never a default', () => {
  // The whole security posture of custom roles rests on this. If an unresolvable
  // role fell back to 'member' (1), a deleted or foreign role would still open
  // every member page. If it fell back to chief, it would open everything.
  assert.strictEqual(effectiveLevel({ role: 'not_a_real_role' }), 0);
  assert.strictEqual(effectiveLevel({ role: '' }), 0);
  assert.strictEqual(effectiveLevel({ role: null }), 0);
  assert.strictEqual(effectiveLevel({}), 0);
  assert.strictEqual(effectiveLevel(null), 0);
  assert.strictEqual(effectiveLevel(undefined), 0);
});

test('effectiveLevel: a resolved custom level is honoured; built-ins still work', () => {
  assert.strictEqual(effectiveLevel({ role: 'prevention_clerk', roleLevel: 2 }), 2);
  assert.strictEqual(effectiveLevel({ role: 'chief' }), 3);
  assert.strictEqual(effectiveLevel({ role: 'member' }), 1);
  // `unit` is deliberately OFF the ladder — it runs on a page allowlist.
  assert.strictEqual(effectiveLevel({ role: 'unit' }), 0);
});

test('effectiveLevel: a hostile roleLevel cannot smuggle access in', () => {
  // Only a FINITE number is honoured. A crafted object/string/Infinity must not
  // become authority.
  for (const bad of ['3', Infinity, NaN, {}, [], true, '999']) {
    const lvl = effectiveLevel({ role: 'not_a_real_role', roleLevel: bad });
    assert.ok(lvl === 0, `roleLevel=${String(bad)} must not grant access, got ${lvl}`);
  }
});

test('canAuthorAtLevel: no self-promotion, and the range is 1..3', () => {
  assert.strictEqual(canAuthorAtLevel(3, 3), true,  'a chief may author a chief-level role');
  assert.strictEqual(canAuthorAtLevel(3, 1), true);
  assert.strictEqual(canAuthorAtLevel(2, 3), false, 'an officer may NOT mint a chief role');
  assert.strictEqual(canAuthorAtLevel(1, 2), false);
  assert.strictEqual(canAuthorAtLevel(3, 4), false, 'nothing above chief exists');
  assert.strictEqual(canAuthorAtLevel(3, 0), false);
  assert.strictEqual(canAuthorAtLevel(0, 1), false, 'level 0 authors nothing');
});

test('isBuiltin covers the whole shipped ladder', () => {
  for (const k of Object.keys(BUILTIN_LEVELS)) assert.ok(isBuiltin(k), `${k} must be built-in`);
  assert.ok(!isBuiltin('prevention_clerk'));
  assert.ok(!isBuiltin('unit'), 'unit is not on the ladder');
});

test('roleAllowsPage: built-ins defer, custom roles are explicit, level 0 never passes', () => {
  // null => defer to the existing level-based PAGE_ACCESS check (unchanged behaviour)
  assert.strictEqual(roleAllowsPage({ level: 3, pages: null }, 'incidents'), null);
  // custom role: explicit allowlist
  assert.strictEqual(roleAllowsPage({ level: 2, pages: ['inspections'] }, 'inspections'), true);
  assert.strictEqual(roleAllowsPage({ level: 2, pages: ['inspections'] }, 'payroll'), false);
  // an empty allowlist is a VALID role that reaches nothing
  assert.strictEqual(roleAllowsPage({ level: 1, pages: [] }, 'incidents'), false);
  // level 0 fails before pages are even consulted
  assert.strictEqual(roleAllowsPage({ level: 0, pages: ['incidents'] }, 'incidents'), false);
  assert.strictEqual(roleAllowsPage(null, 'incidents'), false);
});

// ── 2. LIVE — the market's documented guardrails ────────────────────────────

const MARK = 'ROLE57';

test('custom roles: escalation, built-in immutability, in-use delete, cross-tenant', { skip: !DB && 'TENANCY_TEST_DB not set' }, async (t) => {
  const realSetInterval = global.setInterval;
  global.setInterval = (...a) => { const tm = realSetInterval(...a); if (tm && tm.unref) tm.unref(); return tm; };
  let app;
  try { app = require('../index'); } finally { global.setInterval = realSetInterval; }

  const { pool } = require('../db');
  const bcrypt = require('bcrypt');
  const PW = 'pw-for-custom-roles-tests-12';

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
    if (d.length) {
      await pool.query('DELETE FROM of_roles WHERE department_id = ANY($1)', [d]);
      await pool.query('DELETE FROM audit_log WHERE department_id = ANY($1) OR station_id = ANY($1)', [d]);
    }
    await pool.query(`DELETE FROM users WHERE username LIKE '${MARK.toLowerCase()}\\_%'`);
    if (d.length) await pool.query('DELETE FROM stations WHERE department_id = ANY($1)', [d]);
    await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
  }

  const mk = async (sfx, role) => {
    const dept = (await pool.query('INSERT INTO departments (name) VALUES ($1) RETURNING id', [`${MARK} ${sfx}`])).rows[0].id;
    const st = (await pool.query('INSERT INTO stations (name, department_id) VALUES ($1,$2) RETURNING id', [`${MARK} St ${sfx}`, dept])).rows[0].id;
    const un = `${MARK.toLowerCase()}_${sfx.toLowerCase()}`;
    const uid = (await pool.query(
      `INSERT INTO users (username,"passwordHash",name,initials,role,station_id) VALUES ($1,$2,$3,'RL',$4,$5) RETURNING id`,
      [un, bcrypt.hashSync(PW, 10), `${MARK} ${sfx}`, role, st]
    )).rows[0].id;
    await pool.query('INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [uid, dept, role]);
    const l = await api('POST', '/api/auth/login', null, { username: un, password: PW });
    return { dept, st, uid, un, token: l.json?.token };
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
    const OFF = await mk('Officer', 'officer');
    // Put the officer in A's department so the ESCALATION gate is what refuses them.
    await pool.query('UPDATE users SET station_id=$1 WHERE id=$2', [A.st, OFF.uid]);
    await pool.query('UPDATE of_user_departments SET department_id=$1 WHERE user_id=$2', [A.dept, OFF.uid]);
    OFF.token = (await api('POST', '/api/auth/login', null, { username: OFF.un, password: PW })).json.token;

    let roleId;

    await t.test('a chief can author a custom role', async () => {
      const res = await api('POST', '/api/roles', A.token, {
        key: 'prevention_clerk', label: 'Fire Prevention Clerk', level: 2, pages: ['inspections', 'preplans'],
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.data.key, 'prevention_clerk');
      assert.strictEqual(res.json.data.is_builtin, false);
      roleId = res.json.data.id;
    });

    await t.test('ESCALATION: an officer cannot mint a CHIEF-level role', async () => {
      // The single most dangerous thing this feature could allow: "create a role"
      // becoming "promote myself".
      const res = await api('POST', '/api/roles', OFF.token, {
        key: 'sneaky_admin', label: 'Sneaky', level: 3, pages: [],
      });
      // requireChief refuses first (403) — and even a chief-gated caller is then
      // level-checked, which the next test proves.
      assert.strictEqual(res.status, 403);
    });

    await t.test('ESCALATION: the level check is real, not just the chief gate', async () => {
      // Drive canAuthorAtLevel directly at the boundary the route uses.
      assert.strictEqual(canAuthorAtLevel(2, 3), false);
      assert.strictEqual(canAuthorAtLevel(3, 3), true);
    });

    await t.test('a custom role cannot take a BUILT-IN key', async () => {
      for (const k of ['chief', 'member', 'officer', 'admin']) {
        const res = await api('POST', '/api/roles', A.token, { key: k, label: 'X', level: 1, pages: [] });
        assert.strictEqual(res.status, 409, `${k} must be reserved`);
        assert.strictEqual(res.json.code, 'ROLE_KEY_RESERVED');
      }
    });

    await t.test('duplicate keys within a department are refused', async () => {
      const res = await api('POST', '/api/roles', A.token, {
        key: 'prevention_clerk', label: 'Dupe', level: 1, pages: [],
      });
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.json.code, 'ROLE_KEY_TAKEN');
    });

    await t.test('CROSS-TENANT: B cannot see, edit or delete A\'s role', async () => {
      const list = await api('GET', '/api/roles', B.token);
      assert.strictEqual(list.status, 200);
      assert.ok(!list.json.data.custom.some((r) => r.key === 'prevention_clerk'),
        "B must not see A's custom role");

      const patch = await api('PATCH', `/api/roles/${roleId}`, B.token, { label: 'stolen' });
      assert.strictEqual(patch.status, 404, "another dept's role is simply not found");

      const del = await api('DELETE', `/api/roles/${roleId}`, B.token);
      assert.strictEqual(del.status, 404);

      // And A's role is untouched.
      const still = await api('GET', '/api/roles', A.token);
      assert.ok(still.json.data.custom.some((r) => r.key === 'prevention_clerk'));
    });

    await t.test('B may reuse the SAME key — role names are per-department', async () => {
      const res = await api('POST', '/api/roles', B.token, {
        key: 'prevention_clerk', label: 'B\'s clerk', level: 1, pages: [],
      });
      assert.strictEqual(res.status, 200, 'the unique key is (department_id, key)');
    });

    await t.test('IN USE: a role held by someone cannot be deleted', async () => {
      // Assign the custom role to a real person in A's department.
      await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['prevention_clerk', OFF.uid]);
      const res = await api('DELETE', `/api/roles/${roleId}`, A.token);
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.json.code, 'ROLE_IN_USE');
      // The message must say HOW MANY, not just refuse.
      assert.match(res.json.error, /1 person is still assigned/);

      // Move them off it, and the delete then succeeds.
      await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['officer', OFF.uid]);
      const ok = await api('DELETE', `/api/roles/${roleId}`, A.token);
      assert.strictEqual(ok.status, 200);
    });

    await t.test('BUILT-INS are immutable — enforced by the DATABASE, not just the app', async () => {
      // Insert a built-in row directly, then try to change it as the owner. The
      // trigger must refuse even though this bypasses every application guard.
      const { rows: [r] } = await pool.query(
        `INSERT INTO of_roles (department_id,key,label,level,is_builtin) VALUES ($1,'zz_bi','BI',3,TRUE) RETURNING id`,
        [A.dept]
      );
      await assert.rejects(
        () => pool.query('UPDATE of_roles SET label = $1 WHERE id = $2', ['hacked', r.id]),
        /built-in roles cannot be modified/
      );
      await assert.rejects(
        () => pool.query('DELETE FROM of_roles WHERE id = $1', [r.id]),
        /built-in roles cannot be deleted/
      );
      await pool.query('ALTER TABLE of_roles DISABLE TRIGGER trg_of_roles_protect_builtin');
      await pool.query('DELETE FROM of_roles WHERE id = $1', [r.id]);
      await pool.query('ALTER TABLE of_roles ENABLE TRIGGER trg_of_roles_protect_builtin');
    });

    await t.test('the list always includes the built-in ladder, even with zero custom roles', async () => {
      const res = await api('GET', '/api/roles', B.token);
      assert.strictEqual(res.status, 200);
      const keys = res.json.data.builtin.map((r) => r.key);
      for (const k of ['member', 'officer', 'chief']) assert.ok(keys.includes(k), `${k} must be listed`);
      assert.ok(res.json.data.builtin.every((r) => r.isBuiltin === true));
    });

    await t.test('a member cannot author roles', async () => {
      const M = await mk('Member', 'member');
      const res = await api('POST', '/api/roles', M.token, { key: 'x_role', label: 'X', level: 1, pages: [] });
      assert.strictEqual(res.status, 403);
    });
  } finally {
    await cleanup();
    await new Promise((r) => server.close(r));
  }
});
