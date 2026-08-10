'use strict';
/**
 * 0104 — tenant-scoped unique keys. Cross-tenant collision fix.
 *
 * THE DEFECT (found 2026-07-26 by sweeping all 23 unique keys on tables carrying
 * department_id): two tenant tables held a GLOBAL unique key on a value every
 * department namespaces for itself.
 *
 *   cad_alerts  UNIQUE (alert_id)         -- CAD dispatch/run number
 *   hydrants    UNIQUE ("hydrantNumber")  -- prod holds H-001..H-006, DH-001
 *
 * The second department to be dispatched run number 2026-000123, or to add its
 * own H-001, was refused with 23505 — for cad_alerts, a DROPPED DISPATCH caused
 * by another tenant's data. Latent only because prod has one real department and
 * every alert is synthetic. It fires on the second paying customer.
 *
 * Same defect class OF already fixed once for incidents.incidentNumber (db.js:
 * "The old global UNIQUE ... wrongly blocked two departments from sharing a
 * number"). 0104 applies that pattern to the two tables that still had it.
 *
 * Cases 1 and 3 FAIL against the pre-0104 schema — that is the point.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[0104] TENANCY_TEST_DB not set — skipping.');
  test('0104 tenant-scoped unique keys', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('0104 — two departments may share a CAD run number and a hydrant number; intra-dept dedupe survives', async () => {
    const { pool } = require('../db');
    const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

    const MARK = 'P4-0104';
    let A, B;

    async function cleanup() {
      try {
        await pool.query(`DELETE FROM cad_alerts WHERE alert_id LIKE $1`, [MARK + '%']);
        await pool.query(`DELETE FROM hydrants WHERE "hydrantNumber" LIKE $1`, [MARK + '%']);
      } catch (_) { /* best effort */ }
    }

    try {
      await cleanup();
      A = await mkAlignedDeptStation(pool, MARK + '-A');
      B = await mkAlignedDeptStation(pool, MARK + '-B');

      const RUN = MARK + '-RUN-000123';
      const HYD = MARK + '-H-001';

      // 1) THE SCENARIO THAT WAS BROKEN — two departments, same run number.
      //    Fails 23505 against the pre-0104 global UNIQUE (alert_id).
      await pool.query(
        `INSERT INTO cad_alerts (alert_id, address, units, dispatched_at, station_id, department_id)
         VALUES ($1,'1 Main St','E1',NOW(),$2,$2)`, [RUN, A]);
      await pool.query(
        `INSERT INTO cad_alerts (alert_id, address, units, dispatched_at, station_id, department_id)
         VALUES ($1,'9 Other Rd','E9',NOW(),$2,$2)`, [RUN, B]);
      const both = await pool.query(
        `SELECT count(*)::int AS n FROM cad_alerts WHERE alert_id = $1`, [RUN]);
      assert.equal(both.rows[0].n, 2, 'two departments must each hold the same run number');

      // 2) Intra-department dedupe MUST survive — this is what stops a replayed
      //    CAD webhook from double-dispatching.
      await assert.rejects(
        () => pool.query(
          `INSERT INTO cad_alerts (alert_id, address, units, dispatched_at, station_id, department_id)
           VALUES ($1,'dupe','E1',NOW(),$2,$2)`, [RUN, A]),
        (e) => e.code === '23505',
        'the SAME department must still be refused a duplicate run number'
      );

      // 3) Same, for hydrants. Every municipality numbers from 1.
      await pool.query(
        `INSERT INTO hydrants ("hydrantNumber","streetAddress",station_id,department_id)
         VALUES ($1,'1 Main St',$2,$2)`, [HYD, A]);
      await pool.query(
        `INSERT INTO hydrants ("hydrantNumber","streetAddress",station_id,department_id)
         VALUES ($1,'9 Other Rd',$2,$2)`, [HYD, B]);
      const hyd = await pool.query(
        `SELECT count(*)::int AS n FROM hydrants WHERE "hydrantNumber" = $1`, [HYD]);
      assert.equal(hyd.rows[0].n, 2, 'two departments must each hold the same hydrant number');

      // 4) Intra-department hydrant dedupe survives.
      await assert.rejects(
        () => pool.query(
          `INSERT INTO hydrants ("hydrantNumber","streetAddress",station_id,department_id)
           VALUES ($1,'dupe',$2,$2)`, [HYD, A]),
        (e) => e.code === '23505',
        'the SAME department must still be refused a duplicate hydrant number'
      );

      // 5) THE REAL STATEMENT SHAPE — cadAlertCreate omits department_id and
      //    relies on the BEFORE INSERT trigger trg_sync_department_id. BEFORE
      //    triggers run ahead of the uniqueness check, so the conflict target
      //    (department_id, alert_id) resolves. If this ever regresses the CAD
      //    webhook fails 42P10 on every call.
      const RUN2 = MARK + '-TRIGGER';
      await pool.query(
        `INSERT INTO cad_alerts (alert_id, address, units, dispatched_at, station_id)
         VALUES ($1,'1 Main St','E1',NOW(),$2)
         ON CONFLICT (department_id, alert_id) DO NOTHING`, [RUN2, A]);
      const stamped = await pool.query(
        `SELECT department_id FROM cad_alerts WHERE alert_id = $1`, [RUN2]);
      assert.equal(stamped.rows.length, 1, 'the trigger-populated insert must land');
      assert.ok(stamped.rows[0].department_id != null, 'trigger must populate department_id');

      const replay = await pool.query(
        `INSERT INTO cad_alerts (alert_id, address, units, dispatched_at, station_id)
         VALUES ($1,'1 Main St','E1',NOW(),$2)
         ON CONFLICT (department_id, alert_id) DO NOTHING`, [RUN2, A]);
      assert.equal(replay.rowCount, 0, 'a replayed CAD alert must dedupe — no double-dispatch');
    } finally {
      await cleanup();
      try { await pool.end(); } catch { /* already closed */ }
    }
  });
}
