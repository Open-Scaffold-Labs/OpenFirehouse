'use strict';
/**
 * 4.1a-R.3 — GET /api/cad/alerts/selectable, over real HTTP.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM callAssociation.test.js:
 * that suite exercises db.cadAlerts.selectable directly, which proves the QUERY
 * but not that the ROUTE is mounted, ordered, and gated. After deploying I
 * checked the live route and got 401 — then checked a route that does not exist
 * and got 401 as well. A 401 that a nonexistent path also returns verifies
 * NOTHING; it cannot fail (the repo's own lesson #29 / the FI "401 proves the
 * door is locked, not that the room exists" note). This does a check that can.
 *
 * Specifically covers the two things a direct db call cannot:
 *   • the route is REACHABLE and returns data with a real token
 *   • '/alerts/selectable' is not shadowed by '/alerts' — Express matches in
 *     declaration order, and getting that wrong is silent
 */

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[4.1a-R.3] TENANCY_TEST_DB not set — skipping route suite.');
  test('cad selectable route', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('4.1a-R.3 — /api/cad/alerts/selectable is mounted, gated, dept-scoped, and not shadowed', async () => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...a) => { const t = realSetInterval(...a); if (t && t.unref) t.unref(); return t; };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }

    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');
    const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const MARK = 'P4-SEL';

    async function api(path, token) {
      const res = await fetch(baseUrl + path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      let json = null; try { json = await res.json(); } catch {}
      return { status: res.status, json };
    }

    async function cleanup() {
      try {
        await pool.query(`DELETE FROM cad_alerts WHERE alert_id LIKE '${MARK}%'`);
        await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE '${MARK}%')`);
        await pool.query(`DELETE FROM users WHERE username LIKE '${MARK}%'`);
      } catch (_) { /* best effort */ }
    }

    try {
      await cleanup();
      const A = await mkAlignedDeptStation(pool, MARK + '-A');
      const B = await mkAlignedDeptStation(pool, MARK + '-B');

      async function mkUser(uname, dept) {
        const uid = (await pool.query(
          `INSERT INTO users (username,name,initials,role,"passwordHash",station_id)
           VALUES ($1,$2,'XX','officer','x',$3) RETURNING id`,
          [uname, uname, dept])).rows[0].id;
        await pool.query(
          'INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [uid, dept, 'officer']);
        return jwt.sign({ sub: uid, username: uname, role: 'officer' }, ACCESS_SECRET, { expiresIn: '15m' });
      }
      const tokenA = await mkUser(MARK + '-userA', A);
      const tokenB = await mkUser(MARK + '-userB', B);

      await pool.query(
        `INSERT INTO cad_alerts (alert_id,address,units,dispatched_at,station_id,department_id)
         VALUES ($1,'1 Main St','E1',NOW(),$2,$2)`, [MARK + '-RUN-1', A]);

      // 1) UNAUTHENTICATED is refused. (Necessary, but on its own it proves
      //    nothing — a nonexistent path 401s too. Hence case 2.)
      assert.equal((await api('/api/cad/alerts/selectable')).status, 401);

      // 2) THE CHECK THAT CAN FAIL — with a real token the route must return
      //    DATA. If it were unmounted or shadowed by '/alerts', this is a 404 or
      //    the wrong payload shape.
      const ok = await api('/api/cad/alerts/selectable?days=7', tokenA);
      assert.equal(ok.status, 200, 'the route must be mounted and reachable');
      assert.ok(Array.isArray(ok.json?.data), 'must return { data: [...] }');
      assert.equal(ok.json.days, 7, 'must echo the window — proof it ran THIS handler, not /alerts');
      assert.ok(ok.json.data.some((c) => c.alert_id === MARK + '-RUN-1'),
        "the department's own call must appear");

      // 3) NOT SHADOWED — /alerts is a different handler with a different shape
      //    (no `days`). If Express matched /alerts for both, this would be equal.
      const active = await api('/api/cad/alerts', tokenA);
      assert.equal(active.status, 200);
      assert.equal(active.json.days, undefined,
        "'/alerts' must NOT return `days` — if it does, the two routes have collapsed into one");

      // 4) CROSS-TENANT — dept B must not see dept A's call.
      const other = await api('/api/cad/alerts/selectable?days=7', tokenB);
      assert.equal(other.status, 200);
      assert.ok(!other.json.data.some((c) => c.alert_id === MARK + '-RUN-1'),
        "dept B must not see dept A's calls");

      // 5) The window is CLAMPED — a hostile value cannot widen the read.
      const clamped = await api('/api/cad/alerts/selectable?days=9999', tokenA);
      assert.equal(clamped.json.days, 30, 'days must clamp to 30');
    } finally {
      await cleanup();
      await new Promise((r) => server.close(r));
      try { await pool.end(); } catch { /* already closed */ }
    }
  });
}
