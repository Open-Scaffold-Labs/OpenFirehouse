'use strict';
/**
 * constants/invoice.js — the closed sets of the invoice ledger (Phase 3, module 3.2 Slice B).
 *
 * SAME DOCTRINE AS constants/inspectionResult.js and constants/feeSchedule.js: these are
 * CONTROL values, matched EXACTLY, never by pattern. The repo has already paid for the
 * alternative — the inspection pass doctrine was a regex (/^pass\b/i) and "Passed" silently
 * defeated a life-safety control. Nothing here may be pattern-matched, lowercased-and-
 * compared, startsWith'd, or coerced.
 *
 * ⚠ EVERY SET BELOW IS MIRRORED BY A CHECK CONSTRAINT IN docs/migrations/0125-fi-invoices.sql.
 * A value legal in JS but illegal in Postgres is a 23514 at write time — noisy, survivable.
 * A value legal in Postgres but unknown to JS is worse: it is a document the code cannot
 * reason about. `diffAgainstDatabase()` is the regression fence for both directions, and
 * invoices.test.js drives it off the LIVE constraint definitions.
 */

/**
 * Two statuses. Not three.
 *
 * There is deliberately no 'Paid' status. Payment is a MONEY fact recorded against the
 * document, not a state of the document, and this slice records no money received at all
 * (see 0125's header — R2's IN-list vs the 08-04 handoff, flagged for Matt). A 'Paid' status
 * with nothing able to set it would be a lie on the screen. There is also no 'Draft': §1.8
 * describes invoices as minted at approval, and a draft invoice that can be edited into
 * existence is exactly the in-place-correction shape the comptroller's manual prohibits.
 */
const INVOICE_STATUSES = Object.freeze(['Issued', 'Void']);

/**
 * An `adjustment` is the correction model. It is NOT a credit memo as a distinct numbered
 * document — that is A11, a confirmed market absence, and is a NON-GOAL. An adjustment is an
 * invoice, drawn from the SAME sequence, that names its parent and carries a reason.
 */
const INVOICE_KINDS = Object.freeze(['original', 'adjustment']);

/** The published AR schema's own money categories: fee · penalty · posting fee · interest. */
const INVOICE_LINE_KINDS = Object.freeze(['fee', 'penalty', 'posting_fee', 'interest']);

/**
 * Void grounds. Enumerated because "the reasons for all adjustments should be documented" is
 * a control, and free text alone is not queryable — an auditor samples voids FIRST, and
 * cannot sample a prose field. Free text is required IN ADDITION (CHECK-enforced), never
 * instead: the code says what class of error it was, the text says what actually happened.
 *
 * 'superseded_by_adjustment' exists for the case where a void and an adjustment are two halves
 * of one correction; 'other' exists so a real-world reason is never forced into a wrong bucket,
 * and it carries the same mandatory written basis as every other code.
 */
const VOID_REASON_CODES = Object.freeze([
  'duplicate',                // the same charge invoiced twice
  'issued_in_error',          // should not have been issued at all
  'wrong_party',              // billed to the wrong owner/occupant
  'wrong_amount',             // superseded by a corrected document
  'permit_withdrawn',         // the underlying application went away
  'superseded_by_adjustment',
  'other',
]);

/**
 * Adjustment grounds. 'undercharge' and 'overcharge' are separate on purpose: the comptroller's
 * audit found $11,127 of fee error in BOTH directions, and a single 'correction' code would
 * make the two indistinguishable in exactly the report meant to detect them.
 */
const ADJUSTMENT_REASON_CODES = Object.freeze([
  'undercharge',        // additional amount now due
  'overcharge',         // net credit
  'fee_schedule_error', // the rate table itself was wrong (the "5 of 15 entries" finding)
  'waiver_applied',     // an approved waiver landed after issue
  'recalculation',      // inputs corrected (square footage, tank count)
  'other',
]);

/**
 * The dunning stamps, in ladder order, mapped to their columns. ORDER IS PRESENTATION ONLY —
 * nothing enforces that a department climbs the ladder in sequence, because requiring a second
 * notice before a final one would be inventing a department's escalation policy. That is the
 * engine R2 rules out (A14). The stamps record acts a human performed; the DB enforces only
 * that no stamp predates the invoice.
 */
const DUNNING_STAMPS = Object.freeze([
  'due_date',
  'second_notice_date',
  'final_notice_date',
  'lien_date',
  'sent_to_bureau_date',
]);

