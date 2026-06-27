import { useState, useEffect, useCallback } from 'react';
import {
  FileSearch, Plus, Loader2, ChevronDown, ChevronUp, Filter,
  Trash2, CheckCircle, AlertTriangle, Target, ThumbsUp, Lightbulb,
  Download, Search, Edit,
} from 'lucide-react';
import { api } from '../utils/api';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';
import AIWriteTextarea from './AIWriteTextarea';

function AARModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    title: '', incident_date: '', incident_type: '', location: '',
    summary: '', conducted_by: '',
    conducted_date: new Date().toISOString().slice(0, 10),
    strengths: [''], improvements: [''], action_items: [{ text: '', assigned: '', status: 'open' }],
    lessons_learned: '',
  });

  function updateListItem(field, idx, value) {
    setForm(f => {
      const arr = [...f[field]];
      arr[idx] = value;
      return { ...f, [field]: arr };
    });
  }
  function addListItem(field, defaultVal) {
    setForm(f => ({ ...f, [field]: [...f[field], defaultVal] }));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">New After-Action Report</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} aria-label="Title"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="AAR title…" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Incident Date</label>
              <input type="date" value={form.incident_date} aria-label="Incident date"
                onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Type</label>
              <input value={form.incident_type} aria-label="Incident type" onChange={e => setForm(f => ({ ...f, incident_type: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Structure fire, MCI…" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Location</label>
              <input value={form.location} aria-label="Location" onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Summary</label>
            <AIWriteTextarea
              value={form.summary}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              rows={3}
              name="summary"
              id="summary"
            />
          </div>

          {/* Strengths */}
          <div>
            <label className="block text-xs font-semibold text-green-700 dark:text-green-300 mb-1 flex items-center gap-1">
              <ThumbsUp size={12} /> What Went Well
            </label>
            {form.strengths.map((s, i) => (
              <input key={i} value={s} onChange={e => updateListItem('strengths', i, e.target.value)} aria-label={`Strength ${i + 1}`}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm mb-1 dark:bg-gray-900 dark:text-gray-100" placeholder={`Strength ${i + 1}`} />
            ))}
            <button type="button" onClick={() => addListItem('strengths', '')}
              className="text-xs text-green-700 dark:text-green-300 font-semibold hover:underline">+ Add</button>
          </div>

          {/* Improvements */}
          <div>
            <label className="block text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1 flex items-center gap-1">
              <AlertTriangle size={12} /> Areas for Improvement
            </label>
            {form.improvements.map((s, i) => (
              <input key={i} value={s} onChange={e => updateListItem('improvements', i, e.target.value)} aria-label={`Improvement ${i + 1}`}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm mb-1 dark:bg-gray-900 dark:text-gray-100" placeholder={`Improvement ${i + 1}`} />
            ))}
            <button type="button" onClick={() => addListItem('improvements', '')}
              className="text-xs text-amber-700 dark:text-amber-300 font-semibold hover:underline">+ Add</button>
          </div>

          {/* Action Items */}
          <div>
            <label className="block text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1 flex items-center gap-1">
              <Target size={12} /> Action Items
            </label>
            {form.action_items.map((item, i) => (
              <div key={i} className="flex gap-2 mb-1">
                <input value={item.text} onChange={e => updateListItem('action_items', i, { ...item, text: e.target.value })} aria-label={`Action item ${i + 1}`}
                  className="flex-1 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Action item…" />
                <input value={item.assigned} onChange={e => updateListItem('action_items', i, { ...item, assigned: e.target.value })} aria-label={`Action item ${i + 1} assigned to`}
                  className="w-32 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Assigned to" />
              </div>
            ))}
            <button type="button" onClick={() => addListItem('action_items', { text: '', assigned: '', status: 'open' })}
              className="text-xs text-blue-700 dark:text-blue-300 font-semibold hover:underline">+ Add</button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-1">
              <Lightbulb size={12} /> Lessons Learned
            </label>
            <AIWriteTextarea
              value={form.lessons_learned}
              onChange={e => setForm(f => ({ ...f, lessons_learned: e.target.value }))}
              rows={2}
              name="lessons_learned"
              id="lessons_learned"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Conducted By</label>
              <input value={form.conducted_by} aria-label="Conducted by" onChange={e => setForm(f => ({ ...f, conducted_by: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">AAR Date</label>
              <input type="date" value={form.conducted_date} aria-label="AAR date"
                onChange={e => setForm(f => ({ ...f, conducted_date: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={() => {
            if (form.title) onSave({
              ...form,
              strengths: form.strengths.filter(s => s),
              improvements: form.improvements.filter(s => s),
              action_items: form.action_items.filter(a => a.text),
            });
          }}
            disabled={!form.title}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 disabled:opacity-40">
            Create AAR
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AfterActionReports() {
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expanded, setExpanded] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [rRes, sRes] = await Promise.all([
        api.get(`/api/after-action${filterStatus ? `?status=${filterStatus}` : ''}`),
        api.get('/api/after-action/stats'),
      ]);
      const reports = Array.isArray(rRes?.data?.data) ? rRes.data.data : Array.isArray(rRes?.data) ? rRes.data : Array.isArray(rRes) ? rRes : [];
      const stats = sRes?.data && typeof sRes.data === 'object' ? sRes.data : typeof sRes === 'object' && !Array.isArray(sRes) ? sRes : {};
      setReports(reports);
      setStats(stats);
    } catch (err) {
      console.error('Failed to load AARs:', err);
    } finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate(form) {
    try {
      await api.post('/api/after-action', form);
      setShowModal(false); fetchData();
    } catch (err) { alert(err.message || 'Failed'); }
  }

  async function handleFinalize(id) {
    try {
      await api.patch(`/api/after-action/${id}`, { status: 'final' });
      fetchData();
    } catch (err) { alert(err.message || 'Failed'); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this AAR?')) return;
    try { await api.delete(`/api/after-action/${id}`); fetchData(); } catch (err) { alert('Failed'); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" /><span className="text-sm">Loading AARs…</span>
      </div>
    );
  }

  let filtered = reports;
  if (search) filtered = filtered.filter(r =>
    (r.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.incident_type || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FileSearch className="h-6 w-6 text-red-700 dark:text-red-300" />
            After-Action Reports
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Incident debriefs, lessons learned, and corrective action tracking</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800">
          <Plus size={14} /> New AAR
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Total AARs', value: stats.total || 0, icon: FileSearch, color: 'text-gray-700 dark:text-gray-300' },
          { label: 'Draft', value: stats.draft || 0, icon: Edit, color: (stats.draft || 0) > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400' },
          { label: 'Open Action Items', value: stats.openActionItems || 0, icon: Target, color: (stats.openActionItems || 0) > 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300' },
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search AARs…" aria-label="Search after-action reports"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:bg-gray-900 dark:text-gray-100" />
        </div>
        {['', 'draft', 'final'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${filterStatus === s ? 'bg-red-700 text-white border-red-700' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-8 text-center">
            <FileSearch className="mx-auto h-8 w-8 text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">No after-action reports</p>
          </div>
        ) : (
          filtered.map(r => {
            const isExpanded = expanded === r.id;
            const strengths = typeof r.strengths === 'string' ? JSON.parse(r.strengths || '[]') : (r.strengths || []);
            const improvements = typeof r.improvements === 'string' ? JSON.parse(r.improvements || '[]') : (r.improvements || []);
            const actionItems = typeof r.action_items === 'string' ? JSON.parse(r.action_items || '[]') : (r.action_items || []);
            return (
              <div key={r.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  role="button" tabIndex={0} aria-expanded={isExpanded} aria-label={`Toggle details for ${r.title}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isExpanded ? null : r.id); } }}
                  onClick={() => setExpanded(isExpanded ? null : r.id)}>
                  <div className={`p-2 rounded-lg ${r.status === 'draft' ? 'bg-amber-100 dark:bg-amber-950/50' : 'bg-green-100 dark:bg-green-950/50'}`}>
                    {r.status === 'draft' ? <Edit size={14} className="text-amber-600 dark:text-amber-400" /> : <CheckCircle size={14} className="text-green-600 dark:text-green-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{r.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{r.incident_type} · {r.location} · {r.incident_date}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.status === 'draft' ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300' : 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300'}`}>
                      {r.status}
                    </span>
                    <p className="text-[10px] text-gray-400 mt-0.5">{r.conducted_date}</p>
                  </div>
                  {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </div>
                {isExpanded && (
                  <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 space-y-3">
                    {r.summary && <p className="text-sm text-gray-700 dark:text-gray-300">{r.summary}</p>}
                    {strengths.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-green-700 dark:text-green-300 mb-1 flex items-center gap-1"><ThumbsUp size={11} /> Strengths</p>
                        <ul className="space-y-0.5">{strengths.map((s, i) => <li key={i} className="text-xs text-gray-700 dark:text-gray-300 pl-3">• {s}</li>)}</ul>
                      </div>
                    )}
                    {improvements.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mb-1 flex items-center gap-1"><AlertTriangle size={11} /> Improvements</p>
                        <ul className="space-y-0.5">{improvements.map((s, i) => <li key={i} className="text-xs text-gray-700 dark:text-gray-300 pl-3">• {s}</li>)}</ul>
                      </div>
                    )}
                    {actionItems.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1 flex items-center gap-1"><Target size={11} /> Action Items</p>
                        {actionItems.map((a, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs pl-3 mb-0.5">
                            <span className={`w-2 h-2 rounded-full ${a.status === 'open' ? 'bg-red-400' : 'bg-green-400'}`} />
                            <span className="text-gray-700 dark:text-gray-300">{a.text}</span>
                            {a.assigned && <span className="text-gray-400">— {a.assigned}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {r.lessons_learned && (
                      <div>
                        <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-1"><Lightbulb size={11} /> Lessons Learned</p>
                        <p className="text-xs text-gray-700 dark:text-gray-300">{r.lessons_learned}</p>
                      </div>
                    )}

                    {/* Linked Meetings */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                      <LinkedMeetings module="after-action" recordId={r.id} recordLabel={r.title || 'AAR'} />
                      <Attachments module="after-action" recordId={r.id} recordLabel={r.title || 'AAR'} />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {r.status === 'draft' && (
                        <button onClick={e => { e.stopPropagation(); handleFinalize(r.id); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg hover:bg-green-100 dark:hover:bg-green-900">
                          <CheckCircle size={11} /> Finalize
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

      {showModal && <AARModal onSave={handleCreate} onClose={() => setShowModal(false)} />}
    </div>
  );
}
