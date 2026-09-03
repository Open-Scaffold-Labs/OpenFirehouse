'use strict';
/**
 * morningBrief.http.test.js — Run now uses the signed-in JWT and invoke reads.
 * OPT-IN via TENANCY_TEST_DB. Skips clean without it.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('morning brief HTTP (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('morning brief: session invoke reads, no writes, silent when unchanged', async () => {
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
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    async function api(method, path, token, body) {
      const res = await fetch(baseUrl + path, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
      return { status: res.status, json };
    }

    const MARK = 'AG-BRIEF';
    let deptA;
    async function cleanup() {
      if (deptA) {
        await pool.query('DELETE FROM agent_routine_runs WHERE department_id = $1', [deptA]);
        await pool.query('DELETE FROM agent_approvals WHERE department_id = $1', [deptA]);
      }
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'ag_brief_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'ag_brief_%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) {
        try { const r = await fetch(`${baseUrl}/api/setup-status`); if (r.status === 200) { ready = true; break; } } catch { /* not yet */ }
        await new Promise((r2) => setTimeout(r2, 1000));
      }
      assert.ok(ready, 'DB never became ready');
      await cleanup();

      deptA = await mkAlignedDeptStation(pool, `${MARK} Dept`);
      const officerId = (await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
         VALUES ('ag_brief_officer', 'Capt Brief', 'CB', 'officer', 'x', $1) RETURNING id`, [deptA])).rows[0].id;
      await pool.query(
        `INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1,$2,'officer') ON CONFLICT DO NOTHING`,
        [officerId, deptA]
      );
      const officer = jwt.sign({ sub: officerId, username: 'ag_brief_officer', role: 'officer' }, ACCESS_SECRET, { expiresIn: '15m' });

      const unauth = await api('POST', '/api/agent/routines/morning-brief/run', null, {});
      assert.equal(unauth.status, 401, 'Run now without JWT is refused');

      const first = await api('POST', '/api/agent/routines/morning-brief/run', officer, {});
      assert.equal(first.status, 200, `run now: ${first.status} ${JSON.stringify(first.json)}`);
      assert.equal(first.json.silent, false, 'manual run is always visible for demo');
      assert.ok(Array.isArray(first.json.verbs));
      for (const verb of first.json.verbs) {
        assert.ok(['board_read', 'duty_read', 'roster_read', 'apparatus_status_read', 'incident_read'].includes(verb));
      }
      assert.match(String(first.json.digest || ''), /Morning shift brief|Board:/);
      assert.doesNotMatch(String(first.json.digest || ''), /Heavy smoke|I drafted the narrative/i);

      const approvals = await pool.query('SELECT count(*)::int AS n FROM agent_approvals WHERE department_id = $1', [deptA]);
      assert.equal(approvals.rows[0].n, 0, 'brief must not enqueue gated writes');

      const { runMorningBrief } = require('../utils/morningBrief');
      const actor = {
        user: {
          id: officerId,
          username: 'ag_brief_officer',
          name: 'Capt Brief',
          role: 'officer',
          roleLevel: 2,
          stationId: deptA,
          department_id: deptA,
        },
        headers: {},
        get() { return undefined; },
      };
      const scheduled = await runMorningBrief(actor, { triggerKind: 'scheduled' });
      assert.equal(scheduled.ok, true);
      assert.equal(scheduled.silent, true, 'second scheduled pass with the same facts stays silent');

      const get = await api('GET', '/api/agent/routines/morning-brief', officer);
      assert.equal(get.status, 200);
      assert.equal(get.json.routine, 'morning_shift_brief');
      assert.ok(get.json.latest && get.json.latest.digest);
      assert.equal(get.json.latest.silent, false);
    } finally {
      try { await cleanup(); } catch { /* ignore */ }
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
