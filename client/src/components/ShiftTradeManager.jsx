import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight, Plus, Loader2, CheckCircle, XCircle,
  Clock, AlertTriangle, ChevronDown, ChevronUp, Users,
  Filter, Trash2, Undo2, HandCoins,
} from 'lucide-react';
import { api } from '../utils/api';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';

// Phase 1.3: trades are three types (give-away / swap / payback), a two-stage workflow
// (peer accept → officer approve, per-dept configurable), with a payback ledger + FLSA §207(p)(3)
// advisory impact. This console is the officer/admin surface (approve/deny/settle/withdraw);
// a member accepts/claims from their own portal.
function TradeRequestModal({ members, shifts, onSave, onClose }) {
  const [form, setForm] = useState({
    trade_type: 'give_away',
    requesting_member_id: '', covering_member_id: '',
    original_shift_id: '', swap_shift_id: '', payback_date: '', notes: '',
  });
  const isSwap = form.trade_type === 'swap';
  const isPayback = form.trade_type === 'payback';
  const needsCoverer = isSwap;  // a swap must name the counterpart; give/payback may be open/directed
  const canSubmit = form.requesting_member_id && form.original_shift_id
    && (!isSwap || (form.covering_member_id && form.swap_shift_id));

  const sel = 'w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100';
  const lbl = 'block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1';
  const shiftLabel = (s) => `${s.date} — ${s.shiftType} (${(typeof s.crew === 'string' ? JSON.parse(s.crew || '[]') : (s.crew || [])).length} crew)`;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Request Shift Trade</h3>
        <div className="space-y-3">
          <div>
            <label className={lbl}>Trade type</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: 'give_away', t: 'Give away', d: 'Someone covers; no payback' },
                { v: 'swap', t: 'Mutual swap', d: 'Exchange two shifts' },
                { v: 'payback', t: 'Payback', d: 'They cover, you owe a shift' },
              ].map((o) => (
                <button key={o.v} type="button" onClick={() => setForm((f) => ({ ...f, trade_type: o.v }))}
                  className={`text-left px-3 py-2 rounded-xl border text-xs ${form.trade_type === o.v
                    ? 'border-red-600 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                  <span className="font-bold block">{o.t}</span>
                  <span className="text-[10px] text-gray-400">{o.d}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={lbl}>Requesting member (needs off)</label>
            <select value={form.requesting_member_id} onChange={(e) => setForm((f) => ({ ...f, requesting_member_id: e.target.value }))} className={sel}>
              <option value="">Select member…</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Covering member {needsCoverer ? '(required)' : '(optional — leave blank to post to the open board)'}</label>
            <select value={form.covering_member_id} onChange={(e) => setForm((f) => ({ ...f, covering_member_id: e.target.value }))} className={sel}>
              <option value="">{needsCoverer ? 'Select member…' : 'Open board (any eligible member can claim)'}</option>
              {members.filter((m) => String(m.id) !== form.requesting_member_id).map((m) => <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>{isSwap ? 'Requester’s shift (coverer takes)' : 'Shift to be covered'}</label>
            <select value={form.original_shift_id} onChange={(e) => setForm((f) => ({ ...f, original_shift_id: e.target.value }))} className={sel}>
              <option value="">Select shift…</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{shiftLabel(s)}</option>)}
            </select>
          </div>
          {isSwap && (
            <div>
              <label className={lbl}>Coverer’s shift (requester takes in return)</label>
              <select value={form.swap_shift_id} onChange={(e) => setForm((f) => ({ ...f, swap_shift_id: e.target.value }))} className={sel}>
                <option value="">Select shift…</option>
                {shifts.filter((s) => String(s.id) !== form.original_shift_id).map((s) => <option key={s.id} value={s.id}>{shiftLabel(s)}</option>)}
              </select>
            </div>
          )}
          {isPayback && (
            <div>
              <label className={lbl}>Payback due by (optional)</label>
              <input type="date" value={form.payback_date} onChange={(e) => setForm((f) => ({ ...f, payback_date: e.target.value }))} className={sel} />
            </div>
          )}
          <div>
            <label className={lbl}>Notes / reason</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className={sel} placeholder="Reason for trade…" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={() => canSubmit && onSave({
            trade_type: form.trade_type,
            requesting_member_id: parseInt(form.requesting_member_id),
            covering_member_id: form.covering_member_id ? parseInt(form.covering_member_id) : null,
            original_shift_id: parseInt(form.original_shift_id),
            swap_shift_id: form.swap_shift_id ? parseInt(form.swap_shift_id) : null,
            payback_date: form.payback_date || null,
            notes: form.notes,
            client_key: (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`,
          })} disabled={!canSubmit}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 disabled:opacity-40">
            Request trade
          </button>
        </div>
      </div>
    </div>
  );
}

