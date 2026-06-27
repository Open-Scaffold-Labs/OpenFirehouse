import { useState, useMemo, Fragment, useEffect, useCallback } from 'react';
import {
  Clock, Users, TrendingUp, Award,
  Search, ChevronDown, ChevronUp, Plus, Pencil, Trash2,
  FileText, Calendar, Filter, Loader2,
} from 'lucide-react';
import { ACTIVITY_TYPES, ACTIVITY_COLORS } from '../data/volunteerHours';
import { api } from '../utils/api';
import HoursForm from './HoursForm';
import DeleteConfirm from './DeleteConfirm';

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${m}/${d}/${y}`;
}

function currentYear() { return new Date().getFullYear(); }

function hoursLabel(h) {
  if (h === null || h === undefined) return '—';
  return h % 1 === 0 ? `${h}h` : `${h}h`;
}

// ─── activity badge ───────────────────────────────────────────────────────────

function ActivityBadge({ type }) {
  const cls = ACTIVITY_COLORS[type] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{type}</span>;
}

// ─── stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${color} shrink-0`}><Icon size={20} className="text-white" /></div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── member summary row ───────────────────────────────────────────────────────

function MemberRow({ member, entries, rank, onClick, isExpanded }) {
  const total     = entries.reduce((s, e) => s + (e.hours || 0), 0);
  const byType    = {};
  entries.forEach((e) => { byType[e.activityType] = (byType[e.activityType] || 0) + (e.hours || 0); });
  const topType   = Object.entries(byType).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  const incidents = entries.filter((e) => e.activityType === 'Incident Response').reduce((s, e) => s + (e.hours || 0), 0);

  // rank medal
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

  return (
    <tr
      className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 flex items-center justify-center text-xs font-bold shrink-0">
            {member.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">{medal && <span className="mr-1">{medal}</span>}{member.name}</p>
            <p className="text-xs text-gray-400">{member.rank}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{total}</span>
        <span className="text-xs text-gray-400 ml-1">hrs</span>
      </td>
      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{entries.length}</td>
      <td className="px-4 py-3">
        {incidents > 0
          ? <span className="text-sm font-medium text-red-600 dark:text-red-400">{incidents}h</span>
          : <span className="text-gray-400">—</span>}
      </td>
      <td className="px-4 py-3">
        {topType !== '—' ? <ActivityBadge type={topType} /> : <span className="text-gray-400">—</span>}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          aria-label={`Expand ${member.name} volunteer hours details`}
          aria-expanded={isExpanded}
          className="p-0.5 ml-auto"
        >
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </td>
    </tr>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function VolunteerHours() {
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error,   setError]       = useState(null);
  const [view, setView]           = useState('members');   // 'members' | 'log'
  const [search, setSearch]       = useState('');
  const [filterType, setFilterType]     = useState('');
  const [filterMember, setFilterMember] = useState('');
  const [filterYear, setFilterYear]     = useState(String(currentYear()));
  const [sortKey, setSortKey]     = useState('total');
  const [sortAsc, setSortAsc]     = useState(false);
  const [expandedMember, setExpandedMember] = useState(null);
  const [expandedLog, setExpandedLog]       = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    try { setLoading(true); setError(null); const r = await api.get('/api/volunteer-hours'); setRecords(r.data ?? []); }
    catch(e) { setError('Could not load volunteer hours.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── year options ──
  const years = useMemo(() => {
    const ys = [...new Set(records.map((r) => r.date?.slice(0, 4)))].filter(Boolean).sort().reverse();
    return ['All Years', ...ys];
  }, [records]);

  // ── filtered records ──
  const filtered = useMemo(() => {
    let r = records;
    if (filterYear !== 'All Years') r = r.filter((x) => x.date?.startsWith(filterYear));
    if (filterType)   r = r.filter((x) => x.activityType === filterType);
    if (filterMember) r = r.filter((x) => x.memberName === filterMember);
    if (search)
      r = r.filter((x) =>
        x.memberName.toLowerCase().includes(search.toLowerCase()) ||
        x.description?.toLowerCase().includes(search.toLowerCase()) ||
        x.activityType.toLowerCase().includes(search.toLowerCase()) ||
        x.reference?.toLowerCase().includes(search.toLowerCase())
      );
    return r;
  }, [records, filterYear, filterType, filterMember, search]);

  // ── stats ──
  const totalHours = useMemo(() => filtered.reduce((s, r) => s + (r.hours || 0), 0), [filtered]);
  const activeCount = useMemo(() => new Set(filtered.map((r) => r.memberId)).size, [filtered]);
  const incidentHours = useMemo(() => filtered.filter((r) => r.activityType === 'Incident Response').reduce((s, r) => s + (r.hours || 0), 0), [filtered]);

  // ── member summaries ──
  const memberSummaries = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      if (!map[r.memberId]) {
        map[r.memberId] = { member: { name: r.memberName, rank: '' }, entries: [], memberId: r.memberId };
      }
      map[r.memberId].entries.push(r);
    });
    return Object.values(map).map((s) => ({
      ...s,
      total: s.entries.reduce((sum, e) => sum + (e.hours || 0), 0),
    })).sort((a, b) => {
      if (sortKey === 'total')  return sortAsc ? a.total - b.total : b.total - a.total;
      if (sortKey === 'name')   return sortAsc ? a.member.name.localeCompare(b.member.name) : b.member.name.localeCompare(a.member.name);
      if (sortKey === 'entries') return sortAsc ? a.entries.length - b.entries.length : b.entries.length - a.entries.length;
      return 0;
    });
  }, [filtered, sortKey, sortAsc]);

  // top contributor
  const topContributor = memberSummaries[0]?.member?.name?.split(' ').slice(-1)[0] ?? '—';

  // ── log sort ──
  const logSorted = useMemo(() =>
    [...filtered].sort((a, b) => b.date > a.date ? 1 : -1),
    [filtered]
  );

  function toggleSort(key) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }
  function SortIcon({ col }) {
    if (sortKey !== col) return <ChevronDown size={14} className="text-gray-400" />;
    return sortAsc ? <ChevronUp size={14} className="text-red-600 dark:text-red-400" /> : <ChevronDown size={14} className="text-red-600 dark:text-red-400" />;
  }

  async function handleSave(entry) {
    try {
      if (editEntry) {
        const res = await api.patch(`/api/volunteer-hours/${entry.id}`, entry);
        setRecords((prev) => prev.map((r) => (r.id === entry.id ? res.data : r)));
      } else {
        const res = await api.post('/api/volunteer-hours', entry);
        setRecords((prev) => [...prev, res.data]);
      }
      setShowForm(false); setEditEntry(null);
    } catch(e) { console.error('Failed to save hours entry', e); }
  }
  async function handleDelete() {
    try {
      await api.delete(`/api/volunteer-hours/${deleteTarget.id}`);
      setRecords((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch(e) { console.error('Failed to delete hours entry', e); }
  }

  const memberNames = useMemo(() => [...new Set(records.map((r) => r.memberName))].sort(), [records]);

  if (loading) return <div className="p-6 flex items-center gap-2 text-gray-500 dark:text-gray-400"><Loader2 size={16} className="animate-spin" /> Loading volunteer hours…</div>;
  if (error)   return <div className="p-6 space-y-2"><p className="text-red-600 dark:text-red-400 text-sm">{error}</p><button onClick={load} className="text-sm text-red-600 dark:text-red-400 underline">Retry</button></div>;

  return (
    <div className="space-y-6">

      {/* ── stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Hours"       value={totalHours}      icon={Clock}      color="bg-indigo-500" sub={filterYear !== 'All Years' ? filterYear : 'all time'} />
        <StatCard label="Active Members"    value={activeCount}     icon={Users}      color="bg-blue-500"   sub="with logged hours" />
        <StatCard label="Incident Hours"    value={incidentHours}   icon={TrendingUp} color="bg-red-500"    sub="emergency response" />
        <StatCard label="Top Contributor"   value={topContributor}  icon={Award}      color="bg-amber-500"  sub={`${memberSummaries[0]?.total ?? 0} hrs`} />
      </div>

      {/* ── toolbar ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-3 flex-1">
            {/* view toggle */}
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm font-medium">
              <button
                onClick={() => setView('members')}
                className={`px-4 py-2 transition-colors ${view === 'members' ? 'bg-red-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              >
                By Member
              </button>
              <button
                onClick={() => setView('log')}
                className={`px-4 py-2 transition-colors ${view === 'log' ? 'bg-red-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              >
                Full Log
              </button>
            </div>

            <div className="relative min-w-[180px] flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search member, activity, notes…"
                aria-label="Search volunteer hours"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} aria-label="Filter by year"
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100">
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>

            <select value={filterMember} onChange={(e) => setFilterMember(e.target.value)} aria-label="Filter by member"
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100">
              <option value="">All Members</option>
              {memberNames.map((n) => <option key={n}>{n}</option>)}
            </select>

            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="Filter by activity type"
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100">
              <option value="">All Activities</option>
              {ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>

          <button
            onClick={() => { setEditEntry(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus size={15} /> Log Hours
          </button>
        </div>
      </div>

      {/* ── MEMBER VIEW ── */}
      {view === 'members' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th scope="col" aria-sort={sortKey === 'name' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                    <button type="button" onClick={() => toggleSort('name')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Member <SortIcon col="name" /></button>
                  </th>
                  <th scope="col" aria-sort={sortKey === 'total' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                    <button type="button" onClick={() => toggleSort('total')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Total Hours <SortIcon col="total" /></button>
                  </th>
                  <th scope="col" aria-sort={sortKey === 'entries' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                    <button type="button" onClick={() => toggleSort('entries')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Entries <SortIcon col="entries" /></button>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Incident Hrs</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Top Activity</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {memberSummaries.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No hours match your filters.</td></tr>
                )}
                {memberSummaries.map((s, i) => (
                  <Fragment key={s.memberId}>
                    <MemberRow
                      member={s.member}
                      entries={s.entries}
                      rank={i + 1}
                      isExpanded={expandedMember === s.memberId}
                      onClick={() => setExpandedMember(expandedMember === s.memberId ? null : s.memberId)}
                    />
                    {expandedMember === s.memberId && (
                      <tr className="bg-gray-50 dark:bg-gray-950">
                        <td colSpan={6} className="px-6 py-3">
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                              {s.member.name} — {s.entries.length} entries
                            </p>
                            {s.entries
                              .sort((a, b) => b.date > a.date ? 1 : -1)
                              .map((e) => (
                                <div key={e.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                                  <span className="text-gray-400 whitespace-nowrap w-20">{fmt(e.date)}</span>
                                  <ActivityBadge type={e.activityType} />
                                  <span className="flex-1 text-gray-700 dark:text-gray-300 truncate">{e.description || '—'}</span>
                                  {e.reference && <span className="text-xs text-gray-400 whitespace-nowrap">{e.reference}</span>}
                                  <span className="font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap w-12 text-right">{hoursLabel(e.hours)}</span>
                                  <div className="flex gap-1">
                                    <button onClick={(ev) => { ev.stopPropagation(); setEditEntry(e); setShowForm(true); }} aria-label="Edit hours entry"
                                      className="p-1 text-gray-400 hover:text-blue-600 rounded"><Pencil size={12} /></button>
                                    <button onClick={(ev) => { ev.stopPropagation(); setDeleteTarget(e); }} aria-label="Delete hours entry"
                                      className="p-1 text-gray-400 hover:text-red-600 rounded"><Trash2 size={12} /></button>
                                  </div>
                                </div>
                              ))}
                            {/* hours by activity breakdown */}
                            <div className="pt-3 flex flex-wrap gap-3">
                              {Object.entries(
                                s.entries.reduce((acc, e) => {
                                  acc[e.activityType] = (acc[e.activityType] || 0) + (e.hours || 0);
                                  return acc;
                                }, {})
                              ).sort((a, b) => b[1] - a[1]).map(([type, hrs]) => (
                                <div key={type} className="flex items-center gap-1.5 text-xs">
                                  <ActivityBadge type={type} />
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">{hrs}h</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-xs text-gray-500 dark:text-gray-400">
            {memberSummaries.length} member{memberSummaries.length !== 1 ? 's' : ''} · {totalHours} total hours
          </div>
        </div>
      )}

      {/* ── FULL LOG VIEW ── */}
      {view === 'log' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Member</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Activity</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Description</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Ref #</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Hours</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {logSorted.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No entries match your filters.</td></tr>
                )}
                {logSorted.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmt(entry.date)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap">{entry.memberName}</td>
                    <td className="px-4 py-3"><ActivityBadge type={entry.activityType} /></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-xs truncate">{entry.description || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{entry.reference || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800 dark:text-gray-100">{hoursLabel(entry.hours)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => { setEditEntry(entry); setShowForm(true); }} aria-label="Edit hours entry"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors"><Pencil size={14} /></button>
                        <button onClick={() => setDeleteTarget(entry)} aria-label="Delete hours entry"
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-xs text-gray-500 dark:text-gray-400">
            {logSorted.length} entr{logSorted.length !== 1 ? 'ies' : 'y'} · {totalHours} total hours
          </div>
        </div>
      )}

      {/* modals */}
      {showForm && (
        <HoursForm
          entry={editEntry}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditEntry(null); }}
          existingIds={records.map((r) => r.id)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          member={{ name: `${fmt(deleteTarget.date)} — ${deleteTarget.memberName} (${hoursLabel(deleteTarget.hours)})`, id: deleteTarget.id }}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
