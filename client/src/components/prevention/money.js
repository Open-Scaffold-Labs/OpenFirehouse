// prevention/money.js — money display + the derived payment state, for module 3.2.
//
// ══ THE ONE RULE ══════════════════════════════════════════════════════════════════════
// THIS FILE NEVER DOES FLOAT ARITHMETIC ON MONEY, AND NEITHER MAY ITS CALLERS.
//
// The server side of 3.2 is scaled BigInt end to end for one documented reason:
// `(1.005).toFixed(2)` is `"1.00"`, and the audit behind this module found $11,127 of fee
// error across 34 permits IN BOTH DIRECTIONS. NUMERIC(12,2) arrives from pg as a STRING and
// the server parses it digit-by-digit. If the client re-floats it to render or, worse, to
// total it, the client becomes the place the error creeps back in.
//
// So: totals come from the SERVER or from the fi_invoice_balances view. There is no
// `lines.reduce((a, b) => a + Number(b.amount), 0)` in this module and there must not be.
// `toCents` below exists ONLY so we can COMPARE amounts (is this paid? is it a credit?) —
// it parses the string by hand and returns an exact integer count of cents. It is not an
// invitation to start summing.
//
// (The repo has six divergent currency formatters today — Intl, toFixed, toLocaleString, a
// hand-rolled thousands regex. Unifying them is a separate change and would be a drive-by;
// this file is the one the money module uses.)

/** The em-dash the prevention module uses for an absent value, everywhere. */
const NONE = '—';

/**
 * Exact integer cents from a decimal STRING. No parseFloat, no Number(), no multiplication.
 *
 * NUMERIC(12,2) tops out at 10^10 dollars = 10^12 cents, comfortably inside Number's exact
 * integer range (2^53 ≈ 9×10^15), so an integer count of cents is safe where a decimal is not.
 *
 * Returns null for anything unparseable — deliberately NOT 0. A missing amount is an unknown,
 * and rendering an unknown as zero is the exact failure the server refuses with
 * "a $0 is never a fallback".
 */
export function toCents(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const [, sign, whole, frac = ''] = m;
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return sign === '-' ? -cents : cents;
}

/**
 * NOT EVERY NUMBER IN THIS MODULE IS NUMERIC(12,2), AND ASSUMING SO HID A REAL VALUE.
 *
 * `fi_fee_item_tiers.per_unit` is NUMERIC(12,**4**) and `fi_fee_item_modifiers.value` is
 * NUMERIC(16,4) — a rate legitimately carries sub-cent precision, because "$15 per 1,000
 * sq ft" is a rate, not a charge. Postgres returns those as "15.0000", which `toCents`
 * correctly refuses (it is the (12,2) parser) — so the fee-schedule screen rendered every
 * per-unit rate as the unknown em-dash. A KNOWN value shown as unknown is the same class of
 * lie as an unknown shown as $0.00, just pointing the other way.
 *
 * Returns { sign, whole, frac } with `frac` already trimmed of trailing zeros, or null.
 * Still no float: the string is split, never multiplied.
 */
function decimalParts(value, maxDp) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  const m = new RegExp(`^(-?)(\\d+)(?:\\.(\\d{1,${maxDp}}))?$`).exec(s);
  if (!m) return null;
  return { sign: m[1], whole: m[2], frac: (m[3] || '').replace(/0+$/, '') };
}

const group = (whole) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * A quantity or a rate, up to 4dp, with trailing zeros trimmed — "15.0000" reads "15",
 * "0.2500" reads "0.25". For unit sizes, percentages and modifier values, which are NOT
 * dollar amounts and must not be dressed as them.
 */
export function fmtQty(value) {
  const p = decimalParts(value, 4);
  if (!p) return NONE;
  return `${p.sign}${group(p.whole)}${p.frac ? `.${p.frac}` : ''}`;
}

/**
 * A MONEY rate that may carry sub-cent precision (a per-unit rate). Rendered with at least
 * two decimals so it still looks like money, and up to four so nothing is silently dropped:
 * "15.0000" → "$15.00", "0.0125" → "$0.0125".
 */
export function fmtRate(value) {
  const p = decimalParts(value, 4);
  if (!p) return NONE;
  const frac = p.frac.length >= 2 ? p.frac : (p.frac + '00').slice(0, 2);
  return `${p.sign}$${group(p.whole)}.${frac}`;
}

