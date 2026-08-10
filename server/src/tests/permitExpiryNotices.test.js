'use strict';
/**
 * permitExpiryNotices.test.js — expiry notices against a REAL database (Phase 3, 3.1b).
 *
 * utils/permitNotice.test.js pins the copy. This suite proves the things only a database can
 * prove, and each one is a way the feature could quietly do real-world harm:
 *
 *   1. CONTROL — a legitimate transition DOES generate notices, one per audience. Without
 *      this every refusal below is satisfied by a feature that generates nothing at all.
 *   2. NO DOUBLE-NOTIFY ON RE-RUN — the headline. A duplicate notice is a bureau emailing a
 *      business owner twice about one lapse. Spec §6 row 10.
 *   3. THE GUARD IS REAL, NOT JUST A CODE PATH — a raw duplicate INSERT must be refused by
 *      Postgres. Proves the constraint, not merely our ON CONFLICT clause.
 *   4. EVERY RUNG NOTIFIES — including Delinquent, which is the documented +30-day late
 *      notice and the one a two-kind reading of §3.6 would have left silent.
 *   5. CROSS-TENANT — department A's run must not write notices for department B.
 *   6. A MISSING CONTACT IS SURFACED, NOT DROPPED — no owner email ⇒ 'no_recipient'.
 *   7. NOTHING IS EVER CLAIMED AS SENT while RESEND_API_KEY is unset.
 *   8. THE NOTICE FACT IS IMMUTABLE — the append-only trigger refuses tampering.
 *   9. THE LEDGER COUNTS IT — `notified` lands on fi_job_runs, or a run that notified nobody
 *      would look identical to a healthy one.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[permitExpiryNotices] TENANCY_TEST_DB not set — skipping.');
  test('permit expiry notices (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('permit expiry notices: idempotency, tenancy, honesty about delivery', async (t) => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => {
      const tmr = realSetInterval(...args);
      if (tmr && typeof tmr.unref === 'function') tmr.unref();
      return tmr;
    };

    // The whole feature is dormant-safe by design; assert the precondition rather than
    // assuming it, so this suite cannot accidentally send mail from a developer's machine.
    const hadResendKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    const db = require('../db');
    const { pool } = db;
    const { runPermitExpiry } = require('../jobs/permitExpiry');

    const MARK = `PXN-${Date.now()}`;
    let A, B;

    // Teardown registered FIRST, before any fixture that can throw. Notices come out before
    // permits: permit_id is ON DELETE RESTRICT precisely so this ordering is forced.
    t.after(async () => {
      global.setInterval = realSetInterval;
      if (hadResendKey !== undefined) process.env.RESEND_API_KEY = hadResendKey;
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
    B = await mkAlignedDeptStation(pool, `${MARK}-B`);

    const mkProp = async (dept, email) => {
      const { rows } = await pool.query(
        `INSERT INTO fi_properties (department_id, station_id, name, address, "ownerEmail")
         VALUES ($1,$1,$2,'1 Test St',$3) RETURNING id`,
        [dept, `${MARK} prop`, email]
      );
      return rows[0].id;
    };
    // Term ends 2026-06-30, 30-day notice window, 14-day grace ⇒ grace ends 2026-07-14.
    const mkPermit = async (dept, prop, number) => {
      const { rows } = await pool.query(
        `INSERT INTO fi_permits
           (department_id, station_id, "propertyId", type, status, "expiresDate",
            "permitNumber", term_value, term_unit, notice_window_days, grace_days)
         VALUES ($1,$1,$2,$3,'Active','2026-06-30',$4,1,'year',30,14) RETURNING id`,
        [dept, prop, `${MARK} type`, number]
      );
      return rows[0].id;
    };
    const notices = async (permitId) => (await pool.query(
      `SELECT notice_kind, audience, delivery_state, recipient_email, subject, body,
              from_status, to_status, sent_at
         FROM fi_permit_notices WHERE permit_id = $1
        ORDER BY notice_kind, audience`, [permitId])).rows;

    const propA = await mkProp(A, 'owner@example.test');
    const permit = await mkPermit(A, propA, `${MARK}-1`);

    // ── 1 CONTROL: the ordinary transition generates notices ────────────────────────────
    await runPermitExpiry({ today: '2026-06-15', departmentIds: [A] });
    let rows = await notices(permit);
    assert.equal(rows.length, 2,
      'CONTROL: one transition owes exactly two notices (permittee + bureau) — if this is 0 every assertion below is vacuous');
    assert.deepEqual(rows.map((r) => r.audience), ['bureau', 'permittee']);
    assert.ok(rows.every((r) => r.notice_kind === 'about_to_expire'));
    assert.ok(rows.every((r) => r.from_status === 'Active' && r.to_status === 'AboutToExpire'),
      'the notice must record the transition that caused it');
    assert.ok(rows.every((r) => r.subject.length > 10 && r.body.length > 40),
      'a notice with empty copy is a row pretending to be a notice');

    // ── 2 NO DOUBLE-NOTIFY ON RE-RUN (the headline) ─────────────────────────────────────
    await runPermitExpiry({ today: '2026-06-15', departmentIds: [A] });
    await runPermitExpiry({ today: '2026-06-16', departmentIds: [A] });
    rows = await notices(permit);
    assert.equal(rows.length, 2,
      're-running the job must NOT re-notify — a duplicate is a business owner emailed twice about one lapse');

    // ── 2b THE RE-RUN ABOVE IS PROTECTED BY THE LADDER, NOT BY THE CONSTRAINT ───────────
    // Proven by experiment 2026-08-02: with the UNIQUE index dropped AND the ON CONFLICT
    // clause removed, assertion 2 still passed — because an already-transitioned permit
    // simply never transitions again, so no second INSERT is ever attempted. The assertion
    // above is therefore real but SHALLOW, and on its own it would let the guard rot.
    //
    // This is the case that genuinely reaches the constraint: a human puts the permit back
    // to Active (correcting a mis-keyed expiry date is the real-world version), and the job
    // walks the same rung a second time. Without the UNIQUE index this writes a duplicate
    // notice and the owner is emailed twice about one lapse.
    await pool.query(`UPDATE fi_permits SET status = 'Active' WHERE id = $1`, [permit]);
    const replay = await runPermitExpiry({ today: '2026-06-15', departmentIds: [A] });
    assert.equal(
      replay.departments.find((d) => d.departmentId === A).transitioned, 1,
      'the job must genuinely re-walk the rung, or this test proves nothing about the constraint');
    rows = await notices(permit);
    assert.equal(rows.length, 2,
      'walking the same rung twice must NOT produce a second notice — this is the UNIQUE index doing the work');
    assert.equal(
      replay.departments.find((d) => d.departmentId === A).notified, 0,
      'and the run must honestly report that it notified nobody the second time');

    // ── 3 THE GUARD IS THE DATABASE'S, NOT THE CODE'S ───────────────────────────────────
    // Without ON CONFLICT the insert must still be refused. This proves the constraint
    // exists rather than proving we remembered to write a clause.
    await assert.rejects(
      () => pool.query(
        `INSERT INTO fi_permit_notices
           (department_id, permit_id, notice_kind, audience, from_status, to_status, evaluated_for)
         VALUES ($1,$2,'about_to_expire','permittee','Active','AboutToExpire','2026-06-15')`,
        [A, permit]),
      /duplicate key|unique/i,
      'the UNIQUE index must refuse a second notice for the same rung and audience');

    // ── 4 EVERY RUNG NOTIFIES, INCLUDING Delinquent ─────────────────────────────────────
    await runPermitExpiry({ today: '2026-07-05', departmentIds: [A] });   // → Delinquent
    await runPermitExpiry({ today: '2026-07-20', departmentIds: [A] });   // → Expired
    rows = await notices(permit);
    assert.equal(rows.length, 6, 'three rungs × two audiences');
    const kinds = [...new Set(rows.map((r) => r.notice_kind))].sort();
    assert.deepEqual(kinds, ['about_to_expire', 'delinquent', 'expired'],
      'Delinquent is the documented +30-day late notice — reading §3.6 as only two kinds would leave it silent');

    // The expired notice must withdraw renewal; the earlier ones must not.
    const expiredBody = rows.find((r) => r.notice_kind === 'expired' && r.audience === 'permittee').body;
    const delinqBody  = rows.find((r) => r.notice_kind === 'delinquent' && r.audience === 'permittee').body;
    assert.match(expiredBody, /no longer available/,
      'renewal is withdrawn at Expired — settled 2026-08-01');
    assert.match(delinqBody, /can still be renewed/,
      'renewal survives the grace window; saying otherwise would cost a department a renewal');

    // ── 7 NOTHING IS CLAIMED AS SENT WHILE EMAIL IS DORMANT ─────────────────────────────
    assert.ok(rows.every((r) => r.delivery_state !== 'sent'),
      'RESEND_API_KEY is unset — nothing may be recorded as sent');
    assert.ok(rows.every((r) => r.sent_at === null),
      'a null send timestamp is the honest record of a dormant mail path');
    assert.ok(
      rows.filter((r) => r.audience === 'permittee').every((r) => r.delivery_state === 'queued'),
      'a resolvable contact queues');
    assert.ok(
      rows.filter((r) => r.audience === 'permittee').every((r) => r.recipient_email === 'owner@example.test'),
      'the recipient is frozen onto the record at generation time');

    // ── 6 A MISSING CONTACT IS SURFACED, NOT DROPPED ────────────────────────────────────
    const propNoEmail = await mkProp(A, '');
    const orphan = await mkPermit(A, propNoEmail, `${MARK}-2`);
    await runPermitExpiry({ today: '2026-06-15', departmentIds: [A] });
    const orphanRows = await notices(orphan);
    assert.equal(orphanRows.length, 2,
      'a property with no owner email still gets a notice RECORD — the gap is surfaced, not silently skipped');
    const permitteeRow = orphanRows.find((r) => r.audience === 'permittee');
    assert.equal(permitteeRow.delivery_state, 'no_recipient',
      'no address on file is a real gap a clerk must close, and it must be visible as one');

    // ── 5 CROSS-TENANT ──────────────────────────────────────────────────────────────────
    const propB = await mkProp(B, 'other@example.test');
    const permitB = await mkPermit(B, propB, `${MARK}-B1`);
    await runPermitExpiry({ today: '2026-06-15', departmentIds: [A] });
    assert.equal((await notices(permitB)).length, 0,
      "running for department A must never write a notice against department B's permit");
    // …and the control: B's own run does work, so the assertion above is not vacuous.
    await runPermitExpiry({ today: '2026-06-15', departmentIds: [B] });
    const bRows = await notices(permitB);
    assert.equal(bRows.length, 2, "CONTROL: department B's own run notifies B");
    assert.ok(bRows.every((r) => r.recipient_email !== 'owner@example.test'),
      "department A's owner address must never appear on department B's notice");

    // ── 8 THE NOTICE FACT IS IMMUTABLE ──────────────────────────────────────────────────
    const { rows: [victim] } = await pool.query(
      `SELECT id FROM fi_permit_notices WHERE permit_id = $1 LIMIT 1`, [permit]);
    await assert.rejects(
      () => pool.query(`UPDATE fi_permit_notices SET body = 'tampered' WHERE id = $1`, [victim.id]),
      /append-only/,
      'the recorded notice text must be immutable — it is the record of what was said');
    // …and the control: the delivery seam IS allowed to move, or the trigger is just a wall.
    await pool.query(
      `UPDATE fi_permit_notices SET delivery_state='sent', sent_at=NOW() WHERE id = $1`, [victim.id]);
    await assert.rejects(
      () => pool.query(
        `UPDATE fi_permit_notices SET delivery_state='failed', sent_at=NULL WHERE id = $1`, [victim.id]),
      /already resolved/,
      'once delivery is resolved it must never change again');

    // ── 9 THE LEDGER COUNTS IT, AND THE COUNT IS TRUSTWORTHY ────────────────────────────
    // The invariant that actually matters: the ledger's notice total must equal the notices
    // that exist. If they diverge the monitor is lying, which is worse than not having it.
    const { rows: [tally] } = await pool.query(
      `SELECT (SELECT COALESCE(SUM(notified),0) FROM fi_job_runs WHERE department_id = $1) AS ledgered,
              (SELECT COUNT(*) FROM fi_permit_notices WHERE department_id = $1)      AS actual`,
      [A]);
    assert.equal(Number(tally.ledgered), Number(tally.actual),
      'the ledger\'s notified total must equal the notices actually written, or the monitor reports fiction');

    const { rows: ledger } = await pool.query(
      `SELECT transitioned, notified FROM fi_job_runs
        WHERE department_id = $1 AND transitioned > 0 ORDER BY id`, [A]);
    assert.ok(ledger.length > 0, 'the transitions above must have left ledger rows');
    assert.ok(ledger.some((r) => r.notified === r.transitioned * 2),
      'a healthy run must show two notices per transition');
    // …and the divergence must be REPRESENTABLE. The 2b replay transitioned a permit and
    // notified nobody (correctly — it had already been notified). A ledger that could not
    // express that gap is exactly the blind counter 0117's header was written about.
    assert.ok(ledger.some((r) => r.transitioned > 0 && r.notified === 0),
      'the ledger must be able to show a run that transitioned but notified nobody');
  });
}
