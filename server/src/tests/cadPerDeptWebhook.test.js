'use strict';
/**
 * cadPerDeptWebhook.test.js — full per-department CAD (0021).
 * A department's own cad_connection webhook secret authenticates an inbound
 * dispatch and attributes it to THAT department + house — and another secret
 * (or none) does not. DB-backed: skips cleanly without TENANCY_TEST_DB.
 */
const test = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('per-dept CAD webhook (skipped — set TENANCY_TEST_DB)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL || TENANCY_TEST_DB;
  const db = require('../db');
  const { verifyWebhookSecret } = require('../cad/webhookAuth');
  const reqWith = (secret) => ({ headers: secret ? { 'x-cad-webhook-secret': secret } : {}, query: {} });

  test('per-department CAD: a connection secret resolves to its own department; others do not', async () => {
    const { pool } = db;
    const MARK = 'CADWH-' + Date.now();
    let deptId, stationId, connId;
    try {
      // Stand up a throwaway department + house.
      deptId = (await pool.query(`INSERT INTO departments (name) VALUES ($1) RETURNING id`, [MARK])).rows[0].id;
      stationId = (await pool.query(`INSERT INTO stations (name, department_id) VALUES ($1,$2) RETURNING id`, [MARK + ' HQ', deptId])).rows[0].id;

      // Create a CAD connection for that department; it returns its webhook secret ONCE.
      const conn = await db.cadConnections.create({ name: MARK + ' feed', vendorId: 'generic', status: 'Active', station_id: stationId }, deptId);
      connId = conn.id;
      assert.ok(conn.webhook_secret && conn.webhook_secret.startsWith('ofcad_'), 'create returns a one-time webhook secret');
      assert.strictEqual(conn.webhook_secret_hash, undefined, 'the secret HASH is never returned to the client');

      // The real secret authenticates AND attributes to the right department + house.
      const ok = await verifyWebhookSecret(reqWith(conn.webhook_secret));
      assert.strictEqual(ok.ok, true, 'valid connection secret passes');
      assert.ok(ok.connection, 'resolves the connection');
      assert.strictEqual(Number(ok.connection.departmentId), Number(deptId), 'attributes to the connection department');
      assert.strictEqual(Number(ok.connection.stationId), Number(stationId), 'attributes to the connection house');

      // A wrong secret does not match a connection (falls through to the global-secret path).
      const bad = await verifyWebhookSecret(reqWith('ofcad_not-a-real-secret'));
      assert.ok(!bad.connection, 'a non-matching secret resolves no connection');
    } finally {
      if (connId)   await pool.query('DELETE FROM cad_connections WHERE id = $1', [connId]).catch(() => {});
      if (stationId) await pool.query('DELETE FROM stations WHERE id = $1', [stationId]).catch(() => {});
      if (deptId)    await pool.query('DELETE FROM departments WHERE id = $1', [deptId]).catch(() => {});
      await pool.end().catch(() => {}); // dedicated test process — release the pool so node:test exits (matches the other DB suites)
    }
  });
}
