'use strict';
// fiPreventionConfig.test.js — e2e for the Phase-1 prevention config routes
// (code library / inspection types / checklists): tenant isolation, role gates,
// starter seeds, and checklist item↔code binding. Opt-in (TENANCY_TEST_DB),
// same harness as fiLifecycleE2E / tenancyIsolation.

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[fiPreventionConfig] TENANCY_TEST_DB not set — skipping.');
  test('fi prevention config (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('fi prevention config routes — isolation, gates, seeds, binding', async (t) => {
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

    const MARK = 'FI-CFG';
    async function cleanupFixtures() {
      await pool.query(`DELETE FROM fi_checklist_items WHERE checklist_id IN (SELECT id FROM fi_checklists WHERE name LIKE '${MARK}%')`);
      await pool.query(`DELETE FROM fi_checklists WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM fi_inspection_types WHERE department_id = 1`); // starter seeds are dept-1 fixtures here
      await pool.query(`DELETE FROM fi_code_library WHERE department_id = 1`);
      await pool.query(`DELETE FROM users WHERE username IN ('fi_cfg_chief','fi_cfg_member','fi_cfg_outsider')`);
    }

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) {
        try { const r = await fetch(`${base}/api/setup-status`); if (r.status === 200) { ready = true; break; } }
        catch { /* warming */ }
        await new Promise((r2) => setTimeout(r2, 1000));
      }
      assert.ok(ready, 'DB never became ready');
      await cleanupFixtures();
      await pool.query(`INSERT INTO stations (id, name, fdid, city, state) VALUES (1,'TEN-ISO Victim Station','','','') ON CONFLICT (id) DO NOTHING`);
      const stationBName = 'TEN-ISO Station B (tenancy test)';
      let stationB;
      {
        const found = await pool.query('SELECT id FROM stations WHERE name = $1', [stationBName]);
        stationB = found.rows.length
          ? found.rows[0].id
          : (await pool.query(`INSERT INTO stations (name, fdid, city, state) VALUES ($1,'','','') RETURNING id`, [stationBName])).rows[0].id;
      }

      async function upsertUser(username, stationId, role) {
        const r = await pool.query(
          `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
           VALUES ($1,$2,'FC',$3,'not-a-real-hash',$4)
           ON CONFLICT (username) DO UPDATE SET station_id = EXCLUDED.station_id, role = EXCLUDED.role
           RETURNING id`, [username, `Cfg ${username}`, role, stationId]);
        return r.rows[0].id;
      }
      const sign = (id, username, role) => jwt.sign({ sub: id, username, role }, ACCESS_SECRET, { expiresIn: '15m' });
      const chiefTok    = sign(await upsertUser('fi_cfg_chief', 1, 'chief'), 'fi_cfg_chief', 'chief');
      const memberTok   = sign(await upsertUser('fi_cfg_member', 1, 'member'), 'fi_cfg_member', 'member');
      const outsiderTok = sign(await upsertUser('fi_cfg_outsider', stationB, 'chief'), 'fi_cfg_outsider', 'chief');

      await t.test('role gate: a member can read the library but cannot write it', async () => {
        assert.equal((await api('GET', '/api/fi-code-library', memberTok)).status, 200);
        const w = await api('POST', '/api/fi-code-library', memberTok, { code: 'X1', title: 'nope' });
        assert.equal(w.status, 403);
      });

      await t.test('starter seeds load idempotently (codes + types)', async () => {
        const s1 = await api('POST', '/api/fi-code-library/seed-starter', chiefTok);
        assert.equal(s1.status, 200);
        assert.equal(s1.json.added, 79, 'first seed adds the full IFC 2021 master library');
        const s2 = await api('POST', '/api/fi-code-library/seed-starter', chiefTok);
        assert.equal(s2.json.added, 0, 'second seed adds nothing (idempotent)');
        const st = await api('POST', '/api/fi-inspection-types/seed-starter', chiefTok);
        assert.equal(st.json.added, 8);
        const annual = (await api('GET', '/api/fi-inspection-types', chiefTok)).json.data
          .find((x) => x.name === 'Annual Inspection');
        assert.equal(annual.default_frequency_days, 365);
      });

      let checklistId, codeId;
      await t.test('checklist items bind to library codes; foreign-dept refs refused', async () => {
        // Decision A: the section IS the code — rows are keyed by real IFC sections.
        codeId = (await api('GET', '/api/fi-code-library', chiefTok)).json.data.find((c) => c.code === '1032.2').id;
        const cl = await api('POST', '/api/fi-checklists', chiefTok, { name: `${MARK} General` });
        assert.equal(cl.status, 201);
        checklistId = cl.json.data.id;
        const put = await api('PUT', `/api/fi-checklists/${checklistId}/items`, chiefTok, {
          items: [
            { prompt: 'Are all exits clear and unobstructed?', code_ref_id: codeId, required: true },
            { prompt: 'General housekeeping acceptable?', code_ref_id: null, required: false },
          ],
        });
        assert.equal(put.status, 200, JSON.stringify(put.json));
        assert.equal(put.json.data.items.length, 2);
        assert.equal(put.json.data.items[0].ref_code, '1032.2', 'joined code ref surfaces on the item');
        // Bind to a bogus/foreign id → refused.
        const bad = await api('PUT', `/api/fi-checklists/${checklistId}/items`, chiefTok, {
          items: [{ prompt: 'x', code_ref_id: 999999999, required: false }],
        });
        assert.equal(bad.status, 404);
      });

      await t.test('tenant isolation: another department sees nothing and cannot mutate', async () => {
        const lib = await api('GET', '/api/fi-code-library', outsiderTok);
        assert.equal(lib.json.data.length, 0, 'dept-1 library invisible to station B');
        const cl = await api('GET', `/api/fi-checklists/${checklistId}`, outsiderTok);
        assert.equal(cl.status, 404);
        const patch = await api('PATCH', `/api/fi-code-library/${codeId}`, outsiderTok, { title: 'hijack' });
        assert.equal(patch.status, 404, 'cross-tenant PATCH is a 404 no-op');
        const still = await pool.query('SELECT title FROM fi_code_library WHERE id = $1', [codeId]);
        assert.notEqual(still.rows[0].title, 'hijack');
      });

      await t.test('retire-don\'t-delete: DELETE soft-deletes and the entry leaves the list', async () => {
        const del = await api('DELETE', `/api/fi-code-library/${codeId}`, chiefTok);
        assert.equal(del.status, 200);
        const lib = await api('GET', '/api/fi-code-library', chiefTok);
        assert.ok(!lib.json.data.some((c) => c.id === codeId));
        const raw = await pool.query('SELECT deleted_at FROM fi_code_library WHERE id = $1', [codeId]);
        assert.ok(raw.rows[0].deleted_at, 'row retained with deleted_at');
      });
    } finally {
      await cleanupFixtures();
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
