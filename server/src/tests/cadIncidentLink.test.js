'use strict';
/**
 * Phase 4.1a — the call -> incident link (migration 0100).
 * Spec: docs/PHASE4-ANALYTICS-SPEC-2026-07-26.md §4.3, §9.
 *
 * WHAT BROKE, AND WHY THIS FILE EXISTS
 * cad/pipeline.js processStatusUpdate resolved a status event's incident with
 *   SELECT incident_id FROM cad_alerts WHERE alert_id = $1 AND station_id = $2
 * against a column that had never been created — absent from prod, from every
 * migration 0000-0099, and from db.js DDL. It threw 42703 on EVERY call, inside
 * `catch (_) { /* incident link is optional *\/ }`. So incidentId was always null,
 * silently, from 2026-07-14 until 0100 on 2026-07-26. 163 of 175
 * unit_status_history rows on prod are unattributed as a result, and no per-call
 * turnout or travel time can be computed for them.
 *
 * Every case below could actually fail (lesson #29). Cases 1 and 4 in particular
 * FAIL against pre-0100 code — 1 because the column does not exist, 4 because the
 * writer does not exist. A test that cannot fail verifies nothing.
 *
 * Part A (always runs): the no-guess decision, pure.
 * Part B (opt-in via TENANCY_TEST_DB): the column, the FK, the writer, tenancy.
 */

const { test } = require('node:test');
const assert = require('node:assert');

// NOTE: the Part A `decideLink` cases and the Part B writer cases (3-6) were
// REMOVED 2026-07-26 when the Command Board writer was reverted. They asserted a
// "pick the one open call" heuristic that is the wrong architecture: the market
// keys this association on the CAD DISPATCH/RUN NUMBER, which is unique, so
// concurrent calls are not ambiguous at all. What remains below is what is still
// true and still load-bearing — the column, the FK, and the exact statement
// cad/pipeline.js runs.

// ── Part B — live DB ────────────────────────────────────────────────────────
const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[cadIncidentLink] TENANCY_TEST_DB not set — skipping live-DB 0100 suite.');
  test('0100 live-DB suite', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('0100 — column exists, the pipeline statement runs, FK refuses a bogus incident id', async () => {
    const { pool } = require('../db');
    const db = require('../db');
    const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

    const MARK = 'P4-0100';
    let A, B;

    async function cleanup() {
      try {
        await pool.query(`DELETE FROM cad_alerts WHERE alert_id LIKE $1`, [MARK + '%']);
        await pool.query(`DELETE FROM incidents WHERE "incidentNumber" LIKE $1`, [MARK + '%']);
      } catch (_) { /* best effort */ }
    }

    try {
      await cleanup();
      // dept.id == station.id by construction (the 0004 mirror-station shape).
      A = await mkAlignedDeptStation(pool, MARK + '-A');
      B = await mkAlignedDeptStation(pool, MARK + '-B');

      // 1) THE COLUMN EXISTS. Fails with 42703 against pre-0100 schema.
      const col = await pool.query(
        `SELECT data_type FROM information_schema.columns
          WHERE table_schema='public' AND table_name='cad_alerts' AND column_name='incident_id'`
      );
      assert.equal(col.rows.length, 1, 'cad_alerts.incident_id must exist (migration 0100)');
      assert.equal(col.rows[0].data_type, 'integer');

      // The exact statement processStatusUpdate runs must not throw.
      await pool.query(
        'SELECT incident_id FROM cad_alerts WHERE alert_id = $1 AND station_id = $2 ORDER BY id DESC LIMIT 1',
        [MARK + '-probe', A]
      );

      // A real incident to link to.
      const inc = await pool.query(
        `INSERT INTO incidents ("incidentNumber", date, type, department_id, station_id)
         VALUES ($1, '2026-07-26', 'Structure Fire', $2, $3) RETURNING id`,
        [MARK + '-INC-A', A, A]
      );
      const incidentIdA = inc.rows[0].id;

      // 2) FK REFUSES a bogus incident id (23503).
      const openA = await pool.query(
        `INSERT INTO cad_alerts (alert_id, address, units, dispatched_at, station_id, department_id)
         VALUES ($1,'1 Test St','E1',NOW(),$2,$3) RETURNING id`,
        [MARK + '-A1', A, A]
      );
      await assert.rejects(
        () => pool.query('UPDATE cad_alerts SET incident_id = $1 WHERE id = $2', [99999999, openA.rows[0].id]),
        (e) => e.code === '23503',
        'a non-existent incident id must be refused by the FK'
      );

      // Cases 3-6 (the writer, ambiguity, cross-tenant, no-open-call) were removed
      // with the reverted heuristic writer. They will return, keyed on the CAD run
      // number, when the association is rebuilt at incident-creation time.
    } finally {
      await cleanup();
      // House convention (checks.test.js:314): release the pool or node --test
      // never flushes its summary — the event loop stays alive on the pg client.
      try { await pool.end(); } catch { /* already closed */ }
    }
  });
}
