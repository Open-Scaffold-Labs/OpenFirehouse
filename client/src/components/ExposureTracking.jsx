import { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert, Plus, Trash2, Loader2, Search, Filter,
  ChevronDown, ChevronUp, AlertTriangle, Activity, Calendar,
  Download, User, Flame,
} from 'lucide-react';
import { api } from '../utils/api';

function ExposureModal({ members, exposureTypes, ppeOptions, onSave, onClose }) {
  const [form, setForm] = useState({
    member_id: '', incident_id: '',
    exposure_date: new Date().toISOString().slice(0, 10),
    exposure_type: 'smoke_inhalation', substance: '',
    duration_minutes: '', ppe_worn: [], symptoms: '',
    medical_followup: false, followup_date: '', followup_notes: '',
    reported_by: '', status: 'reported',
  });

  function togglePPE(item) {
    setForm(f => ({
      ...f,
      ppe_worn: f.ppe_worn.includes(item)
        ? f.ppe_worn.filter(p => p !== item)
        : [...f.ppe_worn, item],
    }));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Report Exposure</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Member</label>
            <select value={form.member_id} onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm">
              <option value="">Select member…</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Date</label>
              <input type="date" value={form.exposure_date}
                onChange={e => setForm(f => ({ ...f, exposure_date: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Duration (min)</label>
              <input type="number" min="0" value={form.duration_minutes}
                onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Exposure Type</label>
              <select value={form.exposure_type}
                onChange={e => setForm(f => ({ ...f, exposure_type: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm">
                {exposureTypes.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Substance</label>
              <input value={form.substance}
                onChange={e => setForm(f => ({ ...f, substance: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" placeholder="Specific substance" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">PPE Worn</label>
            <div className="flex flex-wrap gap-1.5">
              {ppeOptions.map(ppe => (
                <button key={ppe} type="button" onClick={() => togglePPE(ppe)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                    form.ppe_worn.includes(ppe)
                      ? 'bg-green-100 dark:bg-green-950/50 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300'
                      : 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-green-300 dark:hover:border-green-800'
                  }`}>
                  {ppe.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Symptoms</label>
            <textarea value={form.symptoms}
              onChange={e => setForm(f => ({ ...f, symptoms: e.target.value }))}
              rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm"
              placeholder="Describe any symptoms experienced…" />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.medical_followup}
                onChange={e => setForm(f => ({ ...f, medical_followup: e.target.checked }))}
                className="rounded border-gray-300 dark:border-gray-700" />
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Medical Follow-up Required</span>
            </label>
          </div>

          {form.medical_followup && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Follow-up Date</label>
                <input type="date" value={form.followup_date}
                  onChange={e => setForm(f => ({ ...f, followup_date: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Reported By</label>
                <select value={form.reported_by} onChange={e => setForm(f => ({ ...f, reported_by: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm">
                  <option value="">Select member…</option>
                  {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={() => {
            if (form.member_id) onSave({
              ...form,
              member_id: parseInt(form.member_id),
              incident_id: form.incident_id ? parseInt(form.incident_id) : null,
              duration_minutes: parseInt(form.duration_minutes) || 0,
            });
          }}
            disabled={!form.member_id}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 disabled:opacity-40">
            Report Exposure
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExposureTracking() {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState([]);
  const [members, setMembers] = useState([]);
  const [typeInfo, setTypeInfo] = useState({ types: [], ppe: [] });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [view, setView] = useState('records'); // records | summary

  const fetchData = useCallback(async () => {
    try {
      const [rRes, sRes, mRes, tRes] = await Promise.all([
        api.get('/api/exposure-records'),
        api.get('/api/exposure-records/summary'),
        api.get('/api/members'),
        api.get('/api/exposure-records/types'),
      ]);
      const rData = Array.isArray(rRes?.data) ? rRes.data : Array.isArray(rRes) ? rRes : [];
      const sData = Array.isArray(sRes?.data) ? sRes.data : Array.isArray(sRes) ? sRes : [];
      const mData = Array.isArray(mRes?.data) ? mRes.data : Array.isArray(mRes) ? mRes : [];
      const tData = tRes?.data || tRes || {};
      setRecords(rData);
      setSummary(sData);
      setMembers(mData.filter(m => m.status === 'Active' || m.status === 'Probationary'));
      setTypeInfo({ types: Array.isArray(tData.types) ? tData.types : [], ppe: Array.isArray(tData.ppe) ? tData.ppe : [] });
    } catch (err) {
      console.error('Failed to load exposure data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSave(form) {
    try {
      await api.post('/api/exposure-records', form);
      setShowModal(false);
      fetchData();
    } catch (err) { alert(err.message || 'Failed to save'); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this exposure record?')) return;
    try {
      await api.delete(`/api/exposure-records/${id}`);
      fetchData();
    } catch (err) { alert(err.message || 'Failed to delete'); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Loading exposure records…</span>
      </div>
    );
  }

  let filtered = records;
  if (search) filtered = filtered.filter(r =>
    (r.member_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.substance || '').toLowerCase().includes(search.toLowerCase())
  );
  if (filterType) filtered = filtered.filter(r => r.exposure_type === filterType);

  const needsFollowup = records.filter(r => r.medical_followup && r.status !== 'closed');

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-red-700 dark:text-red-300" />
            Exposure & Safety Tracking
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">OSHA-required exposure documentation and medical follow-up</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800">
          <Plus size={14} /> Report Exposure
        </button>
      </div>

      {/* Alerts */}
      {needsFollowup.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            <strong>{needsFollowup.length}</strong> exposure{needsFollowup.length !== 1 ? 's' : ''} require medical follow-up
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Exposures', value: records.length, icon: Flame, color: 'text-red-700 dark:text-red-300' },
          { label: 'Members Exposed', value: summary.length, icon: User, color: 'text-blue-700 dark:text-blue-300' },
          { label: 'Pending Follow-up', value: needsFollowup.length, icon: Activity, color: needsFollowup.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300' },
          { label: 'This Month', value: records.filter(r => r.exposure_date >= new Date().toISOString().slice(0, 7)).length, icon: Calendar, color: 'text-gray-700 dark:text-gray-300' },
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search exposures…" aria-label="Search exposures"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} aria-label="Filter by exposure type"
          className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm">
          <option value="">All Types</option>
          {(typeInfo?.types || []).map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
        </select>
        <div className="flex gap-1">
          {['records', 'summary'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                view === v ? 'bg-red-700 text-white border-red-700' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
              }`}>
              {v === 'records' ? 'All Records' : 'By Member'}
            </button>
          ))}
        </div>
      </div>

      {/* Records view */}
      {view === 'records' && (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-8 text-center">
              <ShieldAlert className="mx-auto h-8 w-8 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">No exposure records</p>
            </div>
          ) : (
            filtered.map(r => {
              const isExpanded = expanded === r.id;
              const ppeWorn = typeof r.ppe_worn === 'string' ? JSON.parse(r.ppe_worn || '[]') : (r.ppe_worn || []);
              return (
                <div key={r.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => setExpanded(isExpanded ? null : r.id)}
                    role="button" tabIndex={0} aria-label={`Toggle details for ${r.member_name} exposure`} aria-expanded={isExpanded}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isExpanded ? null : r.id); } }}>
                    <div className={`p-2 rounded-lg ${r.medical_followup && r.status !== 'closed' ? 'bg-amber-100 dark:bg-amber-950/50' : 'bg-gray-100 dark:bg-gray-800'}`}>
                      <ShieldAlert size={14} className={r.medical_followup && r.status !== 'closed' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{r.member_name}</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300">
                          {(r.exposure_type || '').replace(/_/g, ' ')}
                        </span>
                        {r.medical_followup && r.status !== 'closed' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
                            Follow-up needed
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.substance || 'No substance specified'} · {r.duration_minutes || 0} min</p>
                    </div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{r.exposure_date}</p>
                    {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  </div>
                  {isExpanded && (
                    <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 space-y-2">
                      {r.symptoms && <p className="text-sm text-gray-700 dark:text-gray-300"><strong className="text-gray-900 dark:text-gray-100">Symptoms:</strong> {r.symptoms}</p>}
                      {ppeWorn.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">PPE:</span>
                          {ppeWorn.map(p => (
                            <span key={p} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300">
                              {p.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                      {r.medical_followup && (
                        <div className="text-xs text-gray-600 dark:text-gray-300">
                          <strong>Follow-up:</strong> {r.followup_date || 'Date TBD'}
                          {r.followup_notes && ` — ${r.followup_notes}`}
                        </div>
                      )}
                      {r.reported_by && <p className="text-xs text-gray-500 dark:text-gray-400">Reported by: {r.reported_by}</p>}
                      <div className="flex justify-end">
                        <button onClick={e => { e.stopPropagation(); handleDelete(r.id); }}
                          className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 px-2 py-1 rounded">
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
      )}

      {/* Summary view */}
      {view === 'summary' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3">Member</th>
                <th className="text-right px-4 py-3">Exposures</th>
                <th className="text-right px-4 py-3">Total Min</th>
                <th className="text-right px-4 py-3">Pending Follow-up</th>
                <th className="text-left px-4 py-3">Latest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {summary.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">No exposure data</td></tr>
              ) : (
                summary.map(s => (
                  <tr key={s.member_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{s.member_name}</p>
                      <p className="text-[10px] text-gray-400">{s.member_rank}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-bold">{s.total_exposures}</td>
                    <td className="px-4 py-3 text-right">{s.total_duration_minutes || 0}</td>
                    <td className="px-4 py-3 text-right">
                      {parseInt(s.pending_followups) > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">{s.pending_followups}</span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{s.latest_exposure || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ExposureModal
          members={members}
          exposureTypes={typeInfo?.types || []}
          ppeOptions={typeInfo.ppe}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
