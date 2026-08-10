'use strict';
/**
 * cronHealth.test.js — the liveness ledger and the monitor over it. (X-PHASE, 0128)
 *
 * DB-backed; runs only when TENANCY_TEST_DB is set (house pattern), skips clean otherwise.
 *
 * Every case here is one that could fail, and the two that matter most are the ones a naive
 * implementation gets wrong in the SAFE-LOOKING direction:
 *   · an auth REFUSAL must write nothing — these paths are public, and a refusal row would
 *     let anyone on the internet append to a permanent log (the 4C.2 doctrine);
 *   · `never_run` must not be reported as `stale` — on the deploy that adds this check every
 *     job has no history, and five red alarms on day one is how an indicator gets ignored.
 *
 * The PHYSICAL append-only guarantee (of_app UPDATE/DELETE → 42501) is NOT asserted here: a
 * local database has no `of_app` role and no Supabase default privileges, so the assertion
 * would be vacuously true — the 0118 lesson. That one is a prod probe, run as of_app inside a
 * transaction and rolled back.
 */
const { test } = require('node:test');
const assert = require('node:assert');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[cronHealth] TENANCY_TEST_DB not set — skipping.');
  test('cron health (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('0128 — the cron liveness ledger and its monitor', async (t) => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => {
      const tmr = realSetInterval(...args);
      if (tmr && typeof tmr.unref === 'function') tmr.unref();
      return tmr;
    };
    let app;
    try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');
    const { recordCronRun, sanitizeSummary, sanitizeError, withCronRun } = require('../utils/cronRun');
    const { CRON_JOBS } = require('../constants/cronJobs');

    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function api(method, path, token, body) {
      const res = await fetch(base + path, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null; try { json = await res.json(); } catch { /* */ }
      return { status: res.status, json };
    }

    t.after(async () => {
      try { await cleanup(); } finally {
        await new Promise((r) => server.close(r));
        await pool.end().catch(() => {});
      }
    });
    async function cleanup() {
      await pool.query(`DELETE FROM of_cron_runs`);
      await pool.query(`DELETE FROM users WHERE username LIKE 'CRONH-%'`);
    }
    await cleanup();

    const chiefRow = (await pool.query(
      `SELECT id, username, role, station_id FROM users
        WHERE station_id IS NOT NULL AND role='chief' ORDER BY id LIMIT 1`)).rows[0];
    assert.ok(chiefRow, 'need a chief to run this suite');
    const deptId = chiefRow.station_id;
    const tok = (row, role, name) => jwt.sign(
      { sub: row.id, username: row.username, role, stationId: row.station_id ?? deptId, name },
      ACCESS_SECRET, { expiresIn: '15m' });
    const chief = tok(chiefRow, chiefRow.role, 'Cron Chief');

    const officerRow = (await pool.query(
      `INSERT INTO users (username, name, initials, "passwordHash", role, station_id)
       VALUES ('CRONH-officer', 'Cron Officer', 'CO', 'x', 'officer', $1)
       RETURNING id, username, station_id`, [deptId])).rows[0];
    const officer = tok(officerRow, 'officer', 'Cron Officer');

    const ago = (h) => new Date(Date.now() - h * 3600000);

    // ══ THE MONITOR IS CHIEF-ONLY, WITH THE CONTROL THAT PROVES IT WORKS AT ALL ═════════
    await t.test('an officer is refused the monitor; a chief is not', async () => {
      const denied = await api('GET', '/api/cron-health', officer);
      assert.equal(denied.status, 403, JSON.stringify(denied.json));
      assert.equal(denied.json.code, 'FORBIDDEN_ROLE');

      const ok = await api('GET', '/api/cron-health', chief);
      assert.equal(ok.status, 200, JSON.stringify(ok.json));
      assert.equal(ok.json.data.jobs.length, CRON_JOBS.length,
        'every scheduled job must appear, including ones that have never run');
    });

    // ══ never_run IS ITS OWN VERDICT ════════════════════════════════════════════════════
    await t.test('with an empty ledger every job is never_run, NOT stale', async () => {
      const res = await api('GET', '/api/cron-health', chief);
      const verdicts = new Set(res.json.data.jobs.map((j) => j.verdict));
      assert.deepEqual([...verdicts], ['never_run'],
        'calling a job with no history "stale" would light every alarm on the deploy that ' +
        'added this check, which is how an indicator gets ignored');
      assert.equal(res.json.data.stale, 0);
      assert.equal(res.json.data.needsAttention, 0, 'nothing to act on yet');
      assert.equal(res.json.data.neverRun, CRON_JOBS.length);
      assert.equal(res.json.data.ledgerSince, null, 'no anchor yet, so nothing can have expired');
    });

    // ══ THE VERDICT ITSELF ══════════════════════════════════════════════════════════════
    await t.test('a fresh success is healthy; an old one is stale', async () => {
      // permit_expiry: 24h cadence -> 36h window.
      await recordCronRun({ jobName: 'permit_expiry', startedAt: ago(2), outcome: 'success', summary: { examined: 4 } });
      // neris_sweep: 1h cadence -> 3h window. 5h old is past it.
      await pool.query(
        `INSERT INTO of_cron_runs (job_name, started_at, finished_at, outcome)
         VALUES ('neris_sweep', $1, $1, 'success')`, [ago(5)]);

      const res = await api('GET', '/api/cron-health', chief);
      const by = Object.fromEntries(res.json.data.jobs.map((j) => [j.name, j]));
      assert.equal(by.permit_expiry.verdict, 'healthy', JSON.stringify(by.permit_expiry));
      assert.equal(by.neris_sweep.verdict, 'stale',
        'an hourly job silent for five hours is three windows late — that is the finding');
      assert.equal(by.neris_sweep.staleAfterHours, 3);
      assert.equal(by.permit_expiry.staleAfterHours, 36);
      assert.equal(res.json.data.stale, 1);
    });

    await t.test('a job that RUNS and never succeeds is `failing`, and it COUNTS', async () => {
      await recordCronRun({ jobName: 'retention', startedAt: ago(1), outcome: 'failed', error: new Error('boom') });
      const res = await api('GET', '/api/cron-health', chief);
      const j = res.json.data.jobs.find((x) => x.name === 'retention');
      // Was 'never_run' in the first version, which meant a job failing EVERY night showed a
      // grey "Not yet seen" and contributed nothing to the badge.
      assert.equal(j.verdict, 'failing', 'it runs; it has just never worked');
      assert.equal(j.lastRunOutcome, 'failed');
      assert.match(j.lastRunError, /boom/);
      assert.ok(res.json.data.needsAttention >= 1, 'a nightly failure must reach the badge');
    });

    await t.test('never_run EXPIRES — a job that never fires does not read "not yet seen" forever', async () => {
      // Anchor the ledger in the past. `retention` is daily (36h window), so a ledger that has
      // been collecting for 100h means silence from a job is no longer a fresh install.
      await pool.query(
        `INSERT INTO of_cron_runs (job_name, started_at, finished_at, outcome)
         VALUES ('permit_expiry', $1, $1, 'success')`, [ago(100)]);
      const res = await api('GET', '/api/cron-health', chief);
      const rec = res.json.data.jobs.find((x) => x.name === 'reconcile');
      assert.equal(rec.verdict, 'stale',
        'a cron dropped from vercel.json before it ever succeeded must escalate — that is the ' +
        'defect this ledger exists to detect, and the first version could not see it');
      assert.equal(rec.lastSuccessAt, null, 'and it is still honest that nothing ever succeeded');
      assert.ok(res.json.data.needsAttention >= 2);
      assert.ok(res.json.data.ledgerSince, 'the anchor is reported so the verdict is explicable');
    });

    // ══ THE WRAPPER ════════════════════════════════════════════════════════════════════
    await t.test('withCronRun records a success and passes the handler\'s body through', async () => {
      const before = (await pool.query(`SELECT count(*)::int n FROM of_cron_runs WHERE job_name='reconcile'`)).rows[0].n;
      const wrapped = withCronRun('reconcile', async (req, res) => res.json({ ok: true, invoices: 3 }));
      const sent = {};
      const res = {
        statusCode: 200, headersSent: false,
        status(c) { sent.status = c; this.statusCode = c; return this; },
        json(b) { sent.body = b; return this; },
        end() { sent.ended = true; return this; },
      };
      await wrapped({ headers: {} }, res);
      assert.deepEqual(sent.body, { ok: true, invoices: 3 }, 'the caller must get exactly what the handler wrote');
      const rows = (await pool.query(
        `SELECT outcome, summary FROM of_cron_runs WHERE job_name='reconcile' ORDER BY id DESC LIMIT 1`)).rows;
      assert.equal((await pool.query(`SELECT count(*)::int n FROM of_cron_runs WHERE job_name='reconcile'`)).rows[0].n, before + 1);
      assert.equal(rows[0].outcome, 'success');
      assert.equal(rows[0].summary.invoices, 3, 'scalar totals are kept');
    });

    await t.test('a handler that THROWS is recorded as failed and answered 500', async () => {
      const wrapped = withCronRun('report_delivery', async () => { throw new Error('sweep exploded'); });
      const sent = {};
      const res = { statusCode: 200, headersSent: false,
        status(c) { sent.status = c; this.statusCode = c; return this; },
        json(b) { sent.body = b; return this; } };
      await wrapped({ headers: {} }, res);
      assert.equal(sent.status, 500);
      const row = (await pool.query(
        `SELECT outcome, error FROM of_cron_runs WHERE job_name='report_delivery' ORDER BY id DESC LIMIT 1`)).rows[0];
      assert.equal(row.outcome, 'failed');
      assert.match(row.error, /sweep exploded/);
    });

    await t.test('a handler that answers 500 ITSELF is recorded as failed, not success', async () => {
      const wrapped = withCronRun('retention', async (req, res) => res.status(500).json({ error: 'nope' }));
      const sent = {};
      const res = { statusCode: 200, headersSent: false,
        status(c) { sent.status = c; this.statusCode = c; return this; },
        json(b) { sent.body = b; return this; } };
      await wrapped({ headers: {} }, res);
      const row = (await pool.query(
        `SELECT outcome FROM of_cron_runs WHERE job_name='retention' ORDER BY id DESC LIMIT 1`)).rows[0];
      assert.equal(row.outcome, 'failed',
        'a job that answers 500 every night must not look perfectly alive');
    });

    await t.test('a handler that NEVER RESPONDS is recorded failed and answered 500', async () => {
      // res.statusCode defaults to 200, so this used to be ledgered `success` — a job quietly
      // doing nothing every night, looking perfectly alive.
      const wrapped = withCronRun('reconcile', async () => { /* falls out of a branch */ });
      const sent = {};
      const res = { statusCode: 200, headersSent: false,
        status(c) { sent.status = c; this.statusCode = c; return this; },
        json(b) { sent.body = b; return this; }, end() { sent.ended = true; return this; } };
      await wrapped({ headers: {} }, res);
      assert.equal(sent.status, 500, 'the scheduler must see a failure, not a 204');
      const row = (await pool.query(
        `SELECT outcome, error FROM of_cron_runs WHERE job_name='reconcile' ORDER BY id DESC LIMIT 1`)).rows[0];
      assert.equal(row.outcome, 'failed');
      assert.match(row.error, /no response/);
    });

    await t.test("the handler's OWN error message is kept, not \"handler answered 500\"", async () => {
      const wrapped = withCronRun('retention', async (req, res) => res.status(500).json({ error: 'radio_log sweep exploded' }));
      const res = { statusCode: 200, headersSent: false,
        status(c) { this.statusCode = c; return this; }, json() { return this; } };
      await wrapped({ headers: {} }, res);
      const row = (await pool.query(
        `SELECT error FROM of_cron_runs WHERE job_name='retention' ORDER BY id DESC LIMIT 1`)).rows[0];
      assert.match(row.error, /radio_log sweep exploded/,
        'a chief reading the panel needs the cause, not an echo of the status code');
    });

    await t.test('a DSN in the handler BODY is redacted too, not just in a thrown error', async () => {
      // The hole: sanitizeError redacted; sanitizeSummary did not — and two crons answer
      // { error: err.message }, so a pooler failure wrote credentials into an archive-forever
      // table readable by every chief.
      const dsn = 'connect ECONNREFUSED postgresql://of_app:hunter2@db.example:5432/postgres';
      const wrapped = withCronRun('retention', async (req, res) => res.status(500).json({ error: dsn }));
      const res = { statusCode: 200, headersSent: false,
        status(c) { this.statusCode = c; return this; }, json() { return this; } };
      await wrapped({ headers: {} }, res);
      const row = (await pool.query(
        `SELECT summary, error FROM of_cron_runs WHERE job_name='retention' ORDER BY id DESC LIMIT 1`)).rows[0];
      assert.ok(!/postgresql:\/\//.test(JSON.stringify(row.summary)), `summary leaked a DSN: ${JSON.stringify(row.summary)}`);
      assert.ok(!/postgresql:\/\//.test(row.error || ''), `error leaked a DSN: ${row.error}`);
      assert.match(JSON.stringify(row.summary), /redacted-dsn/);
    });

    await t.test('a second res.json() keeps the FIRST response instead of silently swapping it', async () => {
      const wrapped = withCronRun('reconcile', async (req, res) => { res.json({ first: 1 }); res.json({ second: 2 }); });
      const sent = {};
      const res = { statusCode: 200, headersSent: false,
        status(c) { this.statusCode = c; return this; }, json(b) { sent.body = b; return this; } };
      const origErr = console.error; const errs = []; console.error = (...a) => errs.push(a.join(' '));
      try { await wrapped({ headers: {} }, res); } finally { console.error = origErr; }
      assert.deepEqual(sent.body, { first: 1 }, 'unwrapped Express sends the first and throws on the second');
      assert.ok(errs.some((e) => /more than once/.test(e)), 'and it is reported, not swallowed');
    });

    await t.test('a FALSY throw is still a failure', async () => {
      // `catch (e) { threw = e }` + `if (threw)` treated `throw null` as success — the same
      // falsy-through-a-truthiness-check family sanitizeError was already fixed for.
      const wrapped = withCronRun('report_delivery', async () => { throw null; });
      const res = { statusCode: 200, headersSent: false,
        status(c) { this.statusCode = c; return this; }, json() { return this; } };
      await wrapped({ headers: {} }, res);
      const row = (await pool.query(
        `SELECT outcome, error FROM of_cron_runs WHERE job_name='report_delivery' ORDER BY id DESC LIMIT 1`)).rows[0];
      assert.equal(row.outcome, 'failed');
      // Assert it was recorded AS A THROW, not merely caught by the no-response guard. Without
      // this the test passes whether or not `didThrow` handles a falsy throw, because a handler
      // that throws also never responds — two mechanisms, one observable, and the mutation that
      // broke one stayed green. A test that cannot distinguish them is not testing either.
      assert.match(row.error, /no message/,
        'a falsy throw must be attributed to the throw, not reported as "produced no response"');
    });

    await t.test('both timestamps come from ONE clock — no cross-host CHECK to lose a row to', async () => {
      const before = (await pool.query(`SELECT count(*)::int n FROM of_cron_runs`)).rows[0].n;
      const ok = await recordCronRun({ jobName: 'neris_sweep', startedAt: Date.now(), finishedAt: Date.now(), outcome: 'success' });
      assert.equal(ok, true, 'a zero-duration run must still land; 0128 CHECKs finished_at >= started_at');
      assert.equal((await pool.query(`SELECT count(*)::int n FROM of_cron_runs`)).rows[0].n, before + 1);
    });

    // ══ THE DOCTRINE: AN AUTH REFUSAL IS NOT A RUN ══════════════════════════════════════
    await t.test('an UNAUTHENTICATED cron hit writes NOTHING — a public path is not an append surface', async () => {
      const before = (await pool.query(`SELECT count(*)::int n FROM of_cron_runs`)).rows[0].n;
      // No Authorization header. In a test env CRON_SECRET is unset and cronAuth allows it, so
      // force the refusal explicitly to test the branch that matters in production.
      const wrapped = withCronRun('neris_sweep', async (req, res) => res.status(401).json({ error: 'Unauthorized' }));
      const res = { statusCode: 200, headersSent: false,
        status(c) { this.statusCode = c; return this; }, json() { return this; } };
      await wrapped({ headers: {} }, res);
      const after = (await pool.query(`SELECT count(*)::int n FROM of_cron_runs`)).rows[0].n;
      assert.equal(after, before,
        'a 401 must leave no row — otherwise anyone on the internet can append to a permanent log');
    });

    // ══ THE TENANCY FENCE ON `summary` ══════════════════════════════════════════════════
    await t.test('summary keeps totals and DROPS anything that could name a department', () => {
      const s = sanitizeSummary({
        departments: 4, failed: 0, note: 'ok',
        perDepartment: [{ id: 7, name: 'Maplewood VFD' }],   // must not survive
        detail: { 7: 'Maplewood VFD' },                       // must not survive
      });
      assert.deepEqual(s, { departments: 4, failed: 0, note: 'ok' });
      assert.ok(!('perDepartment' in s), 'an array is dropped, not truncated — a truncated list of departments is still a list of departments');
      assert.ok(!('detail' in s));
      assert.equal(sanitizeSummary(null), null);
      assert.equal(sanitizeSummary([1, 2, 3]), null, 'a bare array is not a summary');
    });

    await t.test('an error string never carries a connection string', () => {
      const out = sanitizeError(new Error('connect ECONNREFUSED postgresql://u:p@host:5432/db'));
      assert.ok(!/postgresql:\/\//.test(out), out);
      assert.match(out, /redacted-dsn/);
      assert.equal(sanitizeError(new Error('')), 'Job failed with no message',
        'the CHECK refuses an empty error, so a failure with no message still gets a reason');
    });

    // ══ THE CONSTRAINTS ════════════════════════════════════════════════════════════════
    await t.test('the database refuses an unknown job name, a backwards clock, and an empty error', async () => {
      await assert.rejects(
        pool.query(`INSERT INTO of_cron_runs (job_name, started_at, outcome) VALUES ('made_up', now(), 'success')`),
        /violates check constraint/, 'job_name is a closed set');
      await assert.rejects(
        pool.query(`INSERT INTO of_cron_runs (job_name, started_at, finished_at, outcome)
                    VALUES ('retention', now(), now() - interval '1 hour', 'success')`),
        /violates check constraint/, 'a run cannot finish before it starts');
      await assert.rejects(
        pool.query(`INSERT INTO of_cron_runs (job_name, started_at, outcome, error)
                    VALUES ('retention', now(), 'failed', '   ')`),
        /violates check constraint/,
        'a whitespace-only error is a failure whose cause was silently dropped — the NULL-leak class');
      await assert.rejects(
        pool.query(`INSERT INTO of_cron_runs (job_name, started_at, outcome, error)
                    VALUES ('retention', now(), 'success', 'why is this here')`),
        /violates check constraint/, 'a successful run cannot carry an error');
    });
  });
}
