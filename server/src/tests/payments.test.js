'use strict';
/**
 * payments.test.js — the 3.2 Slice C route surface against a live DB.
 *
 * THE CLAIMS THIS SUITE EXISTS TO PROVE, each a way money could be quietly corrupted:
 *   · SEPARATION OF DUTIES (R8) — an inspector/member may READ receipts, balances, the gap
 *     report and the export; only a prevention admin may record, refund, or void.
 *   · CROSS-TENANT REFUSAL on every payment route, read and write.
 *   · A RECEIPT IS NEVER EDITED — no PATCH exists; the only mutation is a one-way void that
 *     CONSUMES AND RETAINS the number with every original amount preserved.
 *   · NEAR-MISS REFUSAL on the closed method set — 'Check', 'CASH', 'cash ' are each
 *     refused, never coerced (the /^pass\b/i lesson applied to money).
 *   · A REPLAYED RECORDING MINTS ONE RECEIPT — `duplicate` answers success, exactly one row
 *     exists, and the ROLLED-BACK ALLOCATION RETURNS ITS NUMBER (the counter-row design).
 *   · BALANCE IS DERIVED — partial payments accumulate, overpayment goes NEGATIVE
 *     (representable, not an error), refund authorisations add back, voids count for nothing.
 *   · THE R9 BAND — unset threshold changes nothing; set, a refund at/above it refuses
 *     without a second named approver and records one when given.
 *   · R3 ISSUANCE GATE #1 — a permit with a committed-but-uninvoiced fee is blocked; with an
 *     unpaid invoice is blocked; paid in full (including across an adjustment CHAIN) issues.
 *   · THE EXPORT carries charge + payment + refund transactions (the RFP hard requirement).
 *   · MIRROR FENCE — the JS closed sets equal the live CHECK constraint sets, both directions.
 *
 * Teardown inherits the invoices.test.js discipline: append-only triggers must be disabled
 * to clean up (legitimate against a local DB; no such door exists in the app), children
 * before parents, and a residue check that CAN fail.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[payments] TENANCY_TEST_DB not set — skipping.');
  test('payments (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('payments: receipts, refunds, void, balance, R9 band, gate #1, export, duties', async (t) => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => {
      const tmr = realSetInterval(...args);
      if (tmr && typeof tmr.unref === 'function') tmr.unref();
      return tmr;
    };
    let app; try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');

    const MARK = `PAY-${Date.now()}`;

    t.after(async () => {
      const like = [`${MARK}%`];
      const deptFilter = `(SELECT id FROM departments WHERE name LIKE $1)`;
      const step = async (label, sql, params = like) => {
        try { await pool.query(sql, params); } catch (e) {
          console.error(`[payments teardown] ${label} FAILED: ${e.message}`);
        }
      };
      const triggers = [
        ['fi_payments', 'trg_fi_payments_append_only'],
        ['fi_invoices', 'trg_fi_invoices_append_only'],
        ['fi_invoice_lines', 'trg_fi_invoice_lines_append_only'],
      ];
      for (const [tbl, trg] of triggers) {
        await step(`disable ${trg}`, `ALTER TABLE ${tbl} DISABLE TRIGGER ${trg}`, []);
      }
      // Refunds reference their payment (RESTRICT), so refund rows first.
      await step('refunds', `DELETE FROM fi_payments WHERE department_id IN ${deptFilter} AND refund_of_payment_id IS NOT NULL`);
      await step('payments', `DELETE FROM fi_payments WHERE department_id IN ${deptFilter}`);
      await step('receipt seqs', `DELETE FROM fi_receipt_sequences WHERE department_id IN ${deptFilter}`);
      await step('lines', `DELETE FROM fi_invoice_lines WHERE department_id IN ${deptFilter}`);
      await step('adjustments', `DELETE FROM fi_invoices WHERE department_id IN ${deptFilter} AND adjusts_invoice_id IS NOT NULL`);
      await step('invoices', `DELETE FROM fi_invoices WHERE department_id IN ${deptFilter}`);
      await step('invoice seqs', `DELETE FROM fi_invoice_sequences WHERE department_id IN ${deptFilter}`);
      await step('assessments', `DELETE FROM fi_fee_assessments WHERE department_id IN ${deptFilter}`);
      await step('versions', `DELETE FROM fi_fee_schedule_versions WHERE department_id IN ${deptFilter}`);
      await step('schedules', `DELETE FROM fi_fee_schedules WHERE department_id IN ${deptFilter}`);
      await step('settings', `DELETE FROM fi_settings WHERE department_id IN ${deptFilter}`);
      await step('audit', `DELETE FROM audit_log WHERE department_id IN ${deptFilter}`);
      await step('permits', `DELETE FROM fi_permits WHERE department_id IN ${deptFilter}`);
      await step('properties', `DELETE FROM fi_properties WHERE department_id IN ${deptFilter}`);
      await step('user↔dept', `DELETE FROM of_user_departments WHERE department_id IN ${deptFilter}`);
      await step('users', `DELETE FROM users WHERE username LIKE $1`);
      await step('stations', `DELETE FROM stations WHERE department_id IN ${deptFilter}`);
      await step('departments', `DELETE FROM departments WHERE name LIKE $1`);
      for (const [tbl, trg] of triggers) {
        await step(`enable ${trg}`, `ALTER TABLE ${tbl} ENABLE TRIGGER ${trg}`, []);
      }
      try {
        const { rows } = await pool.query(
          `SELECT (SELECT count(*) FROM fi_payments WHERE department_id IN ${deptFilter}) AS p,
                  (SELECT count(*) FROM fi_receipt_sequences WHERE department_id IN ${deptFilter}) AS s,
                  (SELECT count(*) FROM fi_invoices WHERE department_id IN ${deptFilter}) AS i`, like);
        if (Number(rows[0].p) || Number(rows[0].s) || Number(rows[0].i)) {
          console.error(`[payments teardown] RESIDUE LEFT BEHIND: ${JSON.stringify(rows[0])}`);
        }
      } catch { /* pool may already be closing */ }
      try { await pool.end(); } catch { /* already closed */ }
    });

    const A = await mkAlignedDeptStation(pool, `${MARK}-A`);
    const B = await mkAlignedDeptStation(pool, `${MARK}-B`);

    const mkUser = async (dept, role, tag) => {
      const uname = `${MARK}-${tag}`;
      const { rows } = await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
         VALUES ($1,$2,'XX',$3,'x',$4) RETURNING id`,
        [uname, `${tag} user`, role, dept]);
      await pool.query(
        'INSERT INTO of_user_departments (user_id, department_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [rows[0].id, dept, role]);
      return jwt.sign({ sub: rows[0].id, username: uname, role }, ACCESS_SECRET, { expiresIn: '1h' });
    };
    const adminA  = await mkUser(A, 'chief',  'adminA');
    const memberA = await mkUser(A, 'member', 'memberA');
    const adminB  = await mkUser(B, 'chief',  'adminB');

    const server = app.listen(0);
    t.after(() => new Promise((r) => server.close(r)));

    const api = async (method, path, token, body) => {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json = null; try { json = JSON.parse(text); } catch { /* csv or empty */ }
      return { status: res.status, json, text, headers: res.headers };
    };
    const PAY = '/api/fi-payments';
    const INV = '/api/fi-invoices';
    const today = new Date().toISOString().slice(0, 10);

    /* ── An unconfigured prefix REFUSES ──────────────────────────────────────────────── */
    const noPrefix = await api('POST', PAY, adminA,
      { invoice_id: 1, amount: '10.00', method: 'cash', payor_name: 'X', received_date: today });
    assert.equal(noPrefix.status, 409, 'no prefix → refuse, never FY2026--R000001');
    assert.equal(noPrefix.json.code, 'INVOICE_PREFIX_NOT_CONFIGURED');

    for (const [dept, prefix] of [[A, 'AFD'], [B, 'BFD']]) {
      await pool.query(
        `INSERT INTO fi_settings (department_id, invoice_number_prefix, fiscal_year_start_month)
         VALUES ($1,$2,1)
         ON CONFLICT (department_id) DO UPDATE SET invoice_number_prefix = $2`, [dept, prefix]);
    }

    /* ── Fixture: an invoice for $100 in dept A ──────────────────────────────────────── */
    const inv1 = await api('POST', INV, adminA, {
      bill_to_name: 'Acme Warehousing', invoice_date: today,
      lines: [{ line_kind: 'fee', description: 'Annual operational permit', amount: '100.00' }],
    });
    assert.equal(inv1.status, 201, `invoice fixture: ${JSON.stringify(inv1.json)}`);
    const invoiceId = inv1.json.data.id;

    /* ── SEPARATION OF DUTIES (R8) ───────────────────────────────────────────────────── */
    const memberWrite = await api('POST', PAY, memberA,
      { invoice_id: invoiceId, amount: '60.00', method: 'cash', payor_name: 'Acme', received_date: today });
    assert.equal(memberWrite.status, 403, 'a member/inspector must not record money');
    assert.equal(memberWrite.json.code, 'FORBIDDEN_FI');

    /* ── NEAR-MISS REFUSAL on the closed method set ──────────────────────────────────── */
    for (const nearMiss of ['Check', 'CASH', 'cash ', 'Cash', 'debit']) {
      const r = await api('POST', PAY, adminA,
        { invoice_id: invoiceId, amount: '60.00', method: nearMiss, payor_name: 'Acme', received_date: today });
      assert.equal(r.status, 400, `method ${JSON.stringify(nearMiss)} must be REFUSED, never coerced`);
    }

    /* ── A check must carry its number; a number belongs on an instrument ────────────── */
    const noCheckNum = await api('POST', PAY, adminA,
      { invoice_id: invoiceId, amount: '60.00', method: 'check', payor_name: 'Acme', received_date: today });
    assert.equal(noCheckNum.status, 422);
    assert.equal(noCheckNum.json.code, 'CHECK_NUMBER_REQUIRED');
    const cashWithNum = await api('POST', PAY, adminA,
      { invoice_id: invoiceId, amount: '60.00', method: 'cash', check_number: '123',
        payor_name: 'Acme', received_date: today });
    assert.equal(cashWithNum.status, 422);
    assert.equal(cashWithNum.json.code, 'CHECK_NUMBER_NOT_APPLICABLE');

    /* ── An engine refusal reaches a clerk as a SENTENCE, not as JSON ────────────────── */
    // This route passed paymentEngine's structured errors straight into `details`, so
    // errorHandler JSON.stringify'd each one. fiFeeSchedules had flattened its own since day
    // one and left a comment saying to; this route and fiInvoices were written later and did
    // not inherit it. Fixed 2026-08-07 by moving the flattener into routeKit.
    // '0.00' passes the zod money regex and is refused by the ENGINE, which is what makes it
    // the right probe — a zod failure would be a 400 and would never reach the flattener.
    const zeroAmount = await api('POST', PAY, adminA,
      { invoice_id: invoiceId, amount: '0.00', method: 'cash', payor_name: 'Acme', received_date: today });
    assert.equal(zeroAmount.status, 422);
    assert.equal(zeroAmount.json.code, 'AMOUNT_NOT_RECORDABLE');
    assert.ok(Array.isArray(zeroAmount.json.details));
    assert.ok(zeroAmount.json.details.every((d) => typeof d === 'string' && !d.startsWith('{')),
      `details must be sentences, not JSON blobs: ${JSON.stringify(zeroAmount.json.details)}`);
    assert.ok(zeroAmount.json.details.some((d) => d.includes('NOT_POSITIVE')),
      'the refusal must name why');

    /* ── Record a valid payment; read it back ────────────────────────────────────────── */
    const pay1 = await api('POST', PAY, adminA, {
      invoice_id: invoiceId, amount: '60.00', method: 'check', check_number: '4471',
      payor_name: 'Acme Warehousing', received_date: today, idempotency_key: `${MARK}-pay1-key`,
    });
    assert.equal(pay1.status, 201, `record payment: ${JSON.stringify(pay1.json)}`);
    assert.match(pay1.json.data.receipt_number, /^FY\d{4}-AFD-R000001$/);
    const read1 = await api('GET', `${PAY}/${pay1.json.data.id}`, memberA);
    assert.equal(read1.status, 200, 'an inspector/member CAN read a receipt');
    assert.equal(read1.json.data.amount, '60.00');

    /* ── Idempotent replay: one row, and the counter DID NOT BURN a number ───────────── */
    const replay = await api('POST', PAY, adminA, {
      invoice_id: invoiceId, amount: '60.00', method: 'check', check_number: '4471',
      payor_name: 'Acme Warehousing', received_date: today, idempotency_key: `${MARK}-pay1-key`,
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.json.duplicate, true, 'a replay answers duplicate = success');
    const { rows: countRows } = await pool.query(
      `SELECT count(*) AS n FROM fi_payments WHERE department_id = $1`, [A]);
    assert.equal(Number(countRows[0].n), 1, 'exactly one receipt exists after the replay');
    const pay2 = await api('POST', PAY, adminA, {
      invoice_id: invoiceId, amount: '50.00', method: 'cash',
      payor_name: 'Acme Warehousing', received_date: today,
    });
    assert.equal(pay2.status, 201);
    assert.match(pay2.json.data.receipt_number, /R000002$/,
      'the replayed allocation returned its number — sequence 2, not 3 (counter-row, not SEQUENCE)');

    /* ── Balance is DERIVED: 100 − 60 − 50 = −10 → overpayment is representable ──────── */
    const bal1 = await api('GET', `${PAY}/balances?invoice_id=${invoiceId}`, memberA);
    assert.equal(bal1.status, 200);
    assert.equal(bal1.json.data[0].paid_amount, '110.00');
    assert.equal(bal1.json.data[0].balance, '-10.00', 'overpayment is a NEGATIVE balance, not an error');

    /* ── Refund authorisation: reasoned, approved, adds back to the balance ──────────── */
    const refund1 = await api('POST', `${PAY}/refund`, adminA, {
      invoice_id: invoiceId, amount: '10.00', refund_of_payment_id: pay2.json.data.id,
      reason_code: 'overpayment', reason_text: 'Payer overpaid the annual permit fee by $10.',
      approving_authority: 'FM Diaz', payee_name: 'Acme Warehousing', authorized_date: today,
    });
    assert.equal(refund1.status, 201, `refund: ${JSON.stringify(refund1.json)}`);
    assert.match(refund1.json.data.receipt_number, /R000003$/, 'refunds draw from the SAME series');
    const bal2 = await api('GET', `${PAY}/balances?invoice_id=${invoiceId}`, adminA);
    assert.equal(bal2.json.data[0].refunded_amount, '10.00');
    assert.equal(bal2.json.data[0].balance, '0.00');

    /* ── The R9 band: unset = no change; set = second approver required at/above it ──── */
    await pool.query(
      `UPDATE fi_settings SET waiver_approval_threshold = 500.00 WHERE department_id = $1`, [A]);
    const bigRefundNoSecond = await api('POST', `${PAY}/refund`, adminA, {
      invoice_id: invoiceId, amount: '500.00',
      reason_code: 'paid_in_error', reason_text: 'Recorded against the wrong obligation.',
      approving_authority: 'FM Diaz', payee_name: 'Acme Warehousing', authorized_date: today,
    });
    assert.equal(bigRefundNoSecond.status, 422, 'at/above the band, a second approver is REQUIRED');
    assert.equal(bigRefundNoSecond.json.code, 'SECOND_APPROVER_REQUIRED');
    const bigRefundSecond = await api('POST', `${PAY}/refund`, adminA, {
      invoice_id: invoiceId, amount: '500.00',
      reason_code: 'paid_in_error', reason_text: 'Recorded against the wrong obligation.',
      approving_authority: 'FM Diaz', second_approver: 'Chief Alvarez',
      payee_name: 'Acme Warehousing', authorized_date: today,
    });
    assert.equal(bigRefundSecond.status, 201, 'with a second named approver, the band opens');
    assert.equal(bigRefundSecond.json.data.refund_second_approver, 'Chief Alvarez');

    /* ── Cross-tenant refusal, read and write ────────────────────────────────────────── */
    const bReads = await api('GET', `${PAY}/${pay1.json.data.id}`, adminB);
    assert.equal(bReads.status, 404, "dept B cannot read A's receipt");
    const bVoids = await api('POST', `${PAY}/${pay1.json.data.id}/void`, adminB,
      { reason_code: 'other', reason_text: 'x', approving_authority: 'y' });
    assert.equal(bVoids.status, 404, "dept B cannot void A's receipt");
    const bList = await api('GET', PAY, adminB);
    assert.equal(bList.json.data.length, 0, "dept B's list shows none of A's receipts");
    const bBal = await api('GET', `${PAY}/balances?invoice_id=${invoiceId}`, adminB);
    assert.equal(bBal.json.data.length, 0, "dept B cannot read A's balances");

    /* ── Void: one-way, consume-and-retain; a member cannot ─────────────────────────── */
    const memberVoid = await api('POST', `${PAY}/${pay2.json.data.id}/void`, memberA,
      { reason_code: 'duplicate', reason_text: 'x', approving_authority: 'y' });
    assert.equal(memberVoid.status, 403);
    const voided = await api('POST', `${PAY}/${pay2.json.data.id}/void`, adminA, {
      reason_code: 'recorded_in_error',
      reason_text: 'Second payment was recorded against the wrong invoice.',
      approving_authority: 'FM Diaz',
    });
    assert.equal(voided.status, 200);
    assert.equal(voided.json.data.status, 'Void');
    assert.equal(voided.json.data.amount, '50.00', 'the original amount SURVIVES the void');
    const reVoid = await api('POST', `${PAY}/${pay2.json.data.id}/void`, adminA,
      { reason_code: 'other', reason_text: 'again', approving_authority: 'z' });
    assert.equal(reVoid.status, 409, 'a void resolves exactly once');
    const bal3 = await api('GET', `${PAY}/balances?invoice_id=${invoiceId}`, adminA);
    assert.equal(bal3.json.data[0].paid_amount, '60.00', 'a voided receipt counts for NOTHING');

    /* ── No PATCH exists at all ──────────────────────────────────────────────────────── */
    const patch = await api('PATCH', `${PAY}/${pay1.json.data.id}`, adminA, { amount: '1.00' });
    assert.equal(patch.status, 404, 'there is no in-place correction door to guard');

    /* ── Gap report: dense series, and a VOIDED number is NOT a gap ──────────────────── */
    const gaps = await api('GET', `${PAY}/gap-report`, memberA);
    assert.equal(gaps.status, 200);
    assert.equal(gaps.json.data.clean, true,
      'voided receipts consume-and-retain — the series is dense, no gaps to investigate');

    /* ── The export: charge + payment + refund, JSON and CSV ─────────────────────────── */
    const exp = await api('GET', `${PAY}/export`, memberA);
    assert.equal(exp.status, 200);
    const kinds = new Set(exp.json.data.map((r) => r.transaction_kind));
    assert.ok(kinds.has('charge') && kinds.has('payment') && kinds.has('refund'),
      `export carries all three transaction kinds, got ${[...kinds]}`);
    const expCsv = await api('GET', `${PAY}/export?format=csv`, memberA);
    assert.equal(expCsv.status, 200);
    assert.match(expCsv.headers.get('content-type'), /text\/csv/);
    assert.match(expCsv.text.split('\n')[0], /^transaction_kind,document_number/);

    /* ── R3 ISSUANCE GATE #1 ─────────────────────────────────────────────────────────── */
    const { rows: [prop] } = await pool.query(
      `INSERT INTO fi_properties (name, address, department_id, station_id)
       VALUES ($1, '1 Test Way', $2, $2) RETURNING id`, [`${MARK} Prop`, A]);
    const mkPermit = async () => {
      const { rows: [p] } = await pool.query(
        `INSERT INTO fi_permits ("propertyId", type, status, department_id, station_id)
         VALUES ($1, 'operational', 'Pending', $2, $2) RETURNING id`, [prop.id, A]);
      return p.id;
    };

    // (a) committed-but-uninvoiced assessment blocks
    const { rows: [sched] } = await pool.query(
      `INSERT INTO fi_fee_schedules (department_id, name) VALUES ($1, $2) RETURNING id`,
      [A, `${MARK} sched`]);
    // An Adopted version cannot exist without naming its adopting instrument (0118's
    // frozen-adoption CHECK) — the fixture complies with the doctrine it lives under.
    const { rows: [ver] } = await pool.query(
      `INSERT INTO fi_fee_schedule_versions (department_id, schedule_id, version, effective_from,
         status, adopting_instrument, adopting_instrument_ref, adopted_by, adopted_on)
       VALUES ($1, $2, 1, '2020-01-01', 'Adopted',
         'board_resolution', 'R-2020-01', 'Board of Fire Commissioners', '2020-01-01')
       RETURNING id`, [A, sched.id]);
    const permitU = await mkPermit();
    await pool.query(
      `INSERT INTO fi_fee_assessments (department_id, permit_id, schedule_version_id, vesting_date,
         computed_amount, committed_amount, committed_by_user_id, committed_at)
       VALUES ($1, $2, $3, '2026-01-01', 75.00, 75.00, 1, NOW())`, [A, permitU, ver.id]);
    const blockedU = await api('POST', `/api/fi-permits/${permitU}/issue`, adminA, { issuedDate: today });
    assert.equal(blockedU.status, 422, 'a committed, uninvoiced fee must block issuance');
    assert.equal(blockedU.json.code, 'ISSUANCE_BLOCKED');
    assert.match(JSON.stringify(blockedU.json.details), /has not been invoiced/);

    // (b) an unpaid invoice chain blocks; paying it in full (across the chain) unblocks
    const permitP = await mkPermit();
    const invP = await api('POST', INV, adminA, {
      bill_to_name: 'Chain Owner', invoice_date: today,
      lines: [{ line_kind: 'fee', description: 'Permit fee', amount: '100.00', permit_id: permitP }],
    });
    assert.equal(invP.status, 201);
    const blockedP = await api('POST', `/api/fi-permits/${permitP}/issue`, adminA, { issuedDate: today });
    assert.equal(blockedP.status, 422, 'an unpaid invoice must block issuance');
    assert.match(JSON.stringify(blockedP.json.details), /outstanding balance/);

    // A −$30 adjustment corrects the charge; $70 pays the CHAIN in full.
    const adj = await api('POST', `${INV}/${invP.json.data.id}/adjust`, adminA, {
      reason_code: 'overcharge', reason_text: 'Rate table error — corrected per adopted schedule.',
      approving_authority: 'FM Diaz', invoice_date: today,
      lines: [{ line_kind: 'fee', description: 'Overcharge credit', amount: '-30.00', permit_id: permitP }],
    });
    assert.equal(adj.status, 201, `adjustment: ${JSON.stringify(adj.json)}`);
    const stillBlocked = await api('POST', `/api/fi-permits/${permitP}/issue`, adminA, { issuedDate: today });
    assert.equal(stillBlocked.status, 422, '70 still owing across the chain');
    const payChain = await api('POST', PAY, adminA, {
      invoice_id: invP.json.data.id, amount: '70.00', method: 'cash',
      payor_name: 'Chain Owner', received_date: today,
    });
    assert.equal(payChain.status, 201);
    const issued = await api('POST', `/api/fi-permits/${permitP}/issue`, adminA, { issuedDate: today });
    assert.equal(issued.status, 200,
      `chain settled (100 − 30 − 70 = 0) → the gate opens: ${JSON.stringify(issued.json)}`);

    /* ── MIRROR FENCE: JS closed sets == live CHECK sets, both directions ────────────── */
    const { diffAgainstDatabase } = require('../constants/payment');
    const liveSet = async (needle) => {
      const { rows } = await pool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'fi_payments'::regclass AND contype = 'c'
            AND pg_get_constraintdef(oid) LIKE $1`, [`%${needle}%`]);
      assert.ok(rows.length >= 1, `no live CHECK found for ${needle}`);
      const m = rows[0].def.match(/ARRAY\[([^\]]+)\]/);
      assert.ok(m, `could not parse the ${needle} CHECK: ${rows[0].def}`);
      return m[1].split(',').map((s) => s.trim().replace(/^'/, '').replace(/'::text$/, ''));
    };
    for (const [setName, needle] of [
      // 'ach' is unique to the method CHECK — 'money_order' also appears in the
      // check-number instrument CHECK and would match the wrong constraint.
      ['PAYMENT_METHODS', "'ach'"],
      ['REFUND_REASON_CODES', "'duplicate_payment'"],
      ['PAYMENT_VOID_REASON_CODES', "'recorded_in_error'"],
    ]) {
      const diff = diffAgainstDatabase(setName, await liveSet(needle));
      assert.deepEqual(diff.inDatabaseOnly, [], `${setName}: values in DB unknown to JS`);
      assert.deepEqual(diff.inCodeOnly, [], `${setName}: values in JS the DB would refuse`);
    }
  });
}
