'use strict';
/**
 * routes/fiPayments.js — the payment ledger's surface (Phase 3, module 3.2 Slice C).
 *
 * 0126 put two tables + two views on prod. This is the writer and the read paths.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * SEPARATION OF DUTIES (R8 — spec §4b; the 2018 audit's "Inspectors had access rights to
 * change fees in the system")
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *   · requireInspector       — READ receipts, the gap report, balances, and the export.
 *   · requirePreventionAdmin — RECORD a payment, AUTHORIZE a refund, VOID a receipt.
 * There is deliberately NO cashier role or toggle (R8): in the dominant municipal model the
 * money is taken by the city's shared cash-receipting function, not by the fire module, so
 * no competitor ships a fire-side cashier designation and building one would EXCEED the
 * market bar (R1 forbids exceeding in both directions). The grant layer is the second line:
 * 0126 revokes UPDATE/DELETE from of_app and re-grants only the void seam.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS ROUTE WILL NOT DO
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * · NO payment EXECUTION. Never merchant of record; cards stay in the hosted flow
 *   (ADR-0001). This records money that has ALREADY been received.
 * · NO stored balance. Balance is DERIVED (fi_invoice_balances) every time it is read.
 * · NO in-place correction, ever. There is no PATCH on this router. A wrong receipt is
 *   VOIDED (consume-and-retain) and re-recorded.
 * · NO refund disbursement. A refund here is an AUTHORISATION record; Finance pays via AP.
 * · NO holds (A15), NO statements, NO write-offs, NO aging, NO GL — confirmed market
 *   absences, non-goals under R1.
 */
const express = require('express');
const router  = express.Router();
const { z } = require('zod');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { scoped, httpError, validate, flattenEngineErrors } = require('../utils/routeKit');
const { loadFiContext, requireInspector, requirePreventionAdmin } = require('../middleware/fiAuth');
const { isIsoDay } = require('../utils/localDate');
const { validateReceiptAmount } = require('../utils/paymentEngine');
const { parseDec } = require('../utils/feeEngine');
const { fiscalYearFor } = require('../constants/invoice');
const {
  PAYMENT_METHODS, REFUND_REASON_CODES, PAYMENT_VOID_REASON_CODES,
} = require('../constants/payment');

const deptOf = (req) => req.user.department_id;

const idParam = z.object({ id: z.string().regex(/^\d+$/) });
const isoDay  = z.string().refine(isIsoDay, 'must be YYYY-MM-DD');
/** Money arrives as STRINGS (a float has already lost it). Strictly positive here. */
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'must be a positive decimal with at most 2 places');

const paymentSchema = z.object({
  invoice_id:    z.number().int().positive(),
  amount:        money,
  // z.enum matches EXACTLY: 'Check', 'CASH' and 'cash ' are each refused, never coerced.
  method:        z.enum(PAYMENT_METHODS),
  check_number:  z.string().trim().min(1).max(60).optional(),
  payor_name:    z.string().trim().min(1).max(200),
  purpose:       z.string().trim().max(300).optional(),
  received_date: isoDay,
  deposit_batch_ref: z.string().trim().max(100).optional(),
  notes:         z.string().trim().max(2000).optional(),
  idempotency_key: z.string().trim().min(8).max(64).optional(),
}).strict();

const refundSchema = z.object({
  invoice_id:    z.number().int().positive(),
  amount:        money,
  refund_of_payment_id: z.number().int().positive().optional(),
  reason_code:   z.enum(REFUND_REASON_CODES),
  reason_text:   z.string().trim().min(1).max(2000),
  approving_authority: z.string().trim().min(1).max(200),
  second_approver: z.string().trim().min(1).max(200).optional(),
  payee_name:    z.string().trim().min(1).max(200),
  authorized_date: isoDay,
  notes:         z.string().trim().max(2000).optional(),
  idempotency_key: z.string().trim().min(8).max(64).optional(),
}).strict();

const voidSchema = z.object({
  reason_code:         z.enum(PAYMENT_VOID_REASON_CODES),
  reason_text:         z.string().trim().min(1).max(2000),
  approving_authority: z.string().trim().min(1).max(200),
}).strict();

