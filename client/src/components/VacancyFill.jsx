/**
 * VacancyFill.jsx — Auto Vacancy Fill
 *
 * When a member calls out, automatically find and fill the shift:
 * 1. Create vacancy → 2. System ranks candidates → 3. Notify top picks →
 * 4. First to accept gets the shift
 */

import { useState, useEffect, useCallback } from 'react';
import {
  UserCheck, Plus, Search, Clock, AlertTriangle, CheckCircle, XCircle,
  Phone, Mail, Loader2, X, ChevronDown, ChevronUp, Users, Award,
  ArrowRight, Bell, Star, Zap,
} from 'lucide-react';
import { api } from '../utils/api';

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-gray-50 dark:bg-gray-950 dark:text-gray-100';
const BTN_PRIMARY = 'flex items-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl transition-colors';

const STATUS_STYLES = {
  open:       { bg: 'bg-amber-100 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-300', label: 'Open' },
  notifying:  { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300', label: 'Notifying' },
  filled:     { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-300', label: 'Filled' },
  expired:    { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400', label: 'Expired' },
  cancelled:  { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-400', label: 'Cancelled' },
};

const PRIORITY_STYLES = {
  critical: { bg: 'bg-red-600', text: 'text-white' },
  high:     { bg: 'bg-orange-500', text: 'text-white' },
  normal:   { bg: 'bg-blue-500', text: 'text-white' },
  low:      { bg: 'bg-gray-400', text: 'text-white' },
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Vacancy Card ────────────────────────────────────────────────────────────

function VacancyCard({ v, onViewCandidates, onFill, onCancel }) {
  const s = STATUS_STYLES[v.status] || STATUS_STYLES.open;
  const p = PRIORITY_STYLES[v.priority] || PRIORITY_STYLES.normal;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all">
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${v.status === 'filled' ? 'bg-green-100 dark:bg-green-950/50' : 'bg-amber-100 dark:bg-amber-950/50'}`}>
              {v.status === 'filled' ? <CheckCircle size={20} className="text-green-600 dark:text-green-400" /> : <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-black text-gray-900 dark:text-gray-100">{v.shift_date} — {v.shift_name || 'Shift'}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.bg} ${p.text}`}>{v.priority}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {v.callout_member_name ? `${v.callout_member_name} called out` : 'Vacancy'} — {v.position || 'Any position'}
              </p>
              {v.callout_reason && <p className="text-xs text-gray-400 mt-0.5">{v.callout_reason}</p>}
            </div>
          </div>
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>

        {v.status === 'filled' && (
          <div className="mt-2 flex items-center gap-2 bg-green-50 dark:bg-green-950/50 rounded-lg px-3 py-1.5">
            <CheckCircle size={12} className="text-green-600 dark:text-green-400" />
            <span className="text-xs font-bold text-green-700 dark:text-green-300">Filled by {v.filled_by_name}</span>
            {v.filled_at && <span className="text-xs text-green-500 ml-auto">{new Date(v.filled_at).toLocaleString()}</span>}
          </div>
        )}
      </button>

      {expanded && v.status === 'open' && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 flex gap-2">
          <button onClick={() => onViewCandidates(v)} className="flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-3 py-1.5 rounded-lg">
            <Users size={12} /> View Candidates
          </button>
          <button onClick={() => onCancel(v)} className="flex items-center gap-1 text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 px-3 py-1.5 rounded-lg">
            <XCircle size={12} /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Candidate List ──────────────────────────────────────────────────────────

function CandidateList({ vacancy, onClose, onFill }) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filling, setFilling] = useState(null);

  useEffect(() => {
    api.get(`/api/vacancy-fill/${vacancy.id}/candidates`)
      .then(r => setCandidates(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [vacancy.id]);

  async function handleFill(candidate) {
    setFilling(candidate.id);
    try {
      await api.post(`/api/vacancy-fill/${vacancy.id}/accept`, {
        member_id: candidate.id, member_name: candidate.name,
      });
      onFill();
      onClose();
    } catch (e) { console.error(e); }
    finally { setFilling(null); }
  }

  async function handleDecline(candidate) {
    try {
      await api.post(`/api/vacancy-fill/${vacancy.id}/decline`, { member_id: candidate.id });
      setCandidates(c => c.filter(x => x.id !== candidate.id));
    } catch (e) { console.error(e); }
  }

  return (
    <Modal title={`Candidates — ${vacancy.shift_date} ${vacancy.shift_name}`} onClose={onClose}>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Ranked by availability, overtime balance, and qualifications. Top-ranked member is the best fit.</p>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No eligible candidates found</p>
      ) : (
        <div className="space-y-2">
          {candidates.map((c, i) => {
            const availColor = c.availability === 'available' ? 'bg-green-500' : c.availability === 'limited' ? 'bg-amber-500' : 'bg-gray-400';
            return (
              <div key={c.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-950 rounded-xl px-3 py-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center text-xs font-black text-blue-700 dark:text-blue-300 flex-shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{c.name}</p>
                    {i === 0 && <Star size={12} className="text-amber-500" />}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${availColor}`} />
                    <span>{c.availability}</span>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <span>{c.recentHours}h (30d)</span>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <span>Score: {c.score}</span>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleFill(c)}
                    disabled={filling === c.id}
                    className="text-[10px] font-bold text-white bg-green-600 hover:bg-green-500 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {filling === c.id ? <Loader2 size={10} className="animate-spin" /> : 'Assign'}
                  </button>
                  <button
                    onClick={() => handleDecline(c)}
                    className="text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 px-2 py-1.5 rounded-lg"
                  >
                    Skip
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ─── Create Vacancy Form ─────────────────────────────────────────────────────

function CreateVacancyForm({ onClose, onCreated, members }) {
  const [form, setForm] = useState({
    shift_date: new Date().toISOString().split('T')[0],
    shift_name: 'A Shift', position: '', callout_member_name: '',
    callout_reason: '', priority: 'normal', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true);
    try {
      await api.post('/api/vacancy-fill', form);
      onCreated();
      onClose();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  }

  return (
    <Modal title="Report a Callout / Create Vacancy" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Shift Date *</label>
            <input type="date" className={INPUT} value={form.shift_date} onChange={e => set('shift_date', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Shift</label>
            <select className={INPUT} value={form.shift_name} onChange={e => set('shift_name', e.target.value)}>
              <option>A Shift</option><option>B Shift</option><option>C Shift</option>
              <option>Day Shift</option><option>Night Shift</option><option>Weekend</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Who Called Out</label>
          <select className={INPUT} value={form.callout_member_name} onChange={e => set('callout_member_name', e.target.value)}>
            <option value="">Select member...</option>
            {(members || []).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Reason</label>
          <input className={INPUT} value={form.callout_reason} onChange={e => set('callout_reason', e.target.value)} placeholder="Sick, family emergency, etc." />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Position</label>
            <input className={INPUT} value={form.position} onChange={e => set('position', e.target.value)} placeholder="Firefighter, Officer, Driver" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Priority</label>
            <select className={INPUT} value={form.priority} onChange={e => set('priority', e.target.value)}>
              <option value="critical">Critical — must fill</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low — nice to have</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Notes</label>
          <textarea className={INPUT} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional context..." />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.shift_date} className="flex-1 py-2 bg-red-700 text-white font-bold text-sm rounded-xl hover:bg-red-800 disabled:opacity-50 flex items-center justify-center gap-1">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            Find Coverage
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function VacancyFill({ user }) {
  const [vacancies, setVacancies] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('active');
  const [showCreate, setShowCreate] = useState(false);
  const [showCandidates, setShowCandidates] = useState(null);
  const [members, setMembers] = useState([]);

  const load = useCallback(async () => {
    try {
      const [active, past, memberRes] = await Promise.all([
        api.get('/api/vacancy-fill'),
        api.get('/api/vacancy-fill/history'),
        api.get('/api/members'),
      ]);
      setVacancies(active.data || []);
      setHistory(past.data || []);
      setMembers((memberRes.data || []).map(m => m.name));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCancel(v) {
    if (!confirm(`Cancel vacancy for ${v.shift_date}?`)) return;
    try { await api.delete(`/api/vacancy-fill/${v.id}`); load(); } catch (e) { console.error(e); }
  }

  const activeList = tab === 'active' ? vacancies : history;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center">
            <UserCheck size={22} className="text-amber-700 dark:text-amber-300" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">Auto Vacancy Fill</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Automatically find coverage when a member calls out</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className={BTN_PRIMARY}>
          <Plus size={14} /> Report Callout
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center">
          <p className="text-xl font-black text-amber-600 dark:text-amber-400">{vacancies.length}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase">Open</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center">
          <p className="text-xl font-black text-green-600 dark:text-green-400">{history.filter(h => h.status === 'filled').length}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase">Filled (30d)</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center">
          <p className="text-xl font-black text-gray-400">{history.filter(h => h.status === 'expired').length}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase">Unfilled</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        <button onClick={() => setTab('active')} className={`flex-1 py-2 text-xs font-bold rounded-lg ${tab === 'active' ? 'bg-white dark:bg-gray-900 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
          Active ({vacancies.length})
        </button>
        <button onClick={() => setTab('history')} className={`flex-1 py-2 text-xs font-bold rounded-lg ${tab === 'history' ? 'bg-white dark:bg-gray-900 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
          History ({history.length})
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : activeList.length === 0 ? (
        <div className="text-center py-12">
          <UserCheck size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm font-bold text-gray-500 dark:text-gray-400">{tab === 'active' ? 'No open vacancies' : 'No history yet'}</p>
          <p className="text-xs text-gray-400 mt-1">When a member calls out, report it here to auto-find coverage.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeList.map(v => (
            <VacancyCard
              key={v.id} v={v}
              onViewCandidates={setShowCandidates}
              onFill={load}
              onCancel={handleCancel}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && <CreateVacancyForm onClose={() => setShowCreate(false)} onCreated={load} members={members} />}
      {showCandidates && <CandidateList vacancy={showCandidates} onClose={() => setShowCandidates(null)} onFill={load} />}
    </div>
  );
}
