import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Plus, Loader2, Trash2, ChevronDown, ChevronUp,
  Target, Calendar, Clock, BarChart3, Filter, CheckCircle,
} from 'lucide-react';
import { api } from '../utils/api';

function PlanModal({ categories, onSave, onClose }) {
  const [form, setForm] = useState({
    title: '', year: new Date().getFullYear(), description: '',
    category: 'general', target_hours: '', priority: 'normal',
    objectives: [''], created_by: '',
  });
  const [members, setMembers] = useState([]);

  useEffect(() => {
    api.get('/api/members').then(raw => {
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setMembers(arr.filter(m => m.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, []);

  function updateObj(idx, val) {
    setForm(f => { const a = [...f.objectives]; a[idx] = val; return { ...f, objectives: a }; });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">New Training Plan</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Annual Fire Suppression Training" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Year</label>
              <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
                {categories.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Target Hours</label>
              <input type="number" step="0.5" value={form.target_hours}
                onChange={e => setForm(f => ({ ...f, target_hours: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Objectives</label>
            {form.objectives.map((o, i) => (
              <input key={i} value={o} onChange={e => updateObj(i, e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm mb-1 dark:bg-gray-900 dark:text-gray-100" placeholder={`Objective ${i + 1}`} />
            ))}
            <button type="button" onClick={() => setForm(f => ({ ...f, objectives: [...f.objectives, ''] }))}
              className="text-xs text-blue-700 dark:text-blue-300 font-semibold hover:underline">+ Add Objective</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
                {['low', 'normal', 'high', 'critical'].map(p =>
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Created By</label>
              <select value={form.created_by} onChange={e => setForm(f => ({ ...f, created_by: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
                <option value="">Select member…</option>
                {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={() => { if (form.title) onSave({ ...form, target_hours: parseFloat(form.target_hours) || 0, objectives: form.objectives.filter(o => o) }); }}
            disabled={!form.title}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 disabled:opacity-40">
            Create Plan
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TrainingPlans() {
  const [plans, setPlans] = useState([]);
  const [stats, setStats] = useState({});
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [filterStatus, setFilterStatus] = useState('');
  const [expanded, setExpanded] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      let url = `/api/training-plans?year=${year}`;
      if (filterStatus) url += `&status=${filterStatus}`;
      const [pRes, sRes, cRes] = await Promise.all([
        api.get(url),
        api.get(`/api/training-plans/stats?year=${year}`),
        api.get('/api/training-plans/categories'),
      ]);
      const plans = Array.isArray(pRes?.data?.data) ? pRes.data.data : Array.isArray(pRes?.data) ? pRes.data : Array.isArray(pRes) ? pRes : [];
      const stats = sRes?.data && typeof sRes.data === 'object' ? sRes.data : typeof sRes === 'object' && !Array.isArray(sRes) ? sRes : {};
      const cResObj = cRes?.data && typeof cRes.data === 'object' ? cRes.data : typeof cRes === 'object' && !Array.isArray(cRes) ? cRes : {};
      const categories = Array.isArray(cResObj.categories) ? cResObj.categories : [];
      setPlans(plans);
      setStats(stats);
      setCategories(categories);
    } catch (err) {
      console.error('Failed to load training plans:', err);
    } finally { setLoading(false); }
  }, [year, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate(form) {
    try { await api.post('/api/training-plans', form); setShowModal(false); fetchData(); }
    catch (err) { alert(err.message || 'Failed'); }
  }

  async function handleStatusChange(id, status) {
    try { await api.patch(`/api/training-plans/${id}`, { status }); fetchData(); }
    catch (err) { alert(err.message || 'Failed'); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this training plan?')) return;
    try { await api.delete(`/api/training-plans/${id}`); fetchData(); } catch (err) { alert('Failed'); }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="h-8 w-8 animate-spin mr-3" /><span className="text-sm">Loading…</span></div>;
  }

  const completionPct = stats.completionPct || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-red-700 dark:text-red-300" />
            Training Plans
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Annual training programs, objectives, and completion tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(parseInt(e.target.value))} aria-label="Filter by year"
            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-semibold dark:bg-gray-900 dark:text-gray-100">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800">
            <Plus size={14} /> New Plan
          </button>
        </div>
      </div>

      {/* Progress overview */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{year} Training Completion</p>
          <p className="text-sm font-black text-gray-900 dark:text-gray-100">{completionPct}%</p>
        </div>
        <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${
            completionPct >= 80 ? 'bg-green-500' : completionPct >= 50 ? 'bg-amber-500' : 'bg-red-500'
          }`} style={{ width: `${Math.min(100, completionPct)}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{(stats.totalCompletedHours || 0).toFixed(0)}h completed</span>
          <span>{(stats.totalTargetHours || 0).toFixed(0)}h target</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Plans', value: stats.totalPlans || 0, icon: BookOpen, color: 'text-gray-700 dark:text-gray-300' },
          { label: 'In Progress', value: stats.byStatus?.in_progress || 0, icon: Clock, color: 'text-blue-700 dark:text-blue-300' },
          { label: 'Completed', value: stats.byStatus?.completed || 0, icon: CheckCircle, color: 'text-green-700 dark:text-green-300' },
          { label: 'Target Hours', value: (stats.totalTargetHours || 0).toFixed(0), icon: Target, color: 'text-red-700 dark:text-red-300' },
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

      <div className="flex items-center gap-2">
        <Filter size={14} className="text-gray-400" />
        {['', 'planned', 'in_progress', 'completed', 'cancelled'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${filterStatus === s ? 'bg-red-700 text-white border-red-700' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
            {s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'All'}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {plans.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-8 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-gray-200 dark:text-gray-700 mb-2" />
            <p className="text-sm text-gray-400">No training plans for {year}</p>
          </div>
        ) : (
          plans.map(p => {
            const isExpanded = expanded === p.id;
            const objectives = typeof p.objectives === 'string' ? JSON.parse(p.objectives || '[]') : (p.objectives || []);
            const target = parseFloat(p.target_hours) || 0;
            const completed = parseFloat(p.completed_hours) || 0;
            const pct = target > 0 ? ((completed / target) * 100).toFixed(0) : 0;
            return (
              <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  role="button" tabIndex={0} aria-expanded={isExpanded} aria-label={`Toggle details for ${p.title}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isExpanded ? null : p.id); } }}
                  onClick={() => setExpanded(isExpanded ? null : p.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{p.title}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        p.status === 'completed' ? 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300' :
                        p.status === 'in_progress' ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300' :
                        'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                      }`}>{(p.status || '').replace(/_/g, ' ')}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        p.priority === 'critical' ? 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300' :
                        p.priority === 'high' ? 'bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300' :
                        'bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400'
                      }`}>{p.priority}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{(p.category || '').replace(/_/g, ' ')} · {completed}/{target}h ({pct}%)</p>
                  </div>
                  <div className="w-24">
                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </div>
                {isExpanded && (
                  <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 space-y-2">
                    {p.description && <p className="text-sm text-gray-700 dark:text-gray-300">{p.description}</p>}
                    {objectives.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Objectives</p>
                        <ul className="space-y-0.5">{objectives.map((o, i) => <li key={i} className="text-xs text-gray-700 dark:text-gray-300 pl-3">• {o}</li>)}</ul>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      {p.status === 'planned' && (
                        <button onClick={e => { e.stopPropagation(); handleStatusChange(p.id, 'in_progress'); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg">
                          Start
                        </button>
                      )}
                      {p.status === 'in_progress' && (
                        <button onClick={e => { e.stopPropagation(); handleStatusChange(p.id, 'completed'); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg">
                          <CheckCircle size={11} /> Complete
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); handleDelete(p.id); }}
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

      {showModal && <PlanModal categories={categories} onSave={handleCreate} onClose={() => setShowModal(false)} />}
    </div>
  );
}
