import { useState, useEffect, useCallback } from 'react';
import {
  Scale, Plus, Loader2, ChevronDown, ChevronUp, Filter,
  FileText, AlertTriangle, CheckCircle, Clock, Trash2,
  ArrowRight, Search,
} from 'lucide-react';
import { api } from '../utils/api';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';
import CorrespondenceLog from './CorrespondenceLog';
import AIActionButton from './AIActionButton';

const STEP_COLORS = {
  step_1: 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300',
  step_2: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300',
  step_3: 'bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300',
  step_4: 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300',
  resolved: 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300',
  withdrawn: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
};

const STEP_LABELS = {
  step_1: 'Step 1 — Verbal',
  step_2: 'Step 2 — Written',
  step_3: 'Step 3 — Dept Head',
  step_4: 'Step 4 — Arbitration',
  resolved: 'Resolved',
  withdrawn: 'Withdrawn',
};

function GrievanceModal({ members, grievanceTypes, steps, onSave, onClose }) {
  const [form, setForm] = useState({
    filed_by: '', filed_date: new Date().toISOString().slice(0, 10),
    cba_article: '', subject: '', description: '',
    grievance_type: 'contract_violation', union_rep: '', management_rep: '', notes: '',
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">File Grievance</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Filed By</label>
            <select value={form.filed_by} onChange={e => setForm(f => ({ ...f, filed_by: e.target.value }))}
              aria-label="Filed By"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
              <option value="">Select member…</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Subject</label>
            <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              aria-label="Subject"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100"
              placeholder="Brief subject line…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Type</label>
              <select value={form.grievance_type} onChange={e => setForm(f => ({ ...f, grievance_type: e.target.value }))}
                aria-label="Grievance type"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
                {grievanceTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">CBA Article</label>
              <input value={form.cba_article} onChange={e => setForm(f => ({ ...f, cba_article: e.target.value }))}
                aria-label="CBA Article"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100"
                placeholder="e.g. Article 12, §3" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              aria-label="Description"
              rows={3} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100"
              placeholder="Detailed description of the grievance…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Union Rep</label>
              <select value={form.union_rep} onChange={e => setForm(f => ({ ...f, union_rep: e.target.value }))}
                aria-label="Union Rep"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100">
                <option value="">— Select member —</option>
                {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Management Rep</label>
              <select value={form.management_rep} onChange={e => setForm(f => ({ ...f, management_rep: e.target.value }))}
                aria-label="Management Rep"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100">
                <option value="">— Select member —</option>
                {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={() => {
            if (form.subject) onSave({ ...form, filed_by: form.filed_by ? parseInt(form.filed_by) : null });
          }}
            disabled={!form.subject}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 disabled:opacity-40">
            File Grievance
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GrievanceTracker() {
  const [grievances, setGrievances] = useState([]);
  const [stats, setStats] = useState({});
  const [members, setMembers] = useState([]);
  const [types, setTypes] = useState([]);
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [gRes, sRes, mRes, tRes] = await Promise.all([
        api.get(`/api/grievances${filterStatus ? `?status=${filterStatus}` : ''}`),
        api.get('/api/grievances/stats'),
        api.get('/api/members'),
        api.get('/api/grievances/types'),
      ]);
      const gData = gRes?.data?.data || gRes?.data || gRes || [];
      setGrievances(Array.isArray(gData) ? gData : []);
      setStats(sRes?.data || sRes || {});
      const mData = mRes?.data || mRes || [];
      setMembers(Array.isArray(mData) ? mData : []);
      const tData = tRes?.data || tRes || {};
      setTypes(Array.isArray(tData.types) ? tData.types : []);
      setSteps(Array.isArray(tData.steps) ? tData.steps : []);
    } catch (err) {
      console.error('Failed to load grievances:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate(form) {
    try {
      await api.post('/api/grievances', form);
      setShowModal(false);
      fetchData();
    } catch (err) { alert(err.message || 'Failed'); }
  }

  async function advanceStep(grievance) {
    const stepOrder = ['step_1', 'step_2', 'step_3', 'step_4', 'resolved'];
    const currentIdx = stepOrder.indexOf(grievance.current_step);
    if (currentIdx < 0 || currentIdx >= stepOrder.length - 1) return;
    const nextStep = stepOrder[currentIdx + 1];
    const isResolved = nextStep === 'resolved';

    try {
      await api.patch(`/api/grievances/${grievance.id}`, {
        current_step: nextStep,
        status: isResolved ? 'resolved' : 'open',
        resolved_date: isResolved ? new Date().toISOString().slice(0, 10) : null,
        timeline_entry: {
          step: nextStep,
          action: isResolved ? 'Grievance resolved' : `Advanced to ${STEP_LABELS[nextStep]}`,
          by: '',
        },
      });
      fetchData();
    } catch (err) { alert(err.message || 'Failed'); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this grievance?')) return;
    try {
      await api.delete(`/api/grievances/${id}`);
      fetchData();
    } catch (err) { alert(err.message || 'Failed'); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Loading grievances…</span>
      </div>
    );
  }

  let filtered = grievances;
  if (search) filtered = filtered.filter(g =>
    (g.subject || '').toLowerCase().includes(search.toLowerCase()) ||
    (g.filed_by_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (g.grievance_number || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Scale className="h-6 w-6 text-red-700 dark:text-red-300" />
            Grievance Tracker
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Union grievance management, CBA compliance, and resolution tracking</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800">
          <Plus size={14} /> File Grievance
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Open', value: stats.open || 0, icon: AlertTriangle, color: (stats.open || 0) > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300' },
          { label: 'Total Filed', value: stats.total || 0, icon: FileText, color: 'text-gray-700 dark:text-gray-300' },
          { label: 'Avg Resolution', value: `${stats.avgResolutionDays || 0} days`, icon: Clock, color: 'text-blue-700 dark:text-blue-300' },
          { label: 'At Arbitration', value: (stats.byStep || []).find(s => s.current_step === 'step_4')?.count || 0, icon: Scale, color: 'text-red-700 dark:text-red-300' },
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

      {/* Step pipeline */}
      {(stats.byStep || []).length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Pipeline</p>
          <div className="flex items-center gap-2 overflow-x-auto">
            {['step_1', 'step_2', 'step_3', 'step_4'].map((step, idx) => {
              const count = (stats.byStep || []).find(s => s.current_step === step)?.count || 0;
              return (
                <div key={step} className="flex items-center gap-2">
                  <div className={`px-4 py-2 rounded-xl text-center min-w-[100px] ${STEP_COLORS[step]}`}>
                    <p className="text-lg font-black">{count}</p>
                    <p className="text-[10px] font-bold">{STEP_LABELS[step]?.split(' — ')[1] || step}</p>
                  </div>
                  {idx < 3 && <ArrowRight size={14} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} aria-label="Search grievances" placeholder="Search grievances…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:bg-gray-900 dark:text-gray-100" />
        </div>
        <div className="flex gap-1">
          {['', 'open', 'resolved'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                filterStatus === s ? 'bg-red-700 text-white border-red-700' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
              }`}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Grievance list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-8 text-center">
            <Scale className="mx-auto h-8 w-8 text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">No grievances filed</p>
          </div>
        ) : (
          filtered.map(g => {
            const isExpanded = expanded === g.id;
            const stepColor = STEP_COLORS[g.current_step] || STEP_COLORS.step_1;
            const timeline = typeof g.timeline === 'string' ? JSON.parse(g.timeline || '[]') : (g.timeline || []);
            return (
              <div key={g.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => setExpanded(isExpanded ? null : g.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-label={`Toggle details for grievance ${g.grievance_number || g.subject}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isExpanded ? null : g.id); } }}>
                  <div className={`p-2 rounded-lg ${g.status === 'open' ? 'bg-amber-100 dark:bg-amber-950/50' : 'bg-green-100 dark:bg-green-950/50'}`}>
                    {g.status === 'open' ? <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" /> : <CheckCircle size={14} className="text-green-600 dark:text-green-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-gray-400">{g.grievance_number}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${stepColor}`}>
                        {STEP_LABELS[g.current_step] || g.current_step}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{g.subject}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Filed by {g.filed_by_name || 'Unknown'} · {g.filed_date}</p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                      {(g.grievance_type || '').replace(/_/g, ' ')}
                    </span>
                  </div>
                  {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </div>

                {isExpanded && (
                  <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 space-y-3">
                    <p className="text-sm text-gray-700 dark:text-gray-300">{g.description}</p>
                    {g.cba_article && <p className="text-xs text-gray-600 dark:text-gray-300"><strong>CBA Reference:</strong> {g.cba_article}</p>}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-gray-400">Union Rep</p>
                        <p className="font-semibold text-gray-700 dark:text-gray-300">{g.union_rep || '—'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Management Rep</p>
                        <p className="font-semibold text-gray-700 dark:text-gray-300">{g.management_rep || '—'}</p>
                      </div>
                    </div>

                    {/* Timeline */}
                    {timeline.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Timeline</p>
                        <div className="space-y-2">
                          {timeline.map((entry, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-gray-700 dark:text-gray-300">{entry.action}</p>
                                <p className="text-[10px] text-gray-400">{entry.date}{entry.by ? ` · ${entry.by}` : ''}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {g.resolution && (
                      <div className="bg-green-50 dark:bg-green-950/50 rounded-lg p-3">
                        <p className="text-xs font-bold text-green-800 dark:text-green-300">Resolution</p>
                        <p className="text-xs text-green-700 dark:text-green-300 mt-1">{g.resolution}</p>
                      </div>
                    )}

                    {/* AI Actions */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mb-3">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">AI Actions</p>
                      <div className="flex flex-wrap gap-2">
                        <AIActionButton
                          action="summarize_grievance"
                          context={{ module: 'grievances', recordId: g.id, data: g }}
                          label="Summarize Case"
                          variant="inline"
                          resultType="json"
                        />
                        <AIActionButton
                          action="draft_grievance_response"
                          context={{ module: 'grievances', recordId: g.id, data: g }}
                          label="Draft Response"
                          variant="inline"
                          confirmText="Generate a draft management response for this grievance?"
                        />
                      </div>
                    </div>

                    {/* Linked Meetings, Correspondence & Attachments */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-4">
                      <CorrespondenceLog
                        module="grievances"
                        recordId={g.id}
                        recordLabel={g.grievance_number || g.subject}
                      />
                      <LinkedMeetings
                        module="grievances"
                        recordId={g.id}
                        recordLabel={g.grievance_number || g.subject}
                      />
                      <Attachments
                        module="grievances"
                        recordId={g.id}
                        recordLabel={g.grievance_number || g.subject}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      {g.status === 'open' && g.current_step !== 'step_4' && (
                        <button onClick={e => { e.stopPropagation(); advanceStep(g); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950/50">
                          <ArrowRight size={11} /> Advance Step
                        </button>
                      )}
                      {g.status === 'open' && g.current_step === 'step_4' && (
                        <button onClick={e => { e.stopPropagation(); advanceStep(g); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg hover:bg-green-100 dark:hover:bg-green-950/50">
                          <CheckCircle size={11} /> Resolve
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); handleDelete(g.id); }}
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
        <GrievanceModal members={members} grievanceTypes={types} steps={steps}
          onSave={handleCreate} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}
