// prevention/BillingReceipts.jsx — receipts, refund authorisations, and the register of both.
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ─────────────────────────────────────────────────
// This records money that has ALREADY BEEN RECEIVED — at a counter, by mail, or by the
// city's processor. We are a payment CHANNEL at most, never the merchant of record, and
// nothing here moves money. There is no card field and no "take a payment" flow.
//
// A REFUND IS AN AUTHORISATION, NOT A DISBURSEMENT. We record that a refund was authorised
// and by whom; Finance disburses through AP. That is why a refund carries no payment
// method — there is no method, because we are not the one paying it.
//
// ── THE FIELD SET IS NOT A DESIGN CHOICE ─────────────────────────────────────────────
// payor · amount · MODE OF PAYMENT · purpose · THE EMPLOYEE WHO RECEIVED IT · date is the
// set a state auditor's internal-control manual requires of a receipt. `received_by` is the
// signed-in user, stamped server-side — it is not a field a clerk can fill in with someone
// else's name.
//
// ── ONE ROW PER RECEIPT ──────────────────────────────────────────────────────────────
// Not a `paid_amount` column on the invoice: a single column cannot represent two partial
// payments, cannot name who took the money, and cannot be reconciled against a deposit.
//
// ── WHO MAY DO THIS ──────────────────────────────────────────────────────────────────
// requirePreventionAdmin, with NO cashier role and no toggle (R8). No competitor ships a
// fire-department cashier designation; the market answers it architecturally — the money is
// taken by a different department — and inventing a role here would exceed the bar.
import React, { useState, useCallback, useEffect } from 'react';
import { Banknote, Undo2, Ban, AlertTriangle, Plus } from 'lucide-react';
import { fi, localToday } from './fiApi';
import { fmtMoney, checkNumberRule } from './money';
import {
  Section, Field, Input, Select, TextArea, Btn, Badge, Modal, EmptyState, Spinner, RowActions,
} from './ui';

const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—');

// A CLOSED SET, mirrored from the server's CHECK constraint. Nothing may pattern-match a
// method: 'Check' and 'CASH' and a trailing space are each REFUSED rather than coerced,
// which is why this is a <select> and never a text field.
const METHODS = [
  ['cash', 'Cash'],
  ['check', 'Check'],
  ['card', 'Card'],
  ['ach', 'ACH / bank transfer'],
  ['money_order', 'Money order'],
  ['other', 'Other'],
];

const REFUND_REASONS = [
  ['overpayment', 'Overpayment'],
  ['duplicate_payment', 'Duplicate payment'],
  ['permit_withdrawn', 'Permit withdrawn'],
  ['fee_adjusted', 'Fee adjusted'],
  ['paid_in_error', 'Paid in error'],
  ['other', 'Other (explain below)'],
];

const VOID_REASONS = [
  ['recorded_in_error', 'Recorded in error'],
  ['wrong_amount', 'Wrong amount'],
  ['wrong_invoice', 'Applied to the wrong invoice'],
  ['wrong_payor', 'Wrong payor'],
  ['duplicate', 'Duplicate'],
  ['other', 'Other (explain below)'],
];

const newKey = () => (globalThis.crypto?.randomUUID?.() || `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`);

function refusalMessage(e, fallback) {
  const byCode = {
    INVOICE_PREFIX_NOT_CONFIGURED:
      'This department has no invoice prefix yet, so a receipt number cannot be minted. A chief sets it in Settings › Billing.',
    CHECK_NUMBER_REQUIRED: 'A check needs its number recorded — that is what makes it reconcilable against the deposit.',
    CHECK_NUMBER_NOT_APPLICABLE: 'Only a check or a money order carries a check number.',
    AMOUNT_NOT_RECORDABLE: 'That amount cannot be recorded. See below.',
    CANNOT_PAY_VOID_INVOICE: 'That invoice is void — money cannot be applied to a withdrawn charge.',
    SECOND_APPROVER_REQUIRED: 'This amount is at or above the department’s approval threshold and needs a second named approver.',
    ALREADY_VOID: 'That receipt is already void.',
    NOT_FOUND: 'That record is no longer on file.',
    REFERENCE_NOT_FOUND: 'The invoice or payment this refers to no longer exists.',
    CONFLICT: 'Someone changed this while you were working on it. Reopen it and try again.',
    FORBIDDEN_FI: 'That action needs a prevention-admin designation (or chief authority).',
  };
  return byCode[e?.code] || e?.message || fallback;
}

