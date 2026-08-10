'use strict';
// Phase 2.5 — scan tags (migration 0086). Spec: docs/PHASE2-BARCODE-SPEC-2026-07-26.md §4.
//   1. Cross-tenant: dept B resolving dept A's REAL tag → 404 (this probe could fail).
//   2. Unknown tag → 404; malformed → 400 (zod).
//   3. Resolution is read-only + open to members; labels are mechanic/chief-gated.
//   4. Creation paths mint tags (a new asset/item/location has one).
//   5. Labels mint missing tags and return printable payloads.
// Every case could actually fail (lesson #29).

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[scan] TENANCY_TEST_DB not set — skipping live-DB 2.5 suite.');
  test('2.5 scan (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('2.5 — scan: tenancy, gates, minting, labels, malformed', async () => {
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

    const MARK = 'SC-2_5';
    let deptA, deptB;
    async function cleanup() {
      for (const dept of [deptA, deptB]) {
        if (!dept) continue;
        await pool.query('DELETE FROM asset_test_events WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM tracked_assets WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM asset_test_types WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM inventory_items WHERE department_id = $1', [dept]);
        await pool.query('DELETE FROM inventory_locations WHERE department_id = $1', [dept]);
        await pool.query(`DELETE FROM audit_log WHERE department_id = $1 AND table_name IN ('tracked_assets','inventory_items','inventory_locations')`, [dept]);
      }
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'sc_2_5_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'sc_2_5_%'`);
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

    try {
      let ready = false;
      for (let i = 0; i < 30; i++) { try { const r = await fetch(`${baseUrl}/api/setup-status`); if (r.status === 200) { ready = true; break; } } catch {} await new Promise((x) => setTimeout(x, 1000)); }
      assert.ok(ready, 'DB never ready');
      await cleanup();

      deptA = await mkAlignedDeptStation(pool, `${MARK} Dept A`);
      deptB = await mkAlignedDeptStation(pool, `${MARK} Dept B`);
      const chief = await mkUser('sc_2_5_chief', 'chief', deptA);
      const member = await mkUser('sc_2_5_member', 'member', deptA);
      const memberB = await mkUser('sc_2_5_memberb', 'member', deptB);

      // 4 · Creation mints tags.
      let r = await api('POST', '/api/asset-tests/assets', chief.token, { family: 'hose', name: `${MARK} Hose` });
      assert.equal(r.status, 201);
      const asset = r.json.data;
      assert.ok(/^ofh[0-9a-f]{20}$/.test(asset.scan_tag), 'new asset minted a tag');
      r = await api('POST', '/api/inventory/items', chief.token, { name: `${MARK} Gauze` });
      const item = r.json.data;
      assert.ok(/^ofh[0-9a-f]{20}$/.test(item.scan_tag), 'new item minted a tag');
      r = await api('POST', '/api/inventory/locations', chief.token, { name: `${MARK} Kit`, kind: 'kit' });
      const loc = r.json.data;
      assert.ok(/^ofh[0-9a-f]{20}$/.test(loc.scan_tag), 'new location minted a tag');

      // 3 · Member resolves.
      r = await api('GET', `/api/scan/resolve/${asset.scan_tag}`, member.token);
      assert.equal(r.status, 200, `resolve: ${JSON.stringify(r.json)}`);
      assert.equal(r.json.data.kind, 'asset');
      assert.equal(r.json.data.record.id, asset.id);
      r = await api('GET', `/api/scan/resolve/${loc.scan_tag}`, member.token);
      assert.equal(r.json.data.kind, 'location');

      // 1 · THE tenancy probe: the tag EXISTS — dept B still gets nothing.
      r = await api('GET', `/api/scan/resolve/${asset.scan_tag}`, memberB.token);
      assert.equal(r.status, 404, 'a real tag from another department resolves to NOTHING');

      // 2 · Unknown + malformed.
      r = await api('GET', '/api/scan/resolve/ofh00000000000000000000', member.token);
      assert.equal(r.status, 404);
      r = await api('GET', '/api/scan/resolve/DROP-TABLE', member.token);
      assert.equal(r.status, 400, 'malformed tag rejected by shape');

      // 3b · Labels gated; payload shape; mints stragglers.
      r = await api('POST', '/api/scan/labels', member.token, { kind: 'asset', ids: [asset.id] });
      assert.equal(r.status, 403, 'member cannot generate labels');
      await pool.query('UPDATE tracked_assets SET scan_tag = NULL WHERE id = $1', [asset.id]);
      r = await api('POST', '/api/scan/labels', chief.token, { kind: 'asset', ids: [asset.id] });
      assert.equal(r.status, 200, `labels: ${JSON.stringify(r.json)}`);
      const label = r.json.data[0];
      assert.ok(/^OFH1:ofh[0-9a-f]{20}$/.test(label.code), 'label carries the QR payload');
      assert.equal(label.title, `${MARK} Hose`);
      const rehydrated = await pool.query('SELECT scan_tag FROM tracked_assets WHERE id = $1', [asset.id]);
      assert.ok(rehydrated.rows[0].scan_tag, 'labels minted the missing tag');

      // Cross-tenant labels: dept B chief cannot label dept A records.
      const chiefB = await mkUser('sc_2_5_chiefb', 'chief', deptB);
      r = await api('POST', '/api/scan/labels', chiefB.token, { kind: 'asset', ids: [asset.id] });
      assert.equal(r.status, 404, 'cross-tenant label generation refused');
    } finally {
      try { await cleanup(); } catch (e) { console.error('[scan] cleanup failed:', e.message); }
      await new Promise((r) => server.close(r));
      try { await pool.end(); } catch {}
    }
  });
}
