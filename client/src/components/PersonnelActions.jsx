import { useState, useEffect, useCallback } from 'react';
import {
  UserCog, Plus, Trash2, Loader2, FileText, Search,
  Filter, ChevronDown, ChevronUp, Award, AlertTriangle,
  Download, Star, Shield,
} from 'lucide-react';
import { api } from '../utils/api';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';
import CorrespondenceLog from './CorrespondenceLog';

const ACTION_COLORS = {
  promotion: 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300',
  demotion: 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300',
  commendation: 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300',
  verbal_warning: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300',
  written_warning: 'bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300',
  suspension: 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300',
  termination: 'bg-red-200 dark:bg-red-900 text-red-900 dark:text-red-200',
  performance_review: 'bg-purple-100 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300',
  certification_earned: 'bg-teal-100 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300',
  certification_expired: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  transfer: 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300',
  hire: 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300',
  resignation: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  retirement: 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300',
  leave_of_absence: 'bg-yellow-100 dark:bg-yellow-950/50 text-yellow-800 dark:text-yellow-300',
  return_from_leave: 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300',
  pay_change: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300',
  role_change: 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300',
  probation_start: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
  probation_end: 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300',
  other: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
};

const ACTION_ICONS = {
  promotion: Star, demotion: AlertTriangle, commendation: Award,
  verbal_warning: AlertTriangle, written_warning: FileText,
  suspension: Shield, termination: Shield,
};

