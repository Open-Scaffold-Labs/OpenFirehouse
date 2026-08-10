'use strict';
/**
 * permitExpiryJob.test.js — the expiry job against a REAL database (Phase 3, module 3.1b).
 *
 * utils/permitLadder.test.js already pins the arithmetic. This suite proves the things only
 * a database can prove, and every one of them is a way the job could quietly corrupt a
 * legal record:
 *
 *   1. CROSS-TENANT — running for department A must not touch department B's permits,
 *      and B must not see A's ledger rows.
 *   2. THE LEDGER IS PHYSICALLY APPEND-ONLY — of_app cannot UPDATE or DELETE a run row.
 *      A ledger that can be rewritten cannot answer "did this job actually run".
 *   3. NO TIMER TOUCHES A TERMINAL STATUS — a Revoked permit is left exactly as it is.
 *   4. NO TERMS ⇒ NO WRITE, AND A VISIBLE COUNT — a permit issued before the catalogue
 *      existed is skipped rather than guessed at, and the count is recorded so a human
 *      sees it. Prod holds four of these today.
 *   5. IDEMPOTENT — a second run on the same day writes nothing and transitions nothing.
 *   6. THE R7 SNAPSHOT IS UNTOUCHED — the job moves status and nothing else.
 *   7. CONTROL — the ordinary transition DOES happen. Without this, every refusal above
 *      would be satisfied by a job that does nothing at all.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[permitExpiryJob] TENANCY_TEST_DB not set — skipping.');
  test('permit expiry job (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('permit expiry job: tenancy, append-only ledger, and every refusal', async (t) => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => {
      const tmr = realSetInterval(...args);
      if (tmr && typeof tmr.unref === 'function') tmr.unref();
      return tmr;
    };

    const db = require('../db');
    const { pool } = db;
    const { runPermitExpiry } = require('../jobs/permitExpiry');

    const MARK = `PXJ-${Date.now()}`;
    let A, B, propA, propB;   // A and B are ALIGNED ids: mkAlignedDeptStation returns ONE id used as both department_id and station_id (read the helper — I assumed a {departmentId, stationId} shape and the control test caught it)

    // ⚠ Register teardown FIRST, before any fixture that can throw — a setup failure used to
    // leave the pool open and hang the suite forever under --test-timeout=0.
    t.after(async () => {
      global.setInterval = realSetInterval;
      try {
        await pool.query(`DELETE FROM fi_job_runs WHERE department_id IN
                            (SELECT id FROM departments WHERE name LIKE $1)`, [`${MARK}%`]);
        await pool.query(`DELETE FROM audit_log WHERE table_name = 'fi_permits'
                            AND department_id IN (SELECT id FROM departments WHERE name LIKE $1)`,
                         [`${MARK}%`]);
        await pool.query(`DELETE FROM fi_permits WHERE type LIKE $1`, [`${MARK}%`]);
        await pool.query(`DELETE FROM fi_properties WHERE name LIKE $1`, [`${MARK}%`]);
        await pool.query(`DELETE FROM departments WHERE name LIKE $1`, [`${MARK}%`]);
      } catch { /* best effort */ }
      try { await pool.end(); } catch { /* already closed */ }
    });

    A = await mkAlignedDeptStation(pool, `${MARK}-A`);
    B = await mkAlignedDeptStation(pool, `${MARK}-B`);

    const mkProp = async (dept, station) => {
      const { rows } = await pool.query(
        `INSERT INTO fi_properties (department_id, station_id, name, address)
         VALUES ($1,$2,$3,'1 Test St') RETURNING id`,
        [dept, station, `${MARK} prop`]
      );
      return rows[0].id;
    };
    propA = await mkProp(A, A);
    propB = await mkProp(B, B);

    // A permit with a full term snapshot: term ends 2026-06-30, 30-day notice, 14-day grace.
    const mkPermit = async (dept, station, prop, over = {}) => {
      const p = {
        status: 'Active', expiresDate: '2026-06-30',
        notice: 30, grace: 14, ...over,
      };
      const { rows } = await pool.query(
        `INSERT INTO fi_permits
           (department_id, station_id, "propertyId", type, status, "expiresDate",
            term_value, term_unit, notice_window_days, grace_days)
         VALUES ($1,$2,$3,$4,$5,$6,1,'year',$7,$8) RETURNING id`,
        [dept, station, prop, `${MARK} type`, p.status, p.expiresDate, p.notice, p.grace]
      );
      return rows[0].id;
    };

    const statusOf = async (id) => (await pool.query(
      'SELECT status FROM fi_permits WHERE id = $1', [id])).rows[0].status;

    // ── 7 (CONTROL first, so a vacuous job is caught before anything else) ──────────────
    const ctrl = await mkPermit(A, A, propA);
    await runPermitExpiry({ today: '2026-07-01', departmentIds: [A] });
    assert.equal(await statusOf(ctrl), 'Delinquent',
      'CONTROL: the ordinary forward transition must happen, or every refusal below is vacuous');

    // ── 1 CROSS-TENANT ─────────────────────────────────────────────────────────────────
    const otherDept = await mkPermit(B, B, propB);
    await runPermitExpiry({ today: '2026-08-01', departmentIds: [A] });
    assert.equal(await statusOf(otherDept), 'Active',
      'running for department A must not touch department B');

    // ── 3 NO TIMER TOUCHES A TERMINAL STATUS ───────────────────────────────────────────
    const revoked = await mkPermit(A, A, propA, { status: 'Revoked' });
    await runPermitExpiry({ today: '2027-01-01', departmentIds: [A] });
    assert.equal(await statusOf(revoked), 'Revoked',
      'a revoked permit is a human act — no timer may ever move it');

    // ── 4 NO TERMS ⇒ NO WRITE, AND THE COUNT IS VISIBLE ────────────────────────────────
    const { rows: [legacy] } = await pool.query(
      `INSERT INTO fi_permits (department_id, station_id, "propertyId", type, status, "expiresDate")
       VALUES ($1,$2,$3,$4,'Active','2026-04-01') RETURNING id`,
      [A, A, propA, `${MARK} type`]
    );
    const res = await runPermitExpiry({ today: '2026-08-01', departmentIds: [A] });
    assert.equal(await statusOf(legacy.id), 'Active',
      'a permit with no term snapshot must be LEFT ALONE, never guessed at');
    const deptResult = res.departments.find((d) => d.departmentId === A);
    assert.ok(deptResult.skippedNoTerms >= 1,
      'and it must be COUNTED — an invisible skip is how four prod permits fall out of the ladder forever');

    // ── 5 IDEMPOTENT ───────────────────────────────────────────────────────────────────
    const again = await runPermitExpiry({ today: '2026-08-01', departmentIds: [A] });
    assert.equal(again.departments.find((d) => d.departmentId === A).transitioned, 0,
      'a second run on the same day must transition nothing');

    // ── 6 THE R7 SNAPSHOT IS UNTOUCHED ─────────────────────────────────────────────────
    const { rows: [snap] } = await pool.query(
      `SELECT term_value, term_unit, notice_window_days, grace_days FROM fi_permits WHERE id = $1`,
      [ctrl]
    );
    assert.deepEqual(
      { t: snap.term_value, u: snap.term_unit, n: snap.notice_window_days, g: snap.grace_days },
      { t: 1, u: 'year', n: 30, g: 14 },
      'the job moves status and NOTHING else — the snapshot is what the permit was issued under');

    // ── 2 THE LEDGER IS PHYSICALLY APPEND-ONLY ─────────────────────────────────────────
    const { rows: [run] } = await pool.query(
      `SELECT id, outcome, examined FROM fi_job_runs
        WHERE department_id = $1 ORDER BY id DESC LIMIT 1`, [A]);
    assert.ok(run, 'a successful run must leave exactly one ledger row per department');

    const hasOfApp = (await pool.query(
      `SELECT 1 FROM pg_roles WHERE rolname = 'of_app'`)).rowCount > 0;
    if (hasOfApp) {
      // 🔴 A PINNED CLIENT, NOT pool.query — AND THIS IS NOT A STYLE CHOICE.
      // `pool.query` checks a connection out per call, so `SET LOCAL ROLE of_app` applies
      // only to whichever connection happened to run it. The first draft of this test used
      // pool.query throughout: the UPDATE landed on the role-switched connection and was
      // correctly refused, then the DELETE landed on a DIFFERENT connection still running as
      // the superuser — it succeeded, and it really deleted the row. The test reported
      // "missing expected rejection" and the grant was fine all along.
      //
      // A POOLED QUERY IS NOT A SESSION. Any probe that depends on session state (SET ROLE,
      // SET LOCAL, a GUC, a transaction) must hold ONE client for the whole probe. The prod
      // probes for 0093/0094 were sound only because they ran as a single DO block, i.e. one
      // statement on one connection — luck of the shape, not of the design.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE of_app');
        await client.query(`SELECT set_config('app.department_id', $1, true)`, [String(A)]);

        // Prove the REFUSALS and the CONTROL in the same breath: of_app may append but may
        // not rewrite. Without the insert control, the refusals could just mean a broken
        // grant on a table nobody can write at all.
        await assert.rejects(
          () => client.query(`UPDATE fi_job_runs SET outcome = 'success' WHERE id = $1`, [run.id]),
          (e) => e.code === '42501',
          'of_app must NOT be able to rewrite a run row');
        await client.query('ROLLBACK');   // the failed statement poisoned the txn — reset

        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE of_app');
        await client.query(`SELECT set_config('app.department_id', $1, true)`, [String(A)]);
        await assert.rejects(
          () => client.query(`DELETE FROM fi_job_runs WHERE id = $1`, [run.id]),
          (e) => e.code === '42501',
          'of_app must NOT be able to delete a run row');
        await client.query('ROLLBACK');

        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE of_app');
        await client.query(`SELECT set_config('app.department_id', $1, true)`, [String(A)]);
        const ins = await client.query(
          `INSERT INTO fi_job_runs (department_id, job_name, started_at, outcome, evaluated_for)
           VALUES ($1,'permit_expiry',NOW(),'success','2026-08-01') RETURNING id`,
          [A]);
        assert.ok(ins.rows[0].id, 'CONTROL: of_app MUST still be able to append a run row');
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } else {
      console.log('[permitExpiryJob] of_app role absent locally — append-only grants proved on prod instead');
    }

    // ── 1b CROSS-TENANT ON THE LEDGER ITSELF ───────────────────────────────────────────
    const { rows: bRuns } = await pool.query(
      'SELECT id FROM fi_job_runs WHERE department_id = $1', [B]);
    assert.equal(bRuns.length, 0,
      'department B was never run for — it must have no ledger rows');
  });
}
