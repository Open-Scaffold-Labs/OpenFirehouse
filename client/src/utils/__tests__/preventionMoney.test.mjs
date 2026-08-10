/**
 * preventionMoney.test.mjs — the money rules on the 3.2 clerk surface.
 *
 * WHY THIS EXISTS. The server side of module 3.2 is scaled BigInt end to end because a
 * published audit found $11,127 of fee error across 34 permits, in both directions, and
 * because `(1.005).toFixed(2)` is `"1.00"`. All of that care is undone the moment the
 * CLIENT re-floats the string the server so carefully produced. The server has two unit
 * tests that assert the float divergence explicitly so the reason cannot be forgotten;
 * `toCents` below is the client's half of that, and this file is its fence.
 *
 * The other half is a shape question the API forces on us: `INVOICE_STATUSES` is
 * `['Issued', 'Void']` — there is NO 'Paid' status to render. Paid-ness is DERIVED from
 * the balances view, and a NEGATIVE balance is a legal overpayment rather than an error.
 * `paymentState` is that derivation, and getting it wrong means telling a clerk an invoice
 * is unpaid when the payer has already overpaid it.
 *
 * These import the REAL module — not a mirrored copy — so they cannot drift from it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toCents, fmtMoney, fmtQty, fmtRate, paymentState, checkNumberRule,
  PAYMENT_STATE_META, DUNNING_STAMPS,
} from '../../components/prevention/money.js';

// ── toCents: exact, and never a silent zero ──────────────────────────────────────────

test('toCents parses the server\'s decimal strings exactly', () => {
  assert.equal(toCents('0.00'), 0);
  assert.equal(toCents('350.00'), 35000);
  assert.equal(toCents('350'), 35000, 'a whole-dollar string is the same money as 350.00');
  assert.equal(toCents('350.0'), 35000, 'one decimal place is still money');
  assert.equal(toCents('1234567.89'), 123456789);
  assert.equal(toCents('-4.00'), -400, 'a credit balance is negative and legal');
});

test('toCents does NOT go through a float — the divergence is asserted, not assumed', () => {
  // This is the whole reason the function is hand-rolled. Keep it executable so a future
  // author who "simplifies" it to parseFloat sees exactly what they broke.
  assert.equal(parseFloat('8.20') * 100, 819.9999999999999,
    'the float product really is short — if this ever changes, JS changed, not us');
  assert.equal(Math.trunc(parseFloat('8.20') * 100), 819, 'the naive parse loses a cent');
  assert.equal(toCents('8.20'), 820, 'ours does not');
});

test('toCents returns null for the unparseable — deliberately NOT 0', () => {
  // "A $0 is never a fallback" is a server doctrine; rendering an unknown as zero is the
  // same failure arriving from the client side.
  for (const bad of ['', '  ', 'abc', '12.345', '1,200.00', '$12.00', '12.', '.5', null, undefined, {}, NaN]) {
    assert.equal(toCents(bad), null, `${JSON.stringify(bad)} is not an amount`);
  }
  assert.notEqual(toCents('abc'), 0, 'an unknown amount must never read as zero');
});

// ── fmtMoney ─────────────────────────────────────────────────────────────────────────

test('fmtMoney always renders two decimal places', () => {
  // "$350 and $350.00 are the same number; only one of them looks like a fee."
  assert.equal(fmtMoney('350'), '$350.00');
  assert.equal(fmtMoney('350.5'), '$350.50');
  assert.equal(fmtMoney('0'), '$0.00');
});

test('fmtMoney groups thousands and keeps the sign', () => {
  assert.equal(fmtMoney('1234.56'), '$1,234.56');
  assert.equal(fmtMoney('1234567.89'), '$1,234,567.89');
  assert.equal(fmtMoney('-4.00'), '-$4.00', 'an overpayment reads as a credit, not an error');
  assert.equal(fmtMoney('9999999999.99'), '$9,999,999,999.99', 'the top of NUMERIC(12,2)');
});

test('fmtMoney renders an absent amount as the module\'s em-dash, never $0.00', () => {
  assert.equal(fmtMoney(null), '—');
  assert.equal(fmtMoney(undefined), '—');
  assert.equal(fmtMoney(''), '—');
});

// ── Rates carry FOUR decimals, and pretending otherwise hid real values ──────────────

test('a NUMERIC(12,4) rate is not money and must not be parsed as money', () => {
  // fi_fee_item_tiers.per_unit is NUMERIC(12,4); pg returns "15.0000". toCents is the
  // (12,2) parser and correctly refuses it — which is exactly why routing a rate through
  // fmtMoney rendered every per-unit tier on the fee-schedule screen as the unknown dash.
  assert.equal(toCents('15.0000'), null, 'toCents is for (12,2) money and must stay strict');
  assert.equal(fmtMoney('15.0000'), '—', 'which is why the schedule screen showed a dash');
});

test('fmtRate renders a sub-cent money rate without dropping precision', () => {
  assert.equal(fmtRate('15.0000'), '$15.00', 'trailing zeros go, but it still looks like money');
  assert.equal(fmtRate('15.5000'), '$15.50');
  assert.equal(fmtRate('0.0125'), '$0.0125', 'sub-cent precision is real and must survive');
  assert.equal(fmtRate('1234.5678'), '$1,234.5678');
  assert.equal(fmtRate('15'), '$15.00');
  assert.equal(fmtRate(null), '—');
  assert.equal(fmtRate('abc'), '—');
});

test('fmtQty renders a quantity or percentage WITHOUT a dollar sign', () => {
  // A modifier value of 50 is 50% or $50 depending on its kind. Rendering both as money
  // makes the rate-verification screen unreadable in exactly the way it must not be.
  assert.equal(fmtQty('1000.0000'), '1,000');
  assert.equal(fmtQty('0.2500'), '0.25');
  assert.equal(fmtQty('25'), '25');
  assert.equal(fmtQty('-1.5000'), '-1.5');
  assert.equal(fmtQty(null), '—');
  assert.ok(!fmtQty('50.0000').includes('$'), 'a quantity is never dressed as money');
});

// ── paymentState: derived, because there is no Paid status ───────────────────────────

const row = (o = {}) => ({ status: 'Issued', invoice_amount: '100.00', paid_amount: '0.00', balance: '100.00', ...o });

test('an invoice with nothing against it is unpaid', () => {
  assert.equal(paymentState(row()), 'unpaid');
});

test('a settled invoice is paid — a zero balance, not a status column', () => {
  assert.equal(paymentState(row({ paid_amount: '100.00', balance: '0.00' })), 'paid');
});

test('a part payment is PARTIAL, not unpaid — the distinction needs paid_amount', () => {
  // Balance alone cannot tell these apart: $100 owed on a $100 invoice and $100 owed on a
  // $200 invoice with $100 paid are different facts for a clerk chasing money.
  assert.equal(paymentState(row({ invoice_amount: '200.00', paid_amount: '100.00', balance: '100.00' })), 'partial');
});

test('a NEGATIVE balance is an overpayment and must not read as an error', () => {
  // Slice C: overpayment / unapplied cash "must be representable, not an error".
  assert.equal(paymentState(row({ paid_amount: '104.00', balance: '-4.00' })), 'overpaid');
});

test('VOID wins over any balance — a withdrawn invoice is not an unpaid one', () => {
  assert.equal(paymentState(row({ status: 'Void' })), 'void');
  assert.equal(paymentState(row({ status: 'Void', paid_amount: '0.00', balance: '100.00' })), 'void');
});

test('a missing balance is UNKNOWN — not paid, and not unpaid either', () => {
  // 🔴 This test used to assert 'unpaid' here, and it was locking in a real defect.
  // fi_invoice_balances is a LEFT JOIN LATERAL over ALL invoices with COALESCE(paid, 0), so
  // every invoice always HAS a row and a non-null balance. A null balance is therefore never
  // "nobody has paid" — it is "the fetch failed, or this invoice fell outside the balances
  // read's 500-row cap, which is sorted by balance DESC and so drops the SETTLED ones first."
  // Rendering that as a red "Unpaid" badge, on a row whose menu offers "final notice" and
  // "lien", is how a bureau duns someone who has paid in full.
  assert.equal(paymentState({ status: 'Issued', invoice_amount: '100.00' }), 'unknown');
  assert.equal(paymentState({ status: 'Issued', invoice_amount: '100.00', paid_amount: '100.00' }), 'unknown',
    'even a paid_amount is not a balance — refunds also move it');
  assert.equal(paymentState({ status: 'Issued' }), 'unknown', 'no amount and no balance is not a claim');
  assert.equal(paymentState(), 'unknown');
});

test('a genuine zero-dollar invoice with no ledger row is paid, not unpaid', () => {
  assert.equal(paymentState({ status: 'Issued', invoice_amount: '0.00' }), 'paid');
});

test('every state paymentState can return has display metadata', () => {
  // A state with no entry renders as `undefined` in a Badge — silently, and only for the
  // case that produced it.
  const produced = new Set(['unpaid', 'paid', 'partial', 'overpaid', 'void', 'unknown']);
  for (const s of produced) {
    assert.ok(PAYMENT_STATE_META[s], `${s} has no label/tone`);
    assert.ok(PAYMENT_STATE_META[s].label && PAYMENT_STATE_META[s].tone);
  }
});

// ── the check-number rule, mirrored from the server's two refusals ───────────────────

test('a check needs its number; other methods must NOT carry one', () => {
  // Server: CHECK_NUMBER_REQUIRED and CHECK_NUMBER_NOT_APPLICABLE. Both directions.
  assert.equal(checkNumberRule('check'), 'required');
  assert.equal(checkNumberRule('money_order'), 'optional');
  for (const m of ['cash', 'card', 'ach', 'other']) {
    assert.equal(checkNumberRule(m), 'forbidden', `${m} must not carry a check number`);
  }
});

// ── the dunning ladder is presentation only ──────────────────────────────────────────

test('the dunning ladder is the five stamps the server accepts, in bureau order', () => {
  // The server does NOT enforce this order — nothing escalates on a timer. If a stamp key
  // here is not one the API takes, the button 422s on every press.
  assert.deepEqual(DUNNING_STAMPS.map((s) => s.key), [
    'due_date', 'second_notice_date', 'final_notice_date', 'lien_date', 'sent_to_bureau_date',
  ]);
});
