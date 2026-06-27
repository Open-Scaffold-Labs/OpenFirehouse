import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Wind, Plus, Search, ChevronDown, ChevronUp, Pencil, AlertTriangle,
  CheckCircle2, Gauge, Calendar, User, Droplets, ClipboardList,
} from 'lucide-react';
import {
  STATUS_COLORS, SCBA_STATUSES, CYLINDER_SIZES, CYLINDER_MATERIALS,
  MASK_SIZES, FILL_STATIONS, SCBA_MAKES,
} from '../data/scba';
import { api } from '../utils/api';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';

// ─── helpers ─────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr) - new Date(TODAY)) / 86400000);
}

function dateColor(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return 'text-gray-400';
  if (d < 0)   return 'text-red-700 dark:text-red-300 font-bold';
  if (d <= 90) return 'text-amber-600 dark:text-amber-400 font-semibold';
  return 'text-gray-700 dark:text-gray-300';
}

function dateBadge(dateStr, label) {
  const d = daysUntil(dateStr);
  if (d === null || !dateStr) return null;
  if (d < 0)   return <span className="text-[10px] bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 font-bold px-1.5 py-0.5 rounded ml-1">OVERDUE</span>;
  if (d <= 90) return <span className="text-[10px] bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-semibold px-1.5 py-0.5 rounded ml-1">Due in {d}d</span>;
  return null;
}

function StatusChip({ status }) {
  const c = STATUS_COLORS[status] ?? { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-300', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0`} />
      {status}
    </span>
  );
}

function PressureBar({ current, max }) {
  const pct = Math.round((current / max) * 100);
  const color = pct === 0 ? 'bg-gray-200 dark:bg-gray-700' : pct >= 75 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-600 dark:text-gray-300 w-20 shrink-0 text-right">
        {current.toLocaleString()} / {max.toLocaleString()} PSI
      </span>
    </div>
  );
}

// ─── Log Fill Modal ───────────────────────────────────────────────────────────