const listSchema = z.object({
  kind:       z.enum(['payment', 'refund_authorization']).optional(),
  status:     z.enum(['Recorded', 'Void']).optional(),
  invoice_id: z.string().regex(/^\d+$/).optional(),
  // The auditor's two first stops, as explicit filters.
  voided:     z.enum(['1']).optional(),
  refunds:    z.enum(['1']).optional(),
  limit:      z.string().regex(/^\d{1,3}$/).optional(),
}).strict().partial();

const exportSchema = z.object({
  from:   isoDay.optional(),
  to:     isoDay.optional(),
  format: z.enum(['json', 'csv']).optional(),
}).strict().partial();

/** Same refusal as invoicing: an unset prefix mints a hole into a permanent document. */
async function loadReceiptConfig(dept) {
  const { rows: [cfg] } = await pool.query(
    `SELECT COALESCE(invoice_number_prefix, '') AS prefix,
            COALESCE(fiscal_year_start_month, 1) AS fy_start,
            waiver_approval_threshold
       FROM fi_settings WHERE department_id = $1`, [dept]);
  if (!cfg || !cfg.prefix) {
    throw httpError(409,
      'This department has no invoice number prefix configured. Set one in Prevention settings '
      + 'before recording payments — a receipt number is permanent and cannot be issued with a '
      + 'blank department segment.', 'INVOICE_PREFIX_NOT_CONFIGURED');
  }
  return cfg;
}

/**
 * Mint a receipt — allocation and insert in ONE statement (the 0125 MINT_SQL reasoning:
 * the pool is max:1, and a rolled-back mint must RETURN its number to the counter rather
 * than burning it — that is the whole reason the allocator is a counter row, not a
 * Postgres SEQUENCE).
 */
const MINT_SQL = `
WITH alloc AS (
  INSERT INTO fi_receipt_sequences (department_id, fiscal_year, prefix, last_sequence)
  VALUES ($1, $2, $3, 1)
  ON CONFLICT (department_id, fiscal_year)
    DO UPDATE SET last_sequence = fi_receipt_sequences.last_sequence + 1, updated_at = NOW()
  RETURNING fiscal_year, prefix, last_sequence
)
INSERT INTO fi_payments (
  department_id, kind, receipt_number, fiscal_year, sequence_number,
  invoice_id, amount, method, check_number, payor_name, purpose,
  received_by_user_id, received_date, deposit_batch_ref, notes,
  refund_of_payment_id, refund_reason_code, refund_reason_text,
  refund_approving_authority, refund_second_approver,
  issued_by_user_id, idempotency_key)
SELECT $1, $4,
       format('FY%s-%s-R%s', a.fiscal_year, a.prefix, lpad(a.last_sequence::text, 6, '0')),
       a.fiscal_year, a.last_sequence,
       $5, $6::numeric, $7, $8, $9, $10,
       $11, $12::date, $13, $14,
       $15, $16, $17, $18, $19,
       $20, $21
  FROM alloc a
RETURNING *`;