/**
 * The document-number format. `FY{year}-{PREFIX}-{seq:6}`.
 *
 * Kept as ONE regex used by both the formatter and the validator so they cannot drift — the
 * migration carries the identical pattern as a CHECK. A number is retained forever and appears
 * on paper a payer holds, so the two must agree exactly, permanently.
 */
const INVOICE_NUMBER_RE = /^FY[0-9]{4}-[A-Z0-9]{1,12}-[0-9]{6,}$/;
const INVOICE_PREFIX_RE = /^[A-Z0-9]{1,12}$/;
const INVOICE_SEQUENCE_PAD = 6;

/**
 * Format a document number. Throws rather than returning a malformed string: a bad invoice
 * number is not a display bug, it is a permanent defect in a financial record, and the caller
 * has no sensible way to recover from one.
 */
function formatInvoiceNumber(fiscalYear, prefix, sequenceNumber) {
  if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 9999) {
    throw new Error(`invoice number: fiscal year must be a 4-digit integer, got ${fiscalYear}`);
  }
  if (!INVOICE_PREFIX_RE.test(String(prefix || ''))) {
    throw new Error(
      'invoice number: the department invoice prefix is not configured (or is invalid). ' +
      'An empty prefix would mint FY2026--000001 onto a document retained forever.');
  }
  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
    throw new Error(`invoice number: sequence must be a positive integer, got ${sequenceNumber}`);
  }
  const n = `FY${fiscalYear}-${prefix}-${String(sequenceNumber).padStart(INVOICE_SEQUENCE_PAD, '0')}`;
  // Belt and braces: the same pattern Postgres will apply, applied here first, so the failure
  // surfaces with a useful message instead of a bare 23514 from the driver.
  if (!INVOICE_NUMBER_RE.test(n)) throw new Error(`invoice number: produced a malformed number ${n}`);
  return n;
}

/**
 * Which fiscal year a date falls in, given the department's fiscal-year start month.
 *
 * The convention: a fiscal year is NAMED for the calendar year it ENDS in when it does not
 * start in January. A July-start FY covering 2026-07-01..2027-06-30 is "FY2027". This is the
 * dominant US municipal convention, and it is a CONFIGURATION CHOICE, not a claim about law —
 * §1.8 records the per-fiscal-year-reset requirement as UNVERIFIED. startMonth 1 (the default)
 * makes fiscal year == calendar year, which is the identity case.
 *
 * Takes a 'YYYY-MM-DD' string, not a Date. A Date would drag the server's timezone into a
 * document number: `new Date('2026-07-01')` is UTC midnight, which is June 30th in every US
 * timezone, and the invoice would be filed in the wrong fiscal year for anything issued on
 * the first of the month.
 */
function fiscalYearFor(isoDay, startMonth = 1) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDay));
  if (!m) throw new Error(`fiscalYearFor: expected YYYY-MM-DD, got ${isoDay}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const start = Number(startMonth);
  if (!Number.isInteger(start) || start < 1 || start > 12) {
    throw new Error(`fiscalYearFor: fiscal_year_start_month must be 1-12, got ${startMonth}`);
  }
  if (start === 1) return year;
  return month >= start ? year + 1 : year;
}

/** The mirror fence — see feeSchedule.js's diffAgainstDatabase for the rationale. */
function diffAgainstDatabase(setName, dbValues) {
  const known = {
    INVOICE_STATUSES, INVOICE_KINDS, INVOICE_LINE_KINDS,
    VOID_REASON_CODES, ADJUSTMENT_REASON_CODES,
  }[setName];
  if (!known) return { error: `unknown set ${setName}` };
  const db = new Set(dbValues);
  return {
    inDatabaseOnly: [...db].filter((v) => !known.includes(v)), // the dangerous direction
    inCodeOnly: known.filter((v) => !db.has(v)),
  };
}

module.exports = {
  INVOICE_STATUSES,
  INVOICE_KINDS,
  INVOICE_LINE_KINDS,
  VOID_REASON_CODES,
  ADJUSTMENT_REASON_CODES,
  DUNNING_STAMPS,
  INVOICE_NUMBER_RE,
  INVOICE_PREFIX_RE,
  INVOICE_SEQUENCE_PAD,
  formatInvoiceNumber,
  fiscalYearFor,
  diffAgainstDatabase,
};
