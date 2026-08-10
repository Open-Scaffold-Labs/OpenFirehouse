'use strict';
// fiNoticesMailroom.test.js — the dept-wide mailroom list (GET /api/fi-notices).
// Verifies: a notice appears with its property, `served` flips once a service record exists,
// and the list is department-scoped. Needs TENANCY_TEST_DB.

if (process.env.TENANCY_TEST_DB) process.env.DATABASE_URL = process.env.TENANCY_TEST_DB;

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('fi notices mailroom (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  delete process.env.PORT;

  test('the mailroom lists notices with property + served status, dept-scoped', async (t) => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...a) => { const x = realSetInterval(...a); if (x && x.unref) x.unref(); return x; };
    let app;
    try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');

    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const api = async (method, path, token, body) => {
      const res = await fetch(base + path, {
        method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null; try { json = await res.json(); } catch { /* */ }
      return { status: res.status, json };
    };

    const u = (await pool.query(
      `SELECT id, username, role, station_id FROM users WHERE station_id IS NOT NULL AND role='chief' ORDER BY id LIMIT 1`)).rows[0];
    assert.ok(u, 'need a chief with a station');
    const dept = u.station_id;
    const chief = jwt.sign({ sub: u.id, username: u.username, role: u.role, stationId: dept, name: 'Mailroom Test' }, ACCESS_SECRET, { expiresIn: '10m' });

    const MARK = 'ZZMAILROOM';
    const cleanup = async () => {
      await pool.query(`DELETE FROM fi_notice_service WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE $1)`, [`${MARK}%`]);
      await pool.query(`DELETE FROM fi_notices WHERE file_name LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM fi_inspections WHERE notes LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM fi_properties WHERE name LIKE $1`, [`${MARK}%`]);
    };
    await cleanup();
    t.after(async () => { await cleanup(); await new Promise((r) => server.close(r)); await pool.end().catch(() => {}); });

    // A property + inspection, then a stored notice inserted directly (skips the PDF-gen path).
    const prop = await api('POST', '/api/fi-properties', chief, { name: `${MARK} Bldg`, address: '7 Mailroom Way' });
    const propertyId = prop.json.data.id;
    const insp = await api('POST', '/api/fi-inspections', chief, { propertyId, type: `${MARK} Annual`, notes: `${MARK} fixture`, violations: [] });
    const inspectionId = insp.json.data.id;
    await pool.query(
      `INSERT INTO fi_notices (department_id, inspection_id, pdf, file_name, generated_by) VALUES ($1,$2,$3,$4,$5)`,
      [dept, inspectionId, Buffer.from('%PDF-1.4 test'), `${MARK}-notice.pdf`, 'Test']);

    // 1) It shows up, and is "needs mailing" (no service yet).
    const list1 = await api('GET', '/api/fi-notices', chief);
    assert.equal(list1.status, 200, JSON.stringify(list1.json));
    const row = list1.json.data.find((n) => n.inspection_id === inspectionId);
    assert.ok(row, 'the notice must appear in the mailroom list');
    assert.equal(row.property_name, `${MARK} Bldg`, 'joins the property');
    assert.equal(row.served, false, 'unmailed notice reads needs-mailing');

    // 2) Record a mail service event → served flips true.
    const mailed = await api('POST', `/api/fi-inspections/${inspectionId}/service`, chief, { method: 'certified_mail', outcome: 'mailed' });
    assert.equal(mailed.status, 201, JSON.stringify(mailed.json));
    const list2 = await api('GET', '/api/fi-notices', chief);
    const row2 = list2.json.data.find((n) => n.inspection_id === inspectionId);
    assert.equal(row2.served, true, 'once a service record exists, the notice reads served');

    // 3) Department scoping: a chief of ANOTHER dept must not see this notice.
    const other = (await pool.query(
      `SELECT id, username, role, station_id FROM users WHERE station_id IS NOT NULL AND station_id <> $1 AND role='chief' ORDER BY id LIMIT 1`, [dept])).rows[0];
    if (other) {
      const otherTok = jwt.sign({ sub: other.id, username: other.username, role: other.role, stationId: other.station_id, name: 'Other' }, ACCESS_SECRET, { expiresIn: '10m' });
      const otherList = await api('GET', '/api/fi-notices', otherTok);
      assert.ok(!otherList.json.data.some((n) => n.inspection_id === inspectionId), 'another department must not see this notice');
    }
  });
}
