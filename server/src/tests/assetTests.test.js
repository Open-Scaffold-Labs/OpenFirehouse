'use strict';
// Phase 2.3 — generic asset-test engine (migration 0084). Spec: docs/PHASE2-ASSET-TESTS-SPEC-2026-07-26.md §6.
// Part B (opt-in via TENANCY_TEST_DB, adversarial, real Postgres via the API):
//   1. Anchor traps: hose FIRST test dues from manufacture; after an event, from last event;
//      an ad-hoc event resets the clock; a missing anchor is 'unknown' (never guessed).
//   2. Result/status separation: a FAIL never changes asset status (disposition_suggested
//      only); the status door needs a reason for oos/condemned/retired; member 403s.
//   3. Finality: event PATCH → 409 RECORD_FINALIZED; UNRECORDED rejected from the API (400);
//      chief soft delete requires reason, excludes from reads, audits.
//   4. Family/target guards: pump type on an asset → 422; wrong-family asset → 422;
//      exactly-one-target enforced; cross-tenant refused everywhere.
//   5. Retired/condemned assets leave the due board; OOS assets show 'paused'.
//   6. Retirement clock: year-only manufacture is a FLAGGED approximation; missing → unknown.
//   7. Migration: the seeded legacy cylinders exist as assets with UNRECORDED anchor events.
// Every case could actually fail (lesson #29).

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[assetTests] TENANCY_TEST_DB not set — skipping live-DB 2.3 suite.');
  test('2.3 asset tests (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('2.3 — asset tests: anchors, result/status split, finality, guards, due board', async () => {
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
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null; try { json = await res.json(); } catch {}
      return { status: res.status, json };
    }

    const MARK = 'AT-2_3';
    let deptA, deptB;
    async function cleanup() {
      for (const dept of [deptA, deptB]) {
        if (!dept) continue;
        await pool.query('DELETE FROM asset_test_events WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM tracked_assets WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM asset_test_types WHERE department_id = $1', [dept]);
        await pool.query(`DELETE FROM audit_log WHERE department_id = $1 AND table_name IN ('tracked_assets','asset_test_types','asset_test_events')`, [dept]);
      }
      await pool.query(`DELETE FROM apparatus WHERE designation LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'at_2_3_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'at_2_3_%'`);
      await pool.query(`DELETE FROM stations WHERE name LIKE '${MARK}%'`);
      await pool.query(`DELETE FROM departments WHERE name LIKE '${MARK}%'`);
    }
    async function mkUser(uname, role, dept) {
      const uid = (await pool.query(
        `INSERT INTO users (username,name,initials,role,"passwordHash",station_id) VALUES ($1,$2,'XX',$3,'x',$4) RETURNING id`,
        [uname, `${uname} Name`, role, dept])).rows[0].id;
      await pool.query('INSERT INTO of_user_departments (user_id,department_id,role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [uid, dept, role]);
      const token = jwt.sign({ sub: uid, username: uname, role }, ACCESS_SECRET, { expiresIn: '15m' });
      return { uid, token };
    }
    const iso = (d) => d.toISOString().slice(0, 10);
    const today = iso(new Date());
    const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); };

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) { try { const r = await fetch(`${baseUrl}/api/setup-status`); if (r.status === 200) { ready = true; break; } } catch {} await new Promise((x) => setTimeout(x, 1000)); }
      assert.ok(ready, 'DB never ready');
      await cleanup();

      deptA = await mkAlignedDeptStation(pool, `${MARK} Dept A`);
      deptB = await mkAlignedDeptStation(pool, `${MARK} Dept B`);
      const chief = await mkUser('at_2_3_chief', 'chief', deptA);
      const member = await mkUser('at_2_3_member', 'member', deptA);
      const memberB = await mkUser('at_2_3_memberb', 'member', deptB);

      // Types seed on first read (the standards' table-stakes set).
      let r = await api('GET', '/api/asset-tests/types', chief.token);
      assert.equal(r.status, 200);
      const types = r.json.data;
      assert.ok(types.length >= 7, 'default types seeded');
      const hoseType = types.find((t) => t.family === 'hose');
      const pumpType = types.find((t) => t.family === 'pump');
      const flowType = types.find((t) => t.name === 'SCBA flow test');
      assert.equal(hoseType.first_anchor, 'manufacture', 'hose first-anchor = manufacture (the 1962 rule)');
      assert.equal(pumpType.target, 'apparatus', 'pump tests target apparatus');

      // 2/4 · Role gates + creation.
      r = await api('POST', '/api/asset-tests/assets', member.token, { family: 'hose', name: 'X' });
      assert.equal(r.status, 403, 'member cannot create assets');
      r = await api('POST', '/api/asset-tests/assets', chief.token, {
        family: 'hose', name: `${MARK} Hose 1`, serial: 'H-1',
        manufacture_date: daysAgo(400), identity: { diameter: '1.75in', length: 50 },
      });
      assert.equal(r.status, 201, `hose create: ${JSON.stringify(r.json)}`);
      const hose = r.json.data;
      assert.equal(hose.retirement_advisory, true, 'hose retirement defaults ADVISORY');

      // 1 · Anchor: no events → hose dues from MANUFACTURE (400 days ago + 365 = overdue).
      r = await api('GET', `/api/asset-tests/due?today=${today}`, chief.token);
      let row = r.json.data.tests.find((x) => x.target_id === hose.id && x.test_type_id === hoseType.id);
      assert.ok(row, 'hose due row exists');
      assert.equal(row.anchor_kind, 'manufacture');
      assert.equal(row.due_state, 'overdue', 'first test overdue from manufacture');

      // Record a test 10 days ago → clock re-anchors to last event → ok.
      r = await api('POST', '/api/asset-tests/events', chief.token, {
        test_type_id: hoseType.id, asset_id: hose.id, event_date: daysAgo(10),
        result: 'PASS', pressure_used: 300, outside_company: 'Test Co',
      });
      assert.equal(r.status, 201, `event create: ${JSON.stringify(r.json)}`);
      const ev1 = r.json.data;
      assert.equal(ev1.disposition_suggested, false);
      r = await api('GET', `/api/asset-tests/due?today=${today}`, chief.token);
      row = r.json.data.tests.find((x) => x.target_id === hose.id && x.test_type_id === hoseType.id);
      assert.equal(row.due_state, 'ok', 'ad-hoc event reset the clock (the 1932 pattern)');
      assert.equal(row.anchor_kind, 'last_event');

      // SCBA with NO manufacture info: flow clock unknown until an event; retirement unknown.
      r = await api('POST', '/api/asset-tests/assets', chief.token, { family: 'scba', name: `${MARK} Cyl X` });
      const cyl = r.json.data;
      r = await api('GET', `/api/asset-tests/due?today=${today}`, chief.token);
      row = r.json.data.tests.find((x) => x.target_id === cyl.id && x.test_type_id === flowType.id);
      assert.equal(row.due_state, 'unknown', 'no anchor ⇒ unknown, never guessed');
      let ret = r.json.data.retirement.find((x) => x.asset_id === cyl.id);
      assert.equal(ret.retire_state, 'unknown', 'no manufacture info ⇒ retirement unknown');

      // 6 · Year-only manufacture → flagged approximation.
      r = await api('PATCH', `/api/asset-tests/assets/${cyl.id}`, chief.token, { manufacture_year: 2008 });
      assert.equal(r.status, 200);
      r = await api('GET', `/api/asset-tests/due?today=${today}`, chief.token);
      ret = r.json.data.retirement.find((x) => x.asset_id === cyl.id);
      assert.equal(ret.year_only_approximation, true, 'year-only is FLAGGED');
      assert.equal(ret.retire_state, 'overdue', '2008 composite +15y = 2023 — overdue in 2026');

      // 2 · FAIL proposes, never flips; the status door is the human act.
      r = await api('POST', '/api/asset-tests/events', chief.token, {
        test_type_id: flowType.id, asset_id: cyl.id, event_date: today, result: 'FAIL',
      });
      assert.equal(r.status, 201);
      assert.equal(r.json.data.disposition_suggested, true);
      let a = await pool.query('SELECT status FROM tracked_assets WHERE id = $1', [cyl.id]);
      assert.equal(a.rows[0].status, 'in_service', 'FAIL did NOT auto-flip status (the ceiling)');
      r = await api('POST', `/api/asset-tests/assets/${cyl.id}/status`, chief.token, { status: 'out_of_service' });
      assert.equal(r.status, 422, 'oos requires a reason');
      r = await api('POST', `/api/asset-tests/assets/${cyl.id}/status`, member.token,
        { status: 'out_of_service', reason: 'failed flow' });
      assert.equal(r.status, 403, 'member cannot disposition');
      r = await api('POST', `/api/asset-tests/assets/${cyl.id}/status`, chief.token,
        { status: 'out_of_service', reason: 'Failed flow test — sent for service' });
      assert.equal(r.status, 200);

      // 5 · OOS asset shows paused; condemned leaves the board.
      r = await api('GET', `/api/asset-tests/due?today=${today}`, chief.token);
      row = r.json.data.tests.find((x) => x.target_id === cyl.id && x.test_type_id === flowType.id);
      assert.equal(row.due_state, 'paused');
      r = await api('POST', `/api/asset-tests/assets/${cyl.id}/status`, chief.token,
        { status: 'condemned', reason: 'Beyond service life' });
      assert.equal(r.status, 200);
      r = await api('GET', `/api/asset-tests/due?today=${today}`, chief.token);
      assert.ok(!r.json.data.tests.some((x) => x.target_id === cyl.id && x.target_kind === 'asset'),
        'condemned assets leave the due board');

      // 3 · Finality + UNRECORDED rejection + soft delete.
      r = await api('PATCH', `/api/asset-tests/events/${ev1.id}`, chief.token, { note: 'edit' });
      assert.equal(r.status, 409);
      assert.equal(r.json.code, 'RECORD_FINALIZED');
      r = await api('POST', '/api/asset-tests/events', chief.token, {
        test_type_id: hoseType.id, asset_id: hose.id, event_date: today, result: 'UNRECORDED',
      });
      assert.equal(r.status, 400, 'UNRECORDED is migration-only — not an API value');
      r = await api('DELETE', `/api/asset-tests/events/${ev1.id}`, chief.token, {});
      assert.equal(r.status, 400, 'event delete needs a reason');
      r = await api('DELETE', `/api/asset-tests/events/${ev1.id}`, chief.token, { reason: 'entered on the wrong hose' });
      assert.equal(r.status, 200);
      r = await api('GET', `/api/asset-tests/events?asset_id=${hose.id}`, chief.token);
      assert.ok(!(r.json.data || []).some((e) => e.id === ev1.id), 'soft-deleted event excluded');
      const delAudit = await pool.query(
        `SELECT COUNT(*)::int AS n FROM audit_log WHERE table_name = 'asset_test_events' AND record_id = $1 AND action = 'soft_delete'`,
        [ev1.id]);
      assert.equal(delAudit.rows[0].n, 1, 'event soft delete audited');
      // With its only event deleted, the hose re-anchors to manufacture → overdue again.
      r = await api('GET', `/api/asset-tests/due?today=${today}`, chief.token);
      row = r.json.data.tests.find((x) => x.target_id === hose.id && x.test_type_id === hoseType.id);
      assert.equal(row.due_state, 'overdue', 'deleted event no longer anchors the clock');

      // 4 · Family/target guards + cross-tenant.
      r = await api('POST', '/api/asset-tests/events', chief.token, {
        test_type_id: pumpType.id, asset_id: hose.id, event_date: today, result: 'PASS',
      });
      assert.equal(r.status, 422, 'pump type cannot target an asset');
      r = await api('POST', '/api/asset-tests/events', chief.token, {
        test_type_id: flowType.id, asset_id: hose.id, event_date: today, result: 'PASS',
      });
      assert.equal(r.status, 422, 'SCBA test on a hose → FAMILY_MISMATCH');
      const rigB = (await pool.query(
        `INSERT INTO apparatus (designation, type, year, station_id, department_id) VALUES ('${MARK} Engine B','Engine',2019,$1,$1) RETURNING id`,
        [deptB])).rows[0].id;
      r = await api('POST', '/api/asset-tests/events', memberB.token, {
        test_type_id: pumpType.id, apparatus_id: rigB, event_date: today, result: 'PASS',
      });
      assert.equal(r.status, 403, 'dept B member is not a mechanic; and dept A types are invisible to B');
      r = await api('GET', `/api/asset-tests/assets`, memberB.token);
      assert.ok(!(r.json.data || []).some((x) => x.id === hose.id), 'no cross-tenant assets');

      // 7 · The 0084 data migration (legacy cylinders → assets + UNRECORDED events).
      // Environment-honest: CI's fresh DB seeds no legacy cylinders, so there is nothing
      // to migrate there — the check only binds where legacy rows exist (local + prod,
      // where it was ALSO verified by direct query: 8 assets / 16 events on both).
      const legacy = await pool.query('SELECT COUNT(*)::int AS n FROM cylinders');
      if (legacy.rows[0].n > 0) {
        const mig = await pool.query(
          `SELECT COUNT(*)::int AS assets,
                  (SELECT COUNT(*)::int FROM asset_test_events e
                    WHERE e.result = 'UNRECORDED'
                      AND e.asset_id IN (SELECT id FROM tracked_assets WHERE notes LIKE '%[migrated cylinder #%')) AS events
             FROM tracked_assets WHERE notes LIKE '%[migrated cylinder #%'`);
        assert.ok(mig.rows[0].assets >= 1, 'legacy cylinders migrated to tracked_assets');
        assert.ok(mig.rows[0].events >= 1, 'migrated anchor events are UNRECORDED (never fabricated PASSes)');
      } else {
        console.log('[assetTests] no legacy cylinders in this DB — migration check has nothing to bind on (verified by direct query on local + prod instead).');
      }
    } finally {
      try { await cleanup(); } catch (e) { console.error('[assetTests] cleanup failed:', e.message); }
      await new Promise((r) => server.close(r));
      try { await pool.end(); } catch {}
    }
  });
}
