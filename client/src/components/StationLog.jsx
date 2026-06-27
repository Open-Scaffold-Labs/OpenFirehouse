import DictateTextarea from './DictateTextarea';
import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Plus, Search, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Clock, Users, Flame, Pencil, Loader2,
} from 'lucide-react';
import { SHIFTS, LOG_MEMBERS, OFFICERS } from '../data/stationLog';
import { api } from '../utils/api';

// ─── Helpers ──────────────────────────────────────────────────────────────

function Check({ yes }) {
  return yes
    ? <CheckCircle size={13} className="text-green-500" />
    : <XCircle    size={13} className="text-red-400" />;
}

// ─── Expanded detail ──────────────────────────────────────────────────────

function LogDetail({ entry, onEdit }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-700 px-6 py-4 space-y-4">

      {/* At-a-glance row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { l: 'Officer on Duty',  v: entry.officerOnDuty },
          { l: 'Shift',            v: entry.shift },
          { l: 'Weather',          v: entry.weatherConditions || '—' },
          { l: 'Calls',            v: entry.callCount },
        ].map(({ l, v }) => (
          <div key={l}>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{l}</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 font-medium">{v}</p>
          </div>
        ))}
      </div>

      {/* Checks */}
      <div className="flex gap-6">
        <div className="flex items-center gap-2">
          <Check yes={entry.apparatusChecked} />
          <span className="text-xs text-gray-600 dark:text-gray-300">Apparatus check completed</span>
        </div>
        <div className="flex items-center gap-2">
          <Check yes={entry.stationChecked} />
          <span className="text-xs text-gray-600 dark:text-gray-300">Station check completed</span>
        </div>
      </div>

      {/* Members on duty */}
      {entry.membersOnDuty?.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Members on Duty</p>
          <div className="flex flex-wrap gap-2">
            {entry.membersOnDuty.map(m => (
              <span key={m} className="text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 rounded-full px-2.5 py-0.5">{m}</span>
            ))}
          </div>
        </div>
      )}

      {/* Event log */}
      {entry.events?.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Shift Log</p>
          <div className="space-y-2">
            {entry.events.map((e, i) => (
              <div key={i} className="flex gap-3 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2">
                <span className="font-mono text-[10px] font-bold text-gray-400 flex-shrink-0 mt-0.5 w-10">{e.time}</span>
                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{e.entry}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visitors */}
      {entry.visitors && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Visitors</p>
          <p className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2 leading-relaxed">{entry.visitors}</p>
        </div>
      )}

      {/* Notes */}
      {entry.notes && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Officer Notes</p>
          <p className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2 leading-relaxed">{entry.notes}</p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={() => onEdit(entry)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700">
          <Pencil size={11} /> Edit Entry
        </button>
      </div>
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────

function StationLogForm({ initial, onSave, onClose }) {
  const [members, setMembers] = useState([]);
  const [officers, setOfficers] = useState([]);

  useEffect(() => {
    api.get('/api/members').then(raw => {
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      const filtered = arr.filter(m => m.status !== 'Inactive' && (m.rank?.includes('Chief') || m.rank?.includes('Captain') || m.rank?.includes('Lieutenant')))
        .sort((a, b) => a.name.localeCompare(b.name));
      setOfficers(filtered);
      setMembers(arr.filter(m => m.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, []);

  const blank = {
    date: new Date().toISOString().slice(0, 10),
    shift: 'Day',
    officerOnDuty: initial?.officerOnDuty ?? (officers[0]?.name || ''),
    membersOnDuty: [],
    weatherConditions: '',
    callCount: 0,
    apparatusChecked: true,
    stationChecked: true,
    events: [{ time: '07:00', entry: '' }],
    visitors: '',
    notes: '',
  };
  const [form, setForm] = useState(initial ?? blank);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function toggleMember(name) {
    setForm(f => ({
      ...f,
      membersOnDuty: f.membersOnDuty.includes(name)
        ? f.membersOnDuty.filter(m => m !== name)
        : [...f.membersOnDuty, name],
    }));
  }
  function setEvent(i, key, val) {
    setForm(f => {
      const evts = [...f.events];
      evts[i] = { ...evts[i], [key]: val };
      return { ...f, events: evts };
    });
  }
  function addEvent() { setForm(f => ({ ...f, events: [...f.events, { time: '', entry: '' }] })); }
  function removeEvent(i) { setForm(f => ({ ...f, events: f.events.filter((_, j) => j !== i) })); }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...form, id: form.id ?? Date.now(), events: form.events.filter(e => e.entry.trim()) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-red-700 rounded-t-2xl">
          <h2 className="text-base font-bold text-white">{initial ? 'Edit Log Entry' : 'New Daily Log Entry'}</h2>
          <button onClick={onClose} aria-label="Close" className="text-red-200 hover:text-white"><XCircle size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} required
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Shift</label>
              <select value={form.shift} onChange={e => set('shift', e.target.value)}
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100">
                {SHIFTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Officer on Duty</label>
              <select value={form.officerOnDuty} onChange={e => set('officerOnDuty', e.target.value)}
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100">
                <option value="">Select officer…</option>
                {officers.map(o => <option key={o.id} value={o.name}>{o.name} — {o.rank}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Weather Conditions</label>
              <input value={form.weatherConditions} onChange={e => set('weatherConditions', e.target.value)}
                placeholder="e.g. Clear, 42°F, calm winds"
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Call Count</label>
              <input type="number" min="0" value={form.callCount} onChange={e => set('callCount', +e.target.value)}
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100" />
            </div>
          </div>

          {/* Checks */}
          <div className="flex gap-6">
            {[['apparatusChecked', 'Apparatus check completed'], ['stationChecked', 'Station check completed']].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)} className="rounded" />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</span>
              </label>
            ))}
          </div>

          {/* Members */}
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Members on Duty</p>
            <div className="flex flex-wrap gap-2">
              {members.filter(m => m.name !== form.officerOnDuty).map(m => (
                <button type="button" key={m.id} onClick={() => toggleMember(m.name)}
                  className={`text-[10px] font-semibold rounded-full px-2.5 py-1 border transition-colors ${
                    form.membersOnDuty.includes(m.name)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                  }`}>{m.name}</button>
              ))}
            </div>
          </div>

          {/* Events */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Shift Log Entries</label>
              <button type="button" onClick={addEvent}
                className="text-[10px] font-semibold text-red-600 dark:text-red-400 hover:text-red-700">+ Add Entry</button>
            </div>
            <div className="space-y-2">
              {form.events.map((e, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <input value={e.time} onChange={ev => setEvent(i, 'time', ev.target.value)}
                    placeholder="HH:MM" className="w-16 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-red-300 flex-shrink-0 dark:bg-gray-900 dark:text-gray-100" />
                  <DictateTextarea value={e.entry} onChange={ev => setEvent(i, 'entry', ev.target.value)}
                    placeholder="Log entry…" rows={2}
                    className="flex-1 text-xs" />
                  {form.events.length > 1 && (
                    <button type="button" onClick={() => removeEvent(i)} aria-label="Remove log entry" className="text-gray-300 dark:text-gray-600 hover:text-red-500 mt-1"><XCircle size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Visitors</label>
            <input value={form.visitors} onChange={e => set('visitors', e.target.value)}
              placeholder="Name, organization, purpose"
              className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Officer Notes</label>
            <DictateTextarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700">Cancel</button>
            <button type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700">
              {initial ? 'Save Changes' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function StationLog() {
  const [log,        setLog]        = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [formOpen,   setFormOpen]   = useState(false);
  const [editing,    setEditing]    = useState(null);

  const fetchLog = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get('/api/station-log');
      setLog(res.data);
    } catch (err) {
      setError(err.message || 'Could not load station log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const filtered = log.filter(e => {
    const q = search.toLowerCase();
    return !q
      || e.date.includes(q)
      || e.officerOnDuty.toLowerCase().includes(q)
      || (e.events || []).some(ev => ev.entry.toLowerCase().includes(q));
  });

  const stats = {
    entries: log.length,
    totalCalls: log.reduce((s, e) => s + (e.callCount || 0), 0),
    checksComplete: log.filter(e => e.apparatusChecked && e.stationChecked).length,
  };

  async function handleSave(data) {
    try {
      if (data.id && log.find(e => e.id === data.id)) {
        await api.patch(`/api/station-log/${data.id}`, data);
      } else {
        await api.post('/api/station-log', data);
      }
      await fetchLog();
    } catch (err) {
      alert(err.message || 'Failed to save log entry');
    }
    setFormOpen(false); setEditing(null);
  }
  function openEdit(entry) { setEditing(entry); setFormOpen(true); }

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-gray-400">
      <Loader2 className="h-8 w-8 animate-spin mr-3" />
      <span className="text-sm">Loading station log…</span>
    </div>
  );

  if (error) return (
    <div className="rounded-xl bg-red-50 dark:bg-red-950/50 ring-1 ring-red-200 p-8 text-center">
      <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Could not load station log</p>
      <p className="text-xs text-red-500 mb-4">{error}</p>
      <button onClick={fetchLog} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">Retry</button>
    </div>
  );

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100">Station Daily Log</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Shift journal · Activity record · Officer notes</p>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true); }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-sm">
          <Plus size={15} /> New Entry
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: 'Log Entries',     value: stats.entries,      color: 'text-gray-900 dark:text-gray-100' },
          { label: 'Total Calls',     value: stats.totalCalls,   color: 'text-red-700 dark:text-red-300'  },
          { label: 'Full Checks',     value: stats.checksComplete, color: 'text-green-700 dark:text-green-300' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 px-4 py-3 shadow-sm">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by date, officer, or log entry text…"
          aria-label="Search station log"
          className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100" />
      </div>

      {/* Log list */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[0.8fr_0.7fr_1.2fr_0.6fr_0.6fr_1fr_0.6fr_24px] gap-4 px-5 py-2.5 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          <span>Date</span>
          <span>Shift</span>
          <span>Officer on Duty</span>
          <span>Calls</span>
          <span>App. Check</span>
          <span>Members</span>
          <span>Entries</span>
          <span />
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-12">No log entries match your search.</p>
        )}

        {filtered.map(entry => {
          const isOpen = expandedId === entry.id;
          return (
            <div key={entry.id} className="border-b border-gray-50 dark:border-gray-800 last:border-b-0">
              <div
                onClick={() => setExpandedId(isOpen ? null : entry.id)}
                role="button" tabIndex={0} aria-expanded={isOpen} aria-label={`Toggle log details for ${entry.date}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isOpen ? null : entry.id); } }}
                className="grid grid-cols-[0.8fr_0.7fr_1.2fr_0.6fr_0.6fr_1fr_0.6fr_24px] gap-4 px-5 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 items-center"
              >
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{entry.date}</span>
                <span className="text-xs text-gray-600 dark:text-gray-300">{entry.shift}</span>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{entry.officerOnDuty}</span>
                <span className={`text-sm font-black ${entry.callCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
                  {entry.callCount > 0 ? entry.callCount : '—'}
                </span>
                <span className="flex items-center gap-1">
                  <Check yes={entry.apparatusChecked && entry.stationChecked} />
                </span>
                <div className="flex items-center gap-1">
                  <Users size={11} className="text-gray-400" />
                  <span className="text-xs text-gray-600 dark:text-gray-300">{(entry.membersOnDuty?.length ?? 0) + 1}</span>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{entry.events?.length ?? 0} entries</span>
                {isOpen
                  ? <ChevronUp size={14} className="text-gray-400" />
                  : <ChevronDown size={14} className="text-gray-400" />
                }
              </div>
              {isOpen && <LogDetail entry={entry} onEdit={openEdit} />}
            </div>
          );
        })}
      </div>

      {formOpen && (
        <StationLogForm initial={editing} onSave={handleSave} onClose={() => { setFormOpen(false); setEditing(null); }} />
      )}
    </div>
  );
}
