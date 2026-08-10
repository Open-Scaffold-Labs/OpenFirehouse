// prevention/BillingInvoices.jsx — the invoice register and the acts on an invoice.
//
// ── WHAT AN INVOICE IS HERE ──────────────────────────────────────────────────────────
// An issued invoice is APPEND-ONLY. There is no PATCH on the server and there is no edit
// affordance here. A correction is a NEW linked record carrying its reason, its text and
// its approving authority; the original renders unchanged forever. A void CONSUMES AND
// RETAINS its number — voided invoices stay in the register, numbered, because a state
// comptroller manual is explicit that a voided receipt and its copies must be retained,
// and because published audits sample voided records FIRST.
//
// ── THREE MONEY COLUMNS, NOT ONE ─────────────────────────────────────────────────────
// Total / Paid / Balance, following the one fire product whose register is documented.
// Balance is DERIVED from fi_invoice_balances (invoice − payments + refunds) and is never
// stored: "a stored balance is a second source of truth for the same number." There is no
// 'Paid' invoice status to render — INVOICE_STATUSES is ['Issued','Void'] — so paid-ness
// comes from ./money.js paymentState. A NEGATIVE balance is a legal overpayment.
//
// ── DUNNING IS STAMPS, NOT AN ENGINE ─────────────────────────────────────────────────
// Five write-once date columns on the invoice. Nothing escalates on a timer, the server
// does not enforce the ladder's order, and this screen must never imply that it does.
//
// ── THE LIST IS CAPPED AND UNSORTABLE, AND WE SAY SO ─────────────────────────────────
// The API caps at 200 rows with NO pagination and NO client-controllable sort. A sortable
// column header would be a lie, so there are none, and the footer states the cap when it
// is reached rather than letting a clerk believe they are seeing everything.
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { FileText, Plus, Ban, CalendarClock, Split, Banknote, AlertTriangle } from 'lucide-react';
import { fi, localToday } from './fiApi';
import { fmtMoney, paymentState, PAYMENT_STATE_META, DUNNING_STAMPS } from './money';
import {
  Section, Field, Input, Select, TextArea, Btn, Badge, Modal, EmptyState, Spinner, RowActions,
} from './ui';
// One receipt form, two entry points (the receipts register and an invoice row). A second
// copy would be a second place for the check-number rule to drift out of step.
import { RecordPayment } from './BillingReceipts';

const d10 = (v) => (v ? String(v).slice(0, 10) : '');
const fmtDate = (v) => (v ? d10(v) : '—');

const VOID_REASONS = [
  ['duplicate', 'Duplicate of another invoice'],
  ['issued_in_error', 'Issued in error'],
  ['wrong_party', 'Billed to the wrong party'],
  ['wrong_amount', 'Wrong amount'],
  ['permit_withdrawn', 'Permit withdrawn'],
  ['superseded_by_adjustment', 'Superseded by an adjustment'],
  ['other', 'Other (explain below)'],
];

const ADJUST_REASONS = [
  ['undercharge', 'Undercharge'],
  ['overcharge', 'Overcharge'],
  ['fee_schedule_error', 'Fee-schedule error'],
  ['waiver_applied', 'Waiver applied'],
  ['recalculation', 'Recalculation'],
  ['other', 'Other (explain below)'],
];

const LINE_KINDS = [
  ['fee', 'Fee'],
  ['penalty', 'Penalty'],
  ['posting_fee', 'Posting fee'],
  ['interest', 'Interest'],
];

/** A stable idempotency key per form-open. Stable is the point: a retry after a lost ACK
 *  must be answered `duplicate`, not mint a second numbered document. */
const newKey = () => (globalThis.crypto?.randomUUID?.() || `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`);

