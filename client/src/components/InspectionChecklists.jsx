import { useState, useMemo, useEffect } from 'react';
import {
  ClipboardCheck, ClipboardList, Clock, CheckCircle2,
  AlertTriangle, XCircle, Play, History, Search,
  ChevronDown, ChevronUp, Calendar, User, Truck,
} from 'lucide-react';
import { FREQUENCIES } from '../data/checklists';
import { api } from '../utils/api';
import ChecklistRunner from './ChecklistRunner';

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function daysSince(iso) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso)) / (1000 * 60 * 60 * 24));
}

function dueThreshold(frequency) {
  return frequency === 'Daily' ? 1 : frequency === 'Weekly' ? 7 : 30;
}

function dueSince(template, history) {
  const last = history
    .filter((c) => c.templateId === template.id)
    .sort((a, b) => b.completedDate.localeCompare(a.completedDate))[0];
  if (!last) return Infinity;
  return daysSince(last.completedDate);
}

function statusLabel(days, threshold) {
  if (days > threshold * 2) return 'overdue';
  if (days > threshold)     return 'due';
  return 'current';
}

const STATUS_STYLES = {
  current:  { bg: 'bg-green-50 dark:bg-green-950/50',  text: 'text-green-700 dark:text-green-300',  dot: 'bg-green-500',  label: 'Current'  },
  due:      { bg: 'bg-amber-50 dark:bg-amber-950/50',  text: 'text-amber-700 dark:text-amber-300',  dot: 'bg-amber-500',  label: 'Due'      },
  overdue:  { bg: 'bg-red-50 dark:bg-red-950/50',    text: 'text-red-700 dark:text-red-300',    dot: 'bg-red-600',    label: 'Overdue'  },
};

