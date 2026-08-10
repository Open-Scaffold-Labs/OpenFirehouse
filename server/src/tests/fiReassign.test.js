'use strict';
// fiReassign.test.js — reassigning a PENDING reinspection to another inspector.
// The one multi-person case (domain expert): a clerk/officer hands a pending reinspection to
// someone else. Guards: supervisor/clerk only, never a finalized record, dept-scoped assignee,
// append-only audit. Needs TENANCY_TEST_DB.

if (process.env.TENANCY_TEST_DB) process.env.DATABASE_URL = process.env.TENANCY_TEST_DB;

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('fi reassign (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  delete process.env.PORT;

  test('reassignment: guarded, dept-scoped, audited; never a finalized record', async (t) => {
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

    const chiefU = (await pool.query(
      `SELECT id, username, role, station_id FROM users WHERE station_id IS NOT NULL AND role='chief' ORDER BY id LIMIT 1`)).rows[0];
    assert.ok(chiefU, 'need a chief with a station');
    const dept = chiefU.station_id;
    const chief = jwt.sign({ sub: chiefU.id, username: chiefU.username, role: chiefU.role, stationId: dept, name: 'Reassign Chief' }, ACCESS_SECRET, { expiresIn: '10m' });

    // A second user in the same department to reassign TO.
    const otherU = (await pool.query(
      `SELECT id, username, role FROM users WHERE station_id = $1 AND id <> $2 ORDER BY id LIMIT 1`, [dept, chiefU.id])).rows[0];

    const MARK = 'ZZREASSIGN';
    const cleanup = async () => {
      await pool.query(`DELETE FROM fi_violations WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE $1)`, [`${MARK}%`]);
      await pool.query(`DELETE FROM fi_inspections WHERE notes LIKE $1`, [`${MARK}%`]);
      await pool.query(`DELETE FROM fi_properties WHERE name LIKE $1`, [`${MARK}%`]);
    };
    await cleanup();
    t.after(async () => { await cleanup(); await new Promise((r) => server.close(r)); await pool.end().catch(() => {}); });

    const prop = await api('POST', '/api/fi-properties', chief, { name: `${MARK} Bldg`, address: '9 Reassign Rd' });
    const propertyId = prop.json.data.id;
    const mkInspection = async () => {
      const r = await api('POST', '/api/fi-inspections', chief, { propertyId, type: `${MARK} Reinspection`, notes: `${MARK} pending`, violations: [] });
      return r.json.data.id;
    };

    // 1) HAPPY PATH — reassign a pending inspection to another dept user.
    if (otherU) {
      const id = await mkInspection();
      const r = await api('POST', `/api/fi-inspections/${id}/reassign`, chief, { toUserId: otherU.id, reason: 'Original inspector out sick' });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const after = await api('GET', `/api/fi-inspections/${id}`, chief);
      const assigned = after.json.data.assigned_to_user_id ?? after.json.data.assignedToUserId;
      assert.equal(String(assigned), String(otherU.id), 'the inspection now belongs to the new inspector');
      // Append-only audit row with the reassign detail.
      const aud = await pool.query(
        `SELECT detail FROM audit_log WHERE table_name='fi_inspections' AND record_id=$1 AND (detail->>'reassign')='true' ORDER BY id DESC LIMIT 1`, [id]);
      assert.ok(aud.rows.length, 'a reassign audit row must exist');
      assert.equal(String(aud.rows[0].detail.to_user_id), String(otherU.id));
      assert.equal(aud.rows[0].detail.reason, 'Original inspector out sick');

      // 1b) Re-assigning to the SAME inspector is refused.
      const dup = await api('POST', `/api/fi-inspections/${id}/reassign`, chief, { toUserId: otherU.id });
      assert.equal(dup.status, 400);
      assert.equal(dup.json.code, 'ALREADY_ASSIGNED');
    }

    // 2) A COMPLETED inspection can never be reassigned (finalized legal record).
    const cleanId = (await api('POST', '/api/fi-inspections', chief, { propertyId, type: `${MARK} Annual`, notes: `${MARK} clean`, violations: [] })).json.data.id;
    await api('POST', `/api/fi-inspections/${cleanId}/complete`, chief, { result: 'Pass', completedDate: '2026-07-15', scheduleNextCycle: false });
    const doneReassign = await api('POST', `/api/fi-inspections/${cleanId}/reassign`, chief, { toUserId: otherU ? otherU.id : chiefU.id });
    assert.equal(doneReassign.status, 409, `a completed inspection must not be reassignable: ${JSON.stringify(doneReassign.json)}`);
    assert.equal(doneReassign.json.code, 'RECORD_FINALIZED');

    // 3) The new assignee must belong to the department.
    const id3 = await mkInspection();
    const foreign = await api('POST', `/api/fi-inspections/${id3}/reassign`, chief, { toUserId: 999999 });
    assert.equal(foreign.status, 404);
    assert.equal(foreign.json.code, 'ASSIGNEE_NOT_IN_DEPT');

    // 4) A plain inspector (non prevention-admin) cannot reassign — gated, not open.
    const nonAdmin = (await pool.query(
      `SELECT id, username, role FROM users WHERE station_id = $1 AND role <> 'chief' ORDER BY id LIMIT 1`, [dept])).rows[0];
    const denyTok = jwt.sign(nonAdmin
      ? { sub: nonAdmin.id, username: nonAdmin.username, role: nonAdmin.role, stationId: dept, name: 'NonAdmin' }
      : { sub: 999998, username: 'zz_ghost', role: 'firefighter', stationId: dept, name: 'Ghost' },
      ACCESS_SECRET, { expiresIn: '10m' });
    const id4 = await mkInspection();
    const denied = await api('POST', `/api/fi-inspections/${id4}/reassign`, denyTok, { toUserId: chiefU.id });
    assert.ok([401, 403].includes(denied.status), `reassign must be gated (got ${denied.status})`);
  });
}
