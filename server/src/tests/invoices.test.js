/**
 * invoices.test.js — the 3.2 Slice B route surface against a live DB.
 *
 * THE CLAIMS THIS SUITE EXISTS TO PROVE, each because it is a way money or a legal record could
 * be quietly corrupted:
 *   · F14 SEPARATION OF DUTIES — an inspector may READ an invoice and the gap report, and may
 *     not issue, void, adjust or stamp one. The 2018 fire-marshal audit's verbatim finding was
 *     "Inspectors had access rights to change fees in the system."
 *   · F13 cross-tenant refusal on EVERY invoice route, read and write.
 *   · F5 AN ISSUED INVOICE IS NEVER EDITED IN PLACE — there is no PATCH, and the correction
 *     path produces a NEW row with the original unchanged.
 *   · F11 VOID IS NOT DELETE — the voided row is still present, still numbered, reason-coded,
 *     approver-stamped, with its original amounts preserved.
 *   · F12 A SEQUENCE GAP IS SURFACED — and a VOIDED number is NOT reported as a gap, because a
 *     void consumes and retains its number.
 *   · F10 A REPLAYED GENERATION MINTS ONE DOCUMENT — the second call answers `duplicate`, which
 *     counts as success, and exactly one row exists.
 *   · F18 ZERO-AMOUNT AND VOIDED RECORDS ARE FIRST-CLASS — the auditor's first two stops are
 *     queryable filters, not something to eyeball.
 *   · NO CLIENT-SUPPLIED TOTALS — the five money columns are computed server-side from the lines.
 *   · A DUNNING STAMP IS A FACT ABOUT THE PAST — set once, never rewritten, never predating the
 *     invoice. And nothing escalates on a timer (R2: "Stamps yes, engine no").
 *   · AN UNCONFIGURED PREFIX IS A REFUSAL, not FY2026--000001 on a permanent document.
 *
 * ⚠ TEARDOWN ORDER IS LOAD-BEARING, and inherits the feeSchedules lesson: the append-only
 * triggers on fi_invoices and fi_invoice_lines refuse UPDATE/DELETE FOR EVERY ROLE INCLUDING
 * THE TABLE OWNER. That is correct in production — an issued document is never deleted, only
 * voided — but it means this fixture cannot clean up without disabling them. Doing that in
 * teardown, against a local database, is legitimate; there is deliberately no such door in the
 * app. Lines must also go before the permits/assessments they cite (ON DELETE RESTRICT).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { mkAlignedDeptStation } = require('./helpers/alignedTenant');

const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;

if (!TENANCY_TEST_DB) {
  console.log('[invoices] TENANCY_TEST_DB not set — skipping.');
  test('invoices (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('invoices: numbering, immutability, void, adjustment, gaps, duties', async (t) => {
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

    const MARK = `INV-${Date.now()}`;

    t.after(async () => {
      const like = [`${MARK}%`];
      const deptFilter = `(SELECT id FROM departments WHERE name LIKE $1)`;
      const step = async (label, sql, params = like) => {
        try { await pool.query(sql, params); } catch (e) {
          console.error(`[invoices teardown] ${label} FAILED: ${e.message}`);
        }
      };
      const triggers = [
        ['fi_invoices', 'trg_fi_invoices_append_only'],
        ['fi_invoice_lines', 'trg_fi_invoice_lines_append_only'],
      ];
      for (const [tbl, trg] of triggers) {
        await step(`disable ${trg}`, `ALTER TABLE ${tbl} DISABLE TRIGGER ${trg}`, []);
      }
      await step('lines', `DELETE FROM fi_invoice_lines WHERE department_id IN ${deptFilter}`);
      // Adjustments reference their parent invoice (RESTRICT), so children first.
      await step('adjustments', `DELETE FROM fi_invoices WHERE department_id IN ${deptFilter} AND adjusts_invoice_id IS NOT NULL`);
      await step('invoices', `DELETE FROM fi_invoices WHERE department_id IN ${deptFilter}`);
      await step('sequences', `DELETE FROM fi_invoice_sequences WHERE department_id IN ${deptFilter}`);
      await step('settings', `DELETE FROM fi_settings WHERE department_id IN ${deptFilter}`);
      await step('audit', `DELETE FROM audit_log WHERE department_id IN ${deptFilter}`);
      await step('permits', `DELETE FROM fi_permits WHERE type LIKE $1`);
      await step('properties', `DELETE FROM fi_properties WHERE name LIKE $1`);
      await step('user↔dept', `DELETE FROM of_user_departments WHERE department_id IN ${deptFilter}`);
      await step('users', `DELETE FROM users WHERE username LIKE $1`);
      await step('stations', `DELETE FROM stations WHERE department_id IN ${deptFilter}`);
      await step('departments', `DELETE FROM departments WHERE name LIKE $1`);
      for (const [tbl, trg] of triggers) {
        await step(`enable ${trg}`, `ALTER TABLE ${tbl} ENABLE TRIGGER ${trg}`, []);
      }
      // A check that CAN fail: prove the fixtures are actually gone. Residue nobody sees
      // becomes a broken migration three commits later (it already did once, blocking 0120).
      try {
        const { rows } = await pool.query(
          `SELECT (SELECT count(*) FROM fi_invoices WHERE department_id IN ${deptFilter}) AS i,
                  (SELECT count(*) FROM fi_invoice_lines WHERE department_id IN ${deptFilter}) AS l,
                  (SELECT count(*) FROM fi_invoice_sequences WHERE department_id IN ${deptFilter}) AS s`, like);
        if (Number(rows[0].i) || Number(rows[0].l) || Number(rows[0].s)) {
          console.error(`[invoices teardown] RESIDUE LEFT BEHIND: ${JSON.stringify(rows[0])}`);
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
      let json = null; try { json = await res.json(); } catch { /* no body */ }
      return { status: res.status, json };
    };
    const BASE = '/api/fi-invoices';
    const today = new Date().toISOString().slice(0, 10);
    const oneLine = [{ line_kind: 'fee', description: 'Annual operational permit', amount: '250.00' }];

    /* ── An unconfigured prefix REFUSES, and says what to fix ────────────────────────── */

    const noPrefix = await api('POST', BASE, adminA,
      { bill_to_name: 'Acme', invoice_date: today, lines: oneLine });
    assert.equal(noPrefix.status, 409,
      'with no prefix configured, issuing must refuse — not mint FY2026--000001 forever');
    assert.equal(noPrefix.json.code, 'INVOICE_PREFIX_NOT_CONFIGURED');

    // Configure both departments. fi_settings is keyed on department_id.
    for (const [dept, prefix] of [[A, 'AFD'], [B, 'BFD']]) {
      await pool.query(
        `INSERT INTO fi_settings (department_id, invoice_number_prefix, fiscal_year_start_month)
         VALUES ($1,$2,1)
         ON CONFLICT (department_id) DO UPDATE SET invoice_number_prefix = $2, fiscal_year_start_month = 1`,
        [dept, prefix]);
    }

    /* ── An engine refusal reaches a clerk as a SENTENCE, not as JSON ────────────────── */
    // This route passed the engine's structured error objects straight into `details`, so
    // errorHandler JSON.stringify'd each one and a clerk was shown
    //   {"code":"NEGATIVE_ON_ORIGINAL","at":"line 1","message":"…","got":"-25.00"}
    // fiFeeSchedules had flattened its own since day one and left a comment saying to; this
    // route and fiPayments were written later and did not inherit it. Fixed 2026-08-07 by
    // moving the flattener into routeKit so there is one of it.
    const negativeOnOriginal = await api('POST', BASE, adminA, {
      bill_to_name: 'Acme', invoice_date: today,
      lines: [{ line_kind: 'fee', description: 'A credit that does not belong here', amount: '-25.00' }],
    });
    assert.equal(negativeOnOriginal.status, 422);
    assert.equal(negativeOnOriginal.json.code, 'INVOICE_NOT_COMPUTABLE');
    assert.ok(Array.isArray(negativeOnOriginal.json.details));
    assert.ok(negativeOnOriginal.json.details.every((d) => typeof d === 'string' && !d.startsWith('{')),
      `details must be sentences, not JSON blobs: ${JSON.stringify(negativeOnOriginal.json.details)}`);
    assert.ok(negativeOnOriginal.json.details.some((d) => d.includes('NEGATIVE_ON_ORIGINAL') && d.includes('line 1')),
      'the refusal must name WHICH line and WHY');

    /* ── F14: separation of duties, in BOTH directions ───────────────────────────────── */

    const memberIssue = await api('POST', BASE, memberA,
      { bill_to_name: 'Acme', invoice_date: today, lines: oneLine });
    assert.equal(memberIssue.status, 403,
      'an inspector must not be able to issue an invoice (the 2018 audit finding)');

    /* ── Issue, and check the number + the server-computed totals ────────────────────── */

    const issued = await api('POST', BASE, adminA, {
      bill_to_name: 'Acme Storage LLC',
      bill_to_address: '1 Test St',
      invoice_date: today,
      lines: [
        { line_kind: 'fee', description: 'Annual operational permit', amount: '250.00' },
        { line_kind: 'posting_fee', description: 'Posting fee', amount: '15.00' },
      ],
    });
    assert.equal(issued.status, 201, JSON.stringify(issued.json));
    const inv1 = issued.json.data;
    const fy = Number(today.slice(0, 4));
    assert.equal(inv1.invoice_number, `FY${fy}-AFD-000001`, 'first number of the fiscal year');
    assert.equal(inv1.status, 'Issued');
    assert.equal(inv1.invoice_kind, 'original');
    // Totals derived from the lines, never from the body.
    assert.equal(inv1.invoice_amount, '265.00');
    assert.equal(inv1.fee_amount, '250.00');
    assert.equal(inv1.posting_fee, '15.00');
    assert.equal(inv1.penalty_amount, '0.00');
    assert.equal(inv1.issued_by_user_id != null, true, 'attribution is a user id, not a name string');

    // The CONTROL for "the member is blocked by ROLE, not because the route is broken":
    // the same member CAN read it. Without this, the 403 above could be a mounting error.
    const memberRead = await api('GET', `${BASE}/${inv1.id}`, memberA);
    assert.equal(memberRead.status, 200, 'an inspector MUST be able to read an invoice');
    assert.equal(memberRead.json.data.lines.length, 2);

    const second = await api('POST', BASE, adminA,
      { bill_to_name: 'Second Payer', invoice_date: today, lines: oneLine });
    assert.equal(second.status, 201);
    assert.equal(second.json.data.invoice_number, `FY${fy}-AFD-000002`, 'monotonic within the year');

    /* ── No client-supplied totals: an unknown body key is REFUSED outright ──────────── */

    const totalsInBody = await api('POST', BASE, adminA, {
      bill_to_name: 'Sneaky', invoice_date: today, lines: oneLine, invoice_amount: '1.00',
    });
    assert.equal(totalsInBody.status, 400,
      'zod .strict() refuses an unknown key — a money figure over the wire has no computation behind it');

    /* ── F5: there is NO in-place edit. PATCH does not exist on this router. ─────────── */

    const patch = await api('PATCH', `${BASE}/${inv1.id}`, adminA, { bill_to_name: 'Changed' });
    assert.ok(patch.status === 404 || patch.status === 405,
      `an issued invoice has no edit route at all; got ${patch.status}`);

    /* ── F10: a replayed generation mints ONE document ───────────────────────────────── */

    const key = `${MARK}-idem-key-1234`;
    const first  = await api('POST', BASE, adminA,
      { bill_to_name: 'Replay Co', invoice_date: today, lines: oneLine, idempotency_key: key });
    const replay = await api('POST', BASE, adminA,
      { bill_to_name: 'Replay Co', invoice_date: today, lines: oneLine, idempotency_key: key });
    assert.equal(first.status, 201);
    assert.equal(replay.status, 200, 'a replay is answered as SUCCESS, not as a conflict');
    assert.equal(replay.json.duplicate, true);
    assert.equal(replay.json.data.id, first.json.data.id, 'same document, not a second one');
    const { rows: dupRows } = await pool.query(
      `SELECT count(*)::int AS n FROM fi_invoices WHERE department_id = $1 AND idempotency_key = $2`,
      [A, key]);
    assert.equal(dupRows[0].n, 1, 'exactly one row exists for the key');

    /* ── F11: VOID IS NOT DELETE ─────────────────────────────────────────────────────── */

    const unreasonedVoid = await api('POST', `${BASE}/${second.json.data.id}/void`, adminA,
      { reason_code: 'duplicate' });
    assert.equal(unreasonedVoid.status, 400, 'a void with no written reason is refused by the schema');

    const badCode = await api('POST', `${BASE}/${second.json.data.id}/void`, adminA,
      { reason_code: 'Duplicate', reason_text: 'x', approving_authority: 'Fire Marshal' });
    assert.equal(badCode.status, 400,
      'the closed set is matched EXACTLY — "Duplicate" is not "duplicate" (the /^pass\\b/i lesson)');

    const voided = await api('POST', `${BASE}/${second.json.data.id}/void`, adminA, {
      reason_code: 'duplicate',
      reason_text: 'Same charge already invoiced as 000001',
      approving_authority: 'Fire Marshal',
    });
    assert.equal(voided.status, 200, JSON.stringify(voided.json));
    assert.equal(voided.json.data.status, 'Void');
    assert.equal(voided.json.data.invoice_number, `FY${fy}-AFD-000002`, 'the number is RETAINED');
    assert.equal(voided.json.data.invoice_amount, '250.00', 'the original amount is PRESERVED');
    assert.equal(voided.json.data.void_reason_code, 'duplicate');
    assert.ok(voided.json.data.voided_by_user_id != null, 'a void is never anonymous');

    const revoid = await api('POST', `${BASE}/${second.json.data.id}/void`, adminA, {
      reason_code: 'issued_in_error', reason_text: 'Actually a different reason',
      approving_authority: 'Fire Marshal',
    });
    assert.equal(revoid.status, 409, 'a void is recorded ONCE and never rewritten');
    assert.equal(revoid.json.code, 'ALREADY_VOID');

    /* ── F12: gaps. A voided number is accounted for, NOT a gap. ─────────────────────── */

    const gaps1 = await api('GET', `${BASE}/gap-report`, memberA);
    assert.equal(gaps1.status, 200, 'an inspector MUST be able to read the gap report');
    assert.equal(gaps1.json.data.clean, true,
      'three numbers allocated, three documents (one of them VOID) — no gap');
    assert.equal(gaps1.json.data.total, 0);

    /**
     * 🟢 THE COUNTER-NOT-SEQUENCE DESIGN, PROVEN RATHER THAN ASSERTED.
     *
     * Exactly THREE numbers have been allocated at this point, not four — and the fourth
     * mint attempt is why. The idempotency replay above allocated a number, then failed the
     * unique index, and the whole single-statement mint rolled back INCLUDING the counter
     * increment. A Postgres SEQUENCE would have burned that number permanently and this gap
     * report would now show a phantom gap at 000004, sending an auditor after a document
     * that was never issued.
     *
     * I got this wrong on the first run: I predicted 5 allocated and the report said 3. The
     * code was right and my arithmetic was wrong, which is the useful direction to be wrong in.
     */
    const { rows: [ctr] } = await pool.query(
      `SELECT last_sequence FROM fi_invoice_sequences WHERE department_id = $1 AND fiscal_year = $2`,
      [A, fy]);
    assert.equal(Number(ctr.last_sequence), 3,
      'a rolled-back mint returns its number to the counter instead of burning it');

    // Now MANUFACTURE a gap and prove the report goes red. Without this the assertion above
    // could be passing because the view returns nothing at all.
    await pool.query(
      `UPDATE fi_invoice_sequences SET last_sequence = last_sequence + 2
        WHERE department_id = $1 AND fiscal_year = $2`, [A, fy]);
    const gaps2 = await api('GET', `${BASE}/gap-report`, memberA);
    assert.equal(gaps2.json.data.clean, false, 'the check CAN fail — so its passing meant something');
    assert.equal(gaps2.json.data.total, 2);
    assert.deepEqual(gaps2.json.data.byFiscalYear[0].numbers,
      [`FY${fy}-AFD-000004`, `FY${fy}-AFD-000005`]);
    // Put the counter back so later numbering assertions read cleanly.
    await pool.query(
      `UPDATE fi_invoice_sequences SET last_sequence = last_sequence - 2
        WHERE department_id = $1 AND fiscal_year = $2`, [A, fy]);

    /* ── The correction model: a NEW linked record, and the original UNCHANGED ───────── */

    const adjusted = await api('POST', `${BASE}/${inv1.id}/adjust`, adminA, {
      reason_code: 'overcharge',
      reason_text: 'Charged for two tanks; only one is present',
      approving_authority: 'Fire Marshal',
      invoice_date: today,
      lines: [{ line_kind: 'fee', description: 'Credit: one tank overcharged', amount: '-125.00' }],
    });
    assert.equal(adjusted.status, 201, JSON.stringify(adjusted.json));
    assert.equal(adjusted.json.data.invoice_kind, 'adjustment');
    assert.equal(adjusted.json.data.adjusts_invoice_id, inv1.id);
    assert.equal(adjusted.json.data.invoice_amount, '-125.00', 'an adjustment may be a net credit');
    assert.equal(adjusted.json.data.bill_to_name, 'Acme Storage LLC',
      'the adjustment addresses whoever the original did');

    const reread = await api('GET', `${BASE}/${inv1.id}`, adminA);
    assert.equal(reread.json.data.invoice_amount, '265.00',
      'THE ORIGINAL RENDERS UNCHANGED FOREVER — this is the whole point of the model');
    assert.equal(reread.json.data.status, 'Issued', 'adjusting does not void the parent');
    assert.equal(reread.json.data.adjustments.length, 1, 'the chain is discoverable from the parent');

    const unreasonedAdjust = await api('POST', `${BASE}/${inv1.id}/adjust`, adminA, {
      reason_code: 'overcharge', reason_text: '', approving_authority: 'Fire Marshal',
      invoice_date: today, lines: oneLine,
    });
    assert.equal(unreasonedAdjust.status, 400, 'an unreasoned adjustment is refused');

    const adjustVoid = await api('POST', `${BASE}/${second.json.data.id}/adjust`, adminA, {
      reason_code: 'overcharge', reason_text: 'x', approving_authority: 'Fire Marshal',
      invoice_date: today, lines: oneLine,
    });
    assert.equal(adjustVoid.status, 409, 'a void document has no balance to adjust');

    /* ── Dunning: a stamp is a fact about the past ───────────────────────────────────── */

    const stamp1 = await api('POST', `${BASE}/${inv1.id}/stamp`, adminA,
      { stamp: 'second_notice_date', date: today });
    assert.equal(stamp1.status, 200, JSON.stringify(stamp1.json));
    assert.equal(stamp1.json.data.second_notice_date.slice(0, 10), today);

    const restamp = await api('POST', `${BASE}/${inv1.id}/stamp`, adminA,
      { stamp: 'second_notice_date', date: today });
    assert.equal(restamp.status, 409, 'a stamp cannot be rewritten once set');
    assert.equal(restamp.json.code, 'STAMP_ALREADY_SET');

    // A clerk mistyping a year is a foreseeable user action, so it must not surface as a 500
    // carrying a raw constraint name. The DB CHECK remains the authority; the route states the
    // same rule readably. (First run of this suite proved the 500: "violates check constraint
    // fi_invoices_check7" — a real defect found by writing the test, then fixed.)
    const backdated = await api('POST', `${BASE}/${inv1.id}/stamp`, adminA,
      { stamp: 'lien_date', date: '2000-01-01' });
    assert.equal(backdated.status, 422, 'a stamp predating the invoice is a 422, not a 500');
    assert.equal(backdated.json.code, 'STAMP_BEFORE_INVOICE_DATE');
    // `details` is the documented `string[]` — the errorHandler normalizes an object into
    // "key: value" lines on purpose (see its normalizeDetails note). Assert the contract that
    // exists, not the one I assumed.
    assert.ok(Array.isArray(backdated.json.details));
    assert.ok(backdated.json.details.some((d) => d.startsWith('invoice_date:')),
      'the error names the date it conflicts with, so a clerk can see which one to fix');

    // And the CHECK is still the authority — prove the guard survives the route being bypassed.
    await assert.rejects(
      () => pool.query(`UPDATE fi_invoices SET final_notice_date = '2000-01-01' WHERE id = $1`, [inv1.id]),
      /check constraint/,
      'the database refuses a backdated stamp even when nothing asks the route');

    const unknownStamp = await api('POST', `${BASE}/${inv1.id}/stamp`, adminA,
      { stamp: 'paid_date', date: today });
    assert.equal(unknownStamp.status, 400,
      'paid_date is NOT a dunning stamp and does not exist — payment recording awaits a ruling');

    const memberStamp = await api('POST', `${BASE}/${inv1.id}/stamp`, memberA,
      { stamp: 'final_notice_date', date: today });
    assert.equal(memberStamp.status, 403, 'an inspector does not pursue collections');

    /* ── F18: the auditor's two first stops are FILTERS ──────────────────────────────── */

    const zeroInv = await api('POST', BASE, adminA, {
      bill_to_name: 'Exempt: place of worship', invoice_date: today,
      lines: [{ line_kind: 'fee', description: 'Statutory exemption — no fee', amount: '0.00' }],
    });
    assert.equal(zeroInv.status, 201, 'a zero-amount invoice is a legal, authored document');
    assert.equal(zeroInv.json.data.invoice_amount, '0.00');

    const zeroList = await api('GET', `${BASE}?zero_amount=1`, memberA);
    assert.equal(zeroList.status, 200);
    assert.equal(zeroList.json.data.some((r) => r.id === zeroInv.json.data.id), true,
      'a $0 invoice is a queryable ROW, never an absence');

    const voidList = await api('GET', `${BASE}?voided=1`, memberA);
    assert.equal(voidList.json.data.every((r) => r.voided_at !== null), true);
    assert.equal(voidList.json.data.some((r) => r.id === second.json.data.id), true);

    /* ── F13: cross-tenant refusal on every route ────────────────────────────────────── */

    const bRead = await api('GET', `${BASE}/${inv1.id}`, adminB);
    assert.equal(bRead.status, 404, "another department's invoice does not exist to B");

    const bVoid = await api('POST', `${BASE}/${inv1.id}/void`, adminB,
      { reason_code: 'duplicate', reason_text: 'not mine', approving_authority: 'X' });
    assert.equal(bVoid.status, 404, "B cannot void A's invoice");

    const bAdjust = await api('POST', `${BASE}/${inv1.id}/adjust`, adminB, {
      reason_code: 'overcharge', reason_text: 'not mine', approving_authority: 'X',
      invoice_date: today, lines: oneLine,
    });
    assert.equal(bAdjust.status, 404);

    const bStamp = await api('POST', `${BASE}/${inv1.id}/stamp`, adminB,
      { stamp: 'lien_date', date: today });
    assert.equal(bStamp.status, 404);

    const bList = await api('GET', BASE, adminB);
    assert.equal(bList.json.data.some((r) => r.department_id === A), false,
      "A's invoices must not appear in B's list");

    const bGaps = await api('GET', `${BASE}/gap-report`, adminB);
    assert.equal(bGaps.json.data.allocated.length, 0,
      "B has issued nothing, so B's gap report must not see A's numbering");

    /* ── Each department numbers independently, under its OWN prefix ─────────────────── */

    const bIssued = await api('POST', BASE, adminB,
      { bill_to_name: 'B Payer', invoice_date: today, lines: oneLine });
    assert.equal(bIssued.status, 201);
    assert.equal(bIssued.json.data.invoice_number, `FY${fy}-BFD-000001`,
      "B's sequence starts at 1 under B's prefix — numbering is per-department, not global");

    /* ── The physical guard: even the raw UPDATE is refused by the trigger ───────────── */

    await assert.rejects(
      () => pool.query(`UPDATE fi_invoices SET invoice_amount = 1.00 WHERE id = $1`, [inv1.id]),
      /append-only/,
      'the trigger refuses a money rewrite even from the owner connection — the route is the '
      + 'second line of defence, not the only one');

    await assert.rejects(
      () => pool.query(`DELETE FROM fi_invoices WHERE id = $1`, [inv1.id]),
      /never deleted/,
      'an issued invoice is never deleted, only voided');

    await assert.rejects(
      () => pool.query(`UPDATE fi_invoice_lines SET amount = 1.00 WHERE invoice_id = $1`, [inv1.id]),
      /append-only/,
      'a line is part of an issued document and has no seam at all');
  });
}
