'use strict';
/**
 * utils/invoiceEngine.js — pure invoice arithmetic (Phase 3, module 3.2 Slice B).
 *
 * PURE. No I/O, no pool, no req. Everything here is a function of its arguments, so the money
 * math is unit-testable without a database — which is the only way the divergence tests below
 * (the ones asserting that a float would get it WRONG) can exist at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * MONEY IS BigInt, NEVER Number. This is not a preference.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `(1.005).toFixed(2)` is `"1.00"`, not `"1.01"`, because 1.005 is not representable in binary
 * floating point. `0.1 + 0.2 !== 0.3`. Summing 12 invoice lines as JS numbers and rounding at
 * the end produces a total that differs from the sum of the rounded lines, in either direction,
 * and the published comptroller's audit found exactly that class of error: $11,127 across 840
 * permits, IN BOTH DIRECTIONS. So all arithmetic here goes through feeEngine's scaled-BigInt
 * helpers — deliberately REUSED rather than reimplemented, because two money implementations in
 * one codebase is how they drift apart (the `certs.js` lesson, applied to arithmetic).
 *
 * NUMERIC arrives from pg as a STRING. `parseDec` consumes it digit-by-digit and never lets it
 * touch a float on the way in.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * A $0 IS NEVER A FALLBACK (inherited from feeEngine, and it matters more here)
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Every function returns `{ ok: false, errors: [...] }` on bad input. None of them returns a
 * total it is not sure about. A silently-zero fee is the F9/F18 failure mode: the comptroller
 * found "two permits assessed no fee at all", and a $0 the software invented is indistinguishable
 * in the ledger from a $0 a human authored for a reason. A genuine zero-amount invoice is
 * perfectly legal here — it is just AUTHORED, with lines that sum to zero, never defaulted.
 */

const { parseDec, formatMoney, SCALE } = require('./feeEngine');
const { INVOICE_LINE_KINDS, INVOICE_KINDS } = require('../constants/invoice');

const ERR = Object.freeze({
  NO_LINES:        'NO_LINES',
  BAD_LINE_KIND:   'BAD_LINE_KIND',
  BAD_AMOUNT:      'BAD_AMOUNT',
  BAD_INVOICE_KIND:'BAD_INVOICE_KIND',
  NEGATIVE_ON_ORIGINAL: 'NEGATIVE_ON_ORIGINAL',
  TOO_LARGE:       'TOO_LARGE',
  BAD_DESCRIPTION: 'BAD_DESCRIPTION',
});

/** NUMERIC(12,2) holds up to 10 digits before the point. Refuse rather than let pg truncate. */
const MAX_SCALED = 9999999999n * SCALE;

/**
 * Compute the header totals from the lines.
 *
 * Returns the five NUMERIC(12,2) values as decimal STRINGS, ready to bind straight into the
 * insert. The migration's CHECK re-verifies `invoice_amount = fee + penalty + posting + interest`
 * at the database, so a bug here is caught by Postgres rather than persisted — belt and braces
 * on the one arithmetic that an auditor will re-add by hand.
 *
 * @param {Array} lines - [{ line_kind, description, amount }]
 * @param {string} invoiceKind - 'original' | 'adjustment'
 */
