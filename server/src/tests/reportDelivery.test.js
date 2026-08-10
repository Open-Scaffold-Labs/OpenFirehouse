'use strict';
/**
 * Scheduled delivery — the guards, exercised against the real prod-shaped schema.
 *
 * Skips clean without TENANCY_TEST_DB, like every other DB-backed suite here.
 *
 * What these prove is narrow and deliberate: the double-send guard is a database
 * predicate, not an if-statement, and the closed sets are enforced by Postgres
 * rather than by hope. The period arithmetic is covered purely in
 * utils/reportPeriod.test.js — this file is about what happens when two
 * invocations race, which is the failure no unit test can reach.
 */
const assert = require('assert');
const { test, before, after } = require('node:test');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const DSN = process.env.TENANCY_TEST_DB;
const maybe = DSN ? test : test.skip;

let pool;
let deptId;

before(async () => {
  if (!DSN) return;
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: DSN });

  // A REAL department row, so report_schedules' FKs are satisfied.
  //
  // This file used to do two things that made it pass only where the schema was
  // absent, and it went undetected because CI ran no tests for 207 runs:
  //
  //   1. It declared its OWN `CREATE TABLE IF NOT EXISTS report_schedules` with
  //      NO foreign keys, no RLS, no dept_isolation policy and no of_app grants —
  //      a second definition of a production table. Where migration 0105 had
  //      already created the real one (i.e. anywhere current), the IF NOT EXISTS
  //      made it a silent no-op; where it hadn't, the test got an FK-free table
  //      and invented ids were fine. Deleted: a divergent copy of a prod table
  //      inside the test tree masks exactly the drift this suite exists to catch.
  //   2. It invented `deptId = 900000 + random()`, which violates
  //      report_schedules_department_id_fkey -> departments(id). That is what
  //      failed CI here: 6 tests, all 23503.
  //
  // mkAlignedDeptStation creates a department + mirror station with the same
  // explicit id and bumps both sequences, which also avoids the run-to-run
  // sequence-alignment luck documented in that helper (anti-pattern #36).
  deptId = await mkAlignedDeptStation(pool, `reportDelivery test ${Date.now()}`);
});

after(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM report_schedules WHERE department_id = $1', [deptId]);
  // departments -> report_schedules is ON DELETE CASCADE, so the delete above is
  // belt-and-braces; the station must go before the department (FK direction).
  await pool.query('DELETE FROM stations WHERE id = $1', [deptId]);
  await pool.query('DELETE FROM departments WHERE id = $1', [deptId]);
  await pool.end();
});

