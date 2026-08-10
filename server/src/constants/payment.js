'use strict';
/**
 * constants/payment.js — the closed sets of the payment ledger (Phase 3, module 3.2 Slice C).
 *
 * SAME DOCTRINE AS constants/invoice.js: CONTROL values, matched EXACTLY, never by pattern.
 * The inspection pass doctrine was once a regex and "Passed" silently defeated a life-safety
 * control; the fee spec's near-miss rule applies here verbatim — 'Check', 'CASH', and
 * 'cash ' (trailing space) are each REFUSED, never coerced.
 *
 * ⚠ EVERY SET BELOW IS MIRRORED BY A CHECK CONSTRAINT IN docs/migrations/0126-fi-payments.sql
 * (and the db.js fresh-install mirror). `diffAgainstDatabase()` is the regression fence for
 * both directions; payments.test.js drives it off the LIVE constraint definitions.
 */

/**
 * Two kinds, one journal, one number series. A `payment` is money RECEIVED (at a counter, by
 * mail, or via the city's processor). A `refund_authorization` records that a refund was
 * APPROVED and by whom — never a disbursement, because Finance disburses via AP (fees spec
 * §1.10) and we are never merchant of record.
 */
const PAYMENT_KINDS = Object.freeze(['payment', 'refund_authorization']);

/**
 * The state-auditor "mode of payment" axis. 'card' and 'ach' record money that arrived via
 * the city's hosted processor — recording the mode is NOT taking the card (payment execution
 * stays in the hosted flow, ADR-0001). 'other' exists so a real-world mode is never forced
 * into a wrong bucket; the notes field carries what it actually was.
 */
const PAYMENT_METHODS = Object.freeze(['cash', 'check', 'card', 'ach', 'money_order', 'other']);

const PAYMENT_STATUSES = Object.freeze(['Recorded', 'Void']);

/**
 * Refund grounds. Enumerated because auditors sample refunds FIRST (the named fraud in the
 * comptroller's manual is "fake refunds to cover the theft of cash") and a prose field
 * cannot be sampled. Free text is required IN ADDITION, never instead — CHECK-enforced.
 */
const REFUND_REASON_CODES = Object.freeze([
  'overpayment',        // payer overpaid the balance
  'duplicate_payment',  // the same charge was paid twice
  'permit_withdrawn',   // the underlying application went away after payment
  'fee_adjusted',       // an adjustment invoice reduced the charge below what was paid
  'paid_in_error',      // money recorded against the wrong obligation entirely
  'other',
]);

/** Void grounds for a receipt. A wrong receipt is voided and re-recorded, never edited. */
const PAYMENT_VOID_REASON_CODES = Object.freeze([
  'recorded_in_error',
  'wrong_amount',
  'wrong_invoice',
  'wrong_payor',
  'duplicate',
  'other',
]);

/**
 * The receipt-number format: `FY{year}-{PREFIX}-R{seq:6}`. The R segment is what stops a
 * receipt number ever being misread as an invoice number on paper — the two families share
 * the department prefix but can never collide as strings. ONE regex used by formatter and
 * validator; the migration carries the identical pattern as a CHECK.
 */
const RECEIPT_NUMBER_RE = /^FY[0-9]{4}-[A-Z0-9]{1,12}-R[0-9]{6,}$/;
const RECEIPT_SEQUENCE_PAD = 6;

const { INVOICE_PREFIX_RE } = require('./invoice');

/**
 * Format a receipt number. Throws rather than returning a malformed string — a bad receipt
 * number is a permanent defect in a financial record, and the caller cannot recover from one.
 */
function formatReceiptNumber(fiscalYear, prefix, sequenceNumber) {
  if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 9999) {
    throw new Error(`receipt number: fiscal year must be a 4-digit integer, got ${fiscalYear}`);
  }
  if (!INVOICE_PREFIX_RE.test(String(prefix || ''))) {
    throw new Error(
      'receipt number: the department invoice prefix is not configured (or is invalid). '
      + 'An empty prefix would mint FY2026--R000001 onto a document retained forever.');
  }
  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
    throw new Error(`receipt number: sequence must be a positive integer, got ${sequenceNumber}`);
  }
  const n = `FY${fiscalYear}-${prefix}-R${String(sequenceNumber).padStart(RECEIPT_SEQUENCE_PAD, '0')}`;
  if (!RECEIPT_NUMBER_RE.test(n)) throw new Error(`receipt number: produced a malformed number ${n}`);
  return n;
}

/** The mirror fence — see feeSchedule.js's diffAgainstDatabase for the rationale. */
function diffAgainstDatabase(setName, dbValues) {
  const known = {
    PAYMENT_KINDS, PAYMENT_METHODS, PAYMENT_STATUSES,
    REFUND_REASON_CODES, PAYMENT_VOID_REASON_CODES,
  }[setName];
  if (!known) return { error: `unknown set ${setName}` };
  const db = new Set(dbValues);
  return {
    inDatabaseOnly: [...db].filter((v) => !known.includes(v)), // the dangerous direction
    inCodeOnly: known.filter((v) => !db.has(v)),
  };
}

module.exports = {
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  REFUND_REASON_CODES,
  PAYMENT_VOID_REASON_CODES,
  RECEIPT_NUMBER_RE,
  RECEIPT_SEQUENCE_PAD,
  formatReceiptNumber,
  diffAgainstDatabase,
};
