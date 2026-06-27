'use strict';
/**
 * multiHouseDispatch.test.js — 1 department, 2 stations, 2 CAD webhooks.
 *
 * Proves that a department with multiple houses correctly routes each house's
 * inbound webhook dispatch to the right station while attributing BOTH alerts
 * to the SAME department.  Covers the of_station_department resolver (0020)
 * and per-dept CAD connection secret auth (0021).
 *
 * DB-backed: skips cleanly without TENANCY_TEST_DB.
 */
const test   = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('multi-house dispatch routing (skipped — set TENANCY_TEST_DB)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL || TENANCY_TEST_DB;
  const db                  = require('../db');
  const { verifyWebhookSecret } = require('../cad/webhookAuth');
  const { processDispatch }     = require('../cad/pipeline');

  test('1 department + 2 stations: each webhook routes to its house, both alert under the same dept', async () => {
    const { pool } = db;
    const MARK     = 'MULTIHSE-' + Date.now();
    let deptId, stationAId, stationBId, connAId, connBId;

    try {
      // ── Fixture ──────────────────────────────────────────────────────────────
      deptId     = (await pool.query('INSERT INTO departments (name) VALUES ($1) RETURNING id', [MARK + ' Fire'])).rows[0].id;
      stationAId = (await pool.query('INSERT INTO stations (name, department_id) VALUES ($1,$2) RETURNING id', [MARK + ' Station 1', deptId])).rows[0].id;
      stationBId = (await pool.query('INSERT INTO stations (name, department_id) VALUES ($1,$2) RETURNING id', [MARK + ' Station 2', deptId])).rows[0].id;

      // Each house gets its own CAD connection; the secret is returned once on create.
      const connA = await db.cadConnections.create({ name: MARK + ' feed-A', vendorId: 'generic', status: 'Active', station_id: stationAId }, deptId);
      const connB = await db.cadConnections.create({ name: MARK + ' feed-B', vendorId: 'generic', status: 'Active', station_id: stationBId }, deptId);
      connAId = connA.id;
      connBId = connB.id;

      // ── Webhook auth: each secret resolves to the right house + same dept ───
      const reqWith = (secret) => ({ headers: { 'x-cad-webhook-secret': secret }, query: {} });

      const authA = await verifyWebhookSecret(reqWith(connA.webhook_secret));
      assert.strictEqual(authA.ok, true, 'Station A secret authenticates');
      assert.strictEqual(Number(authA.connection.stationId),    Number(stationAId), 'Station A secret → station A');
      assert.strictEqual(Number(authA.connection.departmentId), Number(deptId),     'Station A secret → shared department');

      const authB = await verifyWebhookSecret(reqWith(connB.webhook_secret));
      assert.strictEqual(authB.ok, true, 'Station B secret authenticates');
      assert.strictEqual(Number(authB.connection.stationId),    Number(stationBId), 'Station B secret → station B');
      assert.strictEqual(Number(authB.connection.departmentId), Number(deptId),     'Station B secret → SAME shared department');

      // ── Dispatch routing: each alert lands on the right house, same dept ────
      const alertIdA = MARK + '-A';
      const alertIdB = MARK + '-B';

      const { alert: alertA, duplicate: dupA } = await processDispatch({
        alertId:      alertIdA,
        address:      '123 Main St',
        units:        'E1',
        description:  'STRUCTURE FIRE',
        details:      'Test A',
        stationId:    stationAId,
        departmentId: deptId,
        source:       'test',
      });

      const { alert: alertB, duplicate: dupB } = await processDispatch({
        alertId:      alertIdB,
        address:      '456 Oak Ave',
        units:        'E2',
        description:  'VEHICLE ACCIDENT',
        details:      'Test B',
        stationId:    stationBId,
        departmentId: deptId,
        source:       'test',
      });

      assert.strictEqual(dupA, false, 'Alert A is not a duplicate');
      assert.strictEqual(dupB, false, 'Alert B is not a duplicate');
      assert.ok(alertA, 'Alert A was created');
      assert.ok(alertB, 'Alert B was created');

      // Confirm DB storage: station-scoped, department-attributed.
      // cad_alerts uses snake_case alert_id (not camelCase "alertId") per lesson #11.
      const rowA = (await pool.query('SELECT station_id, department_id FROM cad_alerts WHERE alert_id = $1', [alertIdA])).rows[0];
      const rowB = (await pool.query('SELECT station_id, department_id FROM cad_alerts WHERE alert_id = $1', [alertIdB])).rows[0];

      assert.ok(rowA, 'cad_alerts row exists for alert A');
      assert.ok(rowB, 'cad_alerts row exists for alert B');
      assert.strictEqual(Number(rowA.station_id),    Number(stationAId), 'Alert A stored under station A');
      assert.strictEqual(Number(rowB.station_id),    Number(stationBId), 'Alert B stored under station B');
      assert.strictEqual(Number(rowA.department_id), Number(deptId),     'Alert A department = shared dept');
      assert.strictEqual(Number(rowB.department_id), Number(deptId),     'Alert B department = SAME shared dept');

    } finally {
      // Tear down in reverse-FK order.
      await pool.query('DELETE FROM cad_alerts WHERE alert_id = $1', [MARK + '-A']).catch(() => {});
      await pool.query('DELETE FROM cad_alerts WHERE alert_id = $1', [MARK + '-B']).catch(() => {});
      if (connAId)   await pool.query('DELETE FROM cad_connections WHERE id = $1', [connAId]).catch(() => {});
      if (connBId)   await pool.query('DELETE FROM cad_connections WHERE id = $1', [connBId]).catch(() => {});
      if (stationAId) await pool.query('DELETE FROM stations WHERE id = $1', [stationAId]).catch(() => {});
      if (stationBId) await pool.query('DELETE FROM stations WHERE id = $1', [stationBId]).catch(() => {});
      if (deptId)     await pool.query('DELETE FROM departments WHERE id = $1', [deptId]).catch(() => {});
      await pool.end().catch(() => {});
    }
  });
}
