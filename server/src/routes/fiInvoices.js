'use strict';
/**
 * routes/fiInvoices.js — the invoice ledger's surface (Phase 3, module 3.2 Slice B).
 *
 * 0125 put three tables + a gap view on prod. This is the writer and the read paths.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * SEPARATION OF DUTIES (spec §8 F14, §1.9) — same split as fiFeeSchedules, same reason
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *   · requireInspector       — READ an invoice, and read the GAP REPORT. An inspector must be
 *                              able to see what a property owes and whether numbering is sound.
 *   · requirePreventionAdmin — ISSUE, VOID, ADJUST, and STAMP a dunning date.
 *
 * The 2018 fire-marshal audit found, verbatim, *"Inspectors had access rights to change fees
 * in the system"*, alongside coordinators holding custody + authorization + recordkeeping +
 * void rights simultaneously. A third audit found *"an employee modified their own access to
 * screens and tables"*. So this is the SECOND line of defence, not the only one: 0125 revokes
 * UPDATE/DELETE from of_app at the grant level and re-grants only the void + dunning columns,
 * so F14 survives someone writing a route wrongly later. Verified live on prod as of_app:
 * UPDATE of invoice_amount and DELETE of an invoice both return 42501 before any trigger runs.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS ROUTE WILL NOT DO
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * · NO client-supplied totals. The five money columns are computed HERE by invoiceEngine from
 *   the LINES and are not accepted from the body under any name. A money figure that arrives
 *   over the wire has no attributable computation behind it.
 * · NO in-place correction, ever. `PATCH` does not exist on this router. The only mutations are
 *   `/void` and `/stamp`, and both are one-way.
 * · NO DELETE. An invoice is voided; the number is consumed and the record retained.
 * · NO payment recording, NO holds, NO late-fee engine, NO AR aging, NO statements, NO credit
 *   memos, NO write-offs. Most are confirmed market absences and therefore NON-GOALS under R1.
 *   Payment recording is the ONE open item — see 0125's header. The consequence is stated rather
 *   than hidden: R3 issuance gate #1 ("fee paid in full") has no data source until Matt rules.
 * · NO dunning ENGINE. A14. Stamps are recorded by a human; nothing escalates on a timer.
 *   R2, verbatim: "Stamps yes, engine no."
 */
const express = require('express');
const router  = express.Router();
const { z } = require('zod');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { scoped, httpError, validate, flattenEngineErrors } = require('../utils/routeKit');
const { loadFiContext, requireInspector, requirePreventionAdmin } = require('../middleware/fiAuth');
const { isIsoDay } = require('../utils/localDate');
const { computeInvoiceTotals, summariseGaps } = require('../utils/invoiceEngine');
const {
  INVOICE_LINE_KINDS, VOID_REASON_CODES, ADJUSTMENT_REASON_CODES, DUNNING_STAMPS,
  fiscalYearFor,
} = require('../constants/invoice');

const deptOf = (req) => req.user.department_id;

const idParam = z.object({ id: z.string().regex(/^\d+$/) });
const isoDay  = z.string().refine(isIsoDay, 'must be YYYY-MM-DD');
/** Money arrives as STRINGS. See invoiceEngine's header: a float has already lost it. */
const money = z.string().regex(/^-?\d{1,10}(\.\d{1,2})?$/, 'must be a decimal with at most 2 places');

const lineSchema = z.object({
  line_kind:     z.enum(INVOICE_LINE_KINDS),
  description:   z.string().trim().min(1).max(300),
  amount:        money,
  assessment_id: z.number().int().positive().optional(),
  permit_id:     z.number().int().positive().optional(),
  inspection_id: z.number().int().positive().optional(),
}).strict();

const issueSchema = z.object({
  bill_to_name:    z.string().trim().min(1).max(200),
  bill_to_address: z.string().trim().max(500).optional(),
  bill_to_email:   z.string().trim().email().max(200).optional(),
  invoice_date:    isoDay,
  due_date:        isoDay.optional(),
  lines:           z.array(lineSchema).min(1).max(200),
  idempotency_key: z.string().trim().min(8).max(64).optional(),
}).strict();