function ActionModal({ members, actionTypes, onSave, onClose }) {
  const [form, setForm] = useState({
    member_id: '', action_type: 'commendation',
    action_date: new Date().toISOString().slice(0, 10),
    description: '', issued_by: '', status: 'active',
    details: { notes: '' },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">New Personnel Action</h3>
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
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Action Type</label>
              <select value={form.action_type} onChange={e => setForm(f => ({ ...f, action_type: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
                {actionTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Date</label>
              <input type="date" value={form.action_date} onChange={e => setForm(f => ({ ...f, action_date: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Describe the action…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Issued By</label>
              <input value={form.issued_by} onChange={e => setForm(f => ({ ...f, issued_by: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Name or title" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
                {['active', 'resolved', 'appealed', 'expunged'].map(s =>
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                )}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Additional Notes</label>
            <input value={form.details.notes} onChange={e => setForm(f => ({ ...f, details: { ...f.details, notes: e.target.value } }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Optional" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={() => { if (form.member_id && form.description) onSave({ ...form, member_id: parseInt(form.member_id) }); }}
            disabled={!form.member_id || !form.description}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 disabled:opacity-40">
            Save Action
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PersonnelActions() {
  const [actions, setActions] = useState([]);
  const [members, setMembers] = useState([]);
  const [actionTypes, setActionTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterMember, setFilterMember] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [view, setView] = useState('timeline'); // timeline | personnel-file

  const fetchData = useCallback(async () => {
    try {
      const [aRes, mRes, tRes] = await Promise.all([
        api.get('/api/personnel-actions'),
        api.get('/api/members'),
        api.get('/api/personnel-actions/action-types'),
      ]);
      const actions = Array.isArray(aRes?.data) ? aRes.data : Array.isArray(aRes) ? aRes : [];
      const members = Array.isArray(mRes?.data) ? mRes.data : Array.isArray(mRes) ? mRes : [];
      const actionTypes = Array.isArray(tRes?.data) ? tRes.data : Array.isArray(tRes) ? tRes : [];
      setActions(actions);
      setMembers(members);
      setActionTypes(actionTypes);
    } catch (err) {
      console.error('Failed to load personnel actions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSave(form) {
    try {
      await api.post('/api/personnel-actions', form);
      setShowModal(false);
      fetchData();
    } catch (err) { alert(err.message || 'Failed to save'); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this personnel action? This cannot be undone.')) return;
    try {
      await api.delete(`/api/personnel-actions/${id}`);
      fetchData();
    } catch (err) { alert(err.message || 'Failed to delete'); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Loading personnel actions…</span>
      </div>
    );
  }

  let filtered = actions;
  if (search) filtered = filtered.filter(a =>
    (a.member_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.description || '').toLowerCase().includes(search.toLowerCase())
  );
  if (filterType) filtered = filtered.filter(a => a.action_type === filterType);
  if (filterMember) filtered = filtered.filter(a => String(a.member_id) === filterMember);

  // Group by member for personnel file view
  const byMember = {};
  filtered.forEach(a => {
    const key = a.member_id;
    if (!byMember[key]) byMember[key] = { name: a.member_name, rank: a.member_rank, actions: [] };
    byMember[key].actions.push(a);
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <UserCog className="h-6 w-6 text-red-700 dark:text-red-300" />
            Personnel Actions
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Promotions, disciplinary, commendations, and audit trail</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800">
          <Plus size={14} /> New Action
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search actions…" aria-label="Search actions"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:bg-gray-900 dark:text-gray-100" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} aria-label="Filter by action type"
          className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
          <option value="">All Types</option>
          {actionTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
        </select>
        <select value={filterMember} onChange={e => setFilterMember(e.target.value)} aria-label="Filter by member"
          className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100">
          <option value="">All Members</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div className="flex gap-1">
          {['timeline', 'personnel-file'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                view === v ? 'bg-red-700 text-white border-red-700' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
              }`}>
              {v === 'timeline' ? 'Timeline' : 'By Member'}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline view */}
      {view === 'timeline' && (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-8 text-center">
              <FileText className="mx-auto h-8 w-8 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">No personnel actions recorded</p>
            </div>
          ) : (
            filtered.map(a => {
              const Icon = ACTION_ICONS[a.action_type] || FileText;
              const colorClass = ACTION_COLORS[a.action_type] || ACTION_COLORS.other;
              const isExpanded = expanded === a.id;
              const details = typeof a.details === 'string' ? JSON.parse(a.details || '{}') : (a.details || {});
              return (
                <div key={a.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    role="button" tabIndex={0} aria-expanded={isExpanded} aria-label={`Toggle details for ${a.member_name} ${(a.action_type || '').replace(/_/g, ' ')}`}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isExpanded ? null : a.id); } }}
                    onClick={() => setExpanded(isExpanded ? null : a.id)}>
                    <div className={`p-2 rounded-lg ${colorClass}`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{a.member_name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colorClass}`}>
                          {(a.action_type || '').replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{a.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{a.action_date}</p>
                      <p className="text-[10px] text-gray-400">{a.status}</p>
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  </div>
                  {isExpanded && (
                    <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 space-y-2">
                      <p className="text-sm text-gray-700 dark:text-gray-300">{a.description}</p>
                      {a.issued_by && <p className="text-xs text-gray-500 dark:text-gray-400">Issued by: <span className="font-semibold">{a.issued_by}</span></p>}
                      {details.notes && <p className="text-xs text-gray-500 dark:text-gray-400">Notes: {details.notes}</p>}
                      {/* Correspondence, Linked Meetings & Attachments */}
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3 space-y-4">
                        <CorrespondenceLog module="personnel-actions" recordId={a.id} recordLabel={a.title || 'Personnel Action'} />
                        <LinkedMeetings module="personnel-actions" recordId={a.id} recordLabel={a.title || 'Personnel Action'} />
                        <Attachments module="personnel-actions" recordId={a.id} recordLabel={a.title || 'Personnel Action'} />
                      </div>
                      <div className="flex justify-end pt-1">
                        <button onClick={e => { e.stopPropagation(); handleDelete(a.id); }}
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

      {/* Personnel file view */}
      {view === 'personnel-file' && (
        <div className="space-y-4">
          {Object.keys(byMember).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No actions found</p>
          ) : (
            Object.entries(byMember).map(([memberId, data]) => (
              <div key={memberId} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{data.name}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{data.rank} · {data.actions.length} action{data.actions.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="divide-y divide-gray-50">
                  {data.actions.map(a => {
                    const colorClass = ACTION_COLORS[a.action_type] || ACTION_COLORS.other;
                    return (
                      <div key={a.id} className="px-4 py-2.5 flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colorClass}`}>
                          {(a.action_type || '').replace(/_/g, ' ')}
                        </span>
                        <p className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">{a.description}</p>
                        <p className="text-[10px] text-gray-400">{a.action_date}</p>
                        <button onClick={() => handleDelete(a.id)} aria-label="Delete action" className="p-1 rounded text-gray-400 hover:text-red-600">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showModal && <ActionModal members={members} actionTypes={actionTypes} onSave={handleSave} onClose={() => setShowModal(false)} />}
    </div>
  );
}