// FLSA §207(p)(3) advisory: the substitute's traded hours are EXCLUDED from the substitute's OT;
// the requester is credited as if worked. Reads the rebuilt /impact shape { trade, flsa }.
function FLSAImpactPanel({ tradeId }) {
  const [flsa, setFlsa] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get(`/api/shift-trades/impact/${tradeId}`)
      .then((raw) => { const d = raw?.data || raw; setFlsa(d && d.flsa ? d.flsa : null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tradeId]);

  if (loading) return <div className="text-xs text-gray-400 py-2">Loading FLSA impact…</div>;
  if (!flsa) return <div className="text-xs text-gray-400 py-2">No FLSA impact available</div>;
  const { requester, coverer, otThreshold, periodStart, periodEnd, shiftHours } = flsa;
  const covWouldOT = coverer.otAfterIfCounted > coverer.otBefore;

  return (
    <div className="bg-blue-50 dark:bg-blue-950/50 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Clock size={12} className="text-blue-700 dark:text-blue-300" />
        <p className="text-xs font-bold text-blue-900 dark:text-blue-200">FLSA §207(p)(3) impact (advisory)</p>
      </div>
      <p className="text-[10px] text-blue-700 dark:text-blue-300">Period {periodStart} → {periodEnd} · shift {shiftHours}h · threshold {otThreshold}h</p>
      <div className="grid grid-cols-2 gap-4 text-[11px]">
        <div>
          <p className="font-bold text-gray-700 dark:text-gray-300">Requester (off)</p>
          <p className="text-gray-500">Credited as worked: <span className="font-bold text-gray-800 dark:text-gray-100">{requester.creditedHours}h</span></p>
          <p className="text-green-700 dark:text-green-300">OT unchanged ({requester.otAfter}h)</p>
        </div>
        <div>
          <p className="font-bold text-gray-700 dark:text-gray-300">Coverer (substitute)</p>
          <p className="text-gray-500">Works: <span className="font-bold text-gray-800 dark:text-gray-100">{coverer.workedHours}h</span></p>
          <p className="text-green-700 dark:text-green-300">Traded hours excluded from OT ({coverer.otAfterExcluded}h)</p>
          {covWouldOT && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
              <AlertTriangle size={10} /> Would be {coverer.otAfterIfCounted}h OT if the trade weren’t voluntary/same-capacity
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  open: 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300',
  pending_accept: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300',
  pending_approval: 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300',
  approved: 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300',
  denied: 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300',
  withdrawn: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  completed: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
};
const STATUS_LABEL = {
  open: 'Open', pending_accept: 'Awaiting accept', pending_approval: 'Awaiting approval',
  approved: 'Approved', denied: 'Denied', withdrawn: 'Withdrawn', completed: 'Completed', cancelled: 'Cancelled',
};
const TYPE_LABEL = { give_away: 'Give-away', swap: 'Swap', payback: 'Payback' };

export default function ShiftTradeManager() {
  const [trades, setTrades] = useState([]);
  const [members, setMembers] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(null);
  const [paybackBalances, setPaybackBalances] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const [tRes, mRes, sRes, bRes] = await Promise.all([
        api.get('/api/shift-trades'),
        api.get('/api/members'),
        api.get(`/api/shifts?start=${today}&end=${future}`),
        // 1.3 design-critique follow-up: the owed-payback balance surfaces on approved rows.
        api.get('/api/shift-trades/payback-balance').catch(() => null),
      ]);
      setTrades(Array.isArray(tRes?.data) ? tRes.data : Array.isArray(tRes) ? tRes : []);
      setPaybackBalances(bRes?.data?.balances || []);
      const m = Array.isArray(mRes?.data) ? mRes.data : Array.isArray(mRes) ? mRes : [];
      setMembers(m.filter((x) => x.status === 'Active' || x.status === 'Probationary'));
      setShifts(Array.isArray(sRes?.data) ? sRes.data : Array.isArray(sRes) ? sRes : []);
    } catch (err) { console.error('Failed to load shift trades:', err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate(form) {
    try { await api.post('/api/shift-trades', form); setShowModal(false); fetchData(); }
    catch (err) { alert(err.message || 'Failed to request trade'); }
  }
  // The two-stage workflow is distinct endpoints now (accept/approve/deny/withdraw/settle), not a
  // status PATCH — each carries its own server-side guard (single-winner claim, self-approve block).
  async function act(id, action, body) {
    setBusy(`${id}:${action}`);
    try { await api.post(`/api/shift-trades/${id}/${action}`, body || {}); fetchData(); }
    catch (err) { alert(err.message || `Failed to ${action}`); }
    finally { setBusy(null); }
  }
  async function handleDelete(id) {
    if (!confirm('Remove this trade? Any recorded payback is reversed (append-only).')) return;
    try { await api.delete(`/api/shift-trades/${id}`); fetchData(); }
    catch (err) { alert(err.message || 'Failed to delete'); }
  }
  async function handleDeny(id) {
    const reason = prompt('Reason for denying this trade?');
    if (reason === null) return;
    act(id, 'deny', { reason });
  }
  async function handleSettle(id) {
    if (!confirm('Record this payback as settled (repaid)?')) return;
    act(id, 'settle', {});
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" /><span className="text-sm">Loading shift trades…</span>
      </div>
    );
  }

  const filtered = filterStatus ? trades.filter((t) => t.status === filterStatus) : trades;
  const openCount = trades.filter((t) => t.status === 'open' || t.status === 'pending_accept').length;
  const awaitingApproval = trades.filter((t) => t.status === 'pending_approval').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-red-700 dark:text-red-300" /> Shift Trade Manager
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Give-aways, swaps &amp; paybacks — two-stage approval, payback ledger, FLSA §207(p)(3) impact</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800">
          <Plus size={14} /> Request trade
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total trades', value: trades.length, icon: ArrowLeftRight, color: 'text-gray-700 dark:text-gray-300' },
          { label: 'Open / awaiting accept', value: openCount, icon: Clock, color: openCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400' },
          { label: 'Awaiting approval', value: awaitingApproval, icon: Users, color: awaitingApproval > 0 ? 'text-blue-700 dark:text-blue-300' : 'text-gray-400' },
          { label: 'Approved', value: trades.filter((t) => t.status === 'approved' || t.status === 'completed').length, icon: CheckCircle, color: 'text-green-700 dark:text-green-300' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1"><s.icon size={14} className={s.color} /><span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{s.label}</span></div>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        <div className="flex gap-1 flex-wrap">
          {['', 'open', 'pending_accept', 'pending_approval', 'approved', 'denied', 'completed'].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${filterStatus === s ? 'bg-red-700 text-white border-red-700' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
              {s ? (STATUS_LABEL[s] || s) : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-8 text-center">
            <ArrowLeftRight className="mx-auto h-8 w-8 text-gray-200 dark:text-gray-700 mb-2" />
            <p className="text-sm text-gray-400">No shift trades</p>
          </div>
        ) : filtered.map((t) => {
          const isExpanded = expanded === t.id;
          const statusColor = STATUS_COLORS[t.status] || STATUS_COLORS.open;
          return (
            <div key={t.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                role="button" tabIndex={0} aria-expanded={isExpanded} aria-label="Toggle trade details"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isExpanded ? null : t.id); } }}
                onClick={() => setExpanded(isExpanded ? null : t.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{t.requester_name || 'TBD'}</p>
                    <ArrowLeftRight size={12} className="text-gray-400" />
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{t.coverer_name || 'Open (needs coverer)'}</p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{TYPE_LABEL[t.trade_type] || t.trade_type}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor}`}>{STATUS_LABEL[t.status] || t.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.shift_date} · {t.shift_type || 'Shift'} · {t.notes ? t.notes.slice(0, 80) : 'No notes'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{t.trade_date || t.shift_date}</p>
                  {t.payback_date && <p className="text-[10px] text-gray-400">Payback: {t.payback_date}</p>}
                </div>
                {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </div>

              {isExpanded && (
                <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 space-y-3">
                  {t.covering_member_id && <FLSAImpactPanel tradeId={t.id} />}
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div><p className="text-gray-400">Requester</p><p className="font-semibold text-gray-900 dark:text-gray-100">{t.requester_name} ({t.requester_rank})</p></div>
                    <div><p className="text-gray-400">Coverer</p><p className="font-semibold text-gray-900 dark:text-gray-100">{t.coverer_name || 'Unassigned'} {t.coverer_rank ? `(${t.coverer_rank})` : ''}</p></div>
                  </div>
                  {t.notes && <p className="text-xs text-gray-600 dark:text-gray-300">{t.notes}</p>}

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                    <LinkedMeetings module="shift-trades" recordId={t.id} recordLabel={`${t.requester_name} / ${t.trade_date}`} />
                    <Attachments module="shift-trades" recordId={t.id} recordLabel={`${t.requester_name} / ${t.trade_date}`} />
                  </div>

                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    {t.status === 'pending_approval' && (
                      <>
                        <button disabled={busy === `${t.id}:approve`} onClick={(e) => { e.stopPropagation(); act(t.id, 'approve'); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg hover:bg-green-100 disabled:opacity-40">
                          <CheckCircle size={11} /> Approve
                        </button>
                        <button disabled={busy === `${t.id}:deny`} onClick={(e) => { e.stopPropagation(); handleDeny(t.id); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-100 disabled:opacity-40">
                          <XCircle size={11} /> Deny
                        </button>
                      </>
                    )}
                    {(t.status === 'open' || t.status === 'pending_accept') && (
                      <>
                        <span className="text-[11px] text-gray-400">{t.status === 'open' ? 'Waiting for a member to claim it' : 'Waiting for the coverer to accept'}</span>
                        <button disabled={busy === `${t.id}:withdraw`} onClick={(e) => { e.stopPropagation(); act(t.id, 'withdraw'); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40">
                          <Undo2 size={11} /> Withdraw
                        </button>
                      </>
                    )}
                    {t.status === 'approved' && t.trade_type === 'payback' && (
                      <>
                        {(() => {
                          // Show the caller's net with THIS trade's counterpart (String-coerced ids).
                          const other = paybackBalances.find((b) =>
                            String(b.counterpart_id) === String(t.covering_member_id) ||
                            String(b.counterpart_id) === String(t.requesting_member_id));
                          if (!other || Number(other.net_hours ?? other.net ?? 0) === 0) return null;
                          const net = Number(other.net_hours ?? other.net ?? 0);
                          return (
                            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                              {net > 0 ? `${other.counterpart_name || 'They'} owe${other.counterpart_name ? 's' : ''} you ${net}h`
                                       : `You owe ${other.counterpart_name || 'them'} ${Math.abs(net)}h`}
                            </span>
                          );
                        })()}
                        <button disabled={busy === `${t.id}:settle`} onClick={(e) => { e.stopPropagation(); handleSettle(t.id); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-lg hover:bg-emerald-100 disabled:opacity-40">
                          <HandCoins size={11} /> Mark payback settled
                        </button>
                      </>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg ml-auto">
                      <Trash2 size={11} /> Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && <TradeRequestModal members={members} shifts={shifts} onSave={handleCreate} onClose={() => setShowModal(false)} />}
    </div>
  );
}