const COMPLETION_STYLES = {
  'Pass':                 { bg: 'bg-green-100 dark:bg-green-950/50',  text: 'text-green-700 dark:text-green-300',  icon: CheckCircle2  },
  'Pass with Deficiency': { bg: 'bg-amber-100 dark:bg-amber-950/50',  text: 'text-amber-700 dark:text-amber-300',  icon: AlertTriangle },
  'Fail':                 { bg: 'bg-red-100 dark:bg-red-950/50',    text: 'text-red-700 dark:text-red-300',    icon: XCircle       },
};

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({ template, history, onStart, onViewHistory }) {
  const days      = dueSince(template, history);
  const threshold = dueThreshold(template.frequency);
  const status    = statusLabel(days, threshold);
  const s         = STATUS_STYLES[status];
  const lastRun   = history
    .filter((c) => c.templateId === template.id)
    .sort((a, b) => b.completedDate.localeCompare(a.completedDate))[0];
  const totalItems = template.categories.reduce((sum, c) => sum + c.items.length, 0);

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl border shadow-sm overflow-hidden ${status === 'overdue' ? 'border-red-200 dark:border-red-900' : status === 'due' ? 'border-amber-200 dark:border-amber-900' : 'border-gray-100 dark:border-gray-700'}`}>
      <div className={`h-1.5 ${s.dot}`} />
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-gray-900 dark:text-gray-100 leading-snug">{template.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
              <Truck size={11} /> {template.apparatus}
            </p>
          </div>
          <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
          </span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 text-center border-t border-gray-100 dark:border-gray-700 pt-3">
          <div>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{template.frequency}</p>
            <p className="text-xs text-gray-400">Frequency</p>
          </div>
          <div className="border-x border-gray-100 dark:border-gray-700">
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{totalItems}</p>
            <p className="text-xs text-gray-400">Items</p>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">~{template.estimatedMinutes}m</p>
            <p className="text-xs text-gray-400">Est. Time</p>
          </div>
        </div>

        {/* Last run */}
        {lastRun ? (
          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 border-t border-gray-100 dark:border-gray-700 pt-3">
            <Calendar size={11} className="text-gray-400" />
            Last: {fmtDate(lastRun.completedDate)} by {lastRun.completedBy.split(' ').pop()}
            {' · '}
            <span className={`font-semibold ${COMPLETION_STYLES[lastRun.status]?.text ?? ''}`}>{lastRun.status}</span>
          </div>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium border-t border-gray-100 dark:border-gray-700 pt-3">
            ⚠ No completions on record
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onStart(template)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 transition-colors"
          >
            <Play size={12} /> Start Inspection
          </button>
          <button
            onClick={() => onViewHistory(template)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <History size={12} /> History
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── History Row ──────────────────────────────────────────────────────────────

function HistoryRow({ entry }) {
  const [open, setOpen] = useState(false);
  const s = COMPLETION_STYLES[entry.status] ?? COMPLETION_STYLES['Pass'];
  const Icon = s.icon;
  const failCount = Object.values(entry.responses ?? {}).filter((r) => r.value === 'fail').length;

  return (
    <>
      <tr
        className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        <td className="py-2.5 px-3 text-sm font-medium text-gray-800 dark:text-gray-100">{entry.templateName}</td>
        <td className="py-2.5 px-3 text-sm text-gray-600 dark:text-gray-300">{entry.apparatus}</td>
        <td className="py-2.5 px-3 text-sm text-gray-600 dark:text-gray-300">{fmtDate(entry.completedDate)}</td>
        <td className="py-2.5 px-3 text-sm text-gray-600 dark:text-gray-300">{entry.completedBy}</td>
        <td className="py-2.5 px-3">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
            <Icon size={11} /> {entry.status}
          </span>
        </td>
        <td className="py-2.5 px-3 text-right">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            aria-label={`Expand ${entry.templateName} inspection details`}
            aria-expanded={open}
            className="p-0.5 ml-auto"
          >
            {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="px-3 pb-3">
            <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 text-sm space-y-2">
              {failCount > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-red-700 dark:text-red-300 uppercase tracking-wide">Deficiencies / Fails</p>
                  {Object.entries(entry.responses ?? {})
                    .filter(([, r]) => r.value === 'fail' && r.note)
                    .map(([itemId, r]) => (
                      <p key={itemId} className="text-xs text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
                        <span className="font-mono text-gray-400 mr-1">[{itemId}]</span>{r.note}
                      </p>
                    ))
                  }
                </div>
              )}
              {entry.notes && (
                <div>
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">Inspector Notes</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300">{entry.notes}</p>
                </div>
              )}
              {!failCount && !entry.notes && (
                <p className="text-xs text-gray-400">No deficiencies or notes recorded.</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InspectionChecklists() {
  const [templates,     setTemplates]     = useState([]);
  const [history,       setHistory]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [view,          setView]          = useState('templates'); // 'templates' | 'history'
  const [running,       setRunning]       = useState(null); // template being inspected
  const [search,        setSearch]        = useState('');
  const [freqFilter,    setFreqFilter]    = useState('All');
  const [historyFilter, setHistoryFilter] = useState('All');
  const [focusTemplate, setFocusTemplate] = useState(null); // filter history to one template

  // Fetch templates and completions on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const [tplRes, histRes] = await Promise.all([
          api.get('/api/checklist-templates'),
          api.get('/api/checklist-completions'),
        ]);
        const templates = Array.isArray(tplRes?.data) ? tplRes.data : Array.isArray(tplRes) ? tplRes : [];
        const history = Array.isArray(histRes?.data) ? histRes.data : Array.isArray(histRes) ? histRes : [];
        setTemplates(templates);
        setHistory(history);
      } catch (err) {
        console.error('Failed to fetch checklist data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Stats
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdueCount = templates.filter((t) => {
    const days = dueSince(t, history);
    return days > dueThreshold(t.frequency) * 2;
  }).length;
  const dueCount = templates.filter((t) => {
    const days = dueSince(t, history);
    const th   = dueThreshold(t.frequency);
    return days > th && days <= th * 2;
  }).length;
  const thisWeek = history.filter((c) => {
    const dt = new Date(c.completedDate);
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    return dt >= weekAgo;
  }).length;

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (freqFilter !== 'All' && t.frequency !== freqFilter) return false;
      const q = search.toLowerCase();
      return !q || t.name.toLowerCase().includes(q) || t.apparatus.toLowerCase().includes(q);
    });
  }, [templates, freqFilter, search]);

  // Filtered history
  const filteredHistory = useMemo(() => {
    let h = [...history].sort((a, b) => b.completedDate.localeCompare(a.completedDate));
    if (focusTemplate) h = h.filter((c) => c.templateId === focusTemplate.id);
    if (historyFilter !== 'All') h = h.filter((c) => c.status === historyFilter);
    if (search) {
      const q = search.toLowerCase();
      h = h.filter((c) => c.templateName.toLowerCase().includes(q) || c.apparatus.toLowerCase().includes(q) || c.completedBy.toLowerCase().includes(q));
    }
    return h;
  }, [history, focusTemplate, historyFilter, search]);

  async function handleComplete(completedEntry) {
    try {
      // Save to API
      const res = await api.post('/api/checklist-completions', completedEntry);
      // Update local state with the response
      setHistory((h) => [res.data, ...h]);
      setRunning(null);
    } catch (err) {
      console.error('Failed to save completion:', err);
      alert('Failed to save checklist completion. Please try again.');
    }
  }

  function handleViewHistory(template) {
    setFocusTemplate(template);
    setView('history');
  }

  // Inline checklist runner
  if (running) {
    return (
      <ChecklistRunner
        template={running}
        onComplete={handleComplete}
        onCancel={() => setRunning(null)}
      />
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border border-gray-300 dark:border-gray-700 border-t-red-700 mx-auto mb-3"></div>
        <p className="text-sm text-gray-400">Loading checklists…</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Inspection Checklists</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Daily, weekly, and monthly apparatus and station checks.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-start gap-3">
          <div className="p-2 bg-gray-50 dark:bg-gray-950 rounded-lg"><ClipboardList size={18} className="text-gray-700 dark:text-gray-300" /></div>
          <div><p className="text-xs text-gray-400">Templates</p><p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{templates.length}</p></div>
        </div>
        <div className={`bg-white dark:bg-gray-900 rounded-xl p-4 border shadow-sm flex items-start gap-3 ${overdueCount ? 'border-red-200 dark:border-red-900' : 'border-gray-100 dark:border-gray-700'}`}>
          <div className="p-2 bg-gray-50 dark:bg-gray-950 rounded-lg"><XCircle size={18} className="text-red-600 dark:text-red-400" /></div>
          <div><p className="text-xs text-gray-400">Overdue</p><p className={`text-2xl font-bold ${overdueCount ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'}`}>{overdueCount}</p></div>
        </div>
        <div className={`bg-white dark:bg-gray-900 rounded-xl p-4 border shadow-sm flex items-start gap-3 ${dueCount ? 'border-amber-200 dark:border-amber-900' : 'border-gray-100 dark:border-gray-700'}`}>
          <div className="p-2 bg-gray-50 dark:bg-gray-950 rounded-lg"><AlertTriangle size={18} className="text-amber-600 dark:text-amber-400" /></div>
          <div><p className="text-xs text-gray-400">Due Now</p><p className={`text-2xl font-bold ${dueCount ? 'text-amber-700 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}>{dueCount}</p></div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-start gap-3">
          <div className="p-2 bg-gray-50 dark:bg-gray-950 rounded-lg"><CheckCircle2 size={18} className="text-green-600 dark:text-green-400" /></div>
          <div><p className="text-xs text-gray-400">Completed This Week</p><p className="text-2xl font-bold text-green-700 dark:text-green-300">{thisWeek}</p></div>
        </div>
      </div>

      {/* View toggle + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
          {[{ key: 'templates', icon: ClipboardList, label: 'Checklists' },
            { key: 'history',   icon: History,       label: 'History'    }].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => { setView(key); if (key === 'templates') setFocusTemplate(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                view === key ? 'bg-white dark:bg-gray-900 shadow text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        {view === 'templates' && (
          <div className="flex gap-1.5">
            {['All', ...FREQUENCIES].map((f) => (
              <button key={f} onClick={() => setFreqFilter(f)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                  freqFilter === f ? 'bg-red-700 text-white border-red-700' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300'
                }`}>{f}</button>
            ))}
          </div>
        )}

        {view === 'history' && (
          <>
            {focusTemplate && (
              <div className="flex items-center gap-2">
                <span className="text-xs bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900 font-semibold px-2 py-1 rounded-full">
                  {focusTemplate.name}
                </span>
                <button onClick={() => setFocusTemplate(null)}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600">✕ Clear</button>
              </div>
            )}
            <div className="flex gap-1.5">
              {['All', 'Pass', 'Pass with Deficiency', 'Fail'].map((s) => (
                <button key={s} onClick={() => setHistoryFilter(s)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                    historyFilter === s ? 'bg-red-700 text-white border-red-700' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300'
                  }`}>{s}</button>
              ))}
            </div>
          </>
        )}

        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" aria-label="Search checklists" placeholder="Search…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100" />
        </div>
      </div>

      {/* Templates grid */}
      {view === 'templates' && (
        filteredTemplates.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
            <p>No checklists match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                history={history}
                onStart={setRunning}
                onViewHistory={handleViewHistory}
              />
            ))}
          </div>
        )
      )}

      {/* History table */}
      {view === 'history' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50 dark:bg-gray-950">
                <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                  <th className="text-left py-3 px-3">Checklist</th>
                  <th className="text-left py-3 px-3">Apparatus</th>
                  <th className="text-left py-3 px-3">Date</th>
                  <th className="text-left py-3 px-3">Inspector</th>
                  <th className="text-left py-3 px-3">Result</th>
                  <th className="py-3 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-400">No records found.</td>
                  </tr>
                ) : (
                  filteredHistory.map((entry) => (
                    <HistoryRow key={entry.id} entry={entry} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
