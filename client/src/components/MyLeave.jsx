/**
 * MyLeave.jsx — the member's self-service leave view (Phase 1.2e).
 *
 * Built to the 2026-07-24 market pass:
 *  - one card per bank; the HERO number is "Available" (available_to_request), with
 *    Scheduled / Pending / Used shown small + muted beneath it;
 *  - a request-time-off form that shows the selected bank's available inline + the
 *    projected-after balance, and a SOFT amber warning (never a hard block) if the request
 *    exceeds available (accruals or an approved negative may cover it);
 *  - request history with status carried by icon + label (never color alone, WCAG 1.4.1) and
 *    the denial reason surfaced inline;
 *  - calm zero states, and an honest "not set up" state distinct from a real 0 balance.
 *
 * Data (all member-scoped server-side): GET /api/leave-types (bank list), GET
 * /api/leave-types/balances (enriched picture), GET /api/leave/mine (own requests). Submit:
 * POST /api/leave (the server resolves the caller's own member — no client member id needed).
 *
 * Hours are AUTO-DERIVED from the member's actually-scheduled tours in the window (1.2 gate #1,
 * 2026-07-25): picking a date range prefills the real scheduled hours (apparatus_assignments,
 * shifts fallback) — overridable, never a guessed flat per-day number. The form also shows the
 * PROJECTED bank balance on the request's end date (gate #4) — the market's "future time-off
 * adjustments" — so a member sees whether accruals will cover a request their current balance
 * won't.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CalendarClock, Plus, Check, Clock, X, AlertTriangle, Loader2, Send, CalendarRange } from 'lucide-react';
import { api } from '../utils/api';
import { projectedAfter, requestWarning, statusMeta, canSubmitRequest } from '../utils/leaveForm';

const STATUS_ICON = { approved: Check, pending: Clock, denied: X, cancelled: X };
const TONE = {
  green: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  red:   'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  gray:  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

function StatusPill({ status }) {
  const meta = statusMeta(status);
  const Icon = STATUS_ICON[meta.key] || Clock;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${TONE[meta.tone]}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function BalanceCard({ card }) {
  const zero = card.available <= 0 && card.scheduled <= 0 && card.pending <= 0;
  // A bank with NOTHING in it — not available, not scheduled, not pending, never
  // used — printed four zeros: the headline "0 h available" plus a three-up
  // Scheduled / Pending / Used breakdown of a total that is already zero. Across
  // twelve banks that was 48 rendered zeros on a member's landing page (measured),
  // and the three that matter — a bank the member actually has — were buried in it.
  //
  // Deliberately NOT hiding the bank itself: "I have no FMLA" is a real answer a
  // member needs, and a bank that vanishes is a bank they will ask about. What is
  // dropped is only the breakdown that restates a zero three more times. If ANY of
  // the four numbers is non-zero the full breakdown returns, because then it says
  // something the headline does not.
  const empty = zero && card.used <= 0;
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{card.name}</span>
        <span className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{card.code}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={`text-3xl font-bold ${zero ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>{card.available}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">{card.unit === 'shifts' ? 'shifts' : 'h'} available</span>
      </div>
      {empty ? (
        <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">No activity in this bank</p>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-1 text-center">
          <div>
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">{card.scheduled}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">Scheduled</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">{card.pending}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">Pending</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">{card.used}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">Used</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyLeave() {
  const [banks, setBanks] = useState([]);
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [asOf, setAsOf] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', hours: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  // #1 auto-hours: derived from the member's scheduled tours; #4: projected balance on end date.
  const [derived, setDerived] = useState(null);      // { loading, hours, source, needsReview, days }
  const [projection, setProjection] = useState(null); // { loading, projected, projectable }
  const hoursTouched = useRef(false);                 // once the member edits hours, stop auto-filling

  const today = new Date().toISOString().slice(0, 10);

  // Auto-derive scheduled hours whenever the date range is a valid window. Prefill the hours
  // field unless the member has manually edited it (their number always wins).
  useEffect(() => {
    if (!showForm || !form.startDate || !form.endDate || form.endDate < form.startDate) { setDerived(null); return; }
    let cancelled = false;
    setDerived((d) => ({ ...(d || {}), loading: true }));
    api.get(`/api/leave/scheduled-hours?start=${form.startDate}&end=${form.endDate}`)
      .then((r) => {
        if (cancelled) return;
        const d = r.data || {};
        setDerived({ loading: false, hours: d.hours, source: d.source, needsReview: d.needsReview, days: d.days });
        if (!hoursTouched.current && d.source !== 'none' && d.hours > 0) {
          setForm((f) => ({ ...f, hours: String(d.hours) }));
        }
      })
      .catch(() => { if (!cancelled) setDerived({ loading: false, source: 'none' }); });
    return () => { cancelled = true; };
  }, [showForm, form.startDate, form.endDate]);

  // Project the selected bank's balance to the request's end date (future only).
  useEffect(() => {
    if (!showForm || !form.leaveTypeId || !form.endDate || form.endDate <= today) { setProjection(null); return; }
    let cancelled = false;
    setProjection({ loading: true });
    api.get(`/api/leave-types/balances?self=1&asOf=${form.endDate}`)
      .then((r) => {
        if (cancelled) return;
        const row = (r.data || []).find((x) => String(x.leave_type_id) === String(form.leaveTypeId));
        if (!row || row.projectable === false || row.projected_balance == null) { setProjection({ loading: false, projectable: false }); return; }
        setProjection({ loading: false, projectable: true, projected: row.projected_balance, accrual: row.projected_accrual });
      })
      .catch(() => { if (!cancelled) setProjection({ loading: false, projectable: false }); });
    return () => { cancelled = true; };
  }, [showForm, form.leaveTypeId, form.endDate, today]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [b, bal, mine] = await Promise.all([
        api.get('/api/leave-types'),
        api.get('/api/leave-types/balances?self=1'),   // My Leave is always own-scoped, even for officers
        api.get('/api/leave/mine'),
      ]);
      setBanks((b.data || []).filter((t) => t.active));
      setBalances(bal.data || []);
      setRequests(mine.data || []);
      setAsOf(new Date());
    } catch (e) {
      setError(e.message || 'Could not load your leave.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  const cards = useMemo(() => banks.map((bank) => {
    const bal = balances.find((x) => x.leave_type_id === bank.id) || {};
    return {
      id: bank.id, code: bank.code, name: bank.name, unit: bank.unit,
      available: Number(bal.available_to_request ?? 0),
      scheduled: Number(bal.scheduled_hours ?? 0),
      used: Number(bal.used_hours ?? 0),
      pending: Number(bal.pending_hours ?? 0),
    };
  }), [banks, balances]);

  const selectedBank = cards.find((c) => String(c.id) === String(form.leaveTypeId)) || null;
  const warn = selectedBank ? requestWarning(selectedBank.available, form.hours, selectedBank.name) : null;
  const canSubmit = canSubmitRequest(form) && !submitting;

  const submit = useCallback(async () => {
    if (!canSubmitRequest(form)) return;
    setSubmitting(true); setFormError(null);
    try {
      await api.post('/api/leave', {
        type: selectedBank ? selectedBank.name : 'Leave',
        startDate: form.startDate,
        endDate: form.endDate,
        leaveTypeId: Number(form.leaveTypeId),
        hours: Number(form.hours),
        notes: form.notes || '',
      });
      setForm({ leaveTypeId: '', startDate: '', endDate: '', hours: '', notes: '' });
      hoursTouched.current = false;
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError(e.message || 'Could not submit your request.');
    } finally {
      setSubmitting(false);
    }
  }, [form, selectedBank, load]);

  const history = useMemo(
    () => [...requests].sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || ''))),
    [requests]);

  const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500';
  const labelCls = 'block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1';

  return (
    <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-md overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-red-600"><CalendarClock className="w-5 h-5 text-white" aria-hidden="true" /></div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">My Leave</h3>
            {asOf && <p className="text-[11px] text-gray-500 dark:text-gray-400">as of {asOf.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
          </div>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          /* Blue per the action-colour vocabulary: requesting time off is an
             ordinary primary action, not an emergency. Missed on the first pass. */
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors">
          <Plus className="w-4 h-4" aria-hidden="true" /> Request time off
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* dark:text-gray-400 below is not optional: bare gray-500 on the dark surface
            (#101828) measures 3.67:1. This is the MIRROR of the light-mode gray-400
            defect — same token family, opposite theme — and it only ever renders while
            the fetch is in flight, which is why no sweep had ever seen it. */}
        {loading && (
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading your leave…</div>
        )}
        {error && !loading && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-2 text-sm">{error}</div>
        )}

        {/* Request form */}
        {showForm && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="ml-bank">Leave bank</label>
                <select id="ml-bank" className={inputCls} value={form.leaveTypeId}
                  onChange={(e) => setForm((f) => ({ ...f, leaveTypeId: e.target.value }))}>
                  <option value="">Select a bank…</option>
                  {cards.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.available}{c.unit === 'shifts' ? ' shifts' : 'h'} available</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="ml-start">Start date</label>
                <input id="ml-start" type="date" className={inputCls} value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ml-end">End date</label>
                <input id="ml-end" type="date" className={inputCls} value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ml-hours">Hours</label>
                <input id="ml-hours" type="number" min="0" step="0.5" className={inputCls} value={form.hours}
                  placeholder="e.g. 24" onChange={(e) => { hoursTouched.current = true; setForm((f) => ({ ...f, hours: e.target.value })); }} />
                {derived && !derived.loading && derived.source && derived.source !== 'none' && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <CalendarRange className="inline w-3 h-3 mr-0.5 -mt-0.5" aria-hidden="true" />
                    {derived.hours}h from your {derived.days} scheduled {derived.days === 1 ? 'tour' : 'tours'} — edit if needed.
                    {derived.needsReview && <span className="text-amber-600 dark:text-amber-400"> Some tours had no set length; please confirm.</span>}
                  </p>
                )}
              </div>
              <div>
                <label className={labelCls} htmlFor="ml-notes">Notes (optional)</label>
                <input id="ml-notes" type="text" className={inputCls} value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            {selectedBank && Number(form.hours) > 0 && (
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                After this request: <span className="font-semibold">{projectedAfter(selectedBank.available, form.hours)}{selectedBank.unit === 'shifts' ? ' shifts' : 'h'}</span> remaining (based on your current balance).
              </p>
            )}
            {selectedBank && projection && !projection.loading && projection.projectable && projection.accrual > 0 && (
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                Projected {selectedBank.name} balance on {form.endDate}: <span className="font-semibold">{projection.projected}{selectedBank.unit === 'shifts' ? ' shifts' : 'h'}</span>
                <span className="text-gray-400"> (+{projection.accrual}{selectedBank.unit === 'shifts' ? '' : 'h'} accrues by then)</span>
              </p>
            )}
            {warn && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-3 py-2 text-xs">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{warn.message}</span>
              </div>
            )}
            {formError && <div className="mt-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-2 text-xs">{formError}</div>}

            <div className="mt-3 flex items-center gap-2">
              <button disabled={!canSubmit} onClick={submit}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" aria-hidden="true" />} Submit request
              </button>
              <button onClick={() => { setShowForm(false); setFormError(null); hoursTouched.current = false; }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {/* Balance cards */}
        {!loading && !error && (
          cards.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
              Your leave balances aren't set up yet. Check with your chief to configure your department's leave banks.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cards.map((c) => <BalanceCard key={c.id} card={c} />)}
            </div>
          )
        )}

        {/* Request history */}
        {!loading && !error && (
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">My requests</h4>
            {history.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No time-off requests yet. When you request leave, it'll show up here with its status.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{r.type || 'Leave'}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {r.startDate}{r.endDate && r.endDate !== r.startDate ? ` – ${r.endDate}` : ''}{r.hours != null ? ` · ${r.hours}h` : ''}
                      </div>
                      {String(r.status).toLowerCase() === 'denied' && r.reason && (
                        <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">Reason: {r.reason}</div>
                      )}
                    </div>
                    <StatusPill status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
