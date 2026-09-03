'use strict';
/**
 * agentInvoke.http.test.js — live proof that a tool call is authz-checked
 * and a gated verb creates an approval item instead of writing the record.
 *
 * OPT-IN via TENANCY_TEST_DB (same as the other route suites). Skips clean
 * without it. Local how-to without the test DB: docs/AGENT-MCP.md.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('agent invoke HTTP (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('agent invoke: authz + gated NERIS submit queues instead of writing', async () => {
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

    const MARK = 'AG-MCP';
    let deptA;
    async function cleanup() {
      if (deptA) {
        await pool.query('DELETE FROM agent_approvals WHERE department_id = $1', [deptA]);
        await pool.query('DELETE FROM incidents WHERE department_id = $1 AND "incidentNumber" LIKE $2', [deptA, `${MARK}%`]);
      }
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'ag_mcp_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'ag_mcp_%'`);
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
      const chiefId = (await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
         VALUES ('ag_mcp_chief', 'Chief A', 'CA', 'chief', 'x', $1) RETURNING id`, [deptA])).rows[0].id;
      const memberId = (await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
         VALUES ('ag_mcp_member', 'Member A', 'MA', 'member', 'x', $1) RETURNING id`, [deptA])).rows[0].id;
      const officerId = (await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
         VALUES ('ag_mcp_officer', 'Capt A', 'OA', 'officer', 'x', $1) RETURNING id`, [deptA])).rows[0].id;
      await pool.query(`INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1,$2,'chief') ON CONFLICT DO NOTHING`, [chiefId, deptA]);
      await pool.query(`INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING`, [memberId, deptA]);
      await pool.query(`INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1,$2,'officer') ON CONFLICT DO NOTHING`, [officerId, deptA]);

      const chief = jwt.sign({ sub: chiefId, username: 'ag_mcp_chief', role: 'chief' }, ACCESS_SECRET, { expiresIn: '15m' });
      const member = jwt.sign({ sub: memberId, username: 'ag_mcp_member', role: 'member' }, ACCESS_SECRET, { expiresIn: '15m' });
      const officer = jwt.sign({ sub: officerId, username: 'ag_mcp_officer', role: 'officer' }, ACCESS_SECRET, { expiresIn: '15m' });

      const unauth = await api('POST', '/api/agent/invoke', null, { verb: 'incident_read', args: {} });
      assert.equal(unauth.status, 401, 'tool call without JWT is refused');

      const verbs = await api('GET', '/api/agent/verbs', member);
      assert.equal(verbs.status, 200);
      const verbNames = (verbs.json.data || []).map((v) => v.name);
      for (const name of ['incident_read', 'roster_read', 'training_hours_read', 'apparatus_status_read', 'duty_read', 'board_read']) {
        assert.ok(verbNames.includes(name), `catalog must list ${name} for Ask UI`);
      }

      for (const verb of ['incident_read', 'roster_read', 'training_hours_read', 'apparatus_status_read', 'duty_read', 'board_read']) {
        const read = await api('POST', '/api/agent/invoke', member, { verb, args: {} });
        assert.ok(read.status < 400, `${verb} must execute for a signed-in JWT: ${read.status} ${JSON.stringify(read.json)}`);
        assert.equal(read.json.queued, false, `${verb} is an immediate read, not a gated write`);
      }

      const created = await api('POST', '/api/incidents', chief, {
        incidentNumber: `${MARK}-1`, date: '2026-08-23', type: 'Public Assist', address: '1 Main',
        notes: 'Officer-written narrative — must stay.',
      });
      assert.equal(created.status, 201, 'seed incident');
      const incId = created.json.data.id;
      const notesBefore = created.json.data.notes;

      const oneIncident = await api('POST', '/api/agent/invoke', member, {
        verb: 'incident_read', args: { id: incId },
      });
      assert.ok(oneIncident.status < 400, `incident_read by id: ${oneIncident.status}`);
      assert.equal(oneIncident.json.result && oneIncident.json.result.data && oneIncident.json.result.data.id, incId);

      const stripped = await api('POST', '/api/agent/invoke', member, {
        verb: 'incident_update',
        args: { id: incId, type: 'Vehicle Accident', notes: 'agent must not write this' },
      });
      assert.ok(stripped.status < 400, `fact update should execute: ${stripped.status} ${JSON.stringify(stripped.json)}`);
      assert.ok((stripped.json.droppedKeys || []).includes('notes'), 'notes must be reported stripped');
      const afterUpdate = await api('GET', `/api/incidents/${incId}`, chief);
      assert.equal(afterUpdate.json.data.notes, notesBefore, 'narrative must be unchanged');
      assert.equal(afterUpdate.json.data.type, 'Vehicle Accident');

      const nerisSneak = await api('POST', '/api/agent/invoke', member, {
        verb: 'incident_update',
        args: { id: incId, address: '9 Oak', neris_noaction: 'CANCELLED', neris_status: 'approved' },
      });
      assert.ok(nerisSneak.status < 400, `allowlisted address should execute: ${nerisSneak.status}`);
      assert.ok((nerisSneak.json.droppedKeys || []).includes('neris_noaction'));
      const afterSneak = await api('GET', `/api/incidents/${incId}`, chief);
      assert.equal(afterSneak.json.data.address, '9 Oak');
      assert.ok(afterSneak.json.data.neris_noaction == null, 'NERIS axis must not land on the incident');
      assert.equal(afterSneak.json.data.neris_status, 'draft');

      const queued = await api('POST', '/api/agent/invoke', member, {
        verb: 'neris_submit', args: { id: incId },
      });
      assert.equal(queued.status, 202, 'gated verb returns 202');
      assert.equal(queued.json.queued, true);
      assert.ok(queued.json.approval && queued.json.approval.id, 'approval row created');
      const afterQueue = await api('GET', `/api/incidents/${incId}`, chief);
      assert.equal(afterQueue.json.data.neris_status, 'draft', 'NERIS status must not change until a human accepts');

      const memberAccept = await api('POST', `/api/agent/approvals/${queued.json.approval.id}/accept`, member, {});
      assert.equal(memberAccept.status, 403, 'member cannot accept the queue');

      const officerQueued = await api('POST', '/api/agent/invoke', officer, {
        verb: 'neris_submit', args: { id: incId },
      });
      assert.equal(officerQueued.status, 202);
      const selfAccept = await api('POST', `/api/agent/approvals/${officerQueued.json.approval.id}/accept`, officer, {});
      assert.equal(selfAccept.status, 403, 'requester cannot accept their own item');
      assert.equal(selfAccept.json.code, 'SELF_ACCEPT_FORBIDDEN');
      const stillDraft = await api('GET', `/api/incidents/${incId}`, chief);
      assert.equal(stillDraft.json.data.neris_status, 'draft', 'self-accept must not execute');

      const otherAccept = await api('POST', `/api/agent/approvals/${officerQueued.json.approval.id}/accept`, chief, {});
      assert.notEqual(otherAccept.json && otherAccept.json.code, 'SELF_ACCEPT_FORBIDDEN');
      assert.notEqual(otherAccept.status, 403, 'a different officer may execute');

      const list = await api('GET', '/api/agent/approvals?status=pending', chief);
      assert.equal(list.status, 200);
    } finally {
      try { await cleanup(); } catch { /* ignore */ }
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
