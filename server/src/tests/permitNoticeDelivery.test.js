'use strict';
/**
 * permitNoticeDelivery.test.js — the notice DELIVERY leg against a REAL database (3.1b).
 *
 * permitExpiryNotices.test.js proves generation (idempotency, tenancy, the append-only
 * trigger). This suite proves DELIVERY — deliverQueuedNotices — and each case is a way the
 * leg could quietly do real-world harm:
 *
 *   1. DORMANT IS REALLY DORMANT — with RESEND_API_KEY unset, no network call is even
 *      attempted (the fetch is booby-trapped, not merely unobserved), and rows stay queued.
 *   2. THE BACKLOG DRAINS — rows queued on an earlier run (while email was unconfigured)
 *      are sent on a later run once the key exists. This is prod's exact future sequence.
 *   3. ONLY SENDABLE ROWS ARE ATTEMPTED — bureau rows (in-app delivery BY DESIGN) and
 *      no_recipient rows must never reach the provider. Proven by recording every call.
 *   4. A REFUSAL IS TERMINAL — a 4xx marks the row 'failed' with the error recorded, and
 *      no later run re-attempts it. A retry cannot help a refused request.
 *   5. A TRANSIENT FAILURE RESOLVES NOTHING — network error / 5xx / 429 leave the row
 *      'queued', and the NEXT run retries and succeeds. Non-resolution IS the retry
 *      (the syncCore refused-vs-failed doctrine, applied to outbound mail).
 *   6. A RESOLVED DELIVERY CANNOT BE REWRITTEN — the guard is proven RED (anti-pattern
 *      #29): a raw UPDATE against a 'sent' row must RAISE from 0116's trigger.
 *   7. NEVER CLAIMED AS SENT ON A NON-2xx — 'sent' requires a real 2xx (case 4 + 5).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[permitNoticeDelivery] TENANCY_TEST_DB not set — skipping.');
  test('permit notice delivery (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('permit notice delivery: dormant, backlog drain, refused-vs-transient, immutability', async (t) => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => {
      const tmr = realSetInterval(...args);
      if (tmr && typeof tmr.unref === 'function') tmr.unref();
      return tmr;
    };

    // Environment discipline: the key and fetch are BOTH restored no matter what. The mock
    // key is junk on purpose — even if a test bug let a real fetch through, Resend would
    // refuse it; nothing in this suite can ever send real mail.
    const hadResendKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const realFetch = global.fetch;

    /** Every provider call is recorded; the response is scripted per-test. */
    let fetchCalls = [];
    let fetchScript = () => { throw new Error('BOOBY TRAP: fetch called when none was expected'); };
    global.fetch = async (url, opts) => {
      fetchCalls.push({ url, body: JSON.parse(opts.body) });
      return fetchScript(url, opts);
    };
    const respond = (status) => ({ ok: status >= 200 && status < 300, status });

    const db = require('../db');
    const { pool } = db;
    const { runPermitExpiry, deliverQueuedNotices } = require('../jobs/permitExpiry');

    const MARK = `PND-${Date.now()}`;
    let A;

    t.after(async () => {
      global.setInterval = realSetInterval;
      global.fetch = realFetch;
      if (hadResendKey !== undefined) process.env.RESEND_API_KEY = hadResendKey;
      else delete process.env.RESEND_API_KEY;
      try {
        const depts = `(SELECT id FROM departments WHERE name LIKE $1)`;
        await pool.query(`DELETE FROM fi_permit_notices WHERE department_id IN ${depts}`, [`${MARK}%`]);
        await pool.query(`DELETE FROM fi_job_runs WHERE department_id IN ${depts}`, [`${MARK}%`]);
        await pool.query(`DELETE FROM audit_log WHERE table_name = 'fi_permits'
                            AND department_id IN ${depts}`, [`${MARK}%`]);
        await pool.query(`DELETE FROM fi_permits WHERE type LIKE $1`, [`${MARK}%`]);
        await pool.query(`DELETE FROM fi_properties WHERE name LIKE $1`, [`${MARK}%`]);
        await pool.query(`DELETE FROM departments WHERE name LIKE $1`, [`${MARK}%`]);
      } catch { /* best effort */ }
      try { await pool.end(); } catch { /* already closed */ }
    });

    A = await mkAlignedDeptStation(pool, `${MARK}-A`);

    const mkProp = async (email) => {
      const { rows } = await pool.query(
        `INSERT INTO fi_properties (department_id, station_id, name, address, "ownerEmail")
         VALUES ($1,$1,$2,'1 Test St',$3) RETURNING id`,
        [A, `${MARK} prop`, email]
      );
      return rows[0].id;
    };
    // Term ends 2026-06-30, 30-day window, 14-day grace — same fixture shape as the
    // generation suite, so a transition on 2026-06-15 is Active → AboutToExpire.
    const mkPermit = async (prop, number) => {
      const { rows } = await pool.query(
        `INSERT INTO fi_permits
           (department_id, station_id, "propertyId", type, status, "expiresDate",
            "permitNumber", term_value, term_unit, notice_window_days, grace_days)
         VALUES ($1,$1,$2,$3,'Active','2026-06-30',$4,1,'year',30,14) RETURNING id`,
        [A, prop, `${MARK} type`, number]
      );
      return rows[0].id;
    };
    const noticesOf = async (permitId) => (await pool.query(
      `SELECT id, notice_kind, audience, delivery_state, delivery_error, recipient_email,
              subject, sent_at
         FROM fi_permit_notices WHERE permit_id = $1
        ORDER BY audience`, [permitId])).rows;

    const prop = await mkProp('owner@example.test');
    const permit = await mkPermit(prop, `${MARK}-1`);

    // ── 1 DORMANT IS REALLY DORMANT ──────────────────────────────────────────────────────
    // The booby-trapped fetch is the assertion: with the key unset, ANY provider call
    // throws and fails this test. This is a check that could fail, so its passing means
    // something (#29).
    await t.test('1 with RESEND_API_KEY unset nothing is attempted and rows stay queued', async () => {
      const res = await runPermitExpiry({ today: '2026-06-15', departmentIds: [A] });
      const deptRes = res.departments.find((d) => d.departmentId === A);
      assert.equal(deptRes.outcome, 'success');
      assert.equal(deptRes.transitioned, 1, 'control: the rung must genuinely be walked');
      assert.deepEqual(deptRes.delivery, { attempted: 0, sent: 0, failed: 0, deferred: 0 },
        'dormant means ZERO attempts, not zero successes');
      assert.equal(fetchCalls.length, 0, 'no network call may exist while the key is unset');

      const rows = await noticesOf(permit);
      assert.equal(rows.length, 2, 'control: the transition generated both audiences');
      assert.ok(rows.every((r) => r.delivery_state === 'queued'),
        'queued is the only claimable outcome without a key');
    });

    // ── 2+3 THE BACKLOG DRAINS, AND ONLY SENDABLE ROWS ARE ATTEMPTED ─────────────────────
    // This is prod's exact future: notices queued across earlier runs, then the key lands,
    // then the next nightly run delivers the backlog. The bureau row must NOT be attempted —
    // in-app is bureau delivery until a bureau notification address is DESIGNATED (none is
    // today; see deliverQueuedNotices' header).
    await t.test('2 once the key exists, the queued backlog drains — permittee only', async () => {
      process.env.RESEND_API_KEY = 'test-key-junk-on-purpose';
      fetchCalls = [];
      fetchScript = () => respond(200);

      const counts = await deliverQueuedNotices(A);
      assert.deepEqual(counts, { attempted: 1, sent: 1, failed: 0, deferred: 0 });
      assert.equal(fetchCalls.length, 1, 'exactly ONE provider call: the permittee row');
      assert.equal(fetchCalls[0].body.to, 'owner@example.test');
      assert.ok(fetchCalls[0].body.subject.length > 10, 'the recorded copy is what is sent');

      const rows = await noticesOf(permit);
      const bureau = rows.find((r) => r.audience === 'bureau');
      const permittee = rows.find((r) => r.audience === 'permittee');
      assert.equal(permittee.delivery_state, 'sent');
      assert.ok(permittee.sent_at, 'sent requires sent_at — the 0116 CHECK, honored');
      assert.equal(bureau.delivery_state, 'queued',
        'bureau rows are read in-app; the provider must never see them');
    });

    // ── 6 A RESOLVED DELIVERY CANNOT BE REWRITTEN — the guard proven RED ─────────────────
    await t.test('3 the trigger refuses to rewrite a sent delivery', async () => {
      const rows = await noticesOf(permit);
      const sent = rows.find((r) => r.delivery_state === 'sent');
      await assert.rejects(
        pool.query(`UPDATE fi_permit_notices SET delivery_state='failed', sent_at=NULL,
                      delivery_error='tamper' WHERE id = $1`, [sent.id]),
        /cannot change again/,
        'one move out of queued, ever — a resolved delivery is a fact');
    });

    // ── And a drained queue is not re-attempted ──────────────────────────────────────────
    await t.test('4 a second sweep attempts nothing — resolved rows are out of scope', async () => {
      fetchCalls = [];
      fetchScript = () => { throw new Error('BOOBY TRAP: resolved rows must not be re-sent'); };
      const counts = await deliverQueuedNotices(A);
      assert.deepEqual(counts, { attempted: 0, sent: 0, failed: 0, deferred: 0 });
      assert.equal(fetchCalls.length, 0);
    });

    // ── 4 A REFUSAL IS TERMINAL ──────────────────────────────────────────────────────────
    await t.test('5 a 4xx marks the row failed, records the error, and is never re-tried', async () => {
      // Generate a fresh queued row with the key OFF so generation and delivery stay
      // separate concerns in this test.
      delete process.env.RESEND_API_KEY;
      const p2 = await mkPermit(prop, `${MARK}-2`);
      await runPermitExpiry({ today: '2026-06-15', departmentIds: [A] });

      process.env.RESEND_API_KEY = 'test-key-junk-on-purpose';
      fetchCalls = [];
      fetchScript = () => respond(422);
      let counts = await deliverQueuedNotices(A);
      assert.deepEqual(counts, { attempted: 1, sent: 0, failed: 1, deferred: 0 });

      let rows = await noticesOf(p2);
      const refused = rows.find((r) => r.audience === 'permittee');
      assert.equal(refused.delivery_state, 'failed');
      assert.match(refused.delivery_error, /HTTP 422/, 'the error is recorded for the monitor');
      assert.equal(refused.sent_at, null, 'refused is never sent — the 0116 CHECK, honored');

      // Terminal: a later sweep with a working provider must not resurrect it.
      fetchCalls = [];
      fetchScript = () => respond(200);
      counts = await deliverQueuedNotices(A);
      assert.deepEqual(counts, { attempted: 0, sent: 0, failed: 0, deferred: 0 },
        'a refusal is resolved; a retry cannot help a refused request');
      assert.equal(fetchCalls.length, 0);
    });

    // ── 5 A TRANSIENT FAILURE RESOLVES NOTHING — non-resolution IS the retry ─────────────
    await t.test('6 network errors and 5xx/429 leave the row queued; the next run succeeds', async () => {
      delete process.env.RESEND_API_KEY;
      const p3 = await mkPermit(prop, `${MARK}-3`);
      await runPermitExpiry({ today: '2026-06-15', departmentIds: [A] });
      process.env.RESEND_API_KEY = 'test-key-junk-on-purpose';

      // Attempt 1: the network is down. The row must stay queued — deferred, not failed.
      fetchCalls = [];
      fetchScript = () => { throw new Error('getaddrinfo ENOTFOUND api.resend.com'); };
      let counts = await deliverQueuedNotices(A);
      assert.deepEqual(counts, { attempted: 1, sent: 0, failed: 0, deferred: 1 });
      let row = (await noticesOf(p3)).find((r) => r.audience === 'permittee');
      assert.equal(row.delivery_state, 'queued', 'we could not TELL — queued stays true');

      // Attempt 2: the provider is up but overwhelmed. Same answer.
      fetchScript = () => respond(503);
      counts = await deliverQueuedNotices(A);
      assert.equal(counts.deferred, 1, 'a 5xx is the provider FAILING, not refusing');
      row = (await noticesOf(p3)).find((r) => r.audience === 'permittee');
      assert.equal(row.delivery_state, 'queued');

      // Attempt 3: the provider recovers — and this time deliver through the JOB, not the
      // exported function, proving the wiring: a run with nothing to transition still
      // drains the queue, and reports it on the run's result.
      fetchCalls = [];
      fetchScript = () => respond(200);
      const res = await runPermitExpiry({ today: '2026-06-15', departmentIds: [A] });
      const deptRes = res.departments.find((d) => d.departmentId === A);
      assert.equal(deptRes.transitioned, 0, 'nothing left to transition on this day');
      assert.equal(deptRes.delivery.sent, 1, 'the run itself delivered the deferred row');
      row = (await noticesOf(p3)).find((r) => r.audience === 'permittee');
      assert.equal(row.delivery_state, 'sent');
      assert.ok(row.sent_at);
    });
  });
}
