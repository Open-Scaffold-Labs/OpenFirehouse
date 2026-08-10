/**
 * invoiceEngine.test.js — the pure money math of the invoice ledger (3.2 Slice B).
 *
 * No database. Every test here is a function of its arguments, which is the only reason the
 * float-divergence tests can exist: they assert what a Number implementation would get WRONG,
 * so the reason for the BigInt design cannot be forgotten and then "simplified" away later.
 */
const { test } = require('node:test');
const assert = require('node:assert');

const { computeInvoiceTotals, summariseGaps, ERR } = require('../utils/invoiceEngine');
const {
  formatInvoiceNumber, fiscalYearFor, diffAgainstDatabase,
  INVOICE_STATUSES, VOID_REASON_CODES,
} = require('../constants/invoice');

const line = (over = {}) => ({ line_kind: 'fee', description: 'Permit fee', amount: '100.00', ...over });

/* ── The reason money is BigInt. These assert the FLOAT answer is wrong. ──────────────── */

test('a float would lose money here, and the engine does not', () => {
  // The canonical demonstration: 1.005 is not representable in binary floating point, so
  // toFixed rounds it DOWN. If this assertion ever fails, JS changed, not us.
  assert.equal((1.005).toFixed(2), '1.00', 'baseline: the float bug is real');

  // Ten lines of 0.1 summed as floats is 0.9999999999999999, which rounds to 1.00 only by
  // luck; the engine sums exact scaled integers.
  const floatSum = Array(10).fill(0.1).reduce((a, b) => a + b, 0);
  assert.notStrictEqual(floatSum, 1, 'baseline: 0.1 x 10 !== 1 in floating point');

  const r = computeInvoiceTotals(
    Array.from({ length: 10 }, () => line({ amount: '0.10' })), 'original');
  assert.equal(r.ok, true);
  assert.equal(r.totals.invoice_amount, '1.00');
  assert.equal(r.totals.fee_amount, '1.00');
});

test('sum of rounded lines equals the rounded total — in both directions', () => {
  // Three lines at 0.005 apart. Naive float accumulation then rounding disagrees with
  // rounding each line then summing; exact integers cannot.
  const r = computeInvoiceTotals([
    line({ amount: '10.01' }), line({ amount: '20.02' }), line({ amount: '0.97' }),
  ], 'original');
  assert.equal(r.ok, true);
  assert.equal(r.totals.invoice_amount, '31.00');
});

test('a large invoice does not lose precision', () => {
  const r = computeInvoiceTotals([
    line({ amount: '9999999.99' }), line({ amount: '0.01' }),
  ], 'original');
  assert.equal(r.ok, true);
  assert.equal(r.totals.invoice_amount, '10000000.00');
});

/* ── A $0 IS NEVER A FALLBACK. Every bad input is an error, not a zero. ───────────────── */

test('a missing amount is an ERROR, never a free line', () => {
  for (const bad of [undefined, null, '', 'free', 'NaN', {}, [], '12.34.56']) {
    const r = computeInvoiceTotals([line({ amount: bad })], 'original');
    assert.equal(r.ok, false, `amount ${JSON.stringify(bad)} must not compute`);
    assert.equal(r.errors[0].code, ERR.BAD_AMOUNT);
  }
});

test('an unknown line_kind is refused, not bucketed into fee', () => {
  const r = computeInvoiceTotals([line({ line_kind: 'Fee' })], 'original');
  assert.equal(r.ok, false, 'case matters: the closed set is matched EXACTLY, never lowercased');
  assert.equal(r.errors[0].code, ERR.BAD_LINE_KIND);
});

test('an unlabelled money line is refused', () => {
  const r = computeInvoiceTotals([line({ description: '   ' })], 'original');
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, ERR.BAD_DESCRIPTION);
});

test('an invoice with no lines is refused — a header with no detail is unauditable', () => {
  for (const bad of [[], null, undefined, 'lines']) {
    const r = computeInvoiceTotals(bad, 'original');
    assert.equal(r.ok, false);
    assert.equal(r.errors[0].code, ERR.NO_LINES);
  }
});

test('an amount beyond NUMERIC(12,2) is refused rather than truncated by pg', () => {
  const r = computeInvoiceTotals([line({ amount: '99999999999.00' })], 'original');
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, ERR.TOO_LARGE);
});

test('a genuine zero-amount invoice is LEGAL and computes — it is authored, not defaulted', () => {
  const r = computeInvoiceTotals([line({ amount: '0.00', description: 'Exempt: place of worship' })], 'original');
  assert.equal(r.ok, true, 'a zero must be authorable; only an UNKNOWN amount is an error');
  assert.equal(r.totals.invoice_amount, '0.00');
});

/* ── Negative amounts: the sign rule is the correction model's hinge ─────────────────── */

test('a negative line is refused on an ORIGINAL and allowed on an ADJUSTMENT', () => {
  const neg = [line({ amount: '-25.00', description: 'Credit: overcharged one tank' })];

  const original = computeInvoiceTotals(neg, 'original');
  assert.equal(original.ok, false);
  assert.equal(original.errors[0].code, ERR.NEGATIVE_ON_ORIGINAL);

  // The CONTROL. Without this the test above could pass because negatives are banned
  // outright, which would break every overcharge correction and force in-place edits.
  const adjustment = computeInvoiceTotals(neg, 'adjustment');
  assert.equal(adjustment.ok, true, 'an adjustment MUST be able to carry a net credit');
  assert.equal(adjustment.totals.invoice_amount, '-25.00');
});

