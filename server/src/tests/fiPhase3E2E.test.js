'use strict';
// fiPhase3E2E.test.js — e2e for the Phase-3 field-ops substrate (2026-07-13):
// signature capture (append-only, BYTEA, streamed), batch scheduling with
// idempotent skip, bulk reassignment (pending-only), the rows-authoritative
// open-violations report with lineage-resolved ORIGINAL reported date, the
// assignment identity link (0051), and the crew-toggle gate on legacy CRUD.
// Opt-in (TENANCY_TEST_DB), same harness as the other fi e2e suites.

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[fiPhase3E2E] TENANCY_TEST_DB not set — skipping.');
  test('fi phase 3 field ops (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('fi phase 3 — signatures, batch scheduling, bulk assign, open-violations lineage', async (t) => {
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
      let json = null; try { json = await res.json(); } catch { /* binary or empty */ }
      return { status: res.status, json, headers: res.headers };
    }

    const MARK = 'FI-P3';
    // A real 1x1 transparent PNG.
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    async function cleanupFixtures() {
      await pool.query(`DELETE FROM fi_signatures WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '%${MARK}%' OR "propertyId" IN (SELECT id FROM fi_properties WHERE name LIKE '${MARK}%'))`);
      await pool.query(`DELETE FROM fi_inspection_answers WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '%${MARK}%' OR "propertyId" IN (SELECT id FROM fi_properties WHERE name LIKE '${MARK}%'))`);
      await pool.query(`DELETE FROM fi_violations WHERE inspection_id IN (SELECT id FROM fi_inspections WHERE notes LIKE '%${MARK}%' OR "propertyId" IN (SELECT id FROM fi_properties WHERE name LIKE '${MARK}%'))`);
      await pool.query(`DELETE FROM fi_inspections WHERE notes LIKE '%${MARK}%' OR "propertyId" IN (SELECT id FROM fi_properties WHERE name LIKE '${MARK}%')`);
      await pool.query(`DELETE FROM fi_properties WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM fi_inspection_types WHERE department_id = 1 AND name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM fi_settings WHERE department_id = 1`);
      await pool.query(`DELETE FROM users WHERE username IN ('fi_p3_chief','fi_p3_member','fi_p3_chief2')`);
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
      await pool.query(`INSERT INTO stations (id, name, fdid, city, state) VALUES (2,'TEN-ISO Attacker Station','','','') ON CONFLICT (id) DO NOTHING`);
      async function upsertUser(username, role, stationId) {
        const r = await pool.query(
          `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
           VALUES ($1,$2,'P3',$3,'not-a-real-hash',$4)
           ON CONFLICT (username) DO UPDATE SET station_id = $4, role = EXCLUDED.role RETURNING id`,
          [username, `P3 ${username}`, role, stationId]);
        return r.rows[0].id;
      }
      const chiefId  = await upsertUser('fi_p3_chief', 'chief', 1);
      const memberId = await upsertUser('fi_p3_member', 'member', 1);
      const chief2Id = await upsertUser('fi_p3_chief2', 'chief', 2);
      const sign = (id, username, role) => jwt.sign({ sub: id, username, role }, ACCESS_SECRET, { expiresIn: '15m' });
      const chief  = sign(chiefId, 'fi_p3_chief', 'chief');
      const member = sign(memberId, 'fi_p3_member', 'member');
      const chief2 = sign(chief2Id, 'fi_p3_chief2', 'chief');

      // Fixtures: a type + three properties + one inspection with an open violation.
      const typ = await api('POST', '/api/fi-inspection-types', chief, { name: `${MARK} Annual`, default_frequency_days: null });
      assert.equal(typ.status, 201, JSON.stringify(typ.json));
      const props = [];
      for (const n of ['Alpha', 'Bravo', 'Charlie']) {
        const p = await api('POST', '/api/fi-properties', chief, { name: `${MARK} ${n}`, address: `${n} St` });
        props.push(p.json.data.id);
      }
      const insp = await api('POST', '/api/fi-inspections', chief, {
        propertyId: props[0], type: `${MARK} Annual`, notes: `${MARK} lineage fixture`,
        assignedToUserId: memberId,
        violations: [
          { code: '1001', description: 'exit blocked', status: 'Open', followUpDate: '2026-08-01' },
          { code: '2001', description: 'fixed on site', status: 'Corrected' },
        ],
      });
      assert.equal(insp.status, 201, JSON.stringify(insp.json));
      const inspId = insp.json.data.id;
      assert.equal(insp.json.data.assigned_to_user_id, memberId, '0051 assignment link persisted on create');

      let sigId;
      await t.test('signatures: capture both roles, list, stream; garbage rejected', async () => {
        const occ = await api('POST', `/api/fi-inspections/${inspId}/signatures`, chief,
          { role: 'occupant', signerName: 'Pat Occupant', imageDataUrl: PNG });
        assert.equal(occ.status, 201, JSON.stringify(occ.json));
        sigId = occ.json.data.id;
        const ins = await api('POST', `/api/fi-inspections/${inspId}/signatures`, chief,
          { role: 'inspector', signerName: 'P3 fi_p3_chief', imageDataUrl: PNG });
        assert.equal(ins.status, 201);
        const list = await api('GET', `/api/fi-inspections/${inspId}/signatures`, chief);
        assert.equal(list.json.data.length, 2);
        assert.ok(list.json.data.every((s) => s.has_image === true));
        const img = await fetch(`${base}/api/fi-signatures/${sigId}/image`, { headers: { Authorization: `Bearer ${chief}` } });
        assert.equal(img.status, 200);
        assert.equal(img.headers.get('content-type'), 'image/png');
        const bytes = Buffer.from(await img.arrayBuffer());
        assert.ok(bytes.length > 40 && bytes.subarray(1, 4).toString() === 'PNG', 'streams real PNG bytes');
        const bad = await api('POST', `/api/fi-inspections/${inspId}/signatures`, chief,
          { role: 'occupant', signerName: 'X', imageDataUrl: 'data:text/html;base64,PGI+bm90IGEgcG5nPC9iPg==' });
        assert.equal(bad.status, 400, 'non-PNG data URL rejected');
      });

      await t.test('batch-schedule: creates per property, idempotent skip, admin-gated', async () => {
        const denied = await api('POST', '/api/fi-inspections/batch-schedule', member,
          { propertyIds: props, type: `${MARK} Annual`, scheduledDate: '2026-09-01' });
        assert.equal(denied.status, 403, 'plain member is not a prevention admin');
        const r = await api('POST', '/api/fi-inspections/batch-schedule', chief,
          { propertyIds: props, type: `${MARK} Annual`, scheduledDate: '2026-09-01', assignedToUserId: memberId });
        assert.equal(r.status, 201, JSON.stringify(r.json));
        assert.equal(r.json.data.createdCount, 3);
        assert.equal(r.json.data.skippedExisting, 0);
        const again = await api('POST', '/api/fi-inspections/batch-schedule', chief,
          { propertyIds: props, type: `${MARK} Annual`, scheduledDate: '2026-09-01' });
        assert.equal(again.json.data.createdCount, 0, 'identical pending batch fully skipped');
        assert.equal(again.json.data.skippedExisting, 3);
        const { rows } = await pool.query(
          `SELECT count(*)::int AS n FROM fi_inspections
           WHERE department_id = 1 AND "scheduledDate" = '2026-09-01' AND type = $1
             AND assigned_to_user_id = $2 AND "inspectorName" = 'P3 fi_p3_member' AND deleted_at IS NULL`,
          [`${MARK} Annual`, memberId]);
        assert.equal(rows[0].n, 3, 'assignment id + resolved display name on every created row');
        const foreign = await api('POST', '/api/fi-inspections/batch-schedule', chief,
          { propertyIds: [999999999], type: `${MARK} Annual`, scheduledDate: '2026-09-01' });
        assert.equal(foreign.status, 404, 'foreign/unknown property refused');
      });

      await t.test('bulk-assign: pending move, completed stay', async () => {
        const pending = await pool.query(
          `SELECT id FROM fi_inspections WHERE department_id = 1 AND "scheduledDate" = '2026-09-01' AND type = $1 AND deleted_at IS NULL ORDER BY id`,
          [`${MARK} Annual`]);
        const ids = pending.rows.map((r) => r.id);
        assert.equal(ids.length, 3);
        // Complete one so it must be skipped by the move.
        const done = await api('POST', `/api/fi-inspections/${ids[0]}/complete`, chief,
          { completedDate: '2026-07-13', result: 'Pass', createReinspection: false, scheduleNextCycle: false });
        assert.equal(done.status, 200, JSON.stringify(done.json));
        const r = await api('POST', '/api/fi-inspections/bulk-assign', chief,
          { inspectionIds: ids, assignedToUserId: null, inspectorName: 'Unassigned Pool' });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.json.data.updatedCount, 2, 'only the two pending moved');
        assert.equal(r.json.data.skipped, 1, 'the completed record is history — never moved');
        const badUser = await api('POST', '/api/fi-inspections/bulk-assign', chief,
          { inspectionIds: ids, assignedToUserId: chief2Id });
        assert.equal(badUser.status, 404, 'assignee from another department refused');
      });

      let reinspectionId;
      await t.test('open-violations report: lineage resolves the ORIGINAL reported date; superseded rows drop out', async () => {
        const done = await api('POST', `/api/fi-inspections/${inspId}/complete`, chief,
          { completedDate: '2026-07-01', result: 'Reinspection Required', scheduleNextCycle: false });
        assert.equal(done.status, 200, JSON.stringify(done.json));
        assert.ok(done.json.reinspection, 'reinspection carries the open violation');
        reinspectionId = done.json.reinspection.id;
        const rep = await api('GET', '/api/fi-reports/open-violations', chief);
        assert.equal(rep.status, 200);
        const mine = rep.json.data.filter((v) => v.property_name === `${MARK} Alpha`);
        assert.equal(mine.length, 1, 'ONE current open row per violation — the carried copy, the original is superseded');
        const v = mine[0];
        assert.equal(v.inspection_id, reinspectionId, 'the leaf lives on the reinspection');
        assert.equal(v.root_inspection_id, inspId, 'lineage walked back to the first citation');
        assert.equal(String(v.root_completed_date).slice(0, 10), '2026-07-01', 'ORIGINAL reported date preserved (incumbent doctrine)');
        assert.equal(v.reinspection_count, 1);
        assert.equal(v.code, '1001');
        assert.equal(v.assigned_to_user_id, memberId, 'reinspection inherits the assignment (0051)');
        // Corrected violations never appear.
        assert.ok(!rep.json.data.some((x) => x.code === '2001' && x.property_name === `${MARK} Alpha`));
      });

      await t.test('eligible-users: chief-gated, own department only', async () => {
        const denied = await api('GET', '/api/fi-designations/eligible-users', member);
        assert.equal(denied.status, 403, 'members cannot enumerate accounts');
        const r = await api('GET', '/api/fi-designations/eligible-users', chief);
        assert.equal(r.status, 200);
        const names = r.json.data.map((u) => u.username);
        assert.ok(names.includes('fi_p3_member'), 'own-dept user listed');
        assert.ok(!names.includes('fi_p3_chief2'), 'foreign-dept user never listed');
      });

      await t.test('tenant isolation: the other department sees and touches nothing', async () => {
        const rep = await api('GET', '/api/fi-reports/open-violations', chief2);
        assert.equal(rep.status, 200);
        assert.ok(!rep.json.data.some((x) => String(x.property_name || '').startsWith(MARK)), 'no cross-tenant rows in the report');
        const sig = await api('POST', `/api/fi-inspections/${inspId}/signatures`, chief2,
          { role: 'occupant', signerName: 'Intruder', imageDataUrl: PNG });
        assert.equal(sig.status, 404, 'cannot sign another department\'s inspection');
        const img = await api('GET', `/api/fi-signatures/${sigId}/image`, chief2);
        assert.equal(img.status, 404, 'cannot stream another department\'s signature');
        const batch = await api('POST', '/api/fi-inspections/batch-schedule', chief2,
          { propertyIds: [props[0]], type: 'Annual Inspection', scheduledDate: '2026-09-01' });
        assert.equal(batch.status, 404, 'cannot batch-schedule another department\'s properties');
      });

      await t.test('crew toggle OFF gates legacy CRUD writes; designation model unaffected for chiefs', async () => {
        const set = await api('PATCH', '/api/fi-settings', chief, { allow_crew_inspections: false });
        assert.equal(set.status, 200);
        const denied = await api('POST', '/api/fi-properties', member, { name: `${MARK} ShouldSucceed` });
        // properties route is not fi-gated; the INSPECTION write is the gated one:
        const deniedIns = await api('POST', '/api/fi-inspections', member,
          { propertyId: props[1], type: `${MARK} Annual`, notes: `${MARK} member try`, violations: [] });
        assert.equal(deniedIns.status, 403, 'undesignated member blocked when crew inspections are off');
        const chiefStill = await api('POST', '/api/fi-inspections', chief,
          { propertyId: props[1], type: `${MARK} Annual`, notes: `${MARK} chief ok`, violations: [] });
        assert.equal(chiefStill.status, 201, 'chief authority is never gated');
        const reopen = await api('PATCH', '/api/fi-settings', chief, { allow_crew_inspections: true });
        assert.equal(reopen.status, 200);
        const allowed = await api('POST', '/api/fi-inspections', member,
          { propertyId: props[1], type: `${MARK} Annual`, notes: `${MARK} member ok`, violations: [] });
        assert.equal(allowed.status, 201, 'crew workflow restored');
        void denied; // properties write intentionally un-gated this phase — documented follow-up
      });
    } finally {
      try { await cleanupFixtures(); } catch { /* best effort */ }
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