function Refusal({ error }) {
  if (!error) return null;
  return (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-red-800 dark:text-red-300">{error.message}</p>
        {error.details?.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-sm text-red-800 dark:text-red-300">
            {error.details.map((d, i) => <li key={i}>• {d}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * RecordPayment — the receipt form. Exported because an invoice row opens it too, and a
 * second copy is a second place for the check-number rule to drift.
 *
 * `invoiceId` may be pre-set (from an invoice row) or chosen here (from the receipts view).
 */
export function RecordPayment({ invoiceId, invoiceNumber, onClose, onDone }) {
  const [form, setForm] = useState({
    invoice_id: invoiceId ? String(invoiceId) : '',
    amount: '', method: 'check', check_number: '', payor_name: '', purpose: '',
    received_date: localToday(), deposit_batch_ref: '', notes: '',
  });
  const [open, setOpen] = useState([]);      // outstanding invoices, when none was pre-set
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newKey);

  useEffect(() => {
    if (invoiceId) return;
    fi.payments.balances({ outstanding: '1' }).then((r) => setOpen(r.data || [])).catch(() => setOpen([]));
  }, [invoiceId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const rule = checkNumberRule(form.method);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const body = {
        invoice_id: Number(form.invoice_id),
        amount: form.amount.trim(),
        method: form.method,
        payor_name: form.payor_name.trim(),
        received_date: form.received_date,
        idempotency_key: key,
      };
      // Only send check_number when the method can carry one — the server refuses it
      // otherwise, and an empty string is not the same as omitting the field.
      if (rule !== 'forbidden' && form.check_number.trim()) body.check_number = form.check_number.trim();
      if (form.purpose.trim()) body.purpose = form.purpose.trim();
      if (form.deposit_batch_ref.trim()) body.deposit_batch_ref = form.deposit_batch_ref.trim();
      if (form.notes.trim()) body.notes = form.notes.trim();
      await fi.payments.record(body);
      onDone();
    } catch (e) {
      setError({ message: refusalMessage(e, 'Could not record the payment.'), details: e.details });
    } finally { setBusy(false); }
  };

  const ready = form.invoice_id && form.amount.trim() && form.payor_name.trim() && form.received_date
    && (rule !== 'required' || form.check_number.trim());

  return (
    <Modal title={invoiceNumber ? `Record a payment on ${invoiceNumber}` : 'Record a payment'} onClose={onClose}>
      <Refusal error={error} />
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          This records money already received. It does not take a payment and it does not move money.
        </p>

        {!invoiceId && (
          <Field label="Against which invoice"
            hint={open.length ? 'Invoices with an outstanding balance.' : 'No invoice currently carries a balance.'}>
            <Select value={form.invoice_id} onChange={set('invoice_id')}>
              <option value="">Choose an invoice…</option>
              {open.map((b) => (
                <option key={b.invoice_id} value={b.invoice_id}>
                  {b.invoice_number} — {fmtMoney(b.balance)} outstanding
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" hint="Dollars and cents, like 125.00.">
            <Input value={form.amount} onChange={set('amount')} inputMode="decimal" placeholder="125.00" className="text-right" />
          </Field>
          <Field label="Date received">
            <Input type="date" value={form.received_date} onChange={set('received_date')} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How it was paid">
            <Select value={form.method} onChange={set('method')}>
              {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field
            label={rule === 'required' ? 'Check number' : 'Check number (optional)'}
            hint={rule === 'forbidden'
              ? 'Only a check or money order carries one.'
              : 'It is what makes this reconcilable against the deposit.'}>
            <Input value={form.check_number} onChange={set('check_number')} maxLength={60}
              disabled={rule === 'forbidden'} aria-disabled={rule === 'forbidden'} />
          </Field>
        </div>

        <Field label="Payor" hint="Who the money came from, as it appears on the instrument.">
          <Input value={form.payor_name} onChange={set('payor_name')} maxLength={200} />
        </Field>
        <Field label="What it is for" hint="Optional.">
          <Input value={form.purpose} onChange={set('purpose')} maxLength={300} />
        </Field>
        <Field label="Deposit batch" hint="Optional — the batch this will be deposited in, for reconciliation.">
          <Input value={form.deposit_batch_ref} onChange={set('deposit_batch_ref')} maxLength={100} />
        </Field>
        <Field label="Notes" hint="Optional.">
          <TextArea rows={2} value={form.notes} onChange={set('notes')} maxLength={2000} />
        </Field>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          The receipt is recorded in your name — the employee who received the money is part of the
          record and is not something you can type. Receipts are never edited; a mistake is voided
          with a reason.
        </p>

        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!ready || busy} onClick={submit}>
            {busy ? 'Recording…' : 'Record the payment'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/** Authorise a refund. Records an authorisation — it never disburses. */
function AuthoriseRefund({ onClose, onDone }) {
  const [form, setForm] = useState({
    invoice_id: '', amount: '', reason_code: 'overpayment', reason_text: '',
    approving_authority: '', second_approver: '', payee_name: '',
    authorized_date: localToday(), notes: '',
  });
  const [invoices, setInvoices] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newKey);

  useEffect(() => {
    fi.payments.balances().then((r) => setInvoices(r.data || [])).catch(() => setInvoices([]));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const body = {
        invoice_id: Number(form.invoice_id),
        amount: form.amount.trim(),
        reason_code: form.reason_code,
        reason_text: form.reason_text.trim(),
        approving_authority: form.approving_authority.trim(),
        payee_name: form.payee_name.trim(),
        authorized_date: form.authorized_date,
        idempotency_key: key,
      };
      if (form.second_approver.trim()) body.second_approver = form.second_approver.trim();
      if (form.notes.trim()) body.notes = form.notes.trim();
      await fi.payments.refund(body);
      onDone();
    } catch (e) {
      setError({ message: refusalMessage(e, 'Could not authorise the refund.'), details: e.details });
    } finally { setBusy(false); }
  };

  const ready = form.invoice_id && form.amount.trim() && form.reason_text.trim()
    && form.approving_authority.trim() && form.payee_name.trim() && form.authorized_date;

  return (
    <Modal title="Authorise a refund" onClose={onClose}>
      <Refusal error={error} />
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          This records that a refund was <strong>authorised</strong>, and by whom. It does not pay
          anyone — Finance disburses through accounts payable. That is why there is no payment
          method here.
        </p>
        <Field label="Against which invoice">
          <Select value={form.invoice_id} onChange={set('invoice_id')}>
            <option value="">Choose an invoice…</option>
            {invoices.map((b) => (
              <option key={b.invoice_id} value={b.invoice_id}>
                {b.invoice_number} — {fmtMoney(b.paid_amount)} paid, {fmtMoney(b.balance)} balance
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount">
            <Input value={form.amount} onChange={set('amount')} inputMode="decimal" placeholder="25.00" className="text-right" />
          </Field>
          <Field label="Date authorised">
            <Input type="date" value={form.authorized_date} onChange={set('authorized_date')} />
          </Field>
        </div>
        <Field label="Payee" hint="Who the refund is owed to.">
          <Input value={form.payee_name} onChange={set('payee_name')} maxLength={200} />
        </Field>
        <Field label="Reason">
          <Select value={form.reason_code} onChange={set('reason_code')}>
            {REFUND_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="What happened" hint="Refunds are an audit target — a named fraud is fake refunds covering the theft of cash. Write it plainly.">
          <TextArea rows={3} value={form.reason_text} onChange={set('reason_text')} maxLength={2000} />
        </Field>
        <Field label="Approved by">
          <Input value={form.approving_authority} onChange={set('approving_authority')} maxLength={200} />
        </Field>
        <Field label="Second approver"
          hint="Required only if this department has set an approval threshold and this is at or above it. Leave blank otherwise.">
          <Input value={form.second_approver} onChange={set('second_approver')} maxLength={200} />
        </Field>
        <Field label="Notes" hint="Optional.">
          <TextArea rows={2} value={form.notes} onChange={set('notes')} maxLength={2000} />
        </Field>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!ready || busy} onClick={submit}>
            {busy ? 'Recording…' : 'Authorise the refund'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/** Void a receipt or a refund authorisation. Consume-and-retain: the row stays, numbered. */
function VoidReceipt({ row, onClose, onDone }) {
  const [reasonCode, setReasonCode] = useState('recorded_in_error');
  const [reasonText, setReasonText] = useState('');
  const [authority, setAuthority] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await fi.payments.void(row.id, {
        reason_code: reasonCode, reason_text: reasonText.trim(), approving_authority: authority.trim(),
      });
      onDone();
    } catch (e) {
      setError({ message: refusalMessage(e, 'Could not void it.'), details: e.details });
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`Void ${row.receipt_number}`} onClose={onClose}>
      <Refusal error={error} />
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          The record keeps its number and stays on file, shown as it was. A voided receipt and its
          copies are retained — that is the rule this follows, not a preference.
        </p>
        <Field label="Reason">
          <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            {VOID_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="What happened">
          <TextArea rows={3} value={reasonText} onChange={(e) => setReasonText(e.target.value)} maxLength={2000} />
        </Field>
        <Field label="Approved by">
          <Input value={authority} onChange={(e) => setAuthority(e.target.value)} maxLength={200} />
        </Field>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="danger" disabled={!reasonText.trim() || !authority.trim() || busy} onClick={submit}>
            {busy ? 'Voiding…' : 'Void it'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

export default function BillingReceipts({ fiCtx, canIssue }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [filters, setFilters] = useState({ kind: '', status: '', voided: '' });
  const [recording, setRecording] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [voiding, setVoiding] = useState(null);

  const admin = !!fiCtx?.isPreventionAdmin;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fi.payments.list({ ...filters, limit: 200 });
      setRows(r?.data || []);
      setError(null);
    } catch (e) {
      setError(e.message || 'Could not load the receipt register.');
    } finally { setLoading(false); setFirstLoad(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  if (loading && firstLoad) return <Spinner label="Opening the receipt register…" />;

  const capped = rows.length >= 200;

  return (
    <>
      <Section
        title="Receipts"
        subtitle="Money already received, and refunds authorised. One row per receipt — never a running total on the invoice."
        actions={admin && canIssue ? (
          <div className="flex gap-2">
            <Btn onClick={() => setRefunding(true)}><Undo2 size={16} aria-hidden="true" /> Authorise a refund</Btn>
            <Btn variant="primary" onClick={() => setRecording(true)}><Plus size={16} aria-hidden="true" /> Record a payment</Btn>
          </div>
        ) : null}
      >
        {typeof error === 'string' && <Refusal error={{ message: error }} />}

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Kind</span>
            <Select value={filters.kind} onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))} className="w-52">
              <option value="">Payments and refunds</option>
              <option value="payment">Payments only</option>
              <option value="refund_authorization">Refund authorisations only</option>
            </Select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Status</span>
            <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="w-40">
              <option value="">All</option>
              <option value="Recorded">Recorded</option>
              <option value="Void">Void</option>
            </Select>
          </label>
          <label className="inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={filters.voided === '1'} className="h-4 w-4"
              onChange={(e) => setFilters((f) => ({ ...f, voided: e.target.checked ? '1' : '' }))} />
            Voided only
          </label>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title={Object.values(filters).some(Boolean) ? 'Nothing matches those filters' : 'Nothing received yet'}
            body={Object.values(filters).some(Boolean)
              ? 'Clear a filter to see everything on file.'
              : 'Every payment taken and every refund authorised lands here with its own number — and stays, even when voided.'}
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-700 pb-24">
            <table className="w-full text-sm table-fixed">
              <caption className="sr-only">Receipts and refund authorisations, newest first. Server-ordered — the columns are not sortable.</caption>
              <colgroup>
                <col className="w-[19%]" /><col className="w-[11%]" /><col className="w-[20%]" />
                <col className="w-[13%]" /><col className="w-[12%]" /><col className="w-[13%]" /><col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                  <th scope="col" className="px-3 py-3 font-semibold truncate">Receipt</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate">Date</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate">Payor / payee</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate">Method</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate text-right">Amount</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate">Invoice</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate text-right sticky right-0 z-10 bg-white dark:bg-gray-900 border-l border-gray-100 dark:border-gray-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {rows.map((p) => {
                  const isRefund = p.kind === 'refund_authorization';
                  // ONE column pair holds both sides: the route maps a refund's payee_name
                  // onto payor_name and its authorized_date onto received_date at mint time.
                  // There is no separate payee_name or authorized_date column on fi_payments,
                  // so reading one would be reading a field that does not exist.
                  const who = p.payor_name || '—';
                  return (
                    <tr key={p.id} className="group hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-3 truncate font-semibold" title={p.receipt_number}>{p.receipt_number}</td>
                      <td className="px-3 py-3 truncate">{fmtDate(p.received_date)}</td>
                      <td className="px-3 py-3 truncate" title={who}>{who}</td>
                      {/* A refund has no method, because we are not the one paying it. */}
                      <td className="px-3 py-3 truncate">
                        {isRefund ? <span className="text-gray-500 dark:text-gray-400">refund</span>
                          : (METHODS.find(([v]) => v === p.method)?.[1] || p.method || '—')}
                      </td>
                      <td className="px-3 py-3 truncate text-right tabular-nums">{fmtMoney(p.amount)}</td>
                      <td className="px-3 py-3 truncate" title={p.invoice_number || ''}>{p.invoice_number || '—'}</td>
                      <td className="px-3 py-3 text-right sticky right-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/50 border-l border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-end gap-2">
                          <Badge tone={p.status === 'Void' ? 'gray' : isRefund ? 'yellow' : 'green'}>
                            {p.status === 'Void' ? 'Void' : isRefund ? 'Authorised' : 'Recorded'}
                          </Badge>
                          {admin && p.status !== 'Void' && (
                            <RowActions label={`Actions for ${p.receipt_number}`} items={[
                              { key: 'void', label: 'Void this record', icon: Ban, danger: true,
                                hint: 'Keeps its number and stays on file; it cannot be undone',
                                onSelect: () => setVoiding(p) },
                            ]} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            {rows.length} record{rows.length === 1 ? '' : 's'} shown
            {capped && ', which is the server’s maximum for one read — narrow the filters to be sure you are seeing everything'}.
          </p>
        )}
      </Section>

      {recording && <RecordPayment onClose={() => setRecording(false)} onDone={() => { setRecording(false); load(); }} />}
      {refunding && <AuthoriseRefund onClose={() => setRefunding(false)} onDone={() => { setRefunding(false); load(); }} />}
      {voiding && <VoidReceipt row={voiding} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); load(); }} />}
    </>
  );
}
