import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight, Plus, Loader2, CheckCircle, XCircle,
  Clock, AlertTriangle, ChevronDown, ChevronUp, Users,
  Calendar, Filter, Trash2,
} from 'lucide-react';
import { api } from '../utils/api';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';

function TradeRequestModal({ members, shifts, onSave, onClose }) {
  const [form, setForm] = useState({
    requesting_member_id: '', covering_member_id: '',
    original_shift_id: '', payback_shift_id: '',
    trade_date: '', payback_date: '', notes: '',
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Request Shift Trade</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Requesting Member (needs off)</label>
            <select value={form.requesting_member_id}
              onChange={e => setForm(f => ({ ...f, requesting_member_id: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
              <option value="">Select member…</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Covering Member (working for)</label>
            <select value={form.covering_member_id}
              onChange={e => setForm(f => ({ ...f, covering_member_id: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
              <option value="">Select member…</option>
              {members.filter(m => String(m.id) !== form.requesting_member_id).map(m =>
                <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Original Shift (to be covered)</label>
            <select value={form.original_shift_id}
              onChange={e => {
                const shift = shifts.find(s => String(s.id) === e.target.value);
                setForm(f => ({ ...f, original_shift_id: e.target.value, trade_date: shift?.date || '' }));
              }}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
              <option value="">Select shift…</option>
              {shifts.map(s => (
                <option key={s.id} value={s.id}>
                  {s.date} — {s.shiftType} ({(typeof s.crew === 'string' ? JSON.parse(s.crew) : (s.crew || [])).length} crew)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Payback Date (optional)</label>
            <input type="date" value={form.payback_date}
              onChange={e => setForm(f => ({ ...f, payback_date: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Notes</label>
            <textarea value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100"
              placeholder="Reason for trade…" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={() => {
            if (form.requesting_member_id && form.original_shift_id)
              onSave({
                ...form,
                requesting_member_id: parseInt(form.requesting_member_id),
                covering_member_id: form.covering_member_id ? parseInt(form.covering_member_id) : null,
                original_shift_id: parseInt(form.original_shift_id),
              });
          }}
            disabled={!form.requesting_member_id || !form.original_shift_id}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 disabled:opacity-40">
            Request Trade
          </button>
        </div>
      </div>
    </div>
  );
}

function FLSAImpactPanel({ tradeId }) {
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/shift-trades/impact/${tradeId}`)
      .then(raw => {
        const obj = raw?.data && typeof raw.data === 'object' ? raw.data : typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
        setImpact(obj);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tradeId]);

  if (loading) return <div className="text-xs text-gray-400 py-2">Loading FLSA impact…</div>;
  if (!impact) return <div className="text-xs text-gray-400 py-2">Could not calculate impact</div>;

  const { requester, coverer, otThreshold, periodStart, periodEnd, shiftHours } = impact;

  function ImpactRow({ label, data }) {
    const willOT = data.afterTrade > otThreshold;
    return (
      <div className="space-y-1">
        <p className="text-xs font-bold text-gray-700 dark:text-gray-300">{label}</p>
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <p className="text-gray-400">Current</p>
            <p className="font-bold text-gray-800 dark:text-gray-100">{data.currentHours}h</p>
          </div>
          <div>
            <p className="text-gray-400">After Trade</p>
            <p className={`font-bold ${willOT ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>{data.afterTrade}h</p>
          </div>
          <div>
            <p className="text-gray-400">OT Impact</p>
            <p className={`font-bold ${data.otAfter > data.otBefore ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>
              {data.otAfter > 0 ? `${data.otAfter}h OT` : 'None'}
            </p>
          </div>
        </div>
        {willOT && (
          <p className="text-[10px] text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
            <AlertTriangle size={10} /> Exceeds {otThreshold}h OT threshold
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-950/50 rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Clock size={12} className="text-blue-700 dark:text-blue-300" />
        <p className="text-xs font-bold text-blue-900 dark:text-blue-200">FLSA §207(k) Impact Preview</p>
      </div>
      <p className="text-[10px] text-blue-700 dark:text-blue-300">
        Period: {periodStart} to {periodEnd} · Shift: {shiftHours}h · Threshold: {otThreshold}h
      </p>
      <div className="grid grid-cols-2 gap-4">
        <ImpactRow label="Requester (loses shift)" data={requester} />
        <ImpactRow label="Coverer (gains shift)" data={coverer} />
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  pending: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300',
  accepted: 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300',
  approved: 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300',
  denied: 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300',
  completed: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
};

export default function ShiftTradeManager() {
  const [trades, setTrades] = useState([]);
  const [members, setMembers] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [expanded, setExpanded] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      // Fetch shifts for next 30 days for the trade request modal
      const today = new Date().toISOString().slice(0, 10);
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const [tRes, mRes, sRes] = await Promise.all([
        api.get('/api/shift-trades'),
        api.get('/api/members'),
        api.get(`/api/shifts?start=${today}&end=${future}`),
      ]);
      const trades = Array.isArray(tRes?.data) ? tRes.data : Array.isArray(tRes) ? tRes : [];
      const members = Array.isArray(mRes?.data) ? mRes.data : Array.isArray(mRes) ? mRes : [];
      const shifts = Array.isArray(sRes?.data) ? sRes.data : Array.isArray(sRes) ? sRes : [];
      setTrades(trades);
      setMembers(members.filter(m => m.status === 'Active' || m.status === 'Probationary'));
      setShifts(shifts);
    } catch (err) {
      console.error('Failed to load shift trades:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate(form) {
    try {
      await api.post('/api/shift-trades', form);
      setShowModal(false);
      fetchData();
    } catch (err) { alert(err.message || 'Failed to request trade'); }
  }

  async function handleStatusChange(tradeId, status, extraFields = {}) {
    try {
      await api.patch(`/api/shift-trades/${tradeId}`, { status, ...extraFields });
      fetchData();
    } catch (err) { alert(err.message || 'Failed to update'); }
  }

  async function handleDelete(id) {
    if (!confirm('Cancel this trade request?')) return;
    try {
      await api.delete(`/api/shift-trades/${id}`);
      fetchData();
    } catch (err) { alert(err.message || 'Failed to delete'); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Loading shift trades…</span>
      </div>
    );
  }

  const filtered = filterStatus ? trades.filter(t => t.status === filterStatus) : trades;
  const pending = trades.filter(t => t.status === 'pending').length;
  const accepted = trades.filter(t => t.status === 'accepted').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-red-700 dark:text-red-300" />
            Shift Trade Manager
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Formalized shift trades with FLSA overtime impact preview</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800">
          <Plus size={14} /> Request Trade
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Trades', value: trades.length, icon: ArrowLeftRight, color: 'text-gray-700 dark:text-gray-300' },
          { label: 'Pending', value: pending, icon: Clock, color: pending > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400' },
          { label: 'Awaiting Approval', value: accepted, icon: Users, color: accepted > 0 ? 'text-blue-700 dark:text-blue-300' : 'text-gray-400' },
          { label: 'Approved', value: trades.filter(t => t.status === 'approved' || t.status === 'completed').length, icon: CheckCircle, color: 'text-green-700 dark:text-green-300' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={14} className={s.color} />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{s.label}</span>
            </div>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter size={14} className="text-gray-400" />
        <div className="flex gap-1">
          {['', 'pending', 'accepted', 'approved', 'denied', 'completed'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                filterStatus === s ? 'bg-red-700 text-white border-red-700' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
              }`}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Trade cards */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-8 text-center">
            <ArrowLeftRight className="mx-auto h-8 w-8 text-gray-200 dark:text-gray-700 mb-2" />
            <p className="text-sm text-gray-400">No shift trades</p>
          </div>
        ) : (
          filtered.map(t => {
            const isExpanded = expanded === t.id;
            const statusColor = STATUS_COLORS[t.status] || STATUS_COLORS.pending;
            return (
              <div key={t.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  role="button" tabIndex={0} aria-expanded={isExpanded} aria-label="Toggle trade details"
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isExpanded ? null : t.id); } }}
                  onClick={() => setExpanded(isExpanded ? null : t.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {t.requester_name || 'TBD'}
                      </p>
                      <ArrowLeftRight size={12} className="text-gray-400" />
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {t.coverer_name || 'Open (needs coverer)'}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor}`}>
                        {t.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {t.shift_date} · {t.shift_type || 'Shift'} · {t.notes ? t.notes.slice(0, 80) : 'No notes'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{t.trade_date || t.shift_date}</p>
                    {t.payback_date && <p className="text-[10px] text-gray-400">Payback: {t.payback_date}</p>}
                  </div>
                  {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </div>

                {isExpanded && (
                  <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 space-y-3">
                    {/* FLSA Impact */}
                    {t.covering_member_id && <FLSAImpactPanel tradeId={t.id} />}

                    {/* Details */}
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-gray-400">Requester</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{t.requester_name} ({t.requester_rank})</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Coverer</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{t.coverer_name || 'Unassigned'} {t.coverer_rank ? `(${t.coverer_rank})` : ''}</p>
                      </div>
                    </div>
                    {t.notes && <p className="text-xs text-gray-600 dark:text-gray-300">{t.notes}</p>}

                    {/* Linked Meetings */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                      <LinkedMeetings module="shift-trades" recordId={t.id} recordLabel={`${t.requester_name} / ${t.trade_date}`} />
                      <Attachments module="shift-trades" recordId={t.id} recordLabel={`${t.requester_name} / ${t.trade_date}`} />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      {t.status === 'pending' && (
                        <>
                          <button onClick={e => { e.stopPropagation(); handleStatusChange(t.id, 'accepted'); }}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50">
                            <CheckCircle size={11} /> Accept
                          </button>
                          <button onClick={e => { e.stopPropagation(); handleStatusChange(t.id, 'denied'); }}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50">
                            <XCircle size={11} /> Deny
                          </button>
                        </>
                      )}
                      {t.status === 'accepted' && (
                        <button onClick={e => { e.stopPropagation(); handleStatusChange(t.id, 'approved'); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50">
                          <CheckCircle size={11} /> Approve
                        </button>
                      )}
                      {t.status === 'approved' && (
                        <button onClick={e => { e.stopPropagation(); handleStatusChange(t.id, 'completed'); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                          <CheckCircle size={11} /> Mark Complete
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg ml-auto">
                        <Trash2 size={11} /> Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {showModal && <TradeRequestModal members={members} shifts={shifts} onSave={handleCreate} onClose={() => setShowModal(false)} />}
    </div>
  );
}