const adjustSchema = z.object({
  reason_code:         z.enum(ADJUSTMENT_REASON_CODES),
  reason_text:         z.string().trim().min(1).max(2000),
  approving_authority: z.string().trim().min(1).max(200),
  invoice_date:        isoDay,
  lines:               z.array(lineSchema).min(1).max(200),
  bill_to_name:        z.string().trim().min(1).max(200).optional(),
  idempotency_key:     z.string().trim().min(8).max(64).optional(),
}).strict();

const voidSchema = z.object({
  reason_code:         z.enum(VOID_REASON_CODES),
  reason_text:         z.string().trim().min(1).max(2000),
  approving_authority: z.string().trim().min(1).max(200),
}).strict();

const stampSchema = z.object({
  stamp: z.enum(DUNNING_STAMPS),
  date:  isoDay,
}).strict();

const listSchema = z.object({
  status:       z.enum(['Issued', 'Void']).optional(),
  fiscal_year:  z.string().regex(/^\d{4}$/).optional(),
  permit_id:    z.string().regex(/^\d+$/).optional(),
  // The auditor's two first stops, as explicit filters rather than something to eyeball.
  zero_amount:  z.enum(['1']).optional(),
  voided:       z.enum(['1']).optional(),
  limit:        z.string().regex(/^\d{1,3}$/).optional(),
}).strict().partial();

/**
 * The department's invoicing config. An unset prefix is a REFUSAL, not a default: minting
 * FY2026--000001 would put a hole where the department belongs on a document retained forever,
 * and 0125's CHECK would reject it anyway — better a clear 409 telling an admin what to fix
 * than a 23514 from the driver.
 */
async function loadInvoiceConfig(dept) {
  const { rows: [cfg] } = await pool.query(
    `SELECT COALESCE(invoice_number_prefix, '') AS prefix,
            COALESCE(fiscal_year_start_month, 1) AS fy_start
       FROM fi_settings WHERE department_id = $1`, [dept]);
  if (!cfg || !cfg.prefix) {
    throw httpError(409,
      'This department has no invoice number prefix configured. Set one in Prevention settings '
      + 'before issuing invoices — an invoice number is permanent and cannot be issued with a '
      + 'blank department segment.', 'INVOICE_PREFIX_NOT_CONFIGURED');
  }
  return cfg;
}

/**
 * Mint an invoice — allocation, header and lines in ONE statement.
 *
 * ONE STATEMENT IS LOAD-BEARING, for two independent reasons:
 *  1. The pool is `max:1` (lesson #12). Holding a client and issuing BEGIN/INSERT/INSERT/COMMIT
 *     risks the second-checkout deadlock, and `pool.query` per statement would autocommit
 *     separately wherever P5_TXN is off — leaving an invoice with no lines if the second insert
 *     fails. A single statement is atomic in every configuration.
 *  2. The header totals are derived from the same line array that populates the lines, so the
 *     five money columns CANNOT disagree with the detail they summarise. The migration's CHECK
 *     re-verifies the sum identity independently.
 *
 * A rolled-back mint returns its number to the counter rather than burning it, because the
 * counter row is updated in the same statement. That is why the allocator is a counter and not
 * a Postgres SEQUENCE — a sequence would gap on every failure and manufacture gap-report noise.
 *
 * Verified on local that the `trg_fi_invoice_lines_sign` trigger IS reachable through this CTE
 * path (a negative line on an original is refused from inside the statement), so the guard is
 * not bypassed by the very shape used to satisfy atomicity.
 */