/** Speak the server's refusal in its own terms. Never match on message text. */
function refusalMessage(e, fallback) {
  const byCode = {
    INVOICE_PREFIX_NOT_CONFIGURED:
      'This department has no invoice prefix yet, so a number cannot be minted. A chief sets it in Settings › Billing.',
    INVOICE_NOT_COMPUTABLE: 'The lines could not be totalled — nothing was assumed to be zero. See below.',
    REFERENCE_NOT_FOUND: 'One of the linked records (assessment, permit or inspection) no longer exists.',
    ALREADY_VOID: 'That invoice is already void. A void happens once and cannot be undone.',
    CANNOT_ADJUST_VOID: 'A void invoice cannot be adjusted — the adjustment would have nothing to correct.',
    CANNOT_STAMP_VOID: 'A void invoice cannot be stamped.',
    STAMP_ALREADY_SET: 'That stamp is already recorded. Stamps are written once and never rewritten.',
    STAMP_BEFORE_INVOICE_DATE: 'A notice cannot be dated before the invoice it chases.',
    BAD_STAMP: 'That is not one of the five recorded notice stamps.',
    NOT_FOUND: 'That invoice is no longer on record.',
    CONFLICT: 'Someone changed this invoice while you were working on it. Reopen it and try again.',
    FORBIDDEN_FI: 'That action needs a prevention-admin designation (or chief authority).',
  };
  return byCode[e?.code] || e?.message || fallback;
}

/** The red banner + the server's per-line detail lines, which are now readable sentences. */
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