async function mintReceipt(dept, req, opts) {
  const cfg = await loadReceiptConfig(dept);
  const fy = fiscalYearFor(opts.business_date, cfg.fy_start);

  const checked = validateReceiptAmount(opts.amount);
  if (!checked.ok) {
    throw httpError(422,
      'That amount can\'t be recorded — it must be a positive dollar amount, like 125.00.',
      'AMOUNT_NOT_RECORDABLE', flattenEngineErrors(checked.errors));
  }

  // Readable refusals for what the DB would refuse anyway with a bare 23514/trigger text.
  // The DATABASE remains the authority — these are the human-readable path to the same no.
  const { rows: [inv] } = await pool.query(
    `SELECT id, status, invoice_number FROM fi_invoices WHERE id = $1 AND department_id = $2`,
    [opts.invoice_id, dept]);
  if (!inv) throw httpError(404, 'No such invoice.', 'NOT_FOUND');
  if (inv.status === 'Void') {
    throw httpError(409,
      'That invoice is void — money cannot be applied to it. Record the payment against a '
      + 'live document.', 'CANNOT_PAY_VOID_INVOICE');
  }
  if (opts.kind === 'refund_authorization'
      && cfg.waiver_approval_threshold !== null
      && parseDec(checked.amount) >= parseDec(String(cfg.waiver_approval_threshold))
      && !opts.refund_second_approver) {
    // BigInt comparison via parseDec — money never touches a JS float, even on the
    // readable-message path. The TRIGGER remains the enforcement authority.
    throw httpError(422,
      `A refund of $${checked.amount} is at or above this department's approval threshold `
      + `($${cfg.waiver_approval_threshold}) and requires a second named approver.`,
      'SECOND_APPROVER_REQUIRED');
  }

  let row;
  try {
    ({ rows: [row] } = await pool.query(MINT_SQL, [
      dept, fy, cfg.prefix, opts.kind,
      opts.invoice_id, checked.amount, opts.method ?? null, opts.check_number ?? null,
      opts.counterparty, opts.purpose ?? null,
      req.user.id ?? null, opts.business_date, opts.deposit_batch_ref ?? null, opts.notes ?? null,
      opts.refund_of_payment_id ?? null, opts.refund_reason_code ?? null,
      opts.refund_reason_text ?? null, opts.refund_approving_authority ?? null,
      opts.refund_second_approver ?? null,
      req.user.id ?? null, opts.idempotency_key ?? null,
    ]));
  } catch (err) {
    // F10: a replayed recording must not mint a second receipt. `duplicate` counts as
    // success — the caller's intent was satisfied by the first attempt.
    if (err.code === '23505' && String(err.constraint || '').includes('idempotency')) {
      const { rows: [existing] } = await pool.query(
        `SELECT * FROM fi_payments WHERE department_id = $1 AND idempotency_key = $2`,
        [dept, opts.idempotency_key]);
      return { duplicate: true, payment: existing };
    }
    if (err.code === '23503') {
      throw httpError(422, 'A referenced invoice or payment does not exist.', 'REFERENCE_NOT_FOUND');
    }
    throw err;
  }
  return { duplicate: false, payment: row };
}

// ══ READS ════════════════════════════════════════════════════════════════════════════════

router.get('/',
  loadFiContext, requireInspector,
  validate({ query: listSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const q = req.query;
    const where = ['p.department_id = $1'];
    const params = [dept];
    const add = (clause, value) => { params.push(value); where.push(clause.replace('?', `$${params.length}`)); };

    if (q.kind)       add('p.kind = ?', q.kind);
    if (q.status)     add('p.status = ?', q.status);
    if (q.invoice_id) add('p.invoice_id = ?::int', q.invoice_id);
    if (q.voided === '1')  where.push('p.voided_at IS NOT NULL');
    if (q.refunds === '1') where.push(`p.kind = 'refund_authorization'`);
    const limit = Math.min(Number(q.limit) || 100, 200);
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT p.*, i.invoice_number
         FROM fi_payments p
         JOIN fi_invoices i ON i.id = p.invoice_id
        WHERE ${where.join(' AND ')}
        ORDER BY p.fiscal_year DESC, p.sequence_number DESC
        LIMIT $${params.length}`, params);
    return { data: rows };
  }));

/**
 * The receipt gap report. Mounted BEFORE `/:id` (Express matches in order; the id route
 * would otherwise swallow it and 400 on the digits-only param).
 */
router.get('/gap-report',
  loadFiContext, requireInspector,
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const { rows } = await pool.query(
      `SELECT department_id, fiscal_year, prefix, missing_sequence_number, missing_receipt_number
         FROM fi_receipt_number_gaps
        WHERE department_id = $1
        ORDER BY fiscal_year, missing_sequence_number`, [dept]);
    const { rows: allocated } = await pool.query(
      `SELECT fiscal_year, prefix, last_sequence FROM fi_receipt_sequences
        WHERE department_id = $1 ORDER BY fiscal_year`, [dept]);
    // summariseGaps is invoiceEngine's — deliberately reused; the shape is identical.
    const { summariseGaps } = require('../utils/invoiceEngine');
    const shaped = summariseGaps(rows.map((r) => ({
      fiscal_year: r.fiscal_year,
      missing_invoice_number: r.missing_receipt_number,
      missing_sequence_number: r.missing_sequence_number,
    })));
    return { data: { ...shaped, allocated } };
  }));

/**
 * The transaction export — the one hard requirement in every municipal RFP read in full:
 * "interface all financial transactions … including all payment, charge, and refund
 * transactions." Charges (invoices, incl. adjustments), payments, and refund
 * authorisations, disaggregated by kind, filterable by business date. JSON or CSV.
 */
router.get('/export',
  loadFiContext, requireInspector,
  validate({ query: exportSchema }),
  scoped(async ({ req, res }) => {
    const dept = deptOf(req);
    const { from, to, format } = req.query;
    const params = [dept];
    let dateFilter = '';
    if (from) { params.push(from); dateFilter += ` AND t.transaction_date >= $${params.length}::date`; }
    if (to)   { params.push(to);   dateFilter += ` AND t.transaction_date <= $${params.length}::date`; }

    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT 'charge'::text AS transaction_kind,
                i.invoice_number AS document_number,
                i.invoice_date   AS transaction_date,
                i.invoice_amount AS amount,
                i.status, i.invoice_kind AS detail,
                i.bill_to_name   AS counterparty,
                NULL::text       AS method,
                i.invoice_number AS applies_to,
                i.created_at
           FROM fi_invoices i
          WHERE i.department_id = $1
         UNION ALL
         SELECT CASE WHEN p.kind = 'payment' THEN 'payment' ELSE 'refund' END,
                p.receipt_number,
                p.received_date,
                p.amount,
                p.status, p.kind,
                p.payor_name,
                p.method,
                i.invoice_number,
                p.created_at
           FROM fi_payments p
           JOIN fi_invoices i ON i.id = p.invoice_id
          WHERE p.department_id = $1
       ) t
       WHERE TRUE${dateFilter}
       ORDER BY t.transaction_date, t.created_at`, params);

    if (format === 'csv') {
      const cols = ['transaction_kind', 'document_number', 'transaction_date', 'amount',
                    'status', 'detail', 'counterparty', 'method', 'applies_to'];
      const esc = (v) => {
        if (v === null || v === undefined) return '';
        const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
        // CSV FORMULA INJECTION. `counterparty` is bill_to_name / payor_name — free text an
        // operator typed. Quoting handles the delimiter; it does NOT stop a leading =, +, -,
        // @, tab or CR from being executed as a formula the moment the file opens in a
        // spreadsheet. This file is explicitly the handover to the department's FINANCE
        // system, so the person who opens it is outside our trust boundary by design.
        // A leading apostrophe is the standard neutraliser and is stripped on display.
        const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
        return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
      };
      const csv = [cols.join(',')]
        .concat(rows.map((r) => cols.map((c) => esc(r[c])).join(',')))
        .join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="fi-transactions.csv"');
      res.status(200).send(csv); // scoped() sees headersSent and stops — the streamed path
      return undefined;
    }
    return { data: rows };
  }));

