'use strict';
/**
 * 4.1a-R.4b — auto-create a draft report when a call clears.
 * Spec: docs/PHASE4-1aR-CALL-INCIDENT-ASSOCIATION-2026-07-26.md
 *
 * This writes a LEGAL RECORD without a human in the loop, so the guards matter
 * more than the happy path. Cases 2 and 3 are the ones that keep it honest:
 * a scratch call must produce NOTHING, and a call must never mint twice.
 *
 * The deleted utils/cadPipeline.js had exactly this feature and its duplicate
 * guard FAILED OPEN — isAlreadyLinked caught its own error and returned false,
 * so "nothing is linked" was indistinguishable from "the query blew up."
 */

const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  console.log('[4.1a-R.4b] TENANCY_TEST_DB not set — skipping.');
  test('auto-create from cleared call', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('4.1a-R.4b — auto-create: scratch calls produce nothing, never mints twice, always attached', async () => {
    const { pool } = require('../db');
    const { autoCreateFromCall, RESULT } = require('../utils/autoCreateFromCall');
    const { peekNextIncidentNumber } = require('../utils/incidentNumber');
    const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

    const MARK = 'P4-AUTO';
    let A;

    async function cleanup() {
      try {
        await pool.query(`DELETE FROM unit_status_history WHERE designation LIKE '${MARK}%'`);
        await pool.query(`DELETE FROM cad_alerts WHERE alert_id LIKE '${MARK}%'`);
        await pool.query(`DELETE FROM incidents WHERE "incidentNumber" LIKE '%-%' AND department_id IN
                          (SELECT id FROM departments WHERE name LIKE '${MARK}%')`);
      } catch (_) { /* best effort */ }
    }
    // Dispatch is placed a minute in the past on purpose. The guard is a
    // dispatch->clear window, and NOW() for the alert vs NOW() for the unit
    // response landed 1ms apart — the test raced itself and passed or failed on
    // sub-millisecond ordering. Real calls dispatch before units respond; the
    // fixture should say so rather than depend on clock luck.
    async function mkAlert(run, dispatchedAt = "NOW() - INTERVAL '1 minute'") {
      const { rows } = await pool.query(
        `INSERT INTO cad_alerts (alert_id,address,units,description,dispatched_at,station_id,department_id)
         VALUES ($1,'1 Main St','E1, L1','REPORTED STRUCTURE FIRE',${dispatchedAt},$2,$2) RETURNING *`,
        [run, A]);
      return rows[0];
    }
    async function markResponded(designation) {
      await pool.query(
        `INSERT INTO unit_status_history (station_id,designation,status,changed_at,department_id)
         VALUES ($1,$2,'on_scene',NOW(),$1)`, [A, designation]);
    }

    try {
      await cleanup();
      A = await mkAlignedDeptStation(pool, MARK + '-A');

      // 1) ★ SCRATCH CALL — nobody turned out, so NO report. The market's own
      //    documented behaviour, and the difference between a records system and
      //    a system that manufactures paperwork.
      const scratch = await mkAlert(MARK + '-SCRATCH');
      const r1 = await autoCreateFromCall({ alertRow: scratch, departmentId: A });
      assert.equal(r1.result, RESULT.SCRATCH, 'a call nobody responded to must not mint a report');
      const noneMade = await pool.query(
        `SELECT count(*)::int AS n FROM incidents WHERE department_id=$1 AND deleted_at IS NULL`, [A]);
      assert.equal(noneMade.rows[0].n, 0, 'a scratch call must write NOTHING');

      // 2) HAPPY PATH — a unit went on scene, so a draft is minted AND attached.
      //    Order matters and mirrors reality: the call is dispatched FIRST, then
      //    units turn out. The guard is a dispatch->clear window, so a response
      //    recorded before its own dispatch is correctly not counted.
      const real = await mkAlert(MARK + '-RUN-1');
      await markResponded(MARK + '-E1');
      const expectedNumber = await peekNextIncidentNumber(A);
      const r2 = await autoCreateFromCall({ alertRow: real, departmentId: A });
      assert.equal(r2.result, RESULT.CREATED);
      assert.equal(r2.incidentNumber, expectedNumber, 'must use the department scheme the officer sees');

      const made = await pool.query(
        `SELECT id, type, notes, address, cad_run_number FROM incidents WHERE id=$1`, [r2.incidentId]);
      const inc = made.rows[0];
      assert.equal(inc.cad_run_number, MARK + '-RUN-1', 'the draft must be ATTACHED to its call');
      assert.equal(inc.address, '1 Main St', "CAD's address carries over");

      // 3) THE NARRATIVE IS NEVER WRITTEN BY MACHINE. Doctrine 2026-06-10.
      assert.equal(inc.notes || '', '', 'notes is the subpoenable narrative — it stays EMPTY');

      // 4) THE TYPE IS NOT INVENTED. CAD said "REPORTED STRUCTURE FIRE"; we do
      //    NOT classify that into 'Structure Fire' — a machine must not decide a
      //    reportable type. 'Other' is visibly unfinished, which is honest.
      assert.equal(inc.type, 'Other', 'the incident type must not be inferred from CAD text');

      // 5) The reverse edge landed too — both or neither.
      const back = await pool.query(
        `SELECT incident_id FROM cad_alerts WHERE alert_id=$1`, [MARK + '-RUN-1']);
      assert.equal(back.rows[0].incident_id, r2.incidentId);

      // 6) ★ NEVER TWICE — the guard that failed OPEN in the deleted module.
      const reread = (await pool.query(
        `SELECT * FROM cad_alerts WHERE alert_id=$1`, [MARK + '-RUN-1'])).rows[0];
      const r3 = await autoCreateFromCall({ alertRow: reread, departmentId: A });
      assert.equal(r3.result, RESULT.ALREADY_LINKED, 'a re-processed call must not mint a second report');
      const count = await pool.query(
        `SELECT count(*)::int AS n FROM incidents WHERE department_id=$1 AND deleted_at IS NULL`, [A]);
      assert.equal(count.rows[0].n, 1, 'exactly ONE report exists for one call');

      // 7) Numbers advance rather than collide. Note this call needs its OWN
      //    response — the first call's response does not carry over, because the
      //    guard is a per-call dispatch->clear window. (This assertion failed
      //    until the response was added, which is the window proving it works.)
      const second = await mkAlert(MARK + '-RUN-2');
      await markResponded(MARK + '-E2');
      const r4 = await autoCreateFromCall({ alertRow: second, departmentId: A });
      assert.equal(r4.result, RESULT.CREATED);
      assert.notEqual(r4.incidentNumber, r2.incidentNumber, 'a second call gets a NEW number');

      // 8) A missing alert row is refused, not guessed at.
      assert.equal((await autoCreateFromCall({ alertRow: null, departmentId: A })).result, RESULT.NO_ALERT);
    } finally {
      await cleanup();
      try { await pool.end(); } catch { /* already closed */ }
    }
  });
}
