'use strict';
/**
 * utils/paymentEngine.js — pure payment arithmetic (Phase 3, module 3.2 Slice C).
 *
 * PURE. No I/O, no pool, no req. Same doctrine as invoiceEngine, and the money helpers are
 * deliberately REUSED from feeEngine rather than reimplemented — two money implementations
 * in one codebase is how they drift apart.
 *
 * MONEY IS BigInt, NEVER Number: `(1.005).toFixed(2)` is `"1.00"`, and the published
 * comptroller's audit found $11,127 of fee error in both directions from exactly that class.
 * NUMERIC arrives from pg as a STRING; parseDec consumes it digit-by-digit.
 *
 * A $0 IS NEVER A FALLBACK: every function returns { ok: false, errors } on bad input and
 * never a figure it is unsure of. There is deliberately no zero-amount receipt at all — a
 * genuine zero-fee obligation is an INVOICE fact (an authored $0 invoice), not a payment.
 */

const { parseDec, formatMoney, SCALE } = require('./feeEngine');

const ERR = Object.freeze({
  BAD_AMOUNT:   'BAD_AMOUNT',
  NOT_POSITIVE: 'NOT_POSITIVE',
  TOO_LARGE:    'TOO_LARGE',
});

/** NUMERIC(12,2) holds up to 10 digits before the point. Refuse rather than let pg truncate. */
const MAX_SCALED = 9999999999n * SCALE;

/**
 * Validate and normalise a receipt amount. Strictly positive — the SIGN lives in `kind`
 * (a refund authorisation is its own positive row), so a negative or zero amount is always
 * an authoring error, never a convention.
 *
 * Returns { ok: true, amount } with the amount as a decimal STRING ready to bind, or
 * { ok: false, errors }.
 */
function validateReceiptAmount(raw) {
  const scaled = parseDec(raw);
  if (scaled === null) {
    // parseDec returns null for NaN/Infinity/garbage/''. It does NOT return 0 — a missing
    // amount is an error, not free money.
    return { ok: false, errors: [{ code: ERR.BAD_AMOUNT, message: 'amount is not a valid decimal', got: raw }] };
  }
  if (scaled <= 0n) {
    return { ok: false, errors: [{ code: ERR.NOT_POSITIVE, message: 'a receipt amount must be greater than zero — the sign lives in the record kind, never in the number', got: raw }] };
  }
  if (scaled > MAX_SCALED) {
    return { ok: false, errors: [{ code: ERR.TOO_LARGE, message: 'amount exceeds NUMERIC(12,2)', got: raw }] };
  }
  return { ok: true, amount: formatMoney(scaled) };
}

/**
 * Derive a balance from ledger rows — the JS mirror of the fi_invoice_balances view, kept
 * for unit-testability of the arithmetic (the VIEW remains the production read path; this
 * exists so the divergence tests can prove the float answer is wrong without a database).
 *
 * balance = invoice_amount − Σ payments(non-void) + Σ refund authorisations(non-void).
 * A negative balance IS overpayment/unapplied cash — representable, not an error.
 */
function deriveBalance(invoiceAmount, paymentRows) {
  const inv = parseDec(invoiceAmount);
  if (inv === null) {
    return { ok: false, errors: [{ code: ERR.BAD_AMOUNT, message: 'invoice_amount is not a valid decimal', got: invoiceAmount }] };
  }
  let paid = 0n;
  let refunded = 0n;
  const rows = Array.isArray(paymentRows) ? paymentRows : [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r?.status === 'Void') continue; // a void row counts for nothing
    const scaled = parseDec(r?.amount);
    if (scaled === null) {
      return { ok: false, errors: [{ code: ERR.BAD_AMOUNT, at: `row ${i + 1}`, message: 'payment amount is not a valid decimal', got: r?.amount }] };
    }
    if (r?.kind === 'refund_authorization') refunded += scaled;
    else paid += scaled;
  }
  return {
    ok: true,
    paid_amount: formatMoney(paid),
    refunded_amount: formatMoney(refunded),
    balance: formatMoney(inv - paid + refunded),
  };
}

module.exports = { validateReceiptAmount, deriveBalance, ERR, MAX_SCALED };
