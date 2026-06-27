import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Wrench, Plus, Search, Truck, DollarSign, AlertTriangle,
  CheckCircle2, Clock, ChevronDown, ChevronUp,
  Pencil, Trash2, ClipboardList, Filter, Loader2,
} from 'lucide-react';
import {
  MAINTENANCE_TYPES, MAINTENANCE_STATUSES,
  MAINTENANCE_PRIORITIES, STATUS_COLORS, PRIORITY_COLORS,
} from '../data/maintenance';
import { api } from '../utils/api';
import MaintenanceForm from './MaintenanceForm';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function fmtCost(val) {
  if (val === null || val === undefined || val === '') return '—';
  return `$${Number(val).toLocaleString()}`;
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-gray-700 dark:text-gray-300', highlight }) {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl p-4 border shadow-sm flex items-start gap-3 ${highlight ? 'border-red-200 dark:border-red-900' : 'border-gray-100 dark:border-gray-700'}`}>
      <div className="p-2 bg-gray-50 dark:bg-gray-950 rounded-lg"><Icon size={18} className={color} /></div>
      <div>
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className={`text-2xl font-bold leading-none mt-0.5 ${color}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS['Pending'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const c = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS['Routine'];
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      {priority}
    </span>
  );
}

// ─── Record Row ───────────────────────────────────────────────────────────────

function RecordRow({ record, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const isOpen = record.status !== 'Completed' && record.status !== 'Deferred';

  return (
    <>
      <tr
        className={`hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${isOpen ? 'bg-amber-50/30' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <td className="py-3 px-3">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug">{record.type}</p>
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{record.description}</p>
        </td>
        <td className="py-3 px-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtDate(record.date)}</td>
        <td className="py-3 px-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
          {record.mileage ? record.mileage.toLocaleString() : '—'}
        </td>
        <td className="py-3 px-3"><PriorityBadge priority={record.priority} /></td>
        <td className="py-3 px-3"><StatusBadge status={record.status} /></td>
        <td className="py-3 px-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
          {record.totalCost !== null && record.totalCost !== undefined ? fmtCost(record.totalCost) : '—'}
        </td>
        <td className="py-3 px-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            aria-label={`Expand ${record.type} maintenance record details`}
            aria-expanded={open}
            className="p-0.5"
          >
            {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </button>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={7} className="px-3 pb-3">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Work Order',    value: record.workOrder || '—' },
                  { label: 'Technician',    value: record.technician || '—' },
                  { label: 'Vendor',        value: record.vendor || '—' },
                  { label: 'Labor Hours',   value: record.laborHours != null ? `${record.laborHours}h` : '—' },
                  { label: 'Parts Cost',    value: fmtCost(record.partsCost) },
                  { label: 'Labor Cost',    value: fmtCost(record.laborCost) },
                  { label: 'Next Svc Miles', value: record.nextServiceMiles ? record.nextServiceMiles.toLocaleString() : '—' },
                  { label: 'Next Svc Date',  value: fmtDate(record.nextServiceDate) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                    <p className="text-gray-800 dark:text-gray-100 font-medium">{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Description</p>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{record.description}</p>
              </div>
              {record.notes && (
                <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-100 dark:border-amber-900 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Notes</p>
                  <p className="text-amber-800 dark:text-amber-300 text-sm">{record.notes}</p>
                </div>
              )}
              {/* Linked Meetings */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                <LinkedMeetings module="maintenance" recordId={record.id} recordLabel={record.description || 'Maintenance Record'} />
                <Attachments module="maintenance" recordId={record.id} recordLabel={record.description || 'Maintenance Record'} />
              </div>
              <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(record); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(record.id); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Apparatus Summary Card ───────────────────────────────────────────────────

function ApparatusCard({ apparatus, records, isSelected, onClick }) {
  const openCount  = records.filter((r) => r.status === 'In Progress' || r.status === 'Pending').length;
  const totalSpent = records.reduce((s, r) => s + (r.totalCost ?? 0), 0);

  return (
    <button
      onClick={onClick}
      className={`text-left w-full bg-white dark:bg-gray-900 rounded-xl border transition-all p-3 ${
        isSelected
          ? 'border-red-400 shadow-md ring-1 ring-red-200'
          : openCount > 0
          ? 'border-amber-200 dark:border-amber-900 hover:border-amber-300 shadow-sm'
          : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`font-bold text-sm ${isSelected ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-gray-100'}`}>
          {apparatus.name}
        </p>
        {openCount > 0 && (
          <span className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 rounded-full flex-shrink-0">
            {openCount} open
          </span>
        )}
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span>{records.length} records</span>
        <span>${totalSpent.toLocaleString()} total</span>
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MaintenanceLog() {
  const [records,       setRecords]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [selectedUnit,  setSelectedUnit]  = useState('all');
  const [search,        setSearch]        = useState('');
  const [typeFilter,    setTypeFilter]    = useState('All');
  const [statusFilter,  setStatusFilter]  = useState('All');
  const [formOpen,      setFormOpen]      = useState(false);
  const [editing,       setEditing]       = useState(null);

  const fetchRecords = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get('/api/maintenance');
      setRecords(res.data);
    } catch (err) {
      setError(err.message || 'Could not load maintenance records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Apparatus list derived from records
  const apparatusList = useMemo(() => {
    const seen = new Map();
    records.forEach((r) => {
      if (!seen.has(r.apparatusId)) seen.set(r.apparatusId, r.apparatusName);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  // Stats
  const openTickets   = records.filter((r) => r.status === 'In Progress' || r.status === 'Pending').length;
  const criticalCount = records.filter((r) => r.priority === 'Critical' && r.status !== 'Completed').length;
  const ytdCost       = records
    .filter((r) => r.date?.startsWith(String(new Date().getFullYear())))
    .reduce((s, r) => s + (r.totalCost ?? 0), 0);
  const completedCount = records.filter((r) => r.status === 'Completed').length;

  // Filtered records
  const filtered = useMemo(() => {
    return records
      .filter((r) => {
        if (selectedUnit !== 'all' && r.apparatusId !== Number(selectedUnit)) return false;
        if (typeFilter !== 'All' && r.type !== typeFilter) return false;
        if (statusFilter !== 'All' && r.status !== statusFilter) return false;
        const q = search.toLowerCase();
        return !q || r.description.toLowerCase().includes(q) ||
               r.type.toLowerCase().includes(q) ||
               (r.workOrder || '').toLowerCase().includes(q) ||
               (r.technician || '').toLowerCase().includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [records, selectedUnit, typeFilter, statusFilter, search]);

  async function handleSave(rec) {
    try {
      if (rec.id && records.some((r) => r.id === rec.id)) {
        await api.patch(`/api/maintenance/${rec.id}`, rec);
      } else {
        await api.post('/api/maintenance', rec);
      }
      await fetchRecords();
    } catch (err) {
      alert(err.message || 'Failed to save maintenance record');
    }
    setFormOpen(false);
    setEditing(null);
  }

  function handleEdit(rec) {
    setEditing(rec);
    setFormOpen(true);
  }

  async function handleDelete(id) {
    if (window.confirm('Delete this maintenance record?')) {
      try {
        await api.delete(`/api/maintenance/${id}`);
        await fetchRecords();
      } catch (err) {
        alert(err.message || 'Failed to delete maintenance record');
      }
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-gray-400">
      <Loader2 className="h-8 w-8 animate-spin mr-3" />
      <span className="text-sm">Loading maintenance records…</span>
    </div>
  );

  if (error) return (
    <div className="rounded-xl bg-red-50 dark:bg-red-950/50 ring-1 ring-red-200 p-8 text-center">
      <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Could not load maintenance records</p>
      <p className="text-xs text-red-500 mb-4">{error}</p>
      <button onClick={fetchRecords} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">Retry</button>
    </div>
  );

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Apparatus Maintenance Log</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Service history, repair tickets, and cost tracking per unit.</p>
        </div>
        <button
          onClick={() => { setEditing(null); setFormOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800 transition-colors shadow-sm"
        >
          <Plus size={16} /> Add Record
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={ClipboardList} label="Total Records"    value={records.length}   color="text-gray-700 dark:text-gray-300" />
        <StatCard icon={AlertTriangle} label="Open Tickets"     value={openTickets}      color="text-amber-600 dark:text-amber-400" highlight={openTickets > 0} />
        <StatCard icon={Wrench}        label="Critical / Urgent" value={criticalCount}   color="text-red-700 dark:text-red-300"  highlight={criticalCount > 0} />
        <StatCard icon={DollarSign}    label={`Cost YTD (${new Date().getFullYear()})`} value={`$${ytdCost.toLocaleString()}`} color="text-blue-700 dark:text-blue-300" />
      </div>

      {/* Apparatus selector */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Filter by Unit</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <button
            onClick={() => setSelectedUnit('all')}
            className={`text-left bg-white dark:bg-gray-900 rounded-xl border transition-all p-3 ${
              selectedUnit === 'all' ? 'border-red-400 shadow-md ring-1 ring-red-200' : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 shadow-sm'
            }`}
          >
            <p className={`font-bold text-sm ${selectedUnit === 'all' ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-gray-100'}`}>All Units</p>
            <p className="text-xs text-gray-400 mt-0.5">{records.length} records</p>
          </button>
          {apparatusList.map((a) => (
            <ApparatusCard
              key={a.id}
              apparatus={a}
              records={records.filter((r) => r.apparatusId === a.id)}
              isSelected={selectedUnit === String(a.id)}
              onClick={() => setSelectedUnit(String(a.id))}
            />
          ))}
        </div>
      </div>

      {/* Selected unit header */}
      {selectedUnit !== 'all' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3 flex flex-wrap items-center gap-4 text-sm">
          <Truck size={16} className="text-red-600 dark:text-red-400" />
          <span className="font-bold text-gray-900 dark:text-gray-100">
            {apparatusList.find((a) => String(a.id) === selectedUnit)?.name ?? 'Unit'}
          </span>
          <span className="text-gray-500 dark:text-gray-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-44">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search description, work order…" value={search}
            aria-label="Search maintenance records"
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100" />
        </div>

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by service type"
          className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900">
          <option value="All">All Types</option>
          {MAINTENANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <div className="flex gap-1.5">
          {['All', ...MAINTENANCE_STATUSES].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                statusFilter === s
                  ? 'bg-red-700 text-white border-red-700'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300'
              }`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Records table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-950">
              <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                <th className="text-left py-3 px-3">
                  {selectedUnit === 'all' ? 'Unit / Work' : 'Work Performed'}
                </th>
                <th className="text-left py-3 px-3">Date</th>
                <th className="text-left py-3 px-3">Mileage</th>
                <th className="text-left py-3 px-3">Priority</th>
                <th className="text-left py-3 px-3">Status</th>
                <th className="text-left py-3 px-3">Cost</th>
                <th className="py-3 px-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    <Wrench size={36} className="mx-auto mb-3 opacity-30" />
                    <p>No maintenance records match your filters.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((rec) => (
                  <RecordRow
                    key={rec.id}
                    record={selectedUnit === 'all'
                      ? { ...rec, type: `${rec.apparatusName} — ${rec.type}` }
                      : rec
                    }
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Cost summary footer */}
        {filtered.length > 0 && (
          <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 flex justify-between text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-950">
            <span>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
            <span>
              Showing total: <span className="font-semibold text-gray-700 dark:text-gray-300">
                ${filtered.reduce((s, r) => s + (r.totalCost ?? 0), 0).toLocaleString()}
              </span>
            </span>
          </div>
        )}
      </div>

      {formOpen && (
        <MaintenanceForm
          record={editing}
          defaultApparatusId={selectedUnit !== 'all' ? Number(selectedUnit) : null}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
