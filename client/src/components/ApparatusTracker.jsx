import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  PlusCircle,
  Pencil,
  Trash2,
  Search,
  ChevronUp,
  ChevronDown,
  Truck,
  CheckCircle,
  AlertTriangle,
  Wrench,
  Loader2,
  LayoutGrid,
  List,
} from 'lucide-react';
import { APPARATUS_STATUSES } from '../data/apparatus';
import { api } from '../utils/api';
import ApparatusStatusBadge from './ApparatusStatusBadge';
import ApparatusForm from './ApparatusForm';
import DeleteConfirm from './DeleteConfirm';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function isServiceOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr + 'T00:00:00') < new Date();
}

const TYPE_ICONS = {
  'Engine':          '🚒',
  'Ladder / Aerial': '🪜',
  'Tanker':          '🚛',
  'Rescue':          '🔧',
  'Brush':           '🌲',
  'Command':         '🚗',
  'Utility':         '🔩',
  'Ambulance / EMS': '🚑',
  'Hazmat':          '☣️',
  'Foam Unit':       '💧',
};

export default function ApparatusTracker({ selectedStation = null }) {
  const [units, setUnits]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortField, setSortField] = useState('designation');
  const [sortDir, setSortDir] = useState('asc');
  const [formOpen, setFormOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [deletingUnit, setDeletingUnit] = useState(null);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'schematic'

  const fetchUnits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/api/apparatus');
      setUnits(Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:       units.length,
    inService:   units.filter((u) => u.status === 'In Service').length,
    outOfService: units.filter((u) => u.status === 'Out of Service').length,
    maintenance: units.filter((u) => u.status === 'Maintenance').length,
  }), [units]);

  // ── Filtered & sorted ──────────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = units.filter((u) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        u.designation.toLowerCase().includes(q) ||
        u.type.toLowerCase().includes(q) ||
        u.make.toLowerCase().includes(q) ||
        u.model.toLowerCase().includes(q) ||
        (u.assignedOperator || '').toLowerCase().includes(q);
      const matchStatus = filterStatus === 'All' || u.status === filterStatus;
      const matchStation = !selectedStation || u.station_id === selectedStation; // P6.3
      return matchSearch && matchStatus && matchStation;
    });
    return [...list].sort((a, b) => {
      let av = a[sortField] ?? '';
      let bv = b[sortField] ?? '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [units, search, filterStatus, sortField, sortDir]);

  function handleSort(field) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  }

  async function handleSave(formData) {
    try {
      if (formData.id) {
        const { id, createdAt, updatedAt, ...fields } = formData;
        await api.patch(`/api/apparatus/${id}`, fields);
      } else {
        await api.post('/api/apparatus', formData);
      }
      await fetchUnits();
    } catch (err) {
      alert(`Save failed: ${err.message}`);
      return;
    }
    setFormOpen(false);
    setEditingUnit(null);
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/api/apparatus/${id}`);
      await fetchUnits();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
      return;
    }
    setDeletingUnit(null);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
      <Loader2 className="h-6 w-6 animate-spin" />
      <span className="text-sm">Loading apparatus…</span>
    </div>
  );

  if (error) return (
    <div className="rounded-xl bg-red-50 dark:bg-red-950/50 ring-1 ring-red-200 p-6 text-center">
      <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Could not load apparatus</p>
      <p className="text-xs text-red-500 mb-4">{error}</p>
      <button onClick={fetchUnits} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors">Retry</button>
    </div>
  );

  function SortIcon({ field }) {
    if (sortField !== field) return <ChevronUp className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3.5 w-3.5 text-red-500" />
      : <ChevronDown className="h-3.5 w-3.5 text-red-500" />;
  }

  function getStatusBorderColor(status) {
    switch (status) {
      case 'In Service': return 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50';
      case 'En Route': case 'Responding': return 'border-amber-500 bg-amber-50 dark:bg-amber-950/50';
      case 'On Scene': return 'border-orange-500 bg-orange-50 dark:bg-orange-950/50';
      case 'Out of Service': return 'border-red-500 bg-red-50 dark:bg-red-950/50';
      default: return 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-950';
    }
  }

  function getStatusBgColor(status) {
    switch (status) {
      case 'In Service': return 'bg-emerald-600';
      case 'En Route': case 'Responding': return 'bg-amber-600';
      case 'On Scene': return 'bg-orange-600';
      case 'Out of Service': return 'bg-red-600';
      default: return 'bg-gray-400';
    }
  }

  function isServiceDueSoon(dateStr) {
    if (!dateStr) return false;
    const due = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntil = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    return daysUntil > 0 && daysUntil <= 30;
  }

  return (
    <div className="space-y-6">
      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Units',     value: stats.total,        icon: <Truck className="h-5 w-5 text-gray-500 dark:text-gray-400" />,        bg: 'bg-gray-100 dark:bg-gray-800' },
          { label: 'In Service',      value: stats.inService,    icon: <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, bg: 'bg-emerald-50 dark:bg-emerald-950/50' },
          { label: 'Out of Service',  value: stats.outOfService, icon: <AlertTriangle className="h-5 w-5 text-red-500" />,  bg: 'bg-red-50 dark:bg-red-950/50' },
          { label: 'Maintenance',     value: stats.maintenance,  icon: <Wrench className="h-5 w-5 text-amber-500" />,       bg: 'bg-amber-50 dark:bg-amber-950/50' },
        ].map(({ label, value, icon, bg }) => (
          <div key={label} className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-gray-200">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>{icon}</div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by unit, type, make, or operator…"
            aria-label="Search apparatus"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 pl-9 pr-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label="Filter by status"
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 shadow-sm outline-none focus:ring-2 focus:ring-red-500"
        >
          <option value="All">All Statuses</option>
          {APPARATUS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex items-center gap-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 shadow-sm">
          <button
            onClick={() => setViewMode('table')}
            title="Table view"
            aria-label="Table view"
            className={`p-2.5 transition-colors ${
              viewMode === 'table'
                ? 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            <List className="h-4 w-4" />
          </button>
          <div className="border-r border-gray-300 dark:border-gray-700" />
          <button
            onClick={() => setViewMode('schematic')}
            title="Schematic view"
            aria-label="Schematic view"
            className={`p-2.5 transition-colors ${
              viewMode === 'schematic'
                ? 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={() => { setEditingUnit(null); setFormOpen(true); }}
          className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800 transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
          Add Apparatus
        </button>
      </div>

      {/* ── Table or Schematic View ────────────────────────────────────────── */}
      {viewMode === 'table' ? (
        <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 overflow-hidden">
          {displayed.length === 0 ? (
            <div className="py-16 text-center">
              <Truck className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No apparatus match your search.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-950">
                  <tr>
                    {[
                      { field: 'designation', label: 'Unit' },
                      { field: 'type',        label: 'Type' },
                      { field: 'year',        label: 'Year' },
                      { field: 'status',      label: 'Status' },
                      { field: 'mileage',     label: 'Mileage' },
                      { field: 'nextServiceDue', label: 'Next Service' },
                      { field: 'assignedOperator', label: 'Operator' },
                    ].map(({ field, label }) => (
                      <th
                        key={field}
                        scope="col"
                        aria-sort={sortField === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        <button
                          type="button"
                          onClick={() => handleSort(field)}
                          className="inline-flex items-center gap-1 w-full text-left cursor-pointer select-none"
                        >
                          {label}
                          <SortIcon field={field} />
                        </button>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                  {displayed.map((unit) => {
                    const overdue = isServiceOverdue(unit.nextServiceDue) && unit.status !== 'Out of Service';
                    return (
                      <tr key={unit.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        {/* Unit */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xl leading-none">{TYPE_ICONS[unit.type] || '🚒'}</span>
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{unit.designation}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{unit.make} {unit.model}</p>
                            </div>
                          </div>
                        </td>
                        {/* Type */}
                        <td className="px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{unit.type}</td>
                        {/* Year */}
                        <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300">{unit.year}</td>
                        {/* Status */}
                        <td className="px-4 py-3.5"><ApparatusStatusBadge status={unit.status} /></td>
                        {/* Mileage */}
                        <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {unit.mileage ? unit.mileage.toLocaleString() + ' mi' : '—'}
                        </td>
                        {/* Next Service */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {unit.nextServiceDue ? (
                            <span className={`text-sm font-medium ${overdue ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                              {overdue && <AlertTriangle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
                              {formatDate(unit.nextServiceDue)}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                        {/* Operator */}
                        <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {/* Was `text-gray-300 dark:text-gray-600` — the pair is INVERTED: the
                              pale shade was serving light mode and the dark shade dark mode, so
                              it failed in BOTH (1.47:1 light, 2.35:1 dark). "Unassigned" is a
                              real data value an officer reads off the apparatus table, not
                              decoration, so it needs to clear AA rather than merely look quiet. */}
                          {unit.assignedOperator || <span className="italic text-gray-500 dark:text-gray-400">Unassigned</span>}
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => { setEditingUnit(unit); setFormOpen(true); }}
                              title="Edit"
                              aria-label={`Edit ${unit.designation}`}
                              className="rounded-lg p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeletingUnit(unit)}
                              title="Remove"
                              aria-label={`Remove ${unit.designation}`}
                              className="rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        // Schematic view
        <div className="space-y-4">
          {displayed.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 py-16 text-center">
              <Truck className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No apparatus match your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayed.map((unit) => {
                const { border, bg } = getStatusBorderColor(unit.status);
                const statusBg = getStatusBgColor(unit.status);
                const serviceSoon = isServiceDueSoon(unit.nextServiceDue);
                return (
                  <div
                    key={unit.id}
                    className={`rounded-lg overflow-hidden shadow-sm ring-1 ring-gray-200 border-l-4 ${border} ${bg} hover:shadow-md transition-shadow`}
                  >
                    <div className="p-5">
                      {/* Status badge */}
                      <div className="flex items-start justify-between mb-3">
                        <div className={`${statusBg} text-white px-3 py-1 rounded-lg text-xs font-semibold`}>
                          {unit.status}
                        </div>
                        <span className="text-2xl leading-none">{TYPE_ICONS[unit.type] || '🚒'}</span>
                      </div>

                      {/* Designation - large and bold */}
                      <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">{unit.designation}</p>

                      {/* Type */}
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{unit.type}</p>

                      {/* Year / Make / Model */}
                      <div className="space-y-2 mb-4 pb-4 border-b border-gray-300 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{unit.year}</span> {unit.make} {unit.model}
                        </p>
                        {unit.mileage && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-medium text-gray-700 dark:text-gray-300">{unit.mileage.toLocaleString()}</span> mi
                          </p>
                        )}
                      </div>

                      {/* Service due */}
                      {unit.nextServiceDue && (
                        <div className={`mb-3 pb-3 border-b ${serviceSoon ? 'border-amber-300 dark:border-amber-800' : 'border-gray-300 dark:border-gray-700'}`}>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Next Service</p>
                          <p className={`text-sm font-semibold ${serviceSoon ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            {formatDate(unit.nextServiceDue)}
                          </p>
                          {serviceSoon && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Due within 30 days</p>
                          )}
                        </div>
                      )}

                      {/* Operator */}
                      {unit.assignedOperator && (
                        <div className="mb-4 pb-4 border-b border-gray-300 dark:border-gray-700">
                          <p className="text-xs text-gray-500 dark:text-gray-400">Officer / Crew</p>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{unit.assignedOperator}</p>
                        </div>
                      )}

                      {/* Linked Meetings */}
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3 mb-3">
                        <LinkedMeetings module="apparatus" recordId={unit.id} recordLabel={unit.designation || 'Unit'} />
                        <Attachments module="apparatus" recordId={unit.id} recordLabel={unit.designation || 'Unit'} />
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          onClick={() => { setEditingUnit(unit); setFormOpen(true); }}
                          className="flex-1 rounded-lg p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors text-sm font-medium flex items-center justify-center gap-1"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingUnit(unit)}
                          className="flex-1 rounded-lg p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors text-sm font-medium flex items-center justify-center gap-1"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        Showing {displayed.length} of {units.length} apparatus
        {filterStatus !== 'All' && ` · Filtered by: ${filterStatus}`}
      </p>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {formOpen && (
        <ApparatusForm
          unit={editingUnit}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditingUnit(null); }}
        />
      )}
      {deletingUnit && (
        <DeleteConfirm
          member={deletingUnit}
          onConfirm={handleDelete}
          onCancel={() => setDeletingUnit(null)}
        />
      )}
    </div>
  );
}
