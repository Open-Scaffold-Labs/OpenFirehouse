import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Users, Plus, Trash2, Loader2, BarChart3,
  TrendingUp, ArrowDown, Download, Calendar, Filter,
} from 'lucide-react';
import { api } from '../utils/api';

function LogOTModal({ members, onSave, onClose }) {
  const [form, setForm] = useState({
    member_id: '', ot_date: new Date().toISOString().slice(0, 10),
    ot_hours: '', ot_type: 'callback', reason: '',
    earn_code: '', regular_rate: '',
  });

  const OT_TYPES = ['callback', 'holdover', 'coverage', 'special_event', 'training', 'mandatory', 'voluntary', 'other'];
  // FLSA basis (1.2f) — the axis that decides §225 qualified OT. Orthogonal to OT Type above.
  const EARN_CODES = [
    { value: '', label: 'Unclassified (set later)' },
    { value: 'flsa_ot', label: 'FLSA-required OT — qualifies (§225)' },
    { value: 'cba_ot', label: 'CBA / contractual OT' },
    { value: 'other_premium', label: 'Holiday / callback / standby' },
    { value: 'comp_cashout', label: 'FLSA comp-time cash-out — qualifies' },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Log Overtime</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Member</label>
            <select value={form.member_id} onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
              <option value="">Select member…</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Date</label>
              <input type="date" value={form.ot_date} onChange={e => setForm(f => ({ ...f, ot_date: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Hours</label>
              <input type="number" step="0.5" min="0" value={form.ot_hours}
                onChange={e => setForm(f => ({ ...f, ot_hours: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="0.0" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">OT Type</label>
            <select value={form.ot_type} onChange={e => setForm(f => ({ ...f, ot_type: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
              {OT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">FLSA basis <span className="font-normal text-gray-400">(tax)</span></label>
              <select value={form.earn_code} onChange={e => setForm(f => ({ ...f, earn_code: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
                {EARN_CODES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Regular rate $/hr <span className="font-normal text-gray-400">(optional)</span></label>
              <input type="number" step="0.01" min="0" value={form.regular_rate}
                onChange={e => setForm(f => ({ ...f, regular_rate: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="e.g. 32.50" />
            </div>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Only FLSA-required OT counts toward the W-2 Box 12 (TT) qualified-overtime deduction — that's the premium on hours above your §7(k) work-period threshold, not contractual or sub-threshold OT. A rate lets us show the half-premium dollars; leave it blank to export qualifying hours for payroll.</p>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Reason / Notes</label>
            <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Optional" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={() => { if (form.member_id && form.ot_hours) onSave(form); }}
            disabled={!form.member_id || !form.ot_hours}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 disabled:opacity-40">
            Log OT
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OTEqualizationBoard() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [board, setBoard] = useState(null);
  const [records, setRecords] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [view, setView] = useState('board'); // board | log

  const fetchData = useCallback(async () => {
    try {
      const [bRes, rRes, mRes] = await Promise.all([
        api.get(`/api/ot-equalization/board?year=${year}`),
        api.get(`/api/ot-equalization?year=${year}`),
        api.get('/api/members'),
      ]);
      const board = bRes?.data && typeof bRes.data === 'object' ? bRes.data : typeof bRes === 'object' && !Array.isArray(bRes) ? bRes : {};
      const records = Array.isArray(rRes?.data) ? rRes.data : Array.isArray(rRes) ? rRes : [];
      const members = Array.isArray(mRes?.data) ? mRes.data : Array.isArray(mRes) ? mRes : [];
      setBoard(board);
      setRecords(records);
      setMembers(members.filter(m => m.status === 'Active' || m.status === 'Probationary'));
    } catch (err) {
      console.error('Failed to load OT data:', err);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleLog(form) {
    try {
      await api.post('/api/ot-equalization', {
        ...form, member_id: parseInt(form.member_id), ot_hours: parseFloat(form.ot_hours),
      });
      setShowLog(false);
      fetchData();
    } catch (err) { alert(err.message || 'Failed to log OT'); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this OT record?')) return;
    try {
      await api.delete(`/api/ot-equalization/${id}`);
      fetchData();
    } catch (err) { alert(err.message || 'Failed to delete'); }
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify({ year, board, records }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `ot-equalization-${year}.json`; a.click();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Loading OT data…</span>
      </div>
    );
  }

  const boardMembers = board?.members || [];
  const avgOT = board?.stats?.avgOT || 0;
  const maxDev = board?.stats?.maxDeviation || 0;
  const totalOT = board?.stats?.totalOT || 0;

  const filteredRecords = filterType ? records.filter(r => r.ot_type === filterType) : records;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-red-700 dark:text-red-300" />
            OT Equalization Board
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Fair overtime distribution — lowest-hours-first rotation</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            aria-label="Select year"
            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-semibold dark:bg-gray-900 dark:text-gray-100">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowLog(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800">
            <Plus size={14} /> Log OT
          </button>
          <button onClick={exportJSON} aria-label="Export OT data as JSON" className="p-2 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
            <Download size={14} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total OT Hours', value: totalOT.toFixed(1), icon: Clock, color: 'text-blue-700 dark:text-blue-300' },
          { label: 'Average Per Member', value: avgOT.toFixed(1), icon: Users, color: 'text-green-700 dark:text-green-300' },
          { label: 'Max Deviation', value: maxDev.toFixed(1) + 'h', icon: TrendingUp, color: maxDev > 10 ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300' },
          { label: 'Members Tracked', value: boardMembers.length, icon: Users, color: 'text-gray-700 dark:text-gray-300' },
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

      {/* View toggle */}
      <div className="flex gap-2">
        {['board', 'log'].map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
              view === v ? 'bg-red-700 text-white border-red-700' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-400'
            }`}>
            {v === 'board' ? 'Rotation Board' : 'OT Log'}
          </button>
        ))}
      </div>

      {/* Board view — lowest hours first */}
      {view === 'board' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <ArrowDown size={10} className="inline mr-1" />
              Rotation Order — Next OT goes to top (lowest hours)
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {boardMembers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No OT records for {year}</p>
            ) : (
              boardMembers.map((m, idx) => {
                const barWidth = avgOT > 0 ? Math.min(100, (m.totalHours / (avgOT * 2)) * 100) : 0;
                const deviation = m.totalHours - avgOT;
                return (
                  <div key={m.member_id} className={`px-4 py-3 flex items-center gap-4 ${idx === 0 ? 'bg-green-50 dark:bg-green-950/50' : ''}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      idx === 0 ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="w-40">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m.member_name}</p>
                      <p className="text-[10px] text-gray-400">{m.member_rank}</p>
                    </div>
                    <div className="flex-1">
                      <div className="h-5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${
                          deviation > 5 ? 'bg-red-400' : deviation > 0 ? 'bg-amber-400' : 'bg-green-400'
                        }`} style={{ width: `${barWidth}%` }} />
                      </div>
                    </div>
                    <div className="text-right w-24">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{m.totalHours.toFixed(1)}h</p>
                      <p className={`text-[10px] font-semibold ${deviation > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {deviation >= 0 ? '+' : ''}{deviation.toFixed(1)} from avg
                      </p>
                    </div>
                    <div className="text-right w-16">
                      <p className="text-[10px] text-gray-400">{m.recordCount} entries</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Log view */}
      {view === 'log' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-gray-400" />
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              aria-label="Filter by overtime type"
              className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
              <option value="">All Types</option>
              {['callback', 'holdover', 'coverage', 'special_event', 'training', 'mandatory', 'voluntary', 'other'].map(t =>
                <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              )}
            </select>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Member</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-right px-4 py-3">Hours</th>
                  <th className="text-left px-4 py-3">Reason</th>
                  <th className="text-right px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredRecords.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">No OT records</td></tr>
                ) : (
                  filteredRecords.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.ot_date}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{r.member_name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                          {(r.ot_type || '').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{parseFloat(r.ot_hours || 0).toFixed(1)}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 truncate max-w-[200px]">{r.reason || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleDelete(r.id)} aria-label="Delete OT record" className="p-1 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50">
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showLog && <LogOTModal members={members} onSave={handleLog} onClose={() => setShowLog(false)} />}
    </div>
  );
}
