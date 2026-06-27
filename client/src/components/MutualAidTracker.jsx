import { useState, useMemo, Fragment, useEffect, useCallback } from 'react';
import {
  Handshake, ArrowUpRight, ArrowDownLeft, Users, Truck,
  Search, ChevronDown, ChevronUp, ChevronRight, Plus, Pencil, Trash2,
  MapPin, Clock, FileText, Building2, AlertCircle, Loader2,
} from 'lucide-react';
import { AID_DIRECTIONS, AID_INCIDENT_TYPES, AID_STATUSES } from '../data/mutualAid';
import { api } from '../utils/api';
import MutualAidForm from './MutualAidForm';
import DeleteConfirm from './DeleteConfirm';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';
import AIActionButton from './AIActionButton';

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${m}/${d}/${y}`;
}

function durationLabel(req, clr) {
  if (!req || !clr) return '—';
  const [rh, rm] = req.split(':').map(Number);
  const [ch, cm] = clr.split(':').map(Number);
  let mins = (ch * 60 + cm) - (rh * 60 + rm);
  if (mins < 0) mins += 1440; // crossed midnight
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function currentYear() { return new Date().getFullYear(); }

// ─── direction badge ──────────────────────────────────────────────────────────

function DirectionBadge({ direction }) {
  if (direction === 'Given')
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
        <ArrowUpRight size={11} /> Given
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
      <ArrowDownLeft size={11} /> Received
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    Completed: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
    Active:    'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300',
    Cancelled: 'bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
      {status}
    </span>
  );
}

// ─── stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${color} shrink-0`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function MutualAidTracker() {
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState(null);
  const [search, setSearch]     = useState('');
  const [filterDir, setFilterDir]   = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterYear, setFilterYear] = useState(String(currentYear()));
  const [sortKey, setSortKey]   = useState('date');
  const [sortAsc, setSortAsc]   = useState(false);
  const [expanded, setExpanded] = useState(null);

  const [showForm, setShowForm]         = useState(false);
  const [editRecord, setEditRecord]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    try { setLoading(true); setError(null); const raw = await api.get('/api/mutual-aid'); const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : []; setRecords(arr); }
    catch(e) { setError('Could not load mutual aid records.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── year options ──
  const years = useMemo(() => {
    const ys = [...new Set(records.map((r) => r.date?.slice(0, 4)))].filter(Boolean).sort().reverse();
    return ['All Years', ...ys];
  }, [records]);

  // ── stats ──
  const yearRecords = useMemo(
    () => filterYear === 'All Years' ? records : records.filter((r) => r.date?.startsWith(filterYear)),
    [records, filterYear]
  );
  const givenCount    = useMemo(() => yearRecords.filter((r) => r.direction === 'Given').length, [yearRecords]);
  const receivedCount = useMemo(() => yearRecords.filter((r) => r.direction === 'Received').length, [yearRecords]);
  const totalPersonnel = useMemo(() => yearRecords.reduce((s, r) => s + (r.personnelCount || 0), 0), [yearRecords]);

  // top partner
  const topPartner = useMemo(() => {
    const counts = {};
    yearRecords.forEach((r) => {
      const key = r.partnerDepartment;
      counts[key] = (counts[key] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? sorted[0][0].split(' – ')[0] : '—';
  }, [yearRecords]);

  // ── filter + sort ──
  const visible = useMemo(() => {
    let r = records;
    if (filterYear !== 'All Years') r = r.filter((x) => x.date?.startsWith(filterYear));
    if (search)
      r = r.filter((x) =>
        x.partnerDepartment?.toLowerCase().includes(search.toLowerCase()) ||
        x.address?.toLowerCase().includes(search.toLowerCase()) ||
        x.incidentType?.toLowerCase().includes(search.toLowerCase()) ||
        x.incidentNumber?.toLowerCase().includes(search.toLowerCase())
      );
    if (filterDir)  r = r.filter((x) => x.direction === filterDir);
    if (filterType) r = r.filter((x) => x.incidentType === filterType);

    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [records, search, filterDir, filterType, filterYear, sortKey, sortAsc]);

  function toggleSort(key) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }
  function SortIcon({ col }) {
    if (sortKey !== col) return <ChevronDown size={14} className="text-gray-400" />;
    return sortAsc ? <ChevronUp size={14} className="text-red-600 dark:text-red-400" /> : <ChevronDown size={14} className="text-red-600 dark:text-red-400" />;
  }

  // ── crud ──
  async function handleSave(rec) {
    try {
      if (editRecord) {
        const res = await api.patch(`/api/mutual-aid/${rec.id}`, rec);
        setRecords((prev) => prev.map((r) => (r.id === rec.id ? res.data : r)));
      } else {
        const res = await api.post('/api/mutual-aid', rec);
        setRecords((prev) => [...prev, res.data]);
      }
      setShowForm(false); setEditRecord(null);
    } catch(e) { console.error('Failed to save mutual aid record', e); }
  }
  async function handleDelete() {
    try {
      await api.delete(`/api/mutual-aid/${deleteTarget.id}`);
      setRecords((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch(e) { console.error('Failed to delete mutual aid record', e); }
  }

  // ─── render ───────────────────────────────────────────────────────────────

  if (loading) return <div className="p-6 flex items-center gap-2 text-gray-500 dark:text-gray-400"><Loader2 size={16} className="animate-spin" /> Loading mutual aid records…</div>;
  if (error)   return <div className="p-6 space-y-2"><p className="text-red-600 dark:text-red-400 text-sm">{error}</p><button onClick={load} className="text-sm text-red-600 dark:text-red-400 underline">Retry</button></div>;

  return (
    <div className="space-y-6">

      {/* ── stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Events"        value={yearRecords.length}  icon={Handshake}    color="bg-indigo-500" sub={filterYear === 'All Years' ? 'all time' : filterYear} />
        <StatCard label="Aid Given"           value={givenCount}          icon={ArrowUpRight} color="bg-blue-500"   sub="to neighboring departments" />
        <StatCard label="Aid Received"        value={receivedCount}       icon={ArrowDownLeft} color="bg-emerald-500" sub="from neighboring departments" />
        <StatCard label="Personnel Deployed"  value={totalPersonnel}      icon={Users}        color="bg-red-500"   sub={`top partner: ${topPartner}`} />
      </div>

      {/* ── toolbar ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-3 flex-1">
            <div className="relative min-w-[200px] flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search department, address, type…"
                aria-label="Search mutual aid records"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
              aria-label="Filter by year"
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100">
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>

            <select value={filterDir} onChange={(e) => setFilterDir(e.target.value)}
              aria-label="Filter by direction"
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100">
              <option value="">All Directions</option>
              {AID_DIRECTIONS.map((d) => <option key={d}>{d}</option>)}
            </select>

            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
              aria-label="Filter by incident type"
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100">
              <option value="">All Types</option>
              {AID_INCIDENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>

          <button
            onClick={() => { setEditRecord(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus size={15} /> Log Mutual Aid
          </button>
        </div>
      </div>

      {/* ── table ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th scope="col" aria-sort={sortKey === 'date' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  <button type="button" onClick={() => toggleSort('date')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Date <SortIcon col="date" /></button>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Direction</th>
                <th scope="col" aria-sort={sortKey === 'partnerDepartment' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  <button type="button" onClick={() => toggleSort('partnerDepartment')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Partner Department <SortIcon col="partnerDepartment" /></button>
                </th>
                <th scope="col" aria-sort={sortKey === 'incidentType' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  <button type="button" onClick={() => toggleSort('incidentType')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Type <SortIcon col="incidentType" /></button>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Personnel</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Duration</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    No mutual aid records match your filters.
                  </td>
                </tr>
              )}
              {visible.map((rec) => (
                <Fragment key={rec.id}>
                  <tr
                    className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExpanded(expanded === rec.id ? null : rec.id); }}
                          aria-label={`Expand mutual aid record with ${rec.partnerDepartment} details`}
                          aria-expanded={expanded === rec.id}
                          className="p-0.5"
                        >
                          <ChevronRight size={14} className="text-gray-400" />
                        </button>
                        {formatDate(rec.date)}
                      </span>
                    </td>
                    <td className="px-4 py-3"><DirectionBadge direction={rec.direction} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-gray-400 shrink-0" />
                        <span className="font-medium text-gray-800 dark:text-gray-100">{rec.partnerDepartment}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{rec.incidentType}</td>
                    <td className="px-4 py-3"><StatusBadge status={rec.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                        <Users size={13} className="text-gray-400" />
                        {rec.personnelCount ?? '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {durationLabel(rec.requestTime, rec.clearTime)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditRecord(rec); setShowForm(true); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors"
                          title="Edit"
                          aria-label="Edit mutual aid record"
                        ><Pencil size={14} /></button>
                        <button
                          onClick={() => setDeleteTarget(rec)}
                          className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors"
                          title="Delete"
                          aria-label="Delete mutual aid record"
                        ><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>

                  {/* expanded detail */}
                  {expanded === rec.id && (
                    <tr className="bg-gray-50 dark:bg-gray-950">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="flex items-start gap-2">
                            <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Address</p>
                              <p className="text-gray-700 dark:text-gray-300">{rec.address || '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Clock size={14} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Time</p>
                              <p className="text-gray-700 dark:text-gray-300">{rec.requestTime ?? '—'} – {rec.clearTime ?? '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Truck size={14} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Units</p>
                              <p className="text-gray-700 dark:text-gray-300">
                                {rec.unitsDeployed?.length > 0 ? rec.unitsDeployed.join(', ') : '—'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <FileText size={14} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Incident #</p>
                              <p className="text-gray-700 dark:text-gray-300">{rec.incidentNumber || '—'}</p>
                            </div>
                          </div>
                          {rec.notes && (
                            <div className="col-span-2 md:col-span-4 flex items-start gap-2">
                              <AlertCircle size={14} className="text-gray-400 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Notes</p>
                                <p className="text-gray-700 dark:text-gray-300">{rec.notes}</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* AI Actions */}
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">AI Actions</p>
                          <div className="flex flex-wrap gap-2">
                            <AIActionButton
                              action="generate_mutual_aid_docs"
                              context={{ module: 'mutualaid', recordId: rec.id, data: rec }}
                              label="Generate Documentation"
                              variant="inline"
                              resultType="json"
                            />
                          </div>
                        </div>

                        {/* Linked Meetings */}
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                          <LinkedMeetings module="mutualaid" recordId={rec.id} recordLabel={rec.partnerDepartment || 'Activation'} />
                          <Attachments module="mutualaid" recordId={rec.id} recordLabel={rec.partnerDepartment || 'Activation'} />
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
          Showing {visible.length} of {records.length} record{records.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* partner summary */}
      <PartnerSummary records={yearRecords} />

      {/* modals */}
      {showForm && (
        <MutualAidForm
          record={editRecord}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditRecord(null); }}
          existingIds={records.map((r) => r.id)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          member={{ name: `${formatDate(deleteTarget.date)} – ${deleteTarget.partnerDepartment}`, id: deleteTarget.id }}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ─── partner summary card ─────────────────────────────────────────────────────

function PartnerSummary({ records }) {
  const partners = useMemo(() => {
    const map = {};
    records.forEach((r) => {
      if (!map[r.partnerDepartment]) map[r.partnerDepartment] = { given: 0, received: 0, personnel: 0 };
      if (r.direction === 'Given') map[r.partnerDepartment].given++;
      else map[r.partnerDepartment].received++;
      map[r.partnerDepartment].personnel += r.personnelCount || 0;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v, total: v.given + v.received }))
      .sort((a, b) => b.total - a.total);
  }, [records]);

  if (partners.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <Handshake size={16} className="text-red-600 dark:text-red-400" />
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">Partner Department Summary</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700">
            <tr>
              <th className="text-left px-5 py-2.5 font-semibold text-gray-600 dark:text-gray-300">Department</th>
              <th className="text-center px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300">Aid Given</th>
              <th className="text-center px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300">Aid Received</th>
              <th className="text-center px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300">Total Events</th>
              <th className="text-center px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-300">Personnel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {partners.map((p) => (
              <tr key={p.name} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-5 py-2.5 font-medium text-gray-800 dark:text-gray-100">{p.name}</td>
                <td className="px-4 py-2.5 text-center">
                  {p.given > 0 ? (
                    <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300 font-semibold">
                      <ArrowUpRight size={12} />{p.given}
                    </span>
                  ) : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {p.received > 0 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-semibold">
                      <ArrowDownLeft size={12} />{p.received}
                    </span>
                  ) : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2.5 text-center font-semibold text-gray-700 dark:text-gray-300">{p.total}</td>
                <td className="px-4 py-2.5 text-center text-gray-600 dark:text-gray-300">{p.personnel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
