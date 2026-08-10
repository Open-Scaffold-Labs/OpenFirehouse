// Phase 1.7 — GET /api/daily-staffing/mine (the companion My Schedule read).
// Proves: JWT-derived member (unlinked login 403 NO_MEMBER_LINK), board rows + roster
// shifts UNION (id-first, name-fallback — rename-proof), board-day dedupe (a day on the
// riding board doesn't duplicate from the roster), ascending order, cross-tenant scoped.
// OPT-IN via TENANCY_TEST_DB like the sibling suites.

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[myScheduleMine] TENANCY_TEST_DB not set — skipping live-DB 1.7 suite.');
  test('1.7 /mine (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('1.7 — /api/daily-staffing/mine: self-resolved, union, dedupe, scoped', async () => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...a) => { const t = realSetInterval(...a); if (t && t.unref) t.unref(); return t; };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    async function api(path, token) {
      const res = await fetch(baseUrl + path, { headers: { Authorization: `Bearer ${token}` } });
      let json = null; try { json = await res.json(); } catch {}
      return { status: res.status, json };
    }

    const MARK = 'MS-1_7';
    let dept, stn;
    async function cleanup() {
      if (dept) {
        await pool.query('DELETE FROM apparatus_assignments WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM shifts WHERE department_id = $1', [dept]);
      }
      await pool.query(`DELETE FROM members WHERE "memberNumber" LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'ms_1_7_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'ms_1_7_%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) { try { const r = await fetch(`${baseUrl}/api/setup-status`); if (r.status === 200) { ready = true; break; } } catch {} await new Promise((x) => setTimeout(x, 1000)); }
      assert.ok(ready, 'DB never ready');
      await cleanup();

      dept = await mkAlignedDeptStation(pool, `${MARK} Dept`);
      stn = dept;
      const uid = (await pool.query(
        `INSERT INTO users (username,name,initials,role,"passwordHash",station_id) VALUES ('ms_1_7_m','Sched Member','XX','member','x',$1) RETURNING id`,
        [stn])).rows[0].id;
      await pool.query(`INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,'member')`, [uid, dept]);
      const mid = (await pool.query(
        `INSERT INTO members ("memberNumber",name,rank,role,status,joined,user_id,station_id,department_id)
         VALUES ('${MARK}-1','Sched Member','Firefighter','member','Active',CURRENT_DATE,$1,$2,$3) RETURNING id`,
        [uid, stn, dept])).rows[0].id;
      const token = jwt.sign({ sub: uid, username: 'ms_1_7_m', role: 'member' }, ACCESS_SECRET, { expiresIn: '15m' });
      // Unlinked login in the same dept.
      const uid2 = (await pool.query(
        `INSERT INTO users (username,name,initials,role,"passwordHash",station_id) VALUES ('ms_1_7_x','No Link','XX','member','x',$1) RETURNING id`,
        [stn])).rows[0].id;
      await pool.query(`INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,'member')`, [uid2, dept]);
      const token2 = jwt.sign({ sub: uid2, username: 'ms_1_7_x', role: 'member' }, ACCESS_SECRET, { expiresIn: '15m' });

      const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
      // Day+1: riding-board row. Day+1 ALSO a roster shift (must dedupe → board wins).
      // Day+3: roster-only shift, matched BY ID (crew name deliberately different — rename-proof).
      await pool.query(
        `INSERT INTO apparatus_assignments (department_id, date, member_id, position_name, status, start_time, end_time, hours)
         VALUES ($1, $2, $3, 'Firefighter', 'on_duty', '07:00', '07:00', 24)`, [dept, d(1), mid]);
      await pool.query(
        `INSERT INTO shifts (date, "shiftType", crew, "memberIds", station_id, department_id)
         VALUES ($1, 'Day', $2, $3, $4, $5), ($6, 'Night', $7, $8, $4, $5)`,
        [d(1), JSON.stringify(['Sched Member']), JSON.stringify([mid]), stn, dept,
         d(3), JSON.stringify(['Old Name']), JSON.stringify([mid])]);

      let r = await api('/api/daily-staffing/mine?days=10', token2);
      assert.equal(r.status, 403, 'unlinked login refused');
      assert.equal(r.json.code, 'NO_MEMBER_LINK');

      r = await api('/api/daily-staffing/mine?days=10', token);
      assert.equal(r.status, 200, `mine failed: ${JSON.stringify(r.json)}`);
      const tours = r.json.data.tours;
      assert.equal(tours.length, 2, `board-day deduped + roster id-match: ${JSON.stringify(tours)}`);
      assert.equal(tours[0].date, d(1));
      assert.equal(tours[0].source, 'board');
      assert.equal(Number(tours[0].hours), 24);
      assert.equal(tours[1].date, d(3));
      assert.equal(tours[1].source, 'roster', 'rename-proof id match pulled the roster tour');
      assert.ok(tours[0].date < tours[1].date, 'ascending');
    } finally {
      try { await cleanup(); } catch (e) { console.error('cleanup failed:', e.message); }
      server.close();
      const { pool: p } = require('../db');
      await p.end().catch(() => {});
    }
  });
}