export default function BillingInvoices({ fiCtx, canIssue }) {
  const [rows, setRows] = useState([]);
  const [balances, setBalances] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [filters, setFilters] = useState({ status: '', fiscal_year: '', voided: '', zero_amount: '' });

  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState(null); // { invoice, verb }

  const admin = !!fiCtx?.isPreventionAdmin;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, bal] = await Promise.all([
        fi.invoices.list({ ...filters, limit: 200 }),
        // A secondary failure must not blank the register — the invoice header is still
        // true without its balance, and saying "—" is honest where guessing is not.
        fi.payments.balances().catch(() => ({ data: [] })),
      ]);
      setRows(inv?.data || []);
      setBalances(bal?.data || []);
      setError(null);
    } catch (e) {
      setError(e.message || 'Could not load the invoice register.');
    } finally {
      setLoading(false);
      setFirstLoad(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const balByInvoice = useMemo(() => {
    const m = new Map();
    for (const b of balances) m.set(String(b.invoice_id), b);
    return m;
  }, [balances]);

  const merged = useMemo(() => rows.map((r) => {
    const b = balByInvoice.get(String(r.id));
    const view = {
      ...r,
      paid_amount: b?.paid_amount ?? null,
      refunded_amount: b?.refunded_amount ?? null,
      balance: b?.balance ?? null,
    };
    return { ...view, state: paymentState(view) };
  }), [rows, balByInvoice]);

  if (loading && firstLoad) return <Spinner label="Opening the invoice register…" />;

  const capped = rows.length >= 200;

  return (
    <>
      <Section
        title="Invoices"
        subtitle="Every charge this bureau has issued. An issued invoice is never edited — a correction is a new linked record, and a void keeps its number."
        actions={admin && canIssue
          ? <Btn variant="primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" /> Issue an invoice</Btn>
          : null}
      >
        {typeof error === 'string' && <Refusal error={{ message: error }} />}

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Status</span>
            <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="w-40">
              <option value="">All</option>
              <option value="Issued">Issued</option>
              <option value="Void">Void</option>
            </Select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Fiscal year</span>
            <Input value={filters.fiscal_year} inputMode="numeric" placeholder="2026" maxLength={4} className="w-28"
              onChange={(e) => setFilters((f) => ({ ...f, fiscal_year: e.target.value.replace(/\D/g, '') }))} />
          </label>
          {/* The auditor's sampling frame. These two filters are the reason a bureau can
              answer "show me everything that was voided or billed at zero" in one click —
              published audits start there, before they look at a single record. */}
          <label className="inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={filters.voided === '1'} className="h-4 w-4"
              onChange={(e) => setFilters((f) => ({ ...f, voided: e.target.checked ? '1' : '' }))} />
            Voided only
          </label>
          <label className="inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={filters.zero_amount === '1'} className="h-4 w-4"
              onChange={(e) => setFilters((f) => ({ ...f, zero_amount: e.target.checked ? '1' : '' }))} />
            Zero-amount only
          </label>
        </div>

        {merged.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={Object.values(filters).some(Boolean) ? 'Nothing matches those filters' : 'No invoices issued yet'}
            body={Object.values(filters).some(Boolean)
              ? 'Clear a filter, or try a different fiscal year.'
              : 'Every charge this bureau raises lands here with its own number, newest first — and stays, even when voided.'}
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-700 pb-24">
            <table className="w-full text-sm table-fixed">
              <caption className="sr-only">
                Invoices, newest fiscal year and number first. Server-ordered — the columns are not sortable.
              </caption>
              <colgroup>
                <col className="w-[20%]" /><col className="w-[11%]" /><col className="w-[23%] " />
                <col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[11%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                  <th scope="col" className="px-3 py-3 font-semibold truncate">Number</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate">Date</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate">Bill to</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate text-right">Total</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate text-right">Paid</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate text-right">Balance</th>
                  <th scope="col" className="px-3 py-3 font-semibold truncate text-right sticky right-0 z-10 bg-white dark:bg-gray-900 border-l border-gray-100 dark:border-gray-700">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {merged.map((r) => {
                  const meta = PAYMENT_STATE_META[r.state];
                  return (
                    <tr key={r.id} className="group hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-3 truncate" title={r.invoice_number}>
                        <button type="button" onClick={() => setOpenId(r.id)}
                          className="font-semibold text-red-700 dark:text-red-400 hover:underline truncate max-w-full">
                          {r.invoice_number}
                        </button>
                      </td>
                      <td className="px-3 py-3 truncate" title={fmtDate(r.invoice_date)}>{fmtDate(r.invoice_date)}</td>
                      <td className="px-3 py-3 truncate" title={r.bill_to_name || ''}>{r.bill_to_name || '—'}</td>
                      <td className="px-3 py-3 truncate text-right tabular-nums">{fmtMoney(r.invoice_amount)}</td>
                      <td className="px-3 py-3 truncate text-right tabular-nums">{fmtMoney(r.paid_amount)}</td>
                      <td className="px-3 py-3 truncate text-right tabular-nums">{fmtMoney(r.balance)}</td>
                      <td className="px-3 py-3 text-right sticky right-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/50 border-l border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-end gap-2">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          {admin && r.status !== 'Void' && (
                            <RowActions
                              label={`Actions for invoice ${r.invoice_number}`}
                              items={[
                                { key: 'pay', label: 'Record a payment', icon: Banknote,
                                  hint: 'Money already received — at a counter, by mail, or by the city’s processor',
                                  onSelect: () => setActing({ invoice: r, verb: 'pay' }) },
                                { key: 'stamp', label: 'Record a notice sent', icon: CalendarClock,
                                  hint: 'A date stamp on this invoice — nothing escalates on its own',
                                  onSelect: () => setActing({ invoice: r, verb: 'stamp' }) },
                                { key: 'adjust', label: 'Issue an adjustment', icon: Split,
                                  hint: 'A new linked invoice that corrects this one; this one is never edited',
                                  onSelect: () => setActing({ invoice: r, verb: 'adjust' }) },
                                { key: 'void', label: 'Void this invoice', icon: Ban, danger: true,
                                  hint: 'Keeps its number forever and cannot be undone',
                                  onSelect: () => setActing({ invoice: r, verb: 'void' }) },
                              ]}
                            />
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

        {merged.length > 0 && (
          <>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {merged.length} invoice{merged.length === 1 ? '' : 's'} shown
              {capped && ', which is the server’s maximum for one read — narrow the filters to be sure you are seeing everything'}.
            </p>
            {/* The balances read caps at 500 and is sorted by balance DESC, so past that a
                SETTLED invoice can fall outside it. Its state renders as "Unknown" rather
                than being guessed at — and the reason is said out loud, because an
                unexplained "Unknown" is its own kind of unhelpful. */}
            {merged.some((r) => r.state === 'unknown') && (
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                Some rows show an unknown balance — the payment ledger could not be matched to them
                in this read. They are not unpaid; we simply do not know. Open a row to see its own
                balance, which is always read directly.
              </p>
            )}
          </>
        )}
      </Section>

      {openId && (
        <InvoiceDetail id={openId} admin={admin} onClose={() => setOpenId(null)}
          onAct={(invoice, verb) => { setOpenId(null); setActing({ invoice, verb }); }} />
      )}
      {creating && (
        <IssueInvoice onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />
      )}
      {acting && (
        <InvoiceAct acting={acting} onClose={() => setActing(null)}
          onDone={() => { setActing(null); load(); }} />
      )}
    </>
  );
}

// ── Detail ───────────────────────────────────────────────────────────────────────────
// Renders what the record IS, including the parts a bureau is audited on: the lines, the
// money actually applied against it, the linked adjustments, and the notice stamps.
function InvoiceDetail({ id, admin, onClose, onAct }) {
  const [inv, setInv] = useState(null);
  const [bal, setBal] = useState(null);
  const [pays, setPays] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [d, b, p] = await Promise.all([
          fi.invoices.get(id),
          fi.payments.balances({ invoice_id: id }).catch(() => ({ data: [] })),
          fi.payments.list({ invoice_id: id, limit: 200 }).catch(() => ({ data: [] })),
        ]);
        if (!live) return;
        setInv(d.data); setBal((b.data || [])[0] || null); setPays(p.data || []);
      } catch (e) { if (live) setError(refusalMessage(e, 'Could not open that invoice.')); }
    })();
    return () => { live = false; };
  }, [id]);

  const state = inv ? paymentState({ ...inv, ...(bal || {}) }) : 'unknown';
  const meta = PAYMENT_STATE_META[state];

  return (
    <Modal title={inv ? `Invoice ${inv.invoice_number}` : 'Invoice'} onClose={onClose} wide>
      {error && <Refusal error={{ message: error }} />}
      {!inv && !error && <Spinner label="Opening the invoice…" />}
      {inv && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bold text-gray-900 dark:text-gray-100">{inv.bill_to_name}</p>
              {inv.bill_to_address && <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">{inv.bill_to_address}</p>}
              {inv.bill_to_email && <p className="text-sm text-gray-600 dark:text-gray-400">{inv.bill_to_email}</p>}
            </div>
            <div className="text-right">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Issued {fmtDate(inv.invoice_date)}{inv.invoice_kind === 'adjustment' ? ' · adjustment' : ''}
              </p>
            </div>
          </div>

          {inv.status === 'Void' && (
            <div role="note" className="rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                Voided — {inv.void_reason_code?.replace(/_/g, ' ')}
              </p>
              {inv.void_reason_text && <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{inv.void_reason_text}</p>}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Approved by {inv.void_approving_authority || '—'}. The number is kept, and the original is shown unchanged.
              </p>
            </div>
          )}

          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Lines</h3>
            <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
              <table className="w-full text-sm table-fixed">
                <colgroup><col className="w-[14%]" /><col className="w-[62%]" /><col className="w-[24%]" /></colgroup>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                    <th scope="col" className="px-3 py-2 font-semibold truncate">Kind</th>
                    <th scope="col" className="px-3 py-2 font-semibold truncate">Description</th>
                    <th scope="col" className="px-3 py-2 font-semibold truncate text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {(inv.lines || []).map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 truncate">{l.line_kind?.replace(/_/g, ' ')}</td>
                      <td className="px-3 py-2 truncate" title={l.description}>{l.description}</td>
                      <td className="px-3 py-2 truncate text-right tabular-nums">{fmtMoney(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 dark:border-gray-700 font-bold">
                    <td className="px-3 py-2" colSpan={2}>Invoice total</td>
                    {/* Server-computed. There is no client-side sum of these lines, on purpose. */}
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(inv.invoice_amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Money applied</h3>
              {pays.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Nothing recorded against this invoice yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {pays.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-gray-700 dark:text-gray-300" title={`${p.receipt_number} · ${p.payor_name || p.payee_name || ''}`}>
                        {p.receipt_number}
                        {p.status === 'Void' && <span className="ml-1 text-gray-500">(void)</span>}
                        {p.kind === 'refund_authorization' && <span className="ml-1 text-gray-500">(refund)</span>}
                      </span>
                      <span className="tabular-nums shrink-0">{fmtMoney(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Paid</dt><dd className="tabular-nums font-semibold">{fmtMoney(bal?.paid_amount)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Refunds authorised</dt><dd className="tabular-nums font-semibold">{fmtMoney(bal?.refunded_amount)}</dd></div>
                <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-1">
                  <dt className="font-bold">Balance</dt><dd className="tabular-nums font-bold">{fmtMoney(bal?.balance)}</dd>
                </div>
              </dl>
              {state === 'overpaid' && (
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  A credit balance. That is a recordable state, not an error.
                </p>
              )}
            </div>

            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Notices sent</h3>
              <ul className="space-y-1 text-sm">
                {DUNNING_STAMPS.map((s) => (
                  <li key={s.key} className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">{s.label}</span>
                    <span className="tabular-nums">{fmtDate(inv[s.key])}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Each is a record that a person sent something. Nothing here escalates on its own.
              </p>
            </div>
          </div>

          {inv.adjustments?.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Corrected by</h3>
              <ul className="space-y-1 text-sm">
                {inv.adjustments.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span className="truncate">{a.invoice_number} · {a.adjustment_reason_code?.replace(/_/g, ' ')}</span>
                    <span className="tabular-nums shrink-0">{fmtMoney(a.invoice_amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {admin && inv.status !== 'Void' && (
              <>
                <Btn onClick={() => onAct(inv, 'stamp')}><CalendarClock size={16} aria-hidden="true" /> Record a notice</Btn>
                <Btn onClick={() => onAct(inv, 'adjust')}><Split size={16} aria-hidden="true" /> Adjust</Btn>
                <Btn variant="danger" onClick={() => onAct(inv, 'void')}><Ban size={16} aria-hidden="true" /> Void</Btn>
                <Btn variant="primary" onClick={() => onAct(inv, 'pay')}><Banknote size={16} aria-hidden="true" /> Record a payment</Btn>
              </>
            )}
            <Btn onClick={onClose}>Close</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Line editor, shared by "issue" and "adjust" ──────────────────────────────────────
// An ORIGINAL invoice refuses a negative line (a credit belongs on an adjustment); an
// ADJUSTMENT allows one. Both are enforced by the server and by a table trigger — this is
// only the hint that keeps a clerk out of the refusal.
function LineEditor({ lines, setLines, allowNegative }) {
  const set = (i, k) => (e) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)));
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[9rem_1fr_8rem_auto] items-start">
          <Select value={l.line_kind} onChange={set(i, 'line_kind')} aria-label={`Line ${i + 1} kind`}>
            {LINE_KINDS.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
          </Select>
          <Input value={l.description} onChange={set(i, 'description')} maxLength={300}
            placeholder="What this charge is for" aria-label={`Line ${i + 1} description`} />
          <Input value={l.amount} onChange={set(i, 'amount')} inputMode="decimal"
            placeholder={allowNegative ? '-25.00' : '250.00'} aria-label={`Line ${i + 1} amount`} className="text-right" />
          <Btn variant="ghost" type="button" aria-label={`Remove line ${i + 1}`}
            disabled={lines.length === 1}
            onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</Btn>
        </div>
      ))}
      <Btn type="button" onClick={() => setLines([...lines, { line_kind: 'fee', description: '', amount: '' }])}>
        <Plus size={16} aria-hidden="true" /> Add a line
      </Btn>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Amounts are dollars and cents, like 250.00.
        {allowNegative
          ? ' A credit is a negative amount on an adjustment.'
          : ' A credit cannot go on an original invoice — issue an adjustment instead.'}
        {' '}Every line needs a description: an unlabelled charge cannot be explained to a payer.
      </p>
    </div>
  );
}

function IssueInvoice({ onClose, onDone }) {
  const [form, setForm] = useState({
    bill_to_name: '', bill_to_address: '', bill_to_email: '',
    invoice_date: localToday(), due_date: '',
  });
  const [lines, setLines] = useState([{ line_kind: 'fee', description: '', amount: '' }]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Minted once per form-open and held: a retry after a lost ACK must be answered
  // `duplicate`, not mint a second numbered document.
  const [key] = useState(newKey);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      // Build the body key by key — the server's schemas are STRICT and refuse unknown keys.
      const body = {
        bill_to_name: form.bill_to_name.trim(),
        invoice_date: form.invoice_date,
        idempotency_key: key,
        lines: lines.map((l) => ({
          line_kind: l.line_kind,
          description: l.description.trim(),
          amount: l.amount.trim(),
        })),
      };
      if (form.bill_to_address.trim()) body.bill_to_address = form.bill_to_address.trim();
      if (form.bill_to_email.trim()) body.bill_to_email = form.bill_to_email.trim();
      if (form.due_date) body.due_date = form.due_date;
      await fi.invoices.create(body);
      onDone();
    } catch (e) {
      setError({ message: refusalMessage(e, 'Could not issue the invoice.'), details: e.details });
    } finally { setBusy(false); }
  };

  const ready = form.bill_to_name.trim() && form.invoice_date
    && lines.every((l) => l.description.trim() && l.amount.trim());

  return (
    <Modal title="Issue an invoice" onClose={onClose} wide>
      <Refusal error={error} />
      <div className="space-y-4">
        <Field label="Bill to">
          <Input value={form.bill_to_name} onChange={set('bill_to_name')} maxLength={200} />
        </Field>
        <Field label="Address" hint="Optional — appears on the invoice.">
          <TextArea rows={3} value={form.bill_to_address} onChange={set('bill_to_address')} maxLength={500} />
        </Field>
        <Field label="Email" hint="Optional.">
          <Input type="email" value={form.bill_to_email} onChange={set('bill_to_email')} maxLength={200} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice date">
            <Input type="date" value={form.invoice_date} onChange={set('invoice_date')} />
          </Field>
          <Field label="Due date"
            hint="Optional. Setting it here means it cannot be stamped later — a stamp is written once.">
            <Input type="date" value={form.due_date} onChange={set('due_date')} />
          </Field>
        </div>
        <div>
          <span className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Lines</span>
          <LineEditor lines={lines} setLines={setLines} allowNegative={false} />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The number is minted by the server when you issue. Once issued, this invoice is never
          edited — a correction is a new linked record.
        </p>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!ready || busy} onClick={submit}>
            {busy ? 'Issuing…' : 'Issue invoice'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── The four acts on an invoice ──────────────────────────────────────────────────────
// Void and adjust both demand a reason CODE, free text AND a named approving authority —
// not because a form likes fields, but because a state comptroller's manual requires that
// billing adjustments, write-offs and refunds be approved BEFORE they are made and that
// the reasons be documented and retained. The named fraud it exists to catch is fake
// refunds covering the theft of cash.
function InvoiceAct({ acting, onClose, onDone }) {
  const { invoice, verb } = acting;
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newKey);

  const [reasonCode, setReasonCode] = useState(verb === 'void' ? 'issued_in_error' : 'undercharge');
  const [reasonText, setReasonText] = useState('');
  const [authority, setAuthority] = useState('');
  const [stamp, setStamp] = useState('second_notice_date');
  const [stampDate, setStampDate] = useState(localToday());
  const [adjDate, setAdjDate] = useState(localToday());
  const [lines, setLines] = useState([{ line_kind: 'fee', description: '', amount: '' }]);

  if (verb === 'pay') {
    return <RecordPayment invoiceId={invoice.id} invoiceNumber={invoice.invoice_number}
      onClose={onClose} onDone={onDone} />;
  }

  const run = async () => {
    setBusy(true); setError(null);
    try {
      if (verb === 'void') {
        await fi.invoices.void(invoice.id, {
          reason_code: reasonCode, reason_text: reasonText.trim(), approving_authority: authority.trim(),
        });
      } else if (verb === 'stamp') {
        await fi.invoices.stamp(invoice.id, { stamp, date: stampDate });
      } else if (verb === 'adjust') {
        await fi.invoices.adjust(invoice.id, {
          reason_code: reasonCode, reason_text: reasonText.trim(), approving_authority: authority.trim(),
          invoice_date: adjDate, idempotency_key: key,
          lines: lines.map((l) => ({ line_kind: l.line_kind, description: l.description.trim(), amount: l.amount.trim() })),
        });
      }
      onDone();
    } catch (e) {
      setError({ message: refusalMessage(e, 'That did not go through.'), details: e.details });
    } finally { setBusy(false); }
  };

  const title = {
    void: `Void ${invoice.invoice_number}`,
    stamp: `Record a notice on ${invoice.invoice_number}`,
    adjust: `Adjust ${invoice.invoice_number}`,
  }[verb];

  const ready = verb === 'stamp'
    ? !!stampDate
    : verb === 'void'
      ? reasonText.trim() && authority.trim()
      : reasonText.trim() && authority.trim() && adjDate
        && lines.every((l) => l.description.trim() && l.amount.trim());

  return (
    <Modal title={title} onClose={onClose} wide={verb === 'adjust'}>
      <Refusal error={error} />
      <div className="space-y-4">
        {verb === 'void' && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The invoice keeps its number and stays in the register, shown exactly as it was.
            A void happens once and cannot be undone.
          </p>
        )}
        {verb === 'adjust' && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This mints a <strong>new</strong> invoice, linked to {invoice.invoice_number}, drawing the
            next number in the series. {invoice.invoice_number} is not altered. A credit is a
            negative amount here.
          </p>
        )}

        {verb === 'stamp' && (
          <>
            <Field label="Which notice">
              <Select value={stamp} onChange={(e) => setStamp(e.target.value)}>
                {DUNNING_STAMPS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Date sent" hint="Cannot be earlier than the invoice date. A stamp is written once and never rewritten.">
              <Input type="date" value={stampDate} onChange={(e) => setStampDate(e.target.value)} />
            </Field>
          </>
        )}

        {(verb === 'void' || verb === 'adjust') && (
          <>
            <Field label="Reason">
              <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                {(verb === 'void' ? VOID_REASONS : ADJUST_REASONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="What happened" hint="Retained with the record and read by an auditor. Write what you would want to read in two years.">
              <TextArea rows={3} value={reasonText} onChange={(e) => setReasonText(e.target.value)} maxLength={2000} />
            </Field>
            <Field label="Approved by" hint="The person authorising this — required before the change is made, not after.">
              <Input value={authority} onChange={(e) => setAuthority(e.target.value)} maxLength={200} />
            </Field>
          </>
        )}

        {verb === 'adjust' && (
          <>
            <Field label="Adjustment date">
              <Input type="date" value={adjDate} onChange={(e) => setAdjDate(e.target.value)} />
            </Field>
            <div>
              <span className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Adjustment lines</span>
              <LineEditor lines={lines} setLines={setLines} allowNegative />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant={verb === 'void' ? 'danger' : 'primary'} disabled={!ready || busy} onClick={run}>
            {busy ? 'Working…' : { void: 'Void it', stamp: 'Record it', adjust: 'Issue the adjustment' }[verb]}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
