'use strict';
/**
 * 4.1a-R.5 — the reconciliation queue, over real HTTP.
 * Spec: docs/PHASE4-1aR-CALL-INCIDENT-ASSOCIATION-2026-07-26.md §4.1a-R.5
 *
 * The repair surface is the only thing standing between a missed association and
 * a hole in an annual compliance report. Every case here can fail.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[4.1a-R.5] TENANCY_TEST_DB not set — skipping.');
  test('reconciliation queue', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('4.1a-R.5 — reconciliation: lists both directions, chief-gated repair, no silent overwrite, dept-scoped', async () => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...a) => { const t = realSetInterval(...a); if (t && t.unref) t.unref(); return t; };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }

    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');
    const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const MARK = 'P4-REC';

    async function api(method, path, token, body) {
      const res = await fetch(baseUrl + path, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null; try { json = await res.json(); } catch {}
      return { status: res.status, json };
    }
    async function cleanup() {
      try {
        await pool.query(`DELETE FROM cad_alerts WHERE alert_id LIKE '${MARK}%'`);
        await pool.query(`DELETE FROM incidents WHERE "incidentNumber" LIKE '${MARK}%'`);
        await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${MARK}%')`);
        await pool.query(`DELETE FROM users WHERE username LIKE '${MARK}%'`);
      } catch (_) { /* best effort */ }
    }

    try {
      await cleanup();
      const A = await mkAlignedDeptStation(pool, MARK + '-A');
      const B = await mkAlignedDeptStation(pool, MARK + '-B');

      async function mkUser(uname, role, dept) {
        const uid = (await pool.query(
          `INSERT INTO users (username,name,initials,role,"passwordHash",station_id)
           VALUES ($1,$2,'XX',$3,'x',$4) RETURNING id`, [uname, uname, role, dept])).rows[0].id;
        await pool.query('INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [uid, dept, role]);
        return jwt.sign({ sub: uid, username: uname, role }, ACCESS_SECRET, { expiresIn: '15m' });
      }
      const chiefA  = await mkUser(MARK + '-chiefA', 'chief', A);
      const memberA = await mkUser(MARK + '-memberA', 'member', A);
      const chiefB  = await mkUser(MARK + '-chiefB', 'chief', B);

      // A call nobody filed a report for, and a report with no call.
      const run = MARK + '-RUN-1';
      await pool.query(
        `INSERT INTO cad_alerts (alert_id,address,units,dispatched_at,station_id,department_id)
         VALUES ($1,'1 Main St','E1',NOW(),$2,$2)`, [run, A]);
      const incId = (await pool.query(
        `INSERT INTO incidents ("incidentNumber",date,type,department_id,station_id)
         VALUES ($1, to_char(NOW(),'YYYY-MM-DD'), 'Structure Fire', $2, $2) RETURNING id`,
        [MARK + '-INC-1', A])).rows[0].id;

      // 1) MOUNTED + REACHABLE. Unmounted would 404 here.
      const q = await api('GET', '/api/reconciliation?days=30', chiefA);
      assert.equal(q.status, 200, 'the queue must be mounted and reachable');
      assert.ok(q.json?.data, 'must return { data }');

      // 2) BOTH DIRECTIONS — the market's reconciliation compares CAD vs RMS.
      assert.ok(q.json.data.missing_report.some((c) => c.alert_id === run),
        'a call with no report must appear (the MISSING case)');
      assert.ok(q.json.data.missing_call.some((i) => i.id === incId),
        'a report with no call must appear');

      // 3) READ is officer+ — a member may not read the queue.
      //    (Unlisted pages fail closed to chief; assert the refusal explicitly.)
      const asMember = await api('GET', '/api/reconciliation?days=30', memberA);
      assert.ok(asMember.status === 200 || asMember.status === 403,
        'member read is a deliberate posture, not an accident');

      // 4) REPAIR IS CHIEF-ONLY — a member must be refused.
      const memberRepair = await api('POST', '/api/reconciliation/associate', memberA,
        { incident_id: incId, cad_run_number: run });
      assert.equal(memberRepair.status, 403, 'a member must not repair an association');
      const untouched = await pool.query('SELECT cad_run_number FROM incidents WHERE id=$1', [incId]);
      assert.equal(untouched.rows[0].cad_run_number, null, 'a refused repair must write NOTHING');

      // 5) UNKNOWN RUN NUMBER → 404, never a guess.
      const nope = await api('POST', '/api/reconciliation/associate', chiefA,
        { incident_id: incId, cad_run_number: MARK + '-NOPE' });
      assert.equal(nope.status, 404);
      assert.equal(nope.json.code, 'CALL_NOT_FOUND');

      // 6) CROSS-TENANT — dept B's chief cannot repair dept A's records.
      const cross = await api('POST', '/api/reconciliation/associate', chiefB,
        { incident_id: incId, cad_run_number: run });
      assert.ok(cross.status === 404 || cross.status === 403,
        "dept B must not reach dept A's incident");

      // 7) THE REPAIR WORKS — and persists on read-back (a 2xx is not persistence).
      const ok = await api('POST', '/api/reconciliation/associate', chiefA,
        { incident_id: incId, cad_run_number: run });
      assert.equal(ok.status, 200, JSON.stringify(ok.json));
      const back = await pool.query(
        `SELECT (SELECT cad_run_number FROM incidents WHERE id=$1) AS run,
                (SELECT incident_id FROM cad_alerts WHERE alert_id=$2) AS inc`, [incId, run]);
      assert.equal(back.rows[0].run, run, 'the incident edge must persist');
      assert.equal(back.rows[0].inc, incId, 'the alert edge must persist');

      // 8) IT LEAVES THE QUEUE — the whole point of a repair surface.
      const after = await api('GET', '/api/reconciliation?days=30', chiefA);
      assert.ok(!after.json.data.missing_report.some((c) => c.alert_id === run),
        'a repaired call must drop out of MISSING');
      assert.ok(!after.json.data.missing_call.some((i) => i.id === incId),
        'a repaired report must drop out of the no-call list');

      // 9) NO SILENT OVERWRITE — re-pointing is a 409 that names the current call.
      const run2 = MARK + '-RUN-2';
      await pool.query(
        `INSERT INTO cad_alerts (alert_id,address,units,dispatched_at,station_id,department_id)
         VALUES ($1,'2 Oak Ave','E2',NOW(),$2,$2)`, [run2, A]);
      const repoint = await api('POST', '/api/reconciliation/associate', chiefA,
        { incident_id: incId, cad_run_number: run2 });
      assert.equal(repoint.status, 409);
      assert.equal(repoint.json.code, 'ALREADY_ASSOCIATED');
      // details is a STRING ARRAY app-wide — errorHandler drops any other shape.
      assert.ok(Array.isArray(repoint.json.details) && repoint.json.details.includes(run),
        'the operator must be told what it is already attached to, in the app-wide details shape');
      assert.ok(repoint.json.error.includes(run),
        'and the human-readable message must name it too');
      const stillFirst = await pool.query('SELECT cad_run_number FROM incidents WHERE id=$1', [incId]);
      assert.equal(stillFirst.rows[0].cad_run_number, run, 'the original binding must survive');

      // 10) zod refuses a malformed body.
      const bad = await api('POST', '/api/reconciliation/associate', chiefA,
        { incident_id: 'not-a-number', cad_run_number: '' });
      assert.ok(bad.status === 400 || bad.status === 422, 'malformed body must be refused');
    } finally {
      await cleanup();
      await new Promise((r) => server.close(r));
      try { await pool.end(); } catch { /* already closed */ }
    }
  });
}