function computeInvoiceTotals(lines, invoiceKind) {
  const errors = [];

  if (!INVOICE_KINDS.includes(invoiceKind)) {
    errors.push({ code: ERR.BAD_INVOICE_KIND, message: `invoice_kind must be one of ${INVOICE_KINDS.join(', ')}`, got: invoiceKind });
    return { ok: false, errors };
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    errors.push({ code: ERR.NO_LINES, message: 'an invoice must have at least one line — a header with no detail cannot be checked by an auditor' });
    return { ok: false, errors };
  }

  // Buckets keyed by the closed set, so an unknown kind cannot silently land in 'fee'.
  const buckets = new Map(INVOICE_LINE_KINDS.map((k) => [k, 0n]));
  const normalized = [];

  lines.forEach((line, idx) => {
    const at = `line ${idx + 1}`;

    if (!INVOICE_LINE_KINDS.includes(line?.line_kind)) {
      errors.push({ code: ERR.BAD_LINE_KIND, at, message: `line_kind must be one of ${INVOICE_LINE_KINDS.join(', ')}`, got: line?.line_kind });
      return;
    }
    const description = typeof line.description === 'string' ? line.description.trim() : '';
    if (!description) {
      // A money line with no description is unauditable. The DB agrees (CHECK length > 0).
      errors.push({ code: ERR.BAD_DESCRIPTION, at, message: 'every line needs a description — an unlabelled charge cannot be explained to a payer' });
      return;
    }

    const scaled = parseDec(line.amount);
    if (scaled === null) {
      // parseDec returns null for NaN/Infinity/garbage/''. It does NOT return 0 — that
      // distinction is the whole point: a missing amount is an error, not a free line.
      errors.push({ code: ERR.BAD_AMOUNT, at, message: 'amount is not a valid decimal', got: line.amount });
      return;
    }
    if (scaled > MAX_SCALED || scaled < -MAX_SCALED) {
      errors.push({ code: ERR.TOO_LARGE, at, message: 'amount exceeds NUMERIC(12,2)', got: line.amount });
      return;
    }
    if (invoiceKind === 'original' && scaled < 0n) {
      // Mirrors the trg_fi_invoice_lines_sign trigger. Enforced in BOTH places on purpose:
      // "a guard that exists on one route and not another is not a guard", and the route is
      // not the only writer we may ever have.
      errors.push({ code: ERR.NEGATIVE_ON_ORIGINAL, at, message: 'a negative amount is not permitted on an ORIGINAL invoice — a credit belongs on an adjustment', got: line.amount });
      return;
    }

    buckets.set(line.line_kind, buckets.get(line.line_kind) + scaled);
    normalized.push({
      line_number: normalized.length + 1,
      line_kind: line.line_kind,
      description,
      amount: formatMoney(scaled),
      assessment_id: line.assessment_id ?? null,
      permit_id: line.permit_id ?? null,
      inspection_id: line.inspection_id ?? null,
    });
  });

  if (errors.length) return { ok: false, errors };

  const fee      = buckets.get('fee');
  const penalty  = buckets.get('penalty');
  const posting  = buckets.get('posting_fee');
  const interest = buckets.get('interest');
  const total    = fee + penalty + posting + interest;

  if (total > MAX_SCALED || total < -MAX_SCALED) {
    return { ok: false, errors: [{ code: ERR.TOO_LARGE, message: 'invoice total exceeds NUMERIC(12,2)' }] };
  }

  return {
    ok: true,
    totals: {
      invoice_amount:  formatMoney(total),
      fee_amount:      formatMoney(fee),
      penalty_amount:  formatMoney(penalty),
      posting_fee:     formatMoney(posting),
      interest_amount: formatMoney(interest),
    },
    lines: normalized,
  };
}

/**
 * Summarise a gap report for a human.
 *
 * The controlling verb in the comptroller's manual is INVESTIGATED, not prohibited, so this
 * deliberately does not call a gap an error — it reports a count and the affected numbers and
 * leaves the judgement to a person. Given the counter-in-one-statement allocator, the expected
 * steady state is zero, which is what makes a non-zero result worth a human's attention rather
 * than routine noise.
 */
function summariseGaps(gapRows) {
  const rows = Array.isArray(gapRows) ? gapRows : [];
  const byYear = new Map();
  for (const r of rows) {
    const y = r.fiscal_year;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(r.missing_invoice_number ?? r.missing_sequence_number);
  }
  return {
    total: rows.length,
    clean: rows.length === 0,
    byFiscalYear: [...byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([fiscal_year, numbers]) => ({ fiscal_year, count: numbers.length, numbers })),
  };
}

module.exports = { computeInvoiceTotals, summariseGaps, ERR, MAX_SCALED };
