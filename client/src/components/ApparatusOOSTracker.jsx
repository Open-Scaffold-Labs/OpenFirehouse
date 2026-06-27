import { useState, useEffect, useCallback } from 'react';
import {
  Truck, Plus, Trash2, Loader2, AlertTriangle, CheckCircle,
  Clock, Wrench, ChevronDown, ChevronUp, Filter, XCircle,
} from 'lucide-react';
import { api } from '../utils/api';

const IMPACT_COLORS = {
  low: 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300',
  moderate: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300',
  high: 'bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300',
  critical: 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300',
};

function OOSModal({ apparatus, oosTypes, onSave, onClose }) {
  const [form, setForm] = useState({
    apparatus_id: '', reason: '', oos_type: 'mechanical',
    start_date: new Date().toISOString().slice(0, 10),
    estimated_return: '', impact_level: 'moderate',
    coverage_plan: '', reported_by: '', notes: '',
  });
  const [members, setMembers] = useState([]);

  useEffect(() => {
    api.get('/api/members').then(raw => {
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setMembers(arr.filter(m => m.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, []);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Report Apparatus Out of Service</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Apparatus</label>
            <select value={form.apparatus_id} onChange={e => setForm(f => ({ ...f, apparatus_id: e.target.value }))} aria-label="Apparatus"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
              <option value="">Select apparatus…</option>
              {apparatus.map(a => <option key={a.id} value={a.id}>{a.designation} — {a.type}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Reason</label>
            <textarea value={form.reason} aria-label="Reason" onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100"
              placeholder="Describe the issue…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Type</label>
              <select value={form.oos_type} aria-label="OOS type" onChange={e => setForm(f => ({ ...f, oos_type: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
                {oosTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Impact Level</label>
              <select value={form.impact_level} aria-label="Impact level" onChange={e => setForm(f => ({ ...f, impact_level: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
                {['low', 'moderate', 'high', 'critical'].map(l =>
                  <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                )}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Start Date</label>
              <input type="date" value={form.start_date} aria-label="Start date"
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Est. Return</label>
              <input type="date" value={form.estimated_return} aria-label="Estimated return date"
                onChange={e => setForm(f => ({ ...f, estimated_return: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Coverage Plan</label>
            <input value={form.coverage_plan} aria-label="Coverage plan"
              onChange={e => setForm(f => ({ ...f, coverage_plan: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100"
              placeholder="How will coverage be maintained?" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Reported By</label>
            <select value={form.reported_by} aria-label="Reported by" onChange={e => setForm(f => ({ ...f, reported_by: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
              <option value="">Select member…</option>
              {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={() => { if (form.apparatus_id && form.reason) onSave({ ...form, apparatus_id: parseInt(form.apparatus_id) }); }}
            disabled={!form.apparatus_id || !form.reason}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 disabled:opacity-40">
            Report OOS
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ApparatusOOSTracker() {
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({});
  const [apparatus, setApparatus] = useState([]);
  const [oosTypes, setOosTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [expanded, setExpanded] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [rRes, sRes, aRes, tRes] = await Promise.all([
        api.get(`/api/apparatus-oos${filterStatus ? `?status=${filterStatus}` : ''}`),
        api.get('/api/apparatus-oos/stats'),
        api.get('/api/apparatus'),
        api.get('/api/apparatus-oos/types'),
      ]);
      const records = Array.isArray(rRes?.data?.data) ? rRes.data.data : Array.isArray(rRes?.data) ? rRes.data : Array.isArray(rRes) ? rRes : [];
      const stats = sRes?.data && typeof sRes.data === 'object' ? sRes.data : typeof sRes === 'object' && !Array.isArray(sRes) ? sRes : {};
      const apparatus = Array.isArray(aRes?.data) ? aRes.data : Array.isArray(aRes) ? aRes : [];
      const tResObj = tRes?.data && typeof tRes.data === 'object' ? tRes.data : typeof tRes === 'object' && !Array.isArray(tRes) ? tRes : {};
      const oosTypes = Array.isArray(tResObj.oos_types) ? tResObj.oos_types : [];
      setRecords(records);
      setStats(stats);
      setApparatus(apparatus);
      setOosTypes(oosTypes);
    } catch (err) {
      console.error('Failed to load OOS data:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate(form) {
    try {
      await api.post('/api/apparatus-oos', form);
      setShowModal(false);
      fetchData();
    } catch (err) { alert(err.message || 'Failed'); }
  }

  async function handleResolve(id) {
    try {
      await api.patch(`/api/apparatus-oos/${id}`, {
        status: 'resolved',
        end_date: new Date().toISOString().slice(0, 10),
      });
      fetchData();
    } catch (err) { alert(err.message || 'Failed'); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this OOS record?')) return;
    try {
      await api.delete(`/api/apparatus-oos/${id}`);
      fetchData();
    } catch (err) { alert(err.message || 'Failed'); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Loading OOS data…</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Wrench className="h-6 w-6 text-red-700 dark:text-red-300" />
            Apparatus Out-of-Service
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Track OOS apparatus and coverage impact</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800">
          <Plus size={14} /> Report OOS
        </button>
      </div>

      {/* Critical alert */}
      {stats.critical > 0 && (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-600 dark:text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">
            <strong>{stats.critical}</strong> apparatus with high/critical impact currently OOS
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Currently OOS', value: stats.active || 0, icon: XCircle, color: stats.active > 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300' },
          { label: 'High/Critical', value: stats.critical || 0, icon: AlertTriangle, color: stats.critical > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-400' },
          { label: 'Total Records', value: stats.total || 0, icon: Truck, color: 'text-gray-700 dark:text-gray-300' },
          { label: 'Avg Days OOS', value: stats.avgDaysOOS || '0.0', icon: Clock, color: 'text-blue-700 dark:text-blue-300' },
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
        {['', 'active', 'resolved'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
              filterStatus === s ? 'bg-red-700 text-white border-red-700' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
            }`}>
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {/* Records */}
      <div className="space-y-3">
        {records.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-8 text-center">
            <Truck className="mx-auto h-8 w-8 text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">No OOS records</p>
          </div>
        ) : (
          records.map(r => {
            const isExpanded = expanded === r.id;
            const impactColor = IMPACT_COLORS[r.impact_level] || IMPACT_COLORS.moderate;
            const isActive = r.status === 'active';
            return (
              <div key={r.id} className={`bg-white dark:bg-gray-900 rounded-2xl border shadow-sm overflow-hidden ${isActive ? 'border-red-200 dark:border-red-900' : 'border-gray-100 dark:border-gray-700'}`}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  role="button" tabIndex={0} aria-expanded={isExpanded} aria-label={`Toggle details for ${r.apparatus_name}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isExpanded ? null : r.id); } }}
                  onClick={() => setExpanded(isExpanded ? null : r.id)}>
                  <div className={`p-2 rounded-lg ${isActive ? 'bg-red-100 dark:bg-red-950/50' : 'bg-green-100 dark:bg-green-950/50'}`}>
                    {isActive ? <XCircle size={14} className="text-red-600 dark:text-red-400" /> : <CheckCircle size={14} className="text-green-600 dark:text-green-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{r.apparatus_name}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${impactColor}`}>
                        {r.impact_level}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                        {(r.oos_type || '').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.reason}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{r.start_date}</p>
                    {r.estimated_return && <p className="text-[10px] text-gray-400">Est. return: {r.estimated_return}</p>}
                  </div>
                  {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </div>
                {isExpanded && (
                  <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 space-y-2">
                    <p className="text-sm text-gray-700 dark:text-gray-300">{r.reason}</p>
                    {r.coverage_plan && (
                      <p className="text-xs text-gray-600 dark:text-gray-300"><strong>Coverage Plan:</strong> {r.coverage_plan}</p>
                    )}
                    {r.reported_by && <p className="text-xs text-gray-500 dark:text-gray-400">Reported by: {r.reported_by}</p>}
                    {r.end_date && <p className="text-xs text-gray-500 dark:text-gray-400">Resolved: {r.end_date}</p>}
                    <div className="flex items-center gap-2 pt-1">
                      {isActive && (
                        <button onClick={e => { e.stopPropagation(); handleResolve(r.id); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg hover:bg-green-100 dark:hover:bg-green-900">
                          <CheckCircle size={11} /> Return to Service
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); handleDelete(r.id); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg ml-auto">
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {showModal && (
        <OOSModal apparatus={apparatus} oosTypes={oosTypes} onSave={handleCreate} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}