async function mkSchedule(overrides = {}) {
  const { rows } = await pool.query(
    `INSERT INTO report_schedules (department_id, report_key, cadence, recipients, last_period_key)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [deptId,
      overrides.report_key ?? 'response_compliance',
      overrides.cadence ?? 'monthly',
      overrides.recipients ?? ['chief@example.test'],
      overrides.last_period_key ?? null]
  );
  return rows[0];
}

// The claim statement, verbatim from cronReportDelivery.js. If that statement
// changes, this test must change with it — which is the point.
function claim(id, periodKey) {
  return pool.query(
    `UPDATE report_schedules
        SET last_period_key = $1, last_run_at = NOW(), updated_at = NOW()
      WHERE id = $2 AND department_id = $3
        AND last_period_key IS DISTINCT FROM $1
      RETURNING id`,
    [periodKey, id, deptId]
  );
}

// ── THE DOUBLE-SEND GUARD ──────────────────────────────────────────────────
maybe('the first claim of a period wins and the second gets nothing', async () => {
  const s = await mkSchedule();
  const first = await claim(s.id, '2026-06');
  const second = await claim(s.id, '2026-06');
  assert.strictEqual(first.rowCount, 1, 'the first run must take the work');
  assert.strictEqual(second.rowCount, 0, 'a retry must NOT re-send the same period');
});

maybe('a never-sent schedule claims cleanly (NULL is DISTINCT FROM a key)', async () => {
  // IS DISTINCT FROM, not <>: `NULL <> '2026-06'` is NULL, not true, so a plain
  // inequality would never match a schedule that had never been sent — every
  // first delivery would be skipped forever.
  const s = await mkSchedule({ last_period_key: null });
  const r = await claim(s.id, '2026-06');
  assert.strictEqual(r.rowCount, 1);
});

maybe('a NEW period is claimable after the previous one was delivered', async () => {
  const s = await mkSchedule({ last_period_key: '2026-05' });
  assert.strictEqual((await claim(s.id, '2026-06')).rowCount, 1);
  assert.strictEqual((await claim(s.id, '2026-06')).rowCount, 0);
  assert.strictEqual((await claim(s.id, '2026-07')).rowCount, 1);
});

maybe('a claim cannot reach another department\'s schedule', async () => {
  const s = await mkSchedule();
  const r = await pool.query(
    `UPDATE report_schedules SET last_period_key = $1
      WHERE id = $2 AND department_id = $3
        AND last_period_key IS DISTINCT FROM $1 RETURNING id`,
    ['2026-06', s.id, deptId + 1]
  );
  assert.strictEqual(r.rowCount, 0);
});

// ── THE CLOSED SETS ARE ENFORCED BY POSTGRES, NOT BY THE APP ───────────────
maybe('a report_key outside the closed set is refused by the database', async () => {
  await assert.rejects(
    () => mkSchedule({ report_key: 'anything_i_like' }),
    (e) => e.code === '23514',
    'free-text report_key is how three clients drifted into three vocabularies once already');
});

maybe('an unknown cadence is refused by the database', async () => {
  await assert.rejects(() => mkSchedule({ cadence: 'fortnightly' }), (e) => e.code === '23514');
});

maybe('a schedule that would mail nobody is refused', async () => {
  await assert.rejects(() => mkSchedule({ recipients: [] }), (e) => e.code === '23514');
});

maybe('an unbounded recipient list is refused', async () => {
  const many = Array.from({ length: 21 }, (_, i) => `p${i}@example.test`);
  await assert.rejects(() => mkSchedule({ recipients: many }), (e) => e.code === '23514');
});

// ── STATUS IS AN OUTCOME, AND ITS VOCABULARY IS CLOSED ─────────────────────
maybe('last_status only accepts the four real outcomes', async () => {
  const s = await mkSchedule();
  for (const ok of ['sent', 'no_email_configured', 'send_failed', 'no_data']) {
    await pool.query('UPDATE report_schedules SET last_status = $1 WHERE id = $2', [ok, s.id]);
  }
  await assert.rejects(
    () => pool.query('UPDATE report_schedules SET last_status = $1 WHERE id = $2', ['ok', s.id]),
    (e) => e.code === '23514');
});

maybe('"we could not send this" is storable as a status — never absence', async () => {
  // The whole reason last_status exists: RESEND_API_KEY is unset on this
  // deployment, and a chief must be able to SEE that their monthly report is
  // not going out rather than infer it from silence.
  const s = await mkSchedule();
  await pool.query(
    `UPDATE report_schedules SET last_status = 'no_email_configured', last_error = $1 WHERE id = $2`,
    ['RESEND_API_KEY is not configured on this deployment', s.id]);
  const { rows } = await pool.query('SELECT last_status, last_error FROM report_schedules WHERE id = $1', [s.id]);
  assert.strictEqual(rows[0].last_status, 'no_email_configured');
  assert.match(rows[0].last_error, /RESEND_API_KEY/);
});

// ── THE RENDERER DISPATCH REFUSES RATHER THAN DEFAULTS ─────────────────────
test('only report keys with a real renderer are offered to the API', () => {
  const { DELIVERABLE_REPORT_KEYS } = require('../routes/cronReportDelivery');
  assert.ok(Array.isArray(DELIVERABLE_REPORT_KEYS));
  assert.ok(DELIVERABLE_REPORT_KEYS.includes('response_compliance'));
  // The DB CHECK is deliberately wider than what we can render. A key in the
  // constraint but not here must never become schedulable — a chief receiving a
  // compliance CSV labelled "incident activity" could not tell it was wrong.
  for (const k of DELIVERABLE_REPORT_KEYS) {
    assert.ok(['response_compliance', 'incident_activity', 'cert_expiry'].includes(k),
      `${k} is offered but is not in the database's allowed set`);
  }
});