const MINT_SQL = `
WITH alloc AS (
  INSERT INTO fi_invoice_sequences (department_id, fiscal_year, prefix, last_sequence)
  VALUES ($1, $2, $3, 1)
  ON CONFLICT (department_id, fiscal_year)
    DO UPDATE SET last_sequence = fi_invoice_sequences.last_sequence + 1, updated_at = NOW()
  RETURNING fiscal_year, prefix, last_sequence
),
inv AS (
  INSERT INTO fi_invoices (
    department_id, invoice_number, fiscal_year, sequence_number,
    invoice_kind, adjusts_invoice_id, adjustment_reason_code, adjustment_reason_text,
    adjustment_approving_authority,
    bill_to_name, bill_to_address, bill_to_email,
    invoice_amount, fee_amount, penalty_amount, posting_fee, interest_amount,
    invoice_date, due_date, issued_by_user_id, idempotency_key)
  SELECT $1,
         format('FY%s-%s-%s', a.fiscal_year, a.prefix, lpad(a.last_sequence::text, 6, '0')),
         a.fiscal_year, a.last_sequence,
         $4, $5, $6, $7, $8,
         $9, $10, $11,
         $12::numeric, $13::numeric, $14::numeric, $15::numeric, $16::numeric,
         $17::date, $18::date, $19, $20
    FROM alloc a
  RETURNING *
),
ln AS (
  INSERT INTO fi_invoice_lines (
    department_id, invoice_id, line_number, line_kind, description, amount,
    assessment_id, permit_id, inspection_id)
  SELECT $1, inv.id, l.line_number, l.line_kind, l.description, l.amount::numeric,
         l.assessment_id, l.permit_id, l.inspection_id
    FROM inv, jsonb_to_recordset($21::jsonb)
      AS l(line_number int, line_kind text, description text, amount text,
           assessment_id int, permit_id int, inspection_id int)
  RETURNING *
)
SELECT (SELECT row_to_json(inv) FROM inv) AS invoice,
       (SELECT json_agg(row_to_json(ln) ORDER BY (ln.line_number)) FROM ln) AS lines`;

async function mint(dept, req, opts) {
  const cfg = await loadInvoiceConfig(dept);
  const fy = fiscalYearFor(opts.invoice_date, cfg.fy_start);

  const computed = computeInvoiceTotals(opts.lines, opts.invoice_kind);
  if (!computed.ok) {
    // NEVER a total we are unsure of. A silent $0 is the F9/F18 failure mode.
    throw httpError(422, 'The invoice lines could not be totalled. See details — nothing was '
      + 'assumed to be zero.', 'INVOICE_NOT_COMPUTABLE', flattenEngineErrors(computed.errors));
  }
  const t = computed.totals;

  let result;
  try {
    ({ rows: [result] } = await pool.query(MINT_SQL, [
      dept, fy, cfg.prefix,
      opts.invoice_kind, opts.adjusts_invoice_id ?? null,
      opts.adjustment_reason_code ?? null, opts.adjustment_reason_text ?? null,
      opts.adjustment_approving_authority ?? null,
      opts.bill_to_name, opts.bill_to_address ?? null, opts.bill_to_email ?? null,
      t.invoice_amount, t.fee_amount, t.penalty_amount, t.posting_fee, t.interest_amount,
      opts.invoice_date, opts.due_date ?? null, req.user.id ?? null,
      opts.idempotency_key ?? null,
      JSON.stringify(computed.lines),
    ]));
  } catch (err) {
    // F10: a replayed generation must not mint a second document. The unique index answers
    // 23505 and we report `duplicate` — which the fi-sync contract treats as SUCCESS, because
    // the caller's intent was satisfied by the first attempt.
    if (err.code === '23505' && String(err.constraint || '').includes('idempotency')) {
      const { rows: [existing] } = await pool.query(
        `SELECT * FROM fi_invoices WHERE department_id = $1 AND idempotency_key = $2`,
        [dept, opts.idempotency_key]);
      return { duplicate: true, invoice: existing };
    }
    if (err.code === '23503') {
      throw httpError(422, 'A referenced permit, inspection or assessment does not exist.',
        'REFERENCE_NOT_FOUND');
    }
    throw err;
  }
  return { duplicate: false, invoice: result.invoice, lines: result.lines || [] };
}