/** Balances for the department's invoices — the derived view, never a stored column. */
router.get('/balances',
  loadFiContext, requireInspector,
  validate({ query: z.object({ invoice_id: z.string().regex(/^\d+$/).optional(),
                               outstanding: z.enum(['1']).optional() }).strict().partial() }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const params = [dept];
    const where = ['b.department_id = $1'];
    if (req.query.invoice_id) {
      params.push(req.query.invoice_id);
      where.push(`b.invoice_id = $${params.length}::int`);
    }
    if (req.query.outstanding === '1') where.push(`b.balance > 0 AND b.status <> 'Void'`);
    const { rows } = await pool.query(
      `SELECT b.* FROM fi_invoice_balances b WHERE ${where.join(' AND ')}
        ORDER BY b.balance DESC, b.invoice_id DESC LIMIT 500`, params);
    return { data: rows };
  }));

router.get('/:id',
  loadFiContext, requireInspector,
  validate({ params: idParam }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const { rows: [payment] } = await pool.query(
      `SELECT p.*, i.invoice_number FROM fi_payments p
         JOIN fi_invoices i ON i.id = p.invoice_id
        WHERE p.id = $1 AND p.department_id = $2`, [+req.params.id, dept]);
    if (!payment) throw httpError(404, 'No such receipt.', 'NOT_FOUND');
    // The refund chain, both directions, so a reader always finds what happened.
    const { rows: refunds } = await pool.query(
      `SELECT id, receipt_number, amount, refund_reason_code, created_at
         FROM fi_payments WHERE refund_of_payment_id = $1 AND department_id = $2
        ORDER BY id`, [payment.id, dept]);
    return { data: { ...payment, refunds } };
  }));

// ══ WRITES — prevention-admin only (R8) ══════════════════════════════════════════════════

