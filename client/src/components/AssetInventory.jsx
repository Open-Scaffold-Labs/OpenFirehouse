import { useState, useMemo, useEffect, useCallback, Fragment } from 'react';
import {
  Package, AlertTriangle, Clock, CheckCircle2, Wrench,
  Search, ChevronDown, ChevronUp, ChevronRight, Plus, Pencil, Trash2,
  MapPin, User, Tag, Calendar, FileText, ShieldAlert,
} from 'lucide-react';
import { ASSET_CATEGORIES, ASSET_CONDITIONS } from '../data/assets';
import { api } from '../utils/api';
import AssetForm from './AssetForm';
import DeleteConfirm from './DeleteConfirm';

// ─── helpers ─────────────────────────────────────────────────────────────────

const today = new Date();
today.setHours(0, 0, 0, 0);
const WARN_DAYS = 30;

function daysDiff(str) {
  if (!str) return null;
  return Math.round((new Date(str) - today) / 86_400_000);
}

function fmt(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${m}/${d}/${y}`;
}

function inspectionStatus(asset) {
  const diff = daysDiff(asset.nextInspectionDue);
  if (diff === null) return null;
  if (diff < 0)           return 'overdue';
  if (diff <= WARN_DAYS)  return 'soon';
  return 'ok';
}

// ─── badges ──────────────────────────────────────────────────────────────────

function ConditionBadge({ condition }) {
  const map = {
    'Serviceable':        'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300',
    'Needs Maintenance':  'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
    'Out of Service':     'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300',
    'Retired':            'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[condition] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
      {condition}
    </span>
  );
}

function InspectionBadge({ asset }) {
  const st   = inspectionStatus(asset);
  const diff = daysDiff(asset.nextInspectionDue);
  if (!st) return null;
  if (st === 'overdue')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">
        <AlertTriangle size={10} /> Overdue
      </span>
    );
  if (st === 'soon')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
        <Clock size={10} /> {diff === 0 ? 'Due Today' : `Due in ${diff}d`}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 size={10} /> Current
    </span>
  );
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

// ─── main ─────────────────────────────────────────────────────────────────────

export default function AssetInventory() {
  const [assets, setAssets]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterCat, setFilterCat]   = useState('');
  const [filterCond, setFilterCond] = useState('');
  const [filterInsp, setFilterInsp] = useState('');
  const [sortKey, setSortKey]     = useState('name');
  const [sortAsc, setSortAsc]     = useState(true);
  const [expanded, setExpanded]   = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [editAsset, setEditAsset] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchAssets = useCallback(async () => {
    try {
      const res = await api.get('/api/assets');
      setAssets(res.data ?? []);
    } catch (e) {
      console.error('Failed to fetch assets', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  // ── stats ──
  const serviceable    = useMemo(() => assets.filter((a) => a.condition === 'Serviceable').length, [assets]);
  const needsMaint     = useMemo(() => assets.filter((a) => a.condition === 'Needs Maintenance').length, [assets]);
  const outOfService   = useMemo(() => assets.filter((a) => a.condition === 'Out of Service').length, [assets]);
  const overdueCount   = useMemo(() => assets.filter((a) => inspectionStatus(a) === 'overdue').length, [assets]);
  const soonCount      = useMemo(() => assets.filter((a) => inspectionStatus(a) === 'soon').length, [assets]);

  // ── filter + sort ──
  const visible = useMemo(() => {
    let r = assets;
    if (search)
      r = r.filter((a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.serialNumber?.toLowerCase().includes(search.toLowerCase()) ||
        a.assignedTo?.toLowerCase().includes(search.toLowerCase()) ||
        a.location?.toLowerCase().includes(search.toLowerCase())
      );
    if (filterCat)  r = r.filter((a) => a.category === filterCat);
    if (filterCond) r = r.filter((a) => a.condition === filterCond);
    if (filterInsp === 'overdue') r = r.filter((a) => inspectionStatus(a) === 'overdue');
    if (filterInsp === 'soon')    r = r.filter((a) => inspectionStatus(a) === 'soon');
    if (filterInsp === 'current') r = r.filter((a) => inspectionStatus(a) === 'ok');

    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [assets, search, filterCat, filterCond, filterInsp, sortKey, sortAsc]);

  function toggleSort(key) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  }
  function SortIcon({ col }) {
    if (sortKey !== col) return <ChevronDown size={14} className="text-gray-400" />;
    return sortAsc ? <ChevronUp size={14} className="text-red-600 dark:text-red-400" /> : <ChevronDown size={14} className="text-red-600 dark:text-red-400" />;
  }

  async function handleSave(asset) {
    try {
      if (editAsset) {
        const { id, ...changes } = asset;
        const res = await api.patch(`/api/assets/${id}`, changes);
        setAssets((prev) => prev.map((a) => (a.id === res.data.id ? res.data : a)));
      } else {
        const { id: _ignore, ...body } = asset;
        const res = await api.post('/api/assets', body);
        setAssets((prev) => [...prev, res.data]);
      }
    } catch (e) {
      console.error('Failed to save asset', e);
    }
    setShowForm(false); setEditAsset(null);
  }
  async function handleDelete() {
    try {
      await api.delete(`/api/assets/${deleteTarget.id}`);
      setAssets((prev) => prev.filter((a) => a.id !== deleteTarget.id));
    } catch (e) {
      console.error('Failed to delete asset', e);
    }
    setDeleteTarget(null);
  }

  // category icon map
  const catIcon = (cat) => {
    const m = {
      'PPE': '🥾',
      'SCBA / Breathing Apparatus': '😮‍💨',
      'Hose & Nozzles': '🚿',
      'Hand Tools': '🔧',
      'Power Tools': '⚡',
      'Medical / EMS': '🩺',
      'Rescue Equipment': '🪝',
      'Communication': '📻',
      'Wildland Equipment': '🌲',
      'Detection / Monitoring': '🔬',
      'Miscellaneous': '📦',
    };
    return m[cat] ?? '📦';
  };

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading assets…</div>;

  return (
    <div className="space-y-6">

      {/* ── alert bar ── */}
      {(overdueCount > 0 || soonCount > 0) && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${overdueCount > 0 ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900' : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900'}`}>
          <ShieldAlert size={18} className={overdueCount > 0 ? 'text-red-600 dark:text-red-400 mt-0.5' : 'text-amber-600 dark:text-amber-400 mt-0.5'} />
          <div className="text-sm">
            {overdueCount > 0 && (
              <span className="font-semibold text-red-700 dark:text-red-300">{overdueCount} asset{overdueCount > 1 ? 's' : ''} with overdue inspections. </span>
            )}
            {soonCount > 0 && (
              <span className={`font-semibold ${overdueCount > 0 ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                {soonCount} asset{soonCount > 1 ? 's' : ''} due for inspection within {WARN_DAYS} days.
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Assets"      value={assets.length}   icon={Package}        color="bg-indigo-500" />
        <StatCard label="Serviceable"       value={serviceable}     icon={CheckCircle2}   color="bg-emerald-500" sub={`${assets.length - serviceable} not serviceable`} />
        <StatCard label="Needs Maintenance" value={needsMaint}      icon={Wrench}         color="bg-amber-500" sub={`${outOfService} out of service`} />
        <StatCard label="Inspection Alerts" value={overdueCount + soonCount} icon={AlertTriangle} color={overdueCount > 0 ? 'bg-red-500' : 'bg-amber-500'} sub={overdueCount > 0 ? `${overdueCount} overdue` : `${soonCount} due soon`} />
      </div>

      {/* ── toolbar ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-3 flex-1">
            <div className="relative min-w-[200px] flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, serial, location, assigned to…"
                aria-label="Search assets"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <select value={filterCat} aria-label="Filter by category" onChange={(e) => setFilterCat(e.target.value)}
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100">
              <option value="">All Categories</option>
              {ASSET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={filterCond} aria-label="Filter by condition" onChange={(e) => setFilterCond(e.target.value)}
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100">
              <option value="">All Conditions</option>
              {ASSET_CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={filterInsp} aria-label="Filter by inspection status" onChange={(e) => setFilterInsp(e.target.value)}
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100">
              <option value="">All Inspections</option>
              <option value="overdue">Overdue</option>
              <option value="soon">Due Soon</option>
              <option value="current">Current</option>
            </select>
          </div>
          <button
            onClick={() => { setEditAsset(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus size={15} /> Add Asset
          </button>
        </div>
      </div>

      {/* ── table ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th scope="col" aria-sort={sortKey === 'name' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  <button type="button" onClick={() => toggleSort('name')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Asset <SortIcon col="name" /></button>
                </th>
                <th scope="col" aria-sort={sortKey === 'category' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  <button type="button" onClick={() => toggleSort('category')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Category <SortIcon col="category" /></button>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Condition</th>
                <th scope="col" aria-sort={sortKey === 'location' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  <button type="button" onClick={() => toggleSort('location')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Location <SortIcon col="location" /></button>
                </th>
                <th scope="col" aria-sort={sortKey === 'nextInspectionDue' ? (sortAsc ? 'ascending' : 'descending') : 'none'} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  <button type="button" onClick={() => toggleSort('nextInspectionDue')} className="flex items-center gap-1 w-full text-left cursor-pointer select-none">Next Inspection <SortIcon col="nextInspectionDue" /></button>
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {visible.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No assets match your filters.</td></tr>
              )}
              {visible.map((asset) => (
                <Fragment key={asset.id}>
                  <tr
                    className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    onClick={() => setExpanded(expanded === asset.id ? null : asset.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 font-medium text-gray-900 dark:text-gray-100">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExpanded(expanded === asset.id ? null : asset.id); }}
                          aria-label={`Expand ${asset.name} details`}
                          aria-expanded={expanded === asset.id}
                          className="p-0.5"
                        >
                          <ChevronRight size={14} className="text-gray-400" />
                        </button>
                        {asset.name}
                      </div>
                      {asset.serialNumber && (
                        <div className="text-xs text-gray-400 mt-0.5">S/N: {asset.serialNumber}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      <span>{catIcon(asset.category)} {asset.category}</span>
                    </td>
                    <td className="px-4 py-3"><ConditionBadge condition={asset.condition} /></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{asset.location ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmt(asset.nextInspectionDue)}</span>
                        <InspectionBadge asset={asset} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setEditAsset(asset); setShowForm(true); }} aria-label={`Edit ${asset.name}`}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors" title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeleteTarget(asset)} aria-label={`Delete ${asset.name}`}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {expanded === asset.id && (
                    <tr className="bg-gray-50 dark:bg-gray-950">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="flex items-start gap-2">
                            <User size={14} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Assigned To</p>
                              <p className="text-gray-700 dark:text-gray-300">{asset.assignedTo || 'Unassigned'}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Location</p>
                              <p className="text-gray-700 dark:text-gray-300">{asset.location || '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Calendar size={14} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Purchase Date</p>
                              <p className="text-gray-700 dark:text-gray-300">{fmt(asset.purchaseDate)}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Tag size={14} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Serial Number</p>
                              <p className="text-gray-700 dark:text-gray-300">{asset.serialNumber || '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <CheckCircle2 size={14} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Last Inspection</p>
                              <p className="text-gray-700 dark:text-gray-300">{fmt(asset.lastInspection)}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Clock size={14} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Next Inspection Due</p>
                              <p className="text-gray-700 dark:text-gray-300">{fmt(asset.nextInspectionDue)}</p>
                            </div>
                          </div>
                          {asset.notes && (
                            <div className="col-span-2 md:col-span-4 flex items-start gap-2">
                              <FileText size={14} className="text-gray-400 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Notes</p>
                                <p className="text-gray-700 dark:text-gray-300">{asset.notes}</p>
                              </div>
                            </div>
                          )}
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
          Showing {visible.length} of {assets.length} asset{assets.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* modals */}
      {showForm && (
        <AssetForm
          asset={editAsset}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditAsset(null); }}
          existingIds={assets.map((a) => a.id)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          member={{ name: deleteTarget.name, id: deleteTarget.id }}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
