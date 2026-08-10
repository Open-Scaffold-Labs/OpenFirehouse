/**
 * VacancyFill.jsx — Vacancies (Phase 1.4, the unified open-coverage record).
 *
 * Rebuilt against /api/vacancies (migration 0080): vacancies are minted automatically
 * when an approved leave drops a shift below minimum, or opened here by command (the
 * BC-opens flow). Fill is atomic single-winner on the server; cancel requires a reason.
 * The old ad-hoc candidate scorer is retired — the rules-based hiring engine (OT
 * equalization, seniority, quals, audit trail) is Phase 1.5 and will plug into the
 * same fill door. Until then, fill-by-person is the manual override every platform ships.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  UserCheck, Plus, AlertTriangle, CheckCircle, XCircle,
  Loader2, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '../utils/api';
import { HiringEventModal, HiringListsTab } from './HiringConsole';

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-gray-50 dark:bg-gray-950 dark:text-gray-100';
const BTN_PRIMARY = 'flex items-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl transition-colors';

const STATUS_STYLES = {
  open:      { bg: 'bg-amber-100 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-300', label: 'Open' },
  offering:  { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300', label: 'Offering' },
  filled:    { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-300', label: 'Filled' },
  expired:   { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400', label: 'Expired' },
  cancelled: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-400', label: 'Cancelled' },
};

const PRIORITY_STYLES = {
  1: { bg: 'bg-red-600', text: 'text-white', label: 'P1 — fill first' },
  2: { bg: 'bg-blue-500', text: 'text-white', label: 'P2' },
  3: { bg: 'bg-gray-400', text: 'text-white', label: 'P3' },
};

const CAUSE_LABELS = {
  leave: 'Approved leave', sick_callout: 'Sick call-out', trade_fallout: 'Trade fallout',
  open_slot: 'Open slot', manual: 'Opened by command',
};

const isoDate = (v) => (typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10));

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

function VacancyCard({ v, memberName, onFill, onHire, onCancel }) {
  const s = STATUS_STYLES[v.status] || STATUS_STYLES.open;
  const p = PRIORITY_STYLES[v.priority] || PRIORITY_STYLES[2];
  const [expanded, setExpanded] = useState(false);
  const live = v.status === 'open' || v.status === 'offering';

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
                <p className="text-sm font-black text-gray-900 dark:text-gray-100">{isoDate(v.shift_date)}{v.position_name ? ` — ${v.position_name}` : ''}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.bg} ${p.text}`}>{p.label}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {CAUSE_LABELS[v.cause] || v.cause}
                {v.hours != null && ` — ${Number(v.hours)}h`}
                {v.required_rank && ` — needs ${v.required_rank}`}
              </p>
              {v.cancelled_reason && <p className="text-xs text-gray-400 mt-0.5">Cancelled: {v.cancelled_reason}</p>}
            </div>
          </div>
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>

        {v.status === 'filled' && (
          <div className="mt-2 flex items-center gap-2 bg-green-50 dark:bg-green-950/50 rounded-lg px-3 py-1.5">
            <CheckCircle size={12} className="text-green-600 dark:text-green-400" />
            <span className="text-xs font-bold text-green-700 dark:text-green-300">
              Filled by {memberName(v.filled_by_member_id)}{v.fill_method === 'accepted_offer' ? ' (accepted offer)' : ''}
            </span>
            {v.filled_at && <span className="text-xs text-green-500 ml-auto">{new Date(v.filled_at).toLocaleString()}</span>}
          </div>
        )}
      </button>

      {expanded && live && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 flex gap-2">
          <button onClick={() => onHire(v)} className="flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-3 py-1.5 rounded-lg">
            <UserCheck size={12} /> {v.status === 'offering' ? 'Hiring run…' : 'Start hiring'}
          </button>
          <button onClick={() => onFill(v)} className="flex items-center gap-1 text-xs font-bold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/50 hover:bg-green-100 dark:hover:bg-green-900/50 px-3 py-1.5 rounded-lg">
            <UserCheck size={12} /> Fill by person
          </button>
          <button onClick={() => onCancel(v)} className="flex items-center gap-1 text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 px-3 py-1.5 rounded-lg">
            <XCircle size={12} /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Fill Modal (fill-by-person — the 1.5 hiring engine plugs into this same door) ──

function FillModal({ vacancy, members, onClose, onDone }) {
  const [memberId, setMemberId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleFill() {
    if (!memberId) return;
    setSaving(true); setError('');
    try {
      await api.post(`/api/vacancies/${vacancy.id}/fill`, { member_id: Number(memberId), method: 'assigned' });
      onDone(); onClose();
    } catch (e) {
      setError(e?.message || 'Fill failed — it may already be filled or cancelled.');
    } finally { setSaving(false); }
  }

  return (
    <Modal title={`Fill — ${isoDate(vacancy.shift_date)}${vacancy.position_name ? ` ${vacancy.position_name}` : ''}`} onClose={onClose}>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Assign a member to this vacancy. The assignment lands on the riding board for that date.
        Rules-ordered offers (OT equalization, seniority, quals) arrive with the hiring engine.
      </p>
      <select className={INPUT} value={memberId} onChange={e => setMemberId(e.target.value)}>
        <option value="">Select member…</option>
        {members.map(m => <option key={m.id} value={m.id}>{m.name}{m.rank ? ` — ${m.rank}` : ''}</option>)}
      </select>
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}
      <div className="flex gap-2 pt-3">
        <button onClick={onClose} className="flex-1 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Back</button>
        <button onClick={handleFill} disabled={saving || !memberId} className="flex-1 py-2 bg-green-700 text-white font-bold text-sm rounded-xl hover:bg-green-800 disabled:opacity-50 flex items-center justify-center gap-1">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
          Assign
        </button>
      </div>
    </Modal>
  );
}

// ─── Cancel Modal (reason is recorded — 1.4 design-critique follow-up) ───────

function CancelModal({ vacancy, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function handleCancel() {
    setSaving(true); setError('');
    try {
      await api.post(`/api/vacancies/${vacancy.id}/cancel`, { reason: reason.trim() });
      onDone(); onClose();
    } catch (e) { setError(e?.message || 'Cancel failed — it may already be filled.'); }
    finally { setSaving(false); }
  }
  return (
    <Modal title={`Cancel vacancy — ${isoDate(vacancy.shift_date)}${vacancy.position_name ? ` ${vacancy.position_name}` : ''}`} onClose={onClose}>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        A withdrawn hiring need is still a record — the reason is saved with the vacancy.
      </p>
      <textarea className={INPUT} rows={2} value={reason} onChange={e => setReason(e.target.value)}
        placeholder="Covered by a trade, call-out rescinded, shift restructured…" />
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}
      <div className="flex gap-2 pt-3">
        <button onClick={onClose} className="flex-1 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Back</button>
        <button onClick={handleCancel} disabled={saving || !reason.trim()}
          className="flex-1 py-2 bg-gray-600 text-white font-bold text-sm rounded-xl hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-1">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
          Cancel vacancy
        </button>
      </div>
    </Modal>
  );
}

// ─── Create Vacancy Form ─────────────────────────────────────────────────────

function CreateVacancyForm({ onClose, onCreated }) {
  const [form, setForm] = useState({
    shift_date: new Date().toISOString().split('T')[0],
    position_name: '', required_rank: '', cause: 'sick_callout', priority: 2, hours: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const body = {
        shift_date: form.shift_date,
        position_name: form.position_name || undefined,
        required_rank: form.required_rank || undefined,
        cause: form.cause,
        priority: Number(form.priority),
        hours: form.hours === '' ? undefined : Number(form.hours),
      };
      await api.post('/api/vacancies', body);
      onCreated(); onClose();
    } catch (e) { setError(e?.message || 'Create failed'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Open a Vacancy" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Shift Date *</label>
            <input type="date" className={INPUT} value={form.shift_date} onChange={e => set('shift_date', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Cause</label>
            <select className={INPUT} value={form.cause} onChange={e => set('cause', e.target.value)}>
              <option value="sick_callout">Sick call-out</option>
              <option value="open_slot">Open slot</option>
              <option value="manual">Other (command)</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Position</label>
            <input className={INPUT} value={form.position_name} onChange={e => set('position_name', e.target.value)} placeholder="Firefighter, Officer, Driver" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Required Rank</label>
            <input className={INPUT} value={form.required_rank} onChange={e => set('required_rank', e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Priority</label>
            <select className={INPUT} value={form.priority} onChange={e => set('priority', e.target.value)}>
              <option value={1}>P1 — fill first</option>
              <option value={2}>P2 — standard</option>
              <option value={3}>P3 — nice to have</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Hours</label>
            <input type="number" min="0" max="96" className={INPUT} value={form.hours} onChange={e => set('hours', e.target.value)} placeholder="e.g. 24" />
          </div>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.shift_date} className="flex-1 py-2 bg-red-700 text-white font-bold text-sm rounded-xl hover:bg-red-800 disabled:opacity-50 flex items-center justify-center gap-1">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Open Vacancy
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
  const [fillTarget, setFillTarget] = useState(null);
  const [hireTarget, setHireTarget] = useState(null);   // 1.5: the hiring-run panel
  const [members, setMembers] = useState([]);

  const load = useCallback(async () => {
    try {
      const [active, past, memberRes] = await Promise.all([
        api.get('/api/vacancies'),
        api.get('/api/vacancies/history'),
        api.get('/api/members'),
      ]);
      setVacancies(active.data || []);
      setHistory(past.data || []);
      setMembers(memberRes.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Visibility-aware refresh: fresh on refocus, quiet in a backgrounded tab.
  useEffect(() => {
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(t); };
  }, [load]);

  const memberName = useCallback((id) => {
    const m = members.find(x => String(x.id) === String(id));
    return m ? m.name : (id != null ? `Member #${id}` : 'Unknown');
  }, [members]);

  const [cancelTarget, setCancelTarget] = useState(null); // 1.4 critique: modal, not prompt()

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
            <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">Vacancies</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Coverage holes — minted from approved leave, or opened by command</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className={BTN_PRIMARY}>
          <Plus size={14} /> Open Vacancy
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
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase">Filled</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center">
          <p className="text-xl font-black text-gray-400">{history.filter(h => h.status !== 'filled').length}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase">Closed unfilled</p>
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
        <button onClick={() => setTab('lists')} className={`flex-1 py-2 text-xs font-bold rounded-lg ${tab === 'lists' ? 'bg-white dark:bg-gray-900 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
          Hiring Lists
        </button>
      </div>

      {tab === 'lists' && <HiringListsTab user={user} />}

      {/* List */}
      {tab === 'lists' ? null : loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : activeList.length === 0 ? (
        <div className="text-center py-12">
          <UserCheck size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm font-bold text-gray-500 dark:text-gray-400">{tab === 'active' ? 'Every seat is covered.' : 'No history yet'}</p>
          <p className="text-xs text-gray-400 mt-1">{tab === 'active' ? 'Approved leave that drops a shift below minimum opens one automatically.' : 'Filled and cancelled vacancies land here.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeList.map(v => (
            <VacancyCard
              key={v.id} v={v}
              memberName={memberName}
              onFill={setFillTarget}
              onHire={setHireTarget}
              onCancel={setCancelTarget}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && <CreateVacancyForm onClose={() => setShowCreate(false)} onCreated={load} />}
      {fillTarget && <FillModal vacancy={fillTarget} members={members} onClose={() => setFillTarget(null)} onDone={load} />}
      {hireTarget && <HiringEventModal vacancy={hireTarget} onClose={() => setHireTarget(null)} onChanged={load} />}
      {cancelTarget && <CancelModal vacancy={cancelTarget} onClose={() => setCancelTarget(null)} onDone={load} />}
    </div>
  );
}