router.post('/',
  loadFiContext, requirePreventionAdmin,
  validate({ body: paymentSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const b = req.body;
    if (b.method === 'check' && !b.check_number) {
      throw httpError(422, 'A check payment must record the check number.', 'CHECK_NUMBER_REQUIRED');
    }
    if (b.check_number && !['check', 'money_order'].includes(b.method)) {
      throw httpError(422, 'A check number only applies to a check or money order payment.', 'CHECK_NUMBER_NOT_APPLICABLE');
    }
    const out = await mintReceipt(dept, req, {
      kind: 'payment',
      invoice_id: b.invoice_id,
      amount: b.amount,
      method: b.method,
      check_number: b.check_number,
      counterparty: b.payor_name,
      purpose: b.purpose,
      business_date: b.received_date,
      deposit_batch_ref: b.deposit_batch_ref,
      notes: b.notes,
      idempotency_key: b.idempotency_key,
    });
    if (out.duplicate) return { data: out.payment, duplicate: true };
    await audit(dept, req.user, 'create', 'fi_payments', out.payment.id,
      { action: 'record_payment', receipt_number: out.payment.receipt_number,
        invoice_id: b.invoice_id, amount: out.payment.amount, method: b.method });
    return { _status: 201, data: out.payment };
  }));

/**
 * AUTHORIZE a refund. Recorded, never disbursed — Finance pays via AP (§1.10). Draws its
 * number from the SAME series (one journal, one gap report). At/above the department's R9
 * band a second named approver is required; the trigger enforces it at the database.
 */
router.post('/refund',
  loadFiContext, requirePreventionAdmin,
  validate({ body: refundSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const b = req.body;
    const out = await mintReceipt(dept, req, {
      kind: 'refund_authorization',
      invoice_id: b.invoice_id,
      amount: b.amount,
      counterparty: b.payee_name,
      business_date: b.authorized_date,
      notes: b.notes,
      refund_of_payment_id: b.refund_of_payment_id,
      refund_reason_code: b.reason_code,
      refund_reason_text: b.reason_text,
      refund_approving_authority: b.approving_authority,
      refund_second_approver: b.second_approver,
      idempotency_key: b.idempotency_key,
    });
    if (out.duplicate) return { data: out.payment, duplicate: true };
    await audit(dept, req.user, 'create', 'fi_payments', out.payment.id,
      { action: 'authorize_refund', receipt_number: out.payment.receipt_number,
        invoice_id: b.invoice_id, amount: out.payment.amount,
        reason_code: b.reason_code, approving_authority: b.approving_authority,
        second_approver: b.second_approver ?? null,
        refund_of_payment_id: b.refund_of_payment_id ?? null });
    return { _status: 201, data: out.payment };
  }));

/**
 * VOID — consume and retain. "If a receipt is voided, the original and any copies of that
 * receipt must be retained." The number stays spent; every original amount survives forever.
 */
router.post('/:id/void',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: voidSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const id = +req.params.id;
    const b = req.body;
    const { rows: [existing] } = await pool.query(
      `SELECT id, receipt_number, voided_at FROM fi_payments
        WHERE id = $1 AND department_id = $2`, [id, dept]);
    if (!existing) throw httpError(404, 'No such receipt.', 'NOT_FOUND');
    if (existing.voided_at) {
      throw httpError(409,
        'That receipt is already void. A void is recorded once; a further correction is a new '
        + 'record, never a rewrite.', 'ALREADY_VOID');
    }

    // Atomic: the `voided_at IS NULL` guard in the WHERE means two simultaneous voids
    // cannot both win and write different reasons over each other.
    const { rows: [row] } = await pool.query(
      `UPDATE fi_payments
          SET status = 'Void', voided_at = NOW(), voided_by_user_id = $3,
              void_reason_code = $4, void_reason_text = $5, void_approving_authority = $6
        WHERE id = $1 AND department_id = $2 AND voided_at IS NULL
        RETURNING *`,
      [id, dept, req.user.id ?? null, b.reason_code, b.reason_text, b.approving_authority]);
    if (!row) throw httpError(409, 'The receipt was voided while you were voiding it.', 'CONFLICT');

    await audit(dept, req.user, 'update', 'fi_payments', row.id,
      { action: 'void', receipt_number: row.receipt_number, amount: row.amount,
        reason_code: b.reason_code, approving_authority: b.approving_authority });
    return { data: row };
  }));

module.exports = router;