/**
 * Money for a screen. Takes the server's decimal string and formats it WITHOUT ever making
 * it a float — the integer and fraction parts are grouped as text.
 *
 * Always 2dp: "$350 and $350.00 are the same number; only one of them looks like a fee."
 */
export function fmtMoney(value) {
  const cents = toCents(value);
  if (cents === null) return NONE;
  const neg = cents < 0;
  const abs = String(Math.abs(cents)).padStart(3, '0');
  const whole = abs.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${whole}.${abs.slice(-2)}`;
}

/**
 * The payment state of an invoice — DERIVED, because there is no such column.
 *
 * `INVOICE_STATUSES` is `['Issued', 'Void']` and nothing else: there is no 'Paid' status to
 * read, by design. Paid-ness lives in the fi_invoice_balances view
 * (balance = invoice_amount − payments + refunds), which is derived rather than stored
 * because "a stored balance is a second source of truth for the same number".
 *
 * A NEGATIVE balance is LEGAL and must not render as an error — it is an overpayment, which
 * the spec requires be "representable, not an error".
 *
 * `void` wins over everything: a voided invoice is not unpaid, it is withdrawn.
 */
export function paymentState({ status, invoice_amount, paid_amount, balance } = {}) {
  if (status === 'Void') return 'void';

  const bal = toCents(balance);
  const paid = toCents(paid_amount);
  const total = toCents(invoice_amount);

  // 🔴 THIS USED TO GUESS "unpaid", AND THE COMMENT LICENSING IT WAS FACTUALLY WRONG.
  // It read "an invoice with no payments may simply be absent from the view". It cannot be:
  // fi_invoice_balances is a LEFT JOIN LATERAL over ALL fi_invoices with COALESCE(paid, 0),
  // so every invoice always has a row and a non-null balance. A null balance here therefore
  // never means "nobody has paid" — it means WE FAILED TO GET THE DATA, and this turned that
  // into a red "Unpaid" badge on a line whose row menu offers "final notice" and "lien".
  // It is reachable two ways: the balances fetch is `.catch(() => ({data: []}))`, and the
  // register caps at 200 while the balances read caps at 500 ORDER BY balance DESC — so past
  // 500 invoices the rows dropped are precisely the SETTLED ones.
  // An unknown is now reported as unknown. Saying "I don't know" is the only honest answer,
  // and it is the same doctrine as "a $0 is never a fallback", pointed the other way.
  if (bal === null) return total !== null && total === 0 ? 'paid' : 'unknown';

  if (bal < 0) return 'overpaid';
  if (bal === 0) return 'paid';
  return paid !== null && paid > 0 ? 'partial' : 'unpaid';
}

/** Label + Badge tone for a payment state. Badge tones are the module's existing set. */
export const PAYMENT_STATE_META = {
  paid:     { label: 'Paid',      tone: 'green' },
  partial:  { label: 'Part paid', tone: 'amber' },
  unpaid:   { label: 'Unpaid',    tone: 'red' },
  overpaid: { label: 'Overpaid',  tone: 'yellow' },
  void:     { label: 'Void',      tone: 'gray' },
  unknown:  { label: 'Unknown',   tone: 'gray' },
};

/**
 * The dunning ladder, in the order a bureau walks it.
 *
 * These are DATE STAMPS ON THE INVOICE — the field model taken from a fire department's
 * published open-data AR schema — and NOT an engine. Nothing here escalates on a timer;
 * each entry is a human recording that a notice went out. The server does not enforce the
 * order either, so this array is presentation only and must never gate anything.
 */
export const DUNNING_STAMPS = [
  { key: 'due_date',           label: 'Due' },
  { key: 'second_notice_date', label: 'Second notice' },
  { key: 'final_notice_date',  label: 'Final notice' },
  { key: 'lien_date',          label: 'Lien' },
  { key: 'sent_to_bureau_date', label: 'Sent to collections' },
];

/**
 * Is a check number required for this payment method?
 *
 * The server refuses BOTH ways — CHECK_NUMBER_REQUIRED for a check without one, and
 * CHECK_NUMBER_NOT_APPLICABLE for a number attached to a method other than check or money
 * order. Mirrored here so the form asks for the right thing; the server remains the control.
 */
export function checkNumberRule(method) {
  if (method === 'check') return 'required';
  if (method === 'money_order') return 'optional';
  return 'forbidden';
}