// ══ READS ════════════════════════════════════════════════════════════════════════════════

router.get('/',
  loadFiContext, requireInspector,
  validate({ query: listSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const q = req.query;
    const where = ['i.department_id = $1'];
    const params = [dept];
    const add = (clause, value) => { params.push(value); where.push(clause.replace('?', `$${params.length}`)); };

    if (q.status)      add('i.status = ?', q.status);
    if (q.fiscal_year) add('i.fiscal_year = ?::int', q.fiscal_year);
    if (q.zero_amount === '1') where.push('i.invoice_amount = 0');
    if (q.voided === '1')      where.push('i.voided_at IS NOT NULL');
    if (q.permit_id) {
      // The subject lives on the LINES, not the header — a consolidated annual invoice spans
      // many permits, which is one of the three billing models §1.8 documents.
      params.push(q.permit_id);
      where.push(`EXISTS (SELECT 1 FROM fi_invoice_lines l
                           WHERE l.invoice_id = i.id AND l.permit_id = $${params.length}::int)`);
    }
    const limit = Math.min(Number(q.limit) || 100, 200);
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT i.* FROM fi_invoices i
        WHERE ${where.join(' AND ')}
        ORDER BY i.fiscal_year DESC, i.sequence_number DESC
        LIMIT $${params.length}`, params);
    return { data: rows };
  }));

/**
 * The gap report — the auditor's first stop, and the reason the numbering design exists.
 *
 * The comptroller's controlling verb is *investigated*, not prohibited, so this reports and does
 * not judge. A voided number is NOT a gap: a void consumes and retains its number, so treating
 * it as missing would send someone after a number that is properly accounted for.
 *
 * Mounted BEFORE `/:id` — Express matches in order, and `/gap-report` would otherwise be
 * swallowed by the id route and 400 on the digits-only param.
 */
router.get('/gap-report',
  loadFiContext, requireInspector,
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const { rows } = await pool.query(
      `SELECT department_id, fiscal_year, prefix, missing_sequence_number, missing_invoice_number
         FROM fi_invoice_number_gaps
        WHERE department_id = $1
        ORDER BY fiscal_year, missing_sequence_number`, [dept]);
    const { rows: allocated } = await pool.query(
      `SELECT fiscal_year, prefix, last_sequence FROM fi_invoice_sequences
        WHERE department_id = $1 ORDER BY fiscal_year`, [dept]);
    return { data: { ...summariseGaps(rows), allocated } };
  }));

router.get('/:id',
  loadFiContext, requireInspector,
  validate({ params: idParam }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const { rows: [invoice] } = await pool.query(
      `SELECT * FROM fi_invoices WHERE id = $1 AND department_id = $2`, [+req.params.id, dept]);
    if (!invoice) throw httpError(404, 'No such invoice.', 'NOT_FOUND');
    const { rows: lines } = await pool.query(
      `SELECT * FROM fi_invoice_lines WHERE invoice_id = $1 AND department_id = $2
        ORDER BY line_number`, [invoice.id, dept]);
    // The correction chain, both directions, so a reader of a voided or adjusted document can
    // always find what happened to it without knowing to go looking.
    const { rows: adjustments } = await pool.query(
      `SELECT id, invoice_number, invoice_amount, adjustment_reason_code, created_at
         FROM fi_invoices WHERE adjusts_invoice_id = $1 AND department_id = $2
        ORDER BY id`, [invoice.id, dept]);
    return { data: { ...invoice, lines, adjustments } };
  }));

// ══ WRITES — prevention-admin only ═══════════════════════════════════════════════════════

router.post('/',
  loadFiContext, requirePreventionAdmin,
  validate({ body: issueSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const b = req.body;
    const out = await mint(dept, req, { ...b, invoice_kind: 'original' });
    if (out.duplicate) {
      // Answered as success: the caller's intent was satisfied by the first attempt.
      return { data: out.invoice, duplicate: true };
    }
    await audit(dept, req.user, 'create', 'fi_invoices', out.invoice.id,
      { action: 'issue', invoice_number: out.invoice.invoice_number,
        invoice_amount: out.invoice.invoice_amount, lines: out.lines.length });
    return { _status: 201, data: { ...out.invoice, lines: out.lines } };
  }));

/**
 * ADJUST — the correction model. A NEW linked document, never an edit.
 *
 * The standards mandate neither void+reissue nor credit memo; they mandate that the original is
 * retained, the correction is a NEW pre-approved record, attributable and reasoned, and that it
 * balances. This is that record. An adjustment MAY be negative (a net credit for an overcharge)
 * — forbidding that would force the correction back into an in-place edit, which is the exact
 * thing being prevented.
 */
router.post('/:id/adjust',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: adjustSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const b = req.body;
    const { rows: [parent] } = await pool.query(
      `SELECT id, invoice_number, bill_to_name, bill_to_address, bill_to_email, status
         FROM fi_invoices WHERE id = $1 AND department_id = $2`, [+req.params.id, dept]);
    if (!parent) throw httpError(404, 'No such invoice.', 'NOT_FOUND');
    if (parent.status === 'Void') {
      throw httpError(409,
        'That invoice is void. A void document has no balance to adjust — issue a new invoice '
        + 'instead.', 'CANNOT_ADJUST_VOID');
    }
    const out = await mint(dept, req, {
      invoice_kind: 'adjustment',
      adjusts_invoice_id: parent.id,
      adjustment_reason_code: b.reason_code,
      adjustment_reason_text: b.reason_text,
      adjustment_approving_authority: b.approving_authority,
      // Default the party to the parent's: an adjustment addresses whoever the original did,
      // as of that original. Overridable for a genuine wrong-party correction.
      bill_to_name:    b.bill_to_name ?? parent.bill_to_name,
      bill_to_address: parent.bill_to_address,
      bill_to_email:   parent.bill_to_email,
      invoice_date:    b.invoice_date,
      lines:           b.lines,
      idempotency_key: b.idempotency_key,
    });
    if (out.duplicate) return { data: out.invoice, duplicate: true };

    await audit(dept, req.user, 'create', 'fi_invoices', out.invoice.id,
      { action: 'adjust', adjusts_invoice_id: parent.id,
        adjusts_invoice_number: parent.invoice_number,
        invoice_number: out.invoice.invoice_number,
        invoice_amount: out.invoice.invoice_amount,
        reason_code: b.reason_code, approving_authority: b.approving_authority });
    return { _status: 201, data: { ...out.invoice, lines: out.lines } };
  }));

/**
 * VOID — consume and retain. The number stays spent, the row stays readable, every original
 * amount survives unchanged forever. The state auditor's manual: *"If a receipt is voided, the
 * original and any copies of that receipt must be retained."*
 */
router.post('/:id/void',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: voidSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const id = +req.params.id;
    const b = req.body;
    const { rows: [existing] } = await pool.query(
      `SELECT id, invoice_number, voided_at FROM fi_invoices
        WHERE id = $1 AND department_id = $2`, [id, dept]);
    if (!existing) throw httpError(404, 'No such invoice.', 'NOT_FOUND');
    if (existing.voided_at) {
      throw httpError(409,
        'That invoice is already void. A void is recorded once; a further correction is a new '
        + 'linked record, never a rewrite.', 'ALREADY_VOID');
    }

    // Single atomic statement with the `voided_at IS NULL` guard in the WHERE — so two
    // simultaneous voids cannot both win and write different reasons over each other.
    const { rows: [row] } = await pool.query(
      `UPDATE fi_invoices
          SET status = 'Void', voided_at = NOW(), voided_by_user_id = $3,
              void_reason_code = $4, void_reason_text = $5, void_approving_authority = $6
        WHERE id = $1 AND department_id = $2 AND voided_at IS NULL
        RETURNING *`,
      [id, dept, req.user.id ?? null, b.reason_code, b.reason_text, b.approving_authority]);
    if (!row) throw httpError(409, 'The invoice was voided while you were voiding it.', 'CONFLICT');

    await audit(dept, req.user, 'update', 'fi_invoices', row.id,
      { action: 'void', invoice_number: row.invoice_number,
        invoice_amount: row.invoice_amount, reason_code: b.reason_code,
        approving_authority: b.approving_authority });
    return { data: row };
  }));

/**
 * STAMP a dunning date. R2, verbatim: "Stamps yes, engine no."
 *
 * This records that a human performed an act on a date — it does not decide that the act was
 * due, and nothing here escalates on a timer (A14 is a confirmed market absence). Ladder ORDER
 * is deliberately not enforced: requiring a second notice before a final one would be inventing
 * a department's escalation policy. What IS enforced, by 0125: no stamp may predate the invoice,
 * and a stamp cannot be rewritten once set, because it is a fact about the past.
 */
router.post('/:id/stamp',
  loadFiContext, requirePreventionAdmin,
  validate({ params: idParam, body: stampSchema }),
  scoped(async ({ req }) => {
    const dept = deptOf(req);
    const id = +req.params.id;
    const { stamp, date } = req.body;
    // `stamp` is validated against the frozen DUNNING_STAMPS enum by zod, so interpolating it
    // as a column name here cannot carry anything but one of five literals. Belt and braces:
    if (!DUNNING_STAMPS.includes(stamp)) {
      throw httpError(422, 'Unknown dunning stamp.', 'BAD_STAMP');
    }

    const { rows: [existing] } = await pool.query(
      `SELECT id, invoice_number, invoice_date, status, ${stamp} AS current_value
         FROM fi_invoices WHERE id = $1 AND department_id = $2`, [id, dept]);
    if (!existing) throw httpError(404, 'No such invoice.', 'NOT_FOUND');
    if (existing.current_value) {
      throw httpError(409,
        `That invoice already records a ${stamp.replace(/_/g, ' ')}. A stamp records an act on a `
        + 'date and cannot be rewritten.', 'STAMP_ALREADY_SET');
    }
    if (existing.status === 'Void') {
      throw httpError(409,
        'That invoice is void — there is nothing to pursue on it.', 'CANNOT_STAMP_VOID');
    }
    // A stamp records an act performed AFTER the invoice existed. 0125 enforces this with a
    // CHECK, but a CHECK violation surfaces as a 500 carrying a raw constraint name
    // ("fi_invoices_check7"), and a clerk mistyping a year is a foreseeable user action, not a
    // server fault. So the same rule is stated here as a 422 that says which date is wrong.
    // The CHECK remains the authority — this is the readable path to the same refusal.
    const invoiceDay = new Date(existing.invoice_date).toISOString().slice(0, 10);
    if (date < invoiceDay) {
      throw httpError(422,
        `A ${stamp.replace(/_/g, ' ')} cannot predate the invoice date (${invoiceDay}).`,
        'STAMP_BEFORE_INVOICE_DATE', { stamp, date, invoice_date: invoiceDay });
    }

    const { rows: [row] } = await pool.query(
      `UPDATE fi_invoices SET ${stamp} = $3::date
        WHERE id = $1 AND department_id = $2 AND ${stamp} IS NULL
        RETURNING *`, [id, dept, date]);
    if (!row) throw httpError(409, 'The stamp was recorded while you were recording it.', 'CONFLICT');

    await audit(dept, req.user, 'update', 'fi_invoices', row.id,
      { action: 'dunning_stamp', stamp, date, invoice_number: row.invoice_number });
    return { data: row };
  }));

module.exports = router;