test('the four money categories are bucketed separately and sum to the header', () => {
  const r = computeInvoiceTotals([
    line({ line_kind: 'fee', amount: '100.00' }),
    line({ line_kind: 'penalty', amount: '200.00', description: 'Work without a permit' }),
    line({ line_kind: 'posting_fee', amount: '15.00', description: 'Posting' }),
    line({ line_kind: 'interest', amount: '3.45', description: 'Interest' }),
  ], 'original');
  assert.equal(r.ok, true);
  assert.deepEqual(r.totals, {
    invoice_amount: '318.45', fee_amount: '100.00', penalty_amount: '200.00',
    posting_fee: '15.00', interest_amount: '3.45',
  });
  // The identity the migration's CHECK re-verifies independently.
  const sum = ['fee_amount', 'penalty_amount', 'posting_fee', 'interest_amount']
    .reduce((a, k) => a + Math.round(Number(r.totals[k]) * 100), 0);
  assert.equal(sum, Math.round(Number(r.totals.invoice_amount) * 100));
});

test('line_number is assigned server-side and is contiguous from 1', () => {
  const r = computeInvoiceTotals([line(), line(), line()], 'original');
  assert.deepEqual(r.lines.map((l) => l.line_number), [1, 2, 3]);
});

/* ── Document numbering ──────────────────────────────────────────────────────────────── */

test('a document number is formatted exactly, and a bad one THROWS rather than degrading', () => {
  assert.equal(formatInvoiceNumber(2026, 'CFD', 42), 'FY2026-CFD-000042');
  assert.equal(formatInvoiceNumber(2026, 'CFD', 1000000), 'FY2026-CFD-1000000',
    'past six digits it widens rather than wrapping — a number is never reused');

  // The empty prefix is the case that would put a hole in a permanent document.
  assert.throws(() => formatInvoiceNumber(2026, '', 1), /prefix is not configured/);
  assert.throws(() => formatInvoiceNumber(2026, 'cfd', 1), /prefix is not configured/,
    'lowercase is refused: the number must round-trip the DB CHECK exactly');
  assert.throws(() => formatInvoiceNumber(2026, 'C-FD', 1), /prefix is not configured/,
    'a hyphen in the prefix would make the number ambiguous to parse');
  assert.throws(() => formatInvoiceNumber(2026, 'CFD', 0), /positive integer/);
  assert.throws(() => formatInvoiceNumber(26, 'CFD', 1), /4-digit/);
});

test('fiscal year: a July-start FY is named for the year it ENDS in, and July 1 is not off-by-one', () => {
  // startMonth 1 is the identity case.
  assert.equal(fiscalYearFor('2026-01-01', 1), 2026);
  assert.equal(fiscalYearFor('2026-12-31', 1), 2026);

  // July-start: 2026-07-01..2027-06-30 is FY2027.
  assert.equal(fiscalYearFor('2026-06-30', 7), 2026, 'last day of FY2026');
  assert.equal(fiscalYearFor('2026-07-01', 7), 2027, 'first day of FY2027');
  assert.equal(fiscalYearFor('2027-06-30', 7), 2027);

  // THE TIMEZONE TRAP this function exists to avoid: new Date('2026-07-01') is UTC midnight,
  // which is June 30th in every US timezone — so a Date-based implementation would file a
  // first-of-month invoice into the WRONG fiscal year. Asserted so nobody "simplifies" the
  // string parsing into a Date later.
  assert.equal(new Date('2026-07-01').getUTCDate(), 1);
  assert.ok(new Date('2026-07-01').getTime() < new Date('2026-07-01T00:00:00-04:00').getTime(),
    'baseline: the UTC parse is behind US local midnight');

  assert.throws(() => fiscalYearFor('07/01/2026', 7), /YYYY-MM-DD/);
  assert.throws(() => fiscalYearFor('2026-07-01', 13), /1-12/);
});

/* ── The gap report reports; it does not judge ───────────────────────────────────────── */

test('summariseGaps: clean is clean, and gaps are grouped by fiscal year', () => {
  assert.deepEqual(summariseGaps([]), { total: 0, clean: true, byFiscalYear: [] });

  const s = summariseGaps([
    { fiscal_year: 2026, missing_sequence_number: 4, missing_invoice_number: 'FY2026-CFD-000004' },
    { fiscal_year: 2026, missing_sequence_number: 9, missing_invoice_number: 'FY2026-CFD-000009' },
    { fiscal_year: 2025, missing_sequence_number: 2, missing_invoice_number: 'FY2025-CFD-000002' },
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.clean, false);
  assert.deepEqual(s.byFiscalYear.map((y) => y.fiscal_year), [2025, 2026]);
  assert.deepEqual(s.byFiscalYear[1].numbers, ['FY2026-CFD-000004', 'FY2026-CFD-000009']);
});

/* ── The mirror fence ────────────────────────────────────────────────────────────────── */

test('diffAgainstDatabase reports BOTH directions, and the dangerous one is named', () => {
  const clean = diffAgainstDatabase('INVOICE_STATUSES', INVOICE_STATUSES);
  assert.deepEqual(clean, { inDatabaseOnly: [], inCodeOnly: [] });

  // A value Postgres allows that JS has never heard of is the dangerous direction: it is a
  // document the code cannot reason about.
  const drifted = diffAgainstDatabase('INVOICE_STATUSES', [...INVOICE_STATUSES, 'Paid']);
  assert.deepEqual(drifted.inDatabaseOnly, ['Paid']);

  const missing = diffAgainstDatabase('VOID_REASON_CODES', VOID_REASON_CODES.slice(1));
  assert.deepEqual(missing.inCodeOnly, [VOID_REASON_CODES[0]]);
});

test('there is deliberately no Paid status — payment is not a state of the document', () => {
  // If a later slice adds payment recording, it records a MONEY FACT against the invoice.
  // Adding 'Paid' here would put a status on screen that nothing in this slice can set.
  assert.deepEqual([...INVOICE_STATUSES], ['Issued', 'Void']);
});