function FillModal({ cylinder, onSave, onClose }) {
  const [form, setForm] = useState({
    date: TODAY,
    pre: '',
    psi: cylinder.maxPressure,
    filledBy: '',
    station: FILL_STATIONS[0],
  });
  const [members, setMembers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const raw = await api.get('/api/members');
        const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        setMembers(arr.filter(m => m.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name)));
      } catch (err) {
        console.error('Failed to fetch members:', err);
      } finally {
        setLoadingData(false);
      }
    }
    fetch();
  }, []);

  function handleSave() {
    if (!form.filledBy.trim()) return;
    const entry = {
      date: form.date,
      psi: Number(form.psi),
      pre: Number(form.pre) || 0,
      filledBy: form.filledBy,
      station: form.station,
    };
    onSave({ ...cylinder, currentPressure: entry.psi, fillLog: [entry, ...cylinder.fillLog] });
  }

  const lbl = 'block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1';
  const inp = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100';

  if (loadingData) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border border-gray-300 dark:border-gray-700 border-t-red-700 mx-auto mb-3"></div>
            <p className="text-sm text-gray-400">Loading form…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Log Fill — {cylinder.unitId}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{cylinder.make} {cylinder.model}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Fill Date</label>
              <input type="date" className={inp} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>Pre-Fill PSI</label>
              <input type="number" className={inp} value={form.pre} onChange={(e) => setForm((f) => ({ ...f, pre: e.target.value }))} placeholder="e.g. 2000" />
            </div>
          </div>
          <div>
            <label className={lbl}>Fill-To PSI</label>
            <input type="number" className={inp} value={form.psi} onChange={(e) => setForm((f) => ({ ...f, psi: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>Filled By *</label>
            <select className={inp} value={form.filledBy} onChange={(e) => setForm((f) => ({ ...f, filledBy: e.target.value }))}>
              <option value="">Select member…</option>
              {members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Fill Station</label>
            <select className={inp} value={form.station} onChange={(e) => setForm((f) => ({ ...f, station: e.target.value }))}>
              {FILL_STATIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 font-medium hover:text-gray-900 dark:hover:text-gray-100">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!form.filledBy.trim()}
            className="bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-800 disabled:opacity-40 transition-colors"
          >
            Log Fill
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cylinder detail ──────────────────────────────────────────────────────────

function CylinderDetail({ cyl, onEdit, onLogFill }) {
  const Field = ({ label, value, className = '' }) => (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xs font-medium text-gray-800 dark:text-gray-100 ${className}`}>{value || '—'}</p>
    </div>
  );

  return (
    <div className="bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-700 px-5 py-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Serial Number"      value={cyl.serial} />
        <Field label="Manufacture Year"   value={cyl.manufactureYear} />
        <Field label="Material"           value={cyl.material} />
        <Field label="Max Pressure"       value={`${cyl.maxPressure.toLocaleString()} PSI`} />
        <Field label="Assigned Member"    value={cyl.assignedMember || 'Unassigned'} />
        <Field label="Assigned Apparatus" value={cyl.assignedUnit || 'Unassigned'} />
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Last Hydro Test</p>
          <p className={`text-xs font-medium ${dateColor(cyl.lastHydroDate)}`}>
            {cyl.lastHydroDate || '—'} {dateBadge(cyl.nextHydroDate)}
          </p>
          <p className={`text-[10px] ${dateColor(cyl.nextHydroDate)}`}>Next: {cyl.nextHydroDate || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Annual Inspection</p>
          <p className={`text-xs font-medium ${dateColor(cyl.lastInspectionDate)}`}>
            {cyl.lastInspectionDate || '—'} {dateBadge(cyl.nextInspectionDate)}
          </p>
          <p className={`text-[10px] ${dateColor(cyl.nextInspectionDate)}`}>Next: {cyl.nextInspectionDate || '—'}</p>
        </div>
      </div>

      {cyl.notes && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-100 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-900 dark:text-amber-200">{cyl.notes}</p>
        </div>
      )}

      {/* Fill log */}
      <div>
        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Fill Log</p>
        {cyl.fillLog.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No fills recorded.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left text-[10px] text-gray-400 uppercase py-1 pr-3">Date</th>
                <th className="text-left text-[10px] text-gray-400 uppercase py-1 pr-3">Pre PSI</th>
                <th className="text-left text-[10px] text-gray-400 uppercase py-1 pr-3">Filled To</th>
                <th className="text-left text-[10px] text-gray-400 uppercase py-1 pr-3">Filled By</th>
                <th className="text-left text-[10px] text-gray-400 uppercase py-1">Station</th>
              </tr>
            </thead>
            <tbody>
              {cyl.fillLog.map((f, i) => (
                <tr key={i} className={i % 2 === 1 ? 'bg-gray-50 dark:bg-gray-950' : ''}>
                  <td className="py-1 pr-3">{f.date}</td>
                  <td className="py-1 pr-3 text-gray-500 dark:text-gray-400">{f.pre ? `${f.pre.toLocaleString()} PSI` : '—'}</td>
                  <td className="py-1 pr-3 font-semibold text-green-700 dark:text-green-300">{f.psi.toLocaleString()} PSI</td>
                  <td className="py-1 pr-3">{f.filledBy}</td>
                  <td className="py-1 text-gray-500 dark:text-gray-400">{f.station}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex gap-4 pt-1 border-t border-gray-100 dark:border-gray-700">
        <button onClick={() => onLogFill(cyl)} className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium transition-colors">
          <Droplets size={12} /> Log Fill
        </button>
        <button onClick={() => onEdit(cyl)} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium transition-colors">
          <Pencil size={12} /> Edit Record
        </button>
      </div>

      {/* Linked Meetings */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
        <LinkedMeetings module="scba" recordId={cyl.id} recordLabel={cyl.unitId || 'Cylinder'} />
        <Attachments module="scba" recordId={cyl.id} recordLabel={cyl.unitId || 'Cylinder'} />
      </div>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

const TABS = ['Cylinders', 'Fill Stations'];

export default function SCBATracker() {
  const [cylinders, setCylinders]   = useState([]);
  const [fillStations, setFillStations] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState(0);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [expandedId, setExpandedId] = useState(null);
  const [fillModal, setFillModal]   = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [cylRes, fsRes] = await Promise.all([
        api.get('/api/cylinders'),
        api.get('/api/fill-stations'),
      ]);
      setCylinders(cylRes.data ?? []);
      setFillStations(fsRes.data ?? []);
    } catch (e) {
      console.error('Failed to fetch SCBA data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Stats
  const stats = useMemo(() => {
    const total     = cylinders.length;
    const inService = cylinders.filter((c) => c.status === 'In Service').length;
    const oos       = cylinders.filter((c) => c.status === 'Out of Service' || c.status === 'In Repair').length;
    const hydroDue  = cylinders.filter((c) => { const d = daysUntil(c.nextHydroDate); return d !== null && d <= 90; }).length;
    const inspDue   = cylinders.filter((c) => { const d = daysUntil(c.nextInspectionDate); return d !== null && d <= 90; }).length;
    return { total, inService, oos, hydroDue, inspDue };
  }, [cylinders]);

  const filtered = useMemo(() => {
    return cylinders.filter((c) => {
      const matchStatus = statusFilter === 'All' || c.status === statusFilter;
      const q = search.toLowerCase();
      const matchSearch = !q || [c.unitId, c.make, c.model, c.serial, c.assignedMember, c.assignedUnit]
        .some((v) => v?.toLowerCase().includes(q));
      return matchStatus && matchSearch;
    });
  }, [cylinders, search, statusFilter]);

  async function handleFillSave(updated) {
    try {
      const { id, ...changes } = updated;
      const res = await api.patch(`/api/cylinders/${id}`, changes);
      setCylinders((prev) => prev.map((c) => (c.id === res.data.id ? res.data : c)));
    } catch (e) {
      console.error('Failed to save fill log', e);
    }
    setFillModal(null);
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading SCBA data…</div>;

  return (
    <div className="space-y-6">

      {/* header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">SCBA &amp; Air Management</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Track cylinders, hydrostatic test dates, annual inspections, fill logs, and cascade status per NFPA 1852.
        </p>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Cylinders', value: stats.total,     color: 'text-gray-900 dark:text-gray-100' },
          { label: 'In Service',      value: stats.inService, color: 'text-green-700 dark:text-green-300' },
          { label: 'OOS / In Repair', value: stats.oos,       color: stats.oos > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-400' },
          { label: 'Hydro Due ≤ 90d', value: stats.hydroDue,  color: stats.hydroDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400' },
          { label: 'Inspection Due',  value: stats.inspDue,   color: stats.inspDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              tab === i ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Cylinders Tab ── */}
      {tab === 0 && (
        <>
          {/* filters */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search unit ID, serial, member, apparatus…"
                  aria-label="Search cylinders"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {['All', ...SCBA_STATUSES].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      statusFilter === s ? 'bg-red-700 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-left">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Unit ID</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Make / Model</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-48">Pressure</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Assigned To</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Hydro Due</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden xl:table-cell">Inspection Due</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((cyl) => {
                  const isOpen = expandedId === cyl.id;
                  const hydroAlert = daysUntil(cyl.nextHydroDate);
                  const inspAlert  = daysUntil(cyl.nextInspectionDate);
                  return (
                    <>
                      <tr
                        key={cyl.id}
                        onClick={() => setExpandedId(isOpen ? null : cyl.id)}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">{cyl.unitId}</p>
                          <p className="text-[10px] text-gray-400">{cyl.size}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">
                          {cyl.make} {cyl.model}
                        </td>
                        <td className="px-4 py-3"><StatusChip status={cyl.status} /></td>
                        <td className="px-4 py-3 w-48">
                          <PressureBar current={cyl.currentPressure} max={cyl.maxPressure} />
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <p className="text-sm text-gray-700 dark:text-gray-300">{cyl.assignedMember || '—'}</p>
                          <p className="text-xs text-gray-400">{cyl.assignedUnit}</p>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className={`text-xs ${dateColor(cyl.nextHydroDate)}`}>{cyl.nextHydroDate || '—'}</span>
                          {hydroAlert !== null && hydroAlert <= 90 && (
                            <AlertTriangle size={12} className={`inline ml-1 ${hydroAlert < 0 ? 'text-red-500' : 'text-amber-500'}`} />
                          )}
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                          <span className={`text-xs ${dateColor(cyl.nextInspectionDate)}`}>{cyl.nextInspectionDate || '—'}</span>
                          {inspAlert !== null && inspAlert <= 90 && (
                            <AlertTriangle size={12} className={`inline ml-1 ${inspAlert < 0 ? 'text-red-500' : 'text-amber-500'}`} />
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpandedId(isOpen ? null : cyl.id); }}
                            aria-label={`Expand cylinder ${cyl.unitId} details`}
                            aria-expanded={isOpen}
                            className="p-0.5"
                          >
                            {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${cyl.id}-detail`}>
                          <td colSpan={8} className="p-0">
                            <CylinderDetail cyl={cyl} onEdit={() => {}} onLogFill={setFillModal} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Fill Stations Tab ── */}
      {tab === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {fillStations.map((fs) => (
            <div key={fs.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-gray-900 dark:text-gray-100">{fs.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{fs.type}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  fs.status === 'Operational' ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                }`}>
                  {fs.status}
                </span>
              </div>
              {fs.bankPressure && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Bank Pressure</p>
                  <PressureBar current={fs.bankPressure} max={fs.maxPressure} />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-gray-400 text-[10px] uppercase tracking-wide">Last Inspection</p>
                  <p className={`font-medium ${dateColor(fs.lastInspectionDate)}`}>{fs.lastInspectionDate || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-[10px] uppercase tracking-wide">Next Inspection</p>
                  <p className={`font-medium ${dateColor(fs.nextInspectionDate)}`}>{fs.nextInspectionDate || '—'}</p>
                </div>
              </div>
              {fs.notes && <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-100 rounded px-3 py-2">{fs.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* fill modal */}
      {fillModal && (
        <FillModal cylinder={fillModal} onSave={handleFillSave} onClose={() => setFillModal(null)} />
      )}

    </div>
  );
}
