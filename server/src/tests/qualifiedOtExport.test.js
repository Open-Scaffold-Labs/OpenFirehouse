// Phase 1.2f — §225 qualified-OT export against a REAL Postgres via the API. Proves the
// earn-code write validation, the per-member YTD aggregation (half-premium of FLSA OT only,
// unclassified surfaced), the year filter, chief-gating, and tenant isolation.
// OPT-IN via TENANCY_TEST_DB.

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[qualifiedOtExport] TENANCY_TEST_DB not set — skipping live-DB 1.2f suite.');
  test('1.2f qualified-OT export (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('1.2f — earn-code write + qualified-OT export: aggregation, year filter, chief gate, tenancy', async () => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...a) => { const t = realSetInterval(...a); if (t && t.unref) t.unref(); return t; };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    async function api(method, path, token, body) {
      const res = await fetch(baseUrl + path, {
        method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined });
      let json = null; try { json = await res.json(); } catch {}
      return { status: res.status, json };
    }

    const MARK = 'QOT-1_2f';
    let deptA, deptB, stnA, stnB, chiefId, memberUid, memberA, memberB;
    async function cleanup() {
      await pool.query(`DELETE FROM ot_records WHERE reason LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM members WHERE "memberNumber" LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'qot_1_2f_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'qot_1_2f_%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) { try { const r = await fetch(`${baseUrl}/api/setup-status`); if (r.status === 200) { ready = true; break; } } catch {} await new Promise((x) => setTimeout(x, 1000)); }
      assert.ok(ready, 'DB never ready');
      await cleanup();

      deptA = await mkAlignedDeptStation(pool, `${MARK} A`);
      deptB = await mkAlignedDeptStation(pool, `${MARK} B`);
      stnA = deptA;
      stnB = deptB;
      chiefId = (await pool.query(`INSERT INTO users (username,name,initials,role,"passwordHash",station_id) VALUES ('qot_1_2f_chief','Chief F','CF','chief','x',$1) RETURNING id`, [stnA])).rows[0].id;
      memberUid = (await pool.query(`INSERT INTO users (username,name,initials,role,"passwordHash",station_id) VALUES ('qot_1_2f_member','Mem F','MF','member','x',$1) RETURNING id`, [stnA])).rows[0].id;
      await pool.query(`INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,'chief') ON CONFLICT DO NOTHING`, [chiefId, deptA]);
      await pool.query(`INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING`, [memberUid, deptA]);
      memberA = (await pool.query(`INSERT INTO members ("memberNumber",name,rank,role,status,joined,station_id,department_id) VALUES ('${MARK}-A','FF Alpha','Firefighter','member','Active','2020-01-01',$1,$2) RETURNING id`, [stnA, deptA])).rows[0].id;
      memberB = (await pool.query(`INSERT INTO members ("memberNumber",name,rank,role,status,joined,station_id,department_id) VALUES ('${MARK}-B','FF Bravo','Firefighter','member','Active','2020-01-01',$1,$2) RETURNING id`, [stnB, deptB])).rows[0].id;

      const chief = jwt.sign({ sub: chiefId, username: 'qot_1_2f_chief', role: 'chief' }, ACCESS_SECRET, { expiresIn: '15m' });
      const member = jwt.sign({ sub: memberUid, username: 'qot_1_2f_member', role: 'member' }, ACCESS_SECRET, { expiresIn: '15m' });

      // POST validates the earn code (rejects a bad one).
      const bad = await api('POST', '/api/ot-equalization', chief, { member_id: memberA, ot_date: '2026-03-01', ot_hours: 8, earn_code: 'bogus', reason: `${MARK} bad` });
      assert.equal(bad.status, 400, 'invalid earn_code rejected');
      assert.equal(bad.json.code, 'INVALID_EARN_CODE');

      // POST stores the earn code + rate.
      const good = await api('POST', '/api/ot-equalization', chief, { member_id: memberA, ot_date: '2026-03-02', ot_hours: 10, earn_code: 'flsa_ot', regular_rate: 30, reason: `${MARK} flsa` });
      assert.equal(good.status, 200);
      assert.equal(good.json.data.earn_code, 'flsa_ot');
      assert.equal(Number(good.json.data.regular_rate), 30);

      // More records for memberA (2026): a CBA OT (excluded), an unclassified (surfaced), a prior-year FLSA (excluded by the year filter).
      await pool.query(`INSERT INTO ot_records (member_id, department_id, ot_date, ot_hours, earn_code, regular_rate, reason) VALUES ($1,$2,'2026-04-01',20,'cba_ot',50,'${MARK} cba')`, [memberA, deptA]);
      await pool.query(`INSERT INTO ot_records (member_id, department_id, ot_date, ot_hours, earn_code, regular_rate, reason) VALUES ($1,$2,'2026-05-01',6,NULL,NULL,'${MARK} uncl')`, [memberA, deptA]);
      await pool.query(`INSERT INTO ot_records (member_id, department_id, ot_date, ot_hours, earn_code, regular_rate, reason) VALUES ($1,$2,'2025-12-31',99,'flsa_ot',30,'${MARK} lastyear')`, [memberA, deptA]);
      // A dept-B record that must NEVER appear in dept A's export.
      await pool.query(`INSERT INTO ot_records (member_id, department_id, ot_date, ot_hours, earn_code, regular_rate, reason) VALUES ($1,$2,'2026-06-01',40,'flsa_ot',60,'${MARK} deptB')`, [memberB, deptB]);

      // ── Export (chief, 2026) ────────────────────────────────────────────
      const exp = await api('GET', '/api/ot-equalization/qualified-export?year=2026', chief);
      assert.equal(exp.status, 200);
      assert.equal(exp.json.data.year, 2026);
      assert.match(exp.json.data.advisory, /not payroll-of-record/i, 'advisory disclaimer present');
      const rowA = exp.json.data.members.find(m => m.member_id === memberA);
      assert.ok(rowA, 'member A in the export');
      assert.equal(rowA.qualifyingHours, 10, 'only the FLSA OT hours qualify (CBA + unclassified excluded)');
      assert.equal(rowA.halfPremiumDollars, 150, 'half-premium = 0.5 * 30 * 10 (not the gross)');
      assert.equal(rowA.dollarsComplete, true, 'the sole qualifying row had a rate');
      assert.equal(rowA.unclassifiedHours, 6, 'the unclassified 6h is surfaced');
      // Tenancy: dept B's 40h FLSA OT is not in dept A's export at all.
      assert.ok(!exp.json.data.members.some(m => m.member_id === memberB), 'dept B never appears in dept A export');

      // ── Role gate: a member cannot pull the export ──
      const memberExp = await api('GET', '/api/ot-equalization/qualified-export?year=2026', member);
      assert.equal(memberExp.status, 403, 'a member cannot pull the qualified-OT export');

      console.log('[qualifiedOtExport] all 1.2f cases passed.');
    } finally {
      await cleanup();
      await new Promise((r) => server.close(r));
    }
  });
}
