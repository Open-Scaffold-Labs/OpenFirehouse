'use strict';
/**
 * 4.1a-R — the call -> incident association, keyed on the CAD run number.
 * Spec: docs/PHASE4-1aR-CALL-INCIDENT-ASSOCIATION-2026-07-26.md §6.
 * Migrations: 0100 (cad_alerts.incident_id), 0103 (incidents.cad_run_number).
 *
 * Case 2 is the whole point of the rebuild: TWO CONCURRENT OPEN CALLS, each
 * binding to its own incident. The reverted 4.1a heuristic ("the one open call")
 * could not do this at all — it refused, silently. Under the run-number key it is
 * not even ambiguous.
 *
 * Case 8 is a structural guard, not a data test: it greps the Command Board route
 * for a linkage write. D2 — "the board reflects, it never activates" — has to be
 * mechanical, because a comment does not survive the next session.
 *
 * Every case can fail.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// ── Structural: no tactical surface may write the association (D2) ───────────
test('4.1aR-8 — the Command Board contains NO linkage write (D2, mechanical)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'activeBoard.js'), 'utf8');
  // Strip comments so the explanatory note about the revert cannot mask a real one.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of [
    'associateCallToIncident',
    'linkIncident',
    'cad_run_number',
    'SET incident_id',
  ]) {
    assert.ok(
      !code.includes(forbidden),
      `routes/activeBoard.js must not write the call association — found "${forbidden}". ` +
      'The Command Board reflects state; it never activates it (Matt, 2026-07-26).'
    );
  }
});

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[4.1a-R] TENANCY_TEST_DB not set — skipping live-DB suite.');
  test('4.1a-R live-DB suite', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('4.1a-R — run-number association: concurrent calls, atomicity, no guessing, tenancy', async () => {
    const { pool } = require('../db');
    const { associateCallToIncident, ASSOCIATION_RESULT: R } = require('../utils/callAssociation');
    const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

    const MARK = 'P4-41aR';
    let A, B;

    async function cleanup() {
      try {
        await pool.query(`DELETE FROM cad_alerts WHERE alert_id LIKE $1`, [MARK + '%']);
        await pool.query(`DELETE FROM incidents WHERE "incidentNumber" LIKE $1`, [MARK + '%']);
      } catch (_) { /* best effort */ }
    }
    async function mkAlert(dept, run) {
      const { rows } = await pool.query(
        `INSERT INTO cad_alerts (alert_id, address, units, dispatched_at, station_id, department_id)
         VALUES ($1,'1 Main St','E1',NOW(),$2,$2) RETURNING id`, [run, dept]);
      return rows[0].id;
    }
    async function mkIncident(dept, num) {
      const { rows } = await pool.query(
        `INSERT INTO incidents ("incidentNumber",date,type,department_id,station_id)
         VALUES ($1,'2026-07-26','Structure Fire',$2,$2) RETURNING id`, [num, dept]);
      return rows[0].id;
    }

    try {
      await cleanup();
      A = await mkAlignedDeptStation(pool, MARK + '-A');
      B = await mkAlignedDeptStation(pool, MARK + '-B');

      // 1) HAPPY PATH — and read BOTH edges back. A return value is not persistence.
      const run1 = MARK + '-RUN-1';
      const a1 = await mkAlert(A, run1);
      const i1 = await mkIncident(A, MARK + '-INC-1');
      const r1 = await associateCallToIncident(A, i1, run1);
      assert.equal(r1.result, R.LINKED);
      const back = await pool.query(
        `SELECT (SELECT cad_run_number FROM incidents WHERE id=$1) AS run,
                (SELECT incident_id FROM cad_alerts WHERE id=$2) AS inc`, [i1, a1]);
      assert.equal(back.rows[0].run, run1, 'incident edge must persist');
      assert.equal(back.rows[0].inc, i1, 'alert edge must persist');

      // 2) ★ TWO CONCURRENT OPEN CALLS — impossible under the reverted heuristic.
      const run2 = MARK + '-RUN-2', run3 = MARK + '-RUN-3';
      const a2 = await mkAlert(A, run2);
      const a3 = await mkAlert(A, run3);
      const i2 = await mkIncident(A, MARK + '-INC-2');
      const i3 = await mkIncident(A, MARK + '-INC-3');
      assert.equal((await associateCallToIncident(A, i2, run2)).result, R.LINKED);
      assert.equal((await associateCallToIncident(A, i3, run3)).result, R.LINKED);
      const pair = await pool.query(
        `SELECT id, incident_id FROM cad_alerts WHERE id = ANY($1::int[]) ORDER BY id`, [[a2, a3]]);
      assert.equal(pair.rows[0].incident_id, i2, 'call 2 -> incident 2');
      assert.equal(pair.rows[1].incident_id, i3, 'call 3 -> incident 3, no cross-attribution');

      // 3) UNKNOWN RUN NUMBER — nothing written, no guess.
      const i4 = await mkIncident(A, MARK + '-INC-4');
      const r4 = await associateCallToIncident(A, i4, MARK + '-NOPE');
      assert.equal(r4.result, R.NOT_FOUND);
      const untouched = await pool.query(
        `SELECT cad_run_number FROM incidents WHERE id=$1`, [i4]);
      assert.equal(untouched.rows[0].cad_run_number, null, 'a miss must write NOTHING');

      // 4) IDEMPOTENT — replay is a no-op success, not a duplicate or an error.
      assert.equal((await associateCallToIncident(A, i1, run1)).result, R.ALREADY);

      // 5) NO SILENT RE-POINT — incident already bound to a different call.
      const runX = MARK + '-RUN-X';
      await mkAlert(A, runX);
      const r5 = await associateCallToIncident(A, i1, runX);
      assert.equal(r5.result, R.CONFLICT, 're-pointing must be refused, not overwritten');
      const stillRun1 = await pool.query(
        `SELECT cad_run_number FROM incidents WHERE id=$1`, [i1]);
      assert.equal(stillRun1.rows[0].cad_run_number, run1, 'the original binding must survive');

      // 6) ATOMICITY — a refused incident edge must not let the alert edge land.
      const alertX = await pool.query(
        `SELECT incident_id FROM cad_alerts WHERE alert_id=$1`, [runX]);
      assert.equal(alertX.rows[0].incident_id, null,
        'BOTH EDGES OR NEITHER — the alert edge must not survive a refused incident edge');

      // 7) CROSS-TENANT — dept B cannot bind dept A's call, even with the run number.
      const iB = await mkIncident(B, MARK + '-INC-B');
      assert.equal((await associateCallToIncident(B, iB, run1)).result, R.NOT_FOUND,
        "dept B must not resolve dept A's run number");
      // ...and dept B cannot touch dept A's incident either.
      assert.equal((await associateCallToIncident(B, i1, run1)).result, R.NO_INCIDENT);

      // 9) SAME RUN NUMBER IN TWO DEPARTMENTS — each binds independently (0104).
      const shared = MARK + '-SHARED';
      await mkAlert(A, shared);
      await mkAlert(B, shared);
      const iA2 = await mkIncident(A, MARK + '-INC-A2');
      const iB2 = await mkIncident(B, MARK + '-INC-B2');
      assert.equal((await associateCallToIncident(A, iA2, shared)).result, R.LINKED);
      assert.equal((await associateCallToIncident(B, iB2, shared)).result, R.LINKED);

      // 10) SOFT-DELETED incident is not associable.
      const iDel = await mkIncident(A, MARK + '-INC-DEL');
      await pool.query(`UPDATE incidents SET deleted_at=NOW() WHERE id=$1`, [iDel]);
      const runDel = MARK + '-RUN-DEL';
      await mkAlert(A, runDel);
      assert.equal((await associateCallToIncident(A, iDel, runDel)).result, R.NO_INCIDENT);

      // 12) SELECTABLE-CALLS reader — the picker's source.
      //     Must include CLEARED calls (reports are written after the call clears,
      //     which is exactly when the active feed would be empty) and must return
      //     already-linked calls carrying their incident number, not hide them.
      const runSel = MARK + '-SEL';
      const aSel = await mkAlert(A, runSel);
      await pool.query(`UPDATE cad_alerts SET cleared_at = NOW() WHERE id = $1`, [aSel]);
      const sel = await require('../db').cadAlerts.selectable(A, { days: 7, limit: 100 });
      const found = sel.find((r) => r.alert_id === runSel);
      assert.ok(found, 'a CLEARED call must still be selectable — the active feed is not the picker source');

      const linkedRow = sel.find((r) => r.alert_id === run1);
      assert.ok(linkedRow, 'an already-linked call must be RETURNED, not filtered away');
      assert.equal(linkedRow.incident_id, i1);
      assert.ok(linkedRow.incident_number, 'it must carry the incident number so the picker can say WHY it is unavailable');

      // 13) Cross-tenant: dept B's picker never sees dept A's calls.
      const selB = await require('../db').cadAlerts.selectable(B, { days: 7, limit: 100 });
      assert.ok(!selB.some((r) => r.alert_id === runSel),
        "dept B's picker must not see dept A's calls");

      // 11) Empty / garbage run number never writes.
      assert.equal((await associateCallToIncident(A, i4, '   ')).result, R.NOT_FOUND);
      assert.equal((await associateCallToIncident(A, i4, null)).result, R.NOT_FOUND);
    } finally {
      await cleanup();
      try { await pool.end(); } catch { /* already closed */ }
    }
  });
}
