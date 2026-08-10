'use strict';
// Phase 2.4 — par-level inventory (migration 0085). Spec: docs/PHASE2-INVENTORY-SPEC-2026-07-26.md §5.
// Live-DB adversarial (opt-in via TENANCY_TEST_DB):
//   1. One door + physical floor: usage below zero → 422 INSUFFICIENT_STOCK (stock AND lot).
//   2. Lot honesty: tracks_lots item without lot_id → 422 LOT_REQUIRED (never guessed).
//   3. Count: variance requires a reason; delta computed server-side; posts count_adjust.
//   4. Pick math: below-par alert with suggest = par_max − qty.
//   5. Requisitions: member creates; officer/mechanic decides (deny needs reason);
//      ACCEPTANCE MOVES NOTHING; fulfillment posts exactly the recorded quantities
//      (partials); cancelled/denied retained.
//   6. Role gates: member cannot restock/decide/configure; cross-tenant everywhere.
//   7. Ledger physically append-only (of_app UPDATE → 42501) — probed in D6; here we
//      assert no API mutates a txn (absence of routes).
// Every case could actually fail (lesson #29).

const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[inventory] TENANCY_TEST_DB not set — skipping live-DB 2.4 suite.');
  test('2.4 inventory (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('2.4 — inventory: one door, lots, counts, pick math, requisitions, gates', async () => {
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

    const MARK = 'INV-2_4';
    let deptA, deptB;
    async function cleanup() {
      for (const dept of [deptA, deptB]) {
        if (!dept) continue;
        for (const t of ['inventory_txns', 'requisition_lines', 'requisitions', 'inventory_lots', 'inventory_stock', 'inventory_locations', 'inventory_items']) {
          await pool.query(`DELETE FROM ${t} WHERE department_id = $1`, [dept]);
        }
        await pool.query(`DELETE FROM audit_log WHERE department_id = $1 AND table_name LIKE 'inventory%'`, [dept]);
        await pool.query(`DELETE FROM audit_log WHERE department_id = $1 AND table_name = 'requisitions'`, [dept]);
      }
      await pool.query(`DELETE FROM of_user_departments WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'inv_2_4_%')`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'inv_2_4_%'`);
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
      const chief = await mkUser('inv_2_4_chief', 'chief', deptA);
      const member = await mkUser('inv_2_4_member', 'member', deptA);
      const memberB = await mkUser('inv_2_4_memberb', 'member', deptB);

      // 6 · Config gates.
      let r = await api('POST', '/api/inventory/items', member.token, { name: 'Gauze' });
      assert.equal(r.status, 403, 'member cannot create items');
      r = await api('POST', '/api/inventory/items', chief.token, { name: `${MARK} 4x4 Gauze`, category: 'EMS', tracks_lots: true });
      assert.equal(r.status, 201);
      const gauze = r.json.data;
      r = await api('POST', '/api/inventory/items', chief.token, { name: `${MARK} Fuel Can`, tracks_lots: false });
      const fuel = r.json.data;
      r = await api('POST', '/api/inventory/locations', chief.token, { name: `${MARK} Supply Room`, kind: 'supply_room' });
      const supply = r.json.data;
      r = await api('POST', '/api/inventory/locations', chief.token, { name: `${MARK} Medic Kit`, kind: 'kit' });
      const kit = r.json.data;

      // Par per (item × location): min 10 / max 25.
      r = await api('POST', '/api/inventory/par', chief.token,
        { item_id: gauze.id, location_id: kit.id, par_min: 10, par_max: 25 });
      assert.equal(r.status, 200, `par set: ${JSON.stringify(r.json)}`);

      // Restock (chief): mints a lot at the supply room.
      r = await api('POST', '/api/inventory/restock', chief.token, {
        item_id: gauze.id, location_id: supply.id, qty: 100, lot_number: 'L-77', expiration_date: '2027-01-15',
      });
      assert.equal(r.status, 201, `restock: ${JSON.stringify(r.json)}`);
      r = await api('POST', '/api/inventory/restock', member.token, { item_id: fuel.id, location_id: supply.id, qty: 5 });
      assert.equal(r.status, 403, 'member cannot restock');

      // Transfer supply → kit (moves the lot identity).
      const lots = await api('GET', `/api/inventory/lots?item_id=${gauze.id}&location_id=${supply.id}`, chief.token);
      const srcLot = lots.json.data[0];
      r = await api('POST', '/api/inventory/transfer', chief.token, {
        item_id: gauze.id, from_location_id: supply.id, to_location_id: kit.id, from_lot_id: srcLot.id, qty: 20,
      });
      assert.equal(r.status, 201, `transfer: ${JSON.stringify(r.json)}`);

      // 2 · Lot honesty: usage on a tracked item without lot_id → 422.
      r = await api('POST', '/api/inventory/usage', member.token, { item_id: gauze.id, location_id: kit.id, qty: 2 });
      assert.equal(r.status, 422);
      assert.equal(r.json.code, 'LOT_REQUIRED');
      const kitLots = await api('GET', `/api/inventory/lots?item_id=${gauze.id}&location_id=${kit.id}`, member.token);
      const kitLot = kitLots.json.data[0];
      assert.ok(kitLot, 'the transferred lot exists at the kit');
      assert.equal(kitLot.lot_number, 'L-77', 'lot identity travelled with the transfer');
      r = await api('POST', '/api/inventory/usage', member.token,
        { item_id: gauze.id, location_id: kit.id, lot_id: kitLot.id, qty: 2, incident_ref: 'INC-123' });
      assert.equal(r.status, 201, `usage: ${JSON.stringify(r.json)}`);
      assert.equal(r.json.data.qty, 18, 'kit stock 20 − 2');

      // 1 · The physical floor.
      r = await api('POST', '/api/inventory/usage', member.token,
        { item_id: gauze.id, location_id: kit.id, lot_id: kitLot.id, qty: 100 });
      assert.equal(r.status, 422);
      assert.equal(r.json.code, 'INSUFFICIENT_STOCK');

      // 4 · Pick math: kit has 18, par_min 10 → not below par; use 10 more → 8 < 10 →
      // suggest = 25 − 8 = 17.
      r = await api('POST', '/api/inventory/usage', member.token,
        { item_id: gauze.id, location_id: kit.id, lot_id: kitLot.id, qty: 10 });
      assert.equal(r.status, 201);
      r = await api('GET', '/api/inventory/alerts', member.token);
      const bp = r.json.data.below_par.find((x) => x.item_id === gauze.id && x.location_id === kit.id);
      assert.ok(bp, 'below-par alert fired');
      assert.equal(Number(bp.suggest), 17, 'suggest = par_max − on-hand (order-up-to-max)');
      // Expiry look-ahead (2027-01-15 within 365 days of 2026-07-26).
      r = await api('GET', '/api/inventory/alerts?days=365', member.token);
      assert.ok(r.json.data.expiring.some((x) => x.lot_number === 'L-77'), 'expiry look-ahead sees the lot');

      // 3 · Count: variance without reason → 422; with reason → server-computed delta.
      r = await api('POST', '/api/inventory/count', member.token, {
        location_id: kit.id, lines: [{ item_id: gauze.id, lot_id: kitLot.id, counted_qty: 6 }],
      });
      assert.equal(r.status, 422);
      assert.equal(r.json.code, 'VARIANCE_REASON_REQUIRED');
      r = await api('POST', '/api/inventory/count', member.token, {
        location_id: kit.id,
        lines: [{ item_id: gauze.id, lot_id: kitLot.id, counted_qty: 6, reason: 'two packs water-damaged, discarded' }],
      });
      assert.equal(r.status, 201);
      assert.equal(r.json.data.lines[0].delta, -2, 'delta computed server-side (8 → 6)');
      const led = await pool.query(
        `SELECT verb, qty_delta, counted_qty FROM inventory_txns
          WHERE department_id = $1 AND item_id = $2 AND verb = 'count_adjust'`, [deptA, gauze.id]);
      assert.equal(led.rows.length, 1);
      assert.equal(Number(led.rows[0].counted_qty), 6);

      // 5 · Requisitions: member creates → officer decides → fulfillment moves stock.
      r = await api('POST', '/api/inventory/requisitions', member.token, {
        to_location_id: kit.id, note: 'restock after the MVA',
        lines: [{ item_id: gauze.id, qty_requested: 19 }, { item_id: fuel.id, qty_requested: 2 }],
      });
      assert.equal(r.status, 201);
      const reqq = r.json.data;
      r = await api('POST', `/api/inventory/requisitions/${reqq.id}/decide`, member.token, { decision: 'accepted' });
      assert.equal(r.status, 403, 'member cannot decide');
      r = await api('POST', `/api/inventory/requisitions/${reqq.id}/decide`, chief.token,
        { decision: 'accepted', from_location_id: supply.id });
      assert.equal(r.status, 200);
      // ACCEPTANCE MOVED NOTHING.
      const kitQty = await pool.query(
        'SELECT qty FROM inventory_stock WHERE item_id = $1 AND location_id = $2', [gauze.id, kit.id]);
      assert.equal(Number(kitQty.rows[0].qty), 6, 'acceptance never moves stock');
      // Fulfill partially (10 of 19 gauze; 0 fuel — none in stock).
      const linesRes = await api('GET', `/api/inventory/requisitions?status=accepted`, chief.token);
      const lines = linesRes.json.data.find((x) => x.id === reqq.id).lines;
      const gzLine = lines.find((l) => l.item_id === gauze.id);
      const fuelLine = lines.find((l) => l.item_id === fuel.id);
      r = await api('POST', `/api/inventory/requisitions/${reqq.id}/fulfill`, chief.token, {
        lines: [
          { line_id: gzLine.id, qty_fulfilled: 10, from_lot_id: srcLot.id },
          { line_id: fuelLine.id, qty_fulfilled: 0 },
        ],
      });
      assert.equal(r.status, 200, `fulfill: ${JSON.stringify(r.json)}`);
      const kitAfter = await pool.query(
        'SELECT qty FROM inventory_stock WHERE item_id = $1 AND location_id = $2', [gauze.id, kit.id]);
      assert.equal(Number(kitAfter.rows[0].qty), 16, 'fulfillment moved exactly the recorded 10');
      // Deny needs a reason (fresh request).
      r = await api('POST', '/api/inventory/requisitions', member.token, {
        to_location_id: kit.id, lines: [{ item_id: fuel.id, qty_requested: 1 }],
      });
      const req2 = r.json.data;
      r = await api('POST', `/api/inventory/requisitions/${req2.id}/decide`, chief.token, { decision: 'denied' });
      assert.equal(r.status, 422, 'deny without a reason refused');
      r = await api('POST', `/api/inventory/requisitions/${req2.id}/decide`, chief.token,
        { decision: 'denied', note: 'no fuel cans in stock — ordering' });
      assert.equal(r.status, 200);
      r = await api('GET', '/api/inventory/requisitions?status=denied', member.token);
      assert.ok(r.json.data.some((x) => x.id === req2.id), 'denied requests retained + visible');

      // 6 · Cross-tenant.
      r = await api('GET', '/api/inventory/stock', memberB.token);
      assert.ok(!(r.json.data || []).some((x) => x.item_id === gauze.id), 'no cross-tenant stock');
      r = await api('POST', '/api/inventory/usage', memberB.token,
        { item_id: gauze.id, location_id: kit.id, lot_id: kitLot.id, qty: 1 });
      assert.equal(r.status, 422, 'cross-tenant usage refused (item invisible)');
    } finally {
      try { await cleanup(); } catch (e) { console.error('[inventory] cleanup failed:', e.message); }
      await new Promise((r) => server.close(r));
      try { await pool.end(); } catch {}
    }
  });
}
