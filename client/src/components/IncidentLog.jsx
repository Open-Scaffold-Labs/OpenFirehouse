import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Search, ChevronUp, ChevronDown,
  Flame, Ambulance, AlertTriangle, FileText, ChevronRight, Loader2, Share2,
} from 'lucide-react';
import { INCIDENT_TYPES } from '../data/incidents';
import { api } from '../utils/api';
import { offlineQueue } from '../utils/offlineQueue';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import IncidentForm from './IncidentForm';
import { FAB_RAIL_GUTTER } from '../utils/fabRail';
import { openReportWindow, onReportSaved } from '../utils/reportWindow';
import DeleteConfirm from './DeleteConfirm';
import IncidentTimeline from './IncidentTimeline';
import RecordHistory from './RecordHistory'; // 5.4 — customer-visible change history
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';
import AIActionButton from './AIActionButton';
import CompletenessPanel from './CompletenessPanel';
import DocumentPackagePanel from './DocumentPackagePanel';

// NFIRS per-apparatus times for one incident — derived from the unit-status
// history (Phase 2). Self-contained: fetches only when the row is expanded.
function ApparatusTimesPanel({ incidentId }) {
  const [times, setTimes] = useState(null);
  useEffect(() => {
    let alive = true;
    api.get(`/api/incidents/${incidentId}/apparatus-times`)
      .then(({ data }) => { if (alive) setTimes(Array.isArray(data) ? data : []); })
      .catch(() => { if (alive) setTimes([]); });
    return () => { alive = false; };
  }, [incidentId]);

  const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

  return (
    <>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Apparatus Times (NFIRS)</p>
      {times === null ? (
        <p className="text-gray-500 dark:text-gray-400 text-xs">Loading…</p>
      ) : !times.length ? (
        <p className="text-gray-500 dark:text-gray-400 text-xs">No per-apparatus times recorded for this incident.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-gray-500 dark:text-gray-400 text-left">
                <th className="pr-5 py-1 font-semibold">Unit</th>
                <th className="pr-5 py-1 font-semibold">Dispatched</th>
                <th className="pr-5 py-1 font-semibold">En Route</th>
                <th className="pr-5 py-1 font-semibold">On Scene</th>
                <th className="pr-5 py-1 font-semibold">Clear</th>
              </tr>
            </thead>
            <tbody>
              {times.map((t, i) => (
                <tr key={(t.designation || '') + i} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="pr-5 py-1 font-bold text-gray-800 dark:text-gray-100">{t.designation}</td>
                  <td className="pr-5 py-1 text-gray-600 dark:text-gray-300">{fmt(t.dispatched_at)}</td>
                  <td className="pr-5 py-1 text-gray-600 dark:text-gray-300">{fmt(t.enroute_at)}</td>
                  <td className="pr-5 py-1 text-gray-600 dark:text-gray-300">{fmt(t.on_scene_at)}</td>
                  <td className="pr-5 py-1 text-gray-600 dark:text-gray-300">{fmt(t.clear_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const TYPE_COLORS = {
  'Structure Fire':       'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 ring-red-500/20',
  'Vehicle Fire':         'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 ring-orange-500/20',
  'Brush / Wildland Fire':'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 ring-amber-500/20',
  'Dumpster / Rubbish Fire':'bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300 ring-yellow-500/20',
  'Vehicle Accident':     'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 ring-blue-500/20',
  'Technical Rescue':     'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 ring-indigo-500/20',
  'Water Rescue':         'bg-cyan-100 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 ring-cyan-500/20',
  'Medical / EMS':        'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20',
  'Hazmat':               'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 ring-purple-500/20',
  'Gas Leak':             'bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 ring-teal-500/20',
  'Public Assist':        'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 ring-gray-500/20',
  'False Alarm':          'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 ring-gray-400/20',
  'Mutual Aid':           'bg-pink-100 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300 ring-pink-500/20',
  'Other':                'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 ring-gray-500/20',
};

function TypeBadge({ type }) {
  const cls = TYPE_COLORS[type] || TYPE_COLORS['Other'];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {type}
    </span>
  );
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function IncidentLog() {
  const { online } = useNetworkStatus();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState('');
  const [filterType, setFilterType]       = useState('All');
  const [sortField, setSortField]         = useState('date');
  const [sortDir, setSortDir]             = useState('desc');
  const [formOpen, setFormOpen]           = useState(false);
  const [editingIncident, setEditingIncident]   = useState(null);
  const [deletingIncident, setDeletingIncident] = useState(null);
  const [expandedId, setExpandedId]             = useState(null);
  const [timelineIncident, setTimelineIncident] = useState(null);
  const [aiPrefill, setAiPrefill]               = useState(null);

  const fetchIncidents = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get('/api/incidents');
      setIncidents(Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err.message || 'Could not load incidents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  // The report window is a SEPARATE JS context — it cannot call fetchIncidents()
  // on this one. Without this listener the chief saves in the other window,
  // looks back at this table, and sees the old row until they refresh by hand.
  useEffect(() => onReportSaved(() => { fetchIncidents(); }), [fetchIncidents]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const fires  = incidents.filter((i) => i.type.includes('Fire')).length;
    const ems    = incidents.filter((i) => i.type === 'Medical / EMS').length;
    const injuries = incidents.reduce((n, i) => n + (i.injuries || 0), 0);
    return { total: incidents.length, fires, ems, injuries };
  }, [incidents]);

  // ── Next incident number ──────────────────────────────────────────────────
  const nextNumber = useMemo(() => {
    const year = new Date().getFullYear().toString().slice(-2);
    const max  = incidents
      .map((i) => parseInt((i.incidentNumber || '').split('-')[1] || '0', 10))
      .reduce((a, b) => Math.max(a, b), 0);
    return `${year}-${String(max + 1).padStart(4, '0')}`;
  }, [incidents]);

  // ── Filtered & sorted ─────────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = incidents.filter((i) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        i.incidentNumber.toLowerCase().includes(q) ||
        i.type.toLowerCase().includes(q) ||
        i.address.toLowerCase().includes(q) ||
        (i.notes || '').toLowerCase().includes(q);
      const matchType = filterType === 'All' || i.type === filterType;
      return matchSearch && matchType;
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
  }, [incidents, search, filterType, sortField, sortDir]);

  function handleSort(field) {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  }

  async function handleSave(formData) {
    // If offline, queue the write and optimistically update the local list
    if (!online) {
      const method = formData.id ? 'PATCH' : 'POST';
      const url    = formData.id ? `/api/incidents/${formData.id}` : '/api/incidents';
      offlineQueue.push({ method, url, body: formData, label: `Incident ${formData.incidentNumber || 'new'}` });
      // Optimistic local update so the user sees their change immediately
      setIncidents((prev) =>
        formData.id
          ? prev.map((i) => (i.id === formData.id ? { ...i, ...formData } : i))
          : [{ ...formData, id: `local-${Date.now()}` }, ...prev]
      );
      setFormOpen(false);
      setEditingIncident(null);
      return;
    }
    try {
      if (formData.id) {
        await api.patch(`/api/incidents/${formData.id}`, formData);
      } else {
        await api.post('/api/incidents', formData);
      }
      await fetchIncidents();
    } catch (err) {
      alert(err.message || 'Failed to save incident');
    }
    setFormOpen(false);
    setEditingIncident(null);
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/api/incidents/${id}`);
      await fetchIncidents();
    } catch (err) {
      alert(err.message || 'Failed to delete incident');
    }
    setDeletingIncident(null);
  }

  function handleNewIncident() {
    // ── SPEC R1: open the report in its OWN browser window ──────────────────
    // ⚠️ SYNCHRONOUS, FIRST THING, NO await ABOVE IT. Browsers permit
    // window.open only while a click is being handled; any await severs the
    // user gesture and the popup is silently blocked. The AI-prefill request
    // below deliberately stays AFTER this call for exactly that reason.
    const win = openReportWindow(null);
    if (win) return;   // the window owns the report from here.

    // Blocked (popup blocker, embedded webview, locked-down kiosk browser).
    // A blocked popup must NEVER mean "the button did nothing" — fall back to
    // the in-page modal, which is still a complete, working form.
    setEditingIncident(null);
    setAiPrefill(null);
    setFormOpen(true);
    // Fire AI pre-fill in the background — form is already open and usable
    api.post('/api/ai/action', { action: 'ai_log_incident', module: 'incidents', data: {} })
      .then((res) => {
        if (res.result && typeof res.result === 'object') {
          const ai = res.result;
          setAiPrefill({
            type: ai.type || undefined,
            alarmLevel: ai.alarmLevel || undefined,
            address: ai.address || undefined,
            disposition: ai.disposition || undefined,
            injuries: ai.injuries ?? undefined,
            // `notes` is DELIBERATELY not read (2026-08-07). It is the subpoenable
            // narrative and ships to NERIS verbatim; AI never writes it (doctrine,
            // 2026-06-10). The server strips it too — this is the second lock, not
            // the only one. Do not add it back.
            units: ai.units || undefined,
            personnel: ai.personnel || undefined,
            time: ai.time || undefined,
            dispatchTime: ai.dispatchTime || undefined,
          });
        }
      })
      .catch(() => { /* AI unavailable — form stays with defaults, no interruption */ });
  }

  function SortIcon({ field }) {
    if (sortField !== field) return <ChevronUp className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3.5 w-3.5 text-red-500" />
      : <ChevronDown className="h-3.5 w-3.5 text-red-500" />;
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-gray-500 dark:text-gray-400">
      <Loader2 className="h-8 w-8 animate-spin mr-3" />
      <span className="text-sm">Loading incidents…</span>
    </div>
  );

  if (error) return (
    <div className="rounded-xl bg-red-50 dark:bg-red-950/50 ring-1 ring-red-200 p-8 text-center">
      <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Could not load incidents</p>
      <p className="text-xs text-red-500 mb-4">{error}</p>
      <button onClick={fetchIncidents} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">
        Retry
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Incidents', value: stats.total,    icon: <FileText className="h-5 w-5 text-gray-500 dark:text-gray-400" />,      bg: 'bg-gray-100 dark:bg-gray-800' },
          { label: 'Fire Incidents',  value: stats.fires,    icon: <Flame className="h-5 w-5 text-red-500" />,          bg: 'bg-red-50 dark:bg-red-950/50' },
          { label: 'EMS Responses',   value: stats.ems,      icon: <Ambulance className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,  bg: 'bg-emerald-50 dark:bg-emerald-950/50' },
          { label: 'Total Injuries',  value: stats.injuries, icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,bg: 'bg-amber-50 dark:bg-amber-950/50' },
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
          <input type="text" aria-label="Search incidents" placeholder="Search by incident #, type, address, or notes…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 pl-9 pr-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="Filter by incident type"
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 shadow-sm outline-none focus:ring-2 focus:ring-red-500">
          <option value="All">All Types</option>
          {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <AIActionButton
          action="incident_trends"
          context={{ module: 'incidents' }}
          label="Trend Analysis"
          variant="button"
          resultType="json"
        />
        <button onClick={handleNewIncident}
          className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800 transition-colors">
          <Plus className="h-4 w-4" /> Log Incident
        </button>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 overflow-hidden">
        {displayed.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No incidents match your search.</p>
          </div>
        ) : (
          // FAB_RAIL_GUTTER: the row ACTIONS column reaches the right edge, and the
          // floating widget rail claims the outer 68px of the viewport. Measured on
          // prod 2026-08-06: `Delete incident` was up to 68% covered across four rows
          // — a destructive action on a legal record, partly unclickable and wholly
          // mis-aimable. Vertical padding cannot fix a `fixed` overlay; only this can.
          <div className={`overflow-x-auto ${FAB_RAIL_GUTTER}`}>
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-950">
                <tr>
                  <th className="w-8 px-4 py-3" />
                  {[
                    { field: 'incidentNumber', label: 'Incident #' },
                    { field: 'date',           label: 'Date' },
                    { field: 'time',           label: 'Time' },
                    { field: 'type',           label: 'Type' },
                    { field: 'alarmLevel',     label: 'Alarm' },
                    { field: 'address',        label: 'Location' },
                    { field: 'disposition',    label: 'Disposition' },
                  ].map(({ field, label }) => (
                    <th key={field} scope="col"
                      aria-sort={sortField === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-300">
                      <button type="button" onClick={() => handleSort(field)} className="inline-flex items-center gap-1 w-full text-left cursor-pointer select-none">{label}<SortIcon field={field} /></button>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                {displayed.map((inc) => (
                  <>
                    <tr key={inc.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(expandedId === inc.id ? null : inc.id)}
                    >
                      {/* Expand toggle */}
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === inc.id ? null : inc.id); }}
                          aria-label={`Expand incident ${inc.incidentNumber} details`}
                          aria-expanded={expandedId === inc.id}
                          className="p-0.5"
                        >
                          <ChevronRight className={`h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform ${expandedId === inc.id ? 'rotate-90' : ''}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">{inc.incidentNumber}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{formatDate(inc.date)}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{inc.time}</td>
                      <td className="px-4 py-3.5"><TypeBadge type={inc.type} /></td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          inc.alarmLevel === 'Still' ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' :
                          inc.alarmLevel === 'Working' ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' :
                          'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'}`}>
                          {inc.alarmLevel}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300 max-w-[200px] truncate">{inc.address}</td>
                      <td className="px-4 py-3.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap max-w-[160px] truncate">{inc.disposition}</td>
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setTimelineIncident(inc)}
                            aria-label="View timeline"
                            className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-colors" title="View timeline">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                              <path d="M21 3v5h-5" />
                              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                              <path d="M3 21v-5h5" />
                            </svg>
                          </button>
                          {navigator.share && (
                            <button onClick={() => {
                              const text = [
                                `📋 Incident ${inc.incidentNumber}`,
                                `📅 ${inc.date}  ${inc.time}`,
                                `🔥 ${inc.type} — ${inc.alarmLevel}`,
                                `📍 ${inc.address}`,
                                inc.units.length   ? `🚒 Units: ${inc.units.join(', ')}`         : null,
                                inc.personnel.length ? `👥 Personnel: ${inc.personnel.join(', ')}` : null,
                                inc.injuries > 0   ? `🚑 Injuries: ${inc.injuries}`              : null,
                                inc.disposition    ? `✅ ${inc.disposition}`                       : null,
                                inc.notes          ? `\nNarrative: ${inc.notes}`                  : null,
                              ].filter(Boolean).join('\n');
                              navigator.share({ title: `Incident ${inc.incidentNumber}`, text }).catch(() => {});
                            }}
                              aria-label="Share incident"
                              className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors" title="Share incident">
                              <Share2 className="h-4 w-4" />
                            </button>
                          )}
                          <button onClick={() => {
                            // Same rule as New: synchronous window.open, fall
                            // back to the modal when the browser blocks it.
                            if (openReportWindow(inc.id)) return;
                            setEditingIncident(inc); setFormOpen(true);
                          }}
                            aria-label="Edit incident"
                            className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => setDeletingIncident({ ...inc, name: inc.incidentNumber })}
                            aria-label="Delete incident"
                            className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* ── Expanded detail row ── */}
                    {expandedId === inc.id && (<>
                      <tr key={`${inc.id}-detail`} className="bg-gray-50 dark:bg-gray-950">
                        <td colSpan={9} className="px-8 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Units Responding</p>
                              {inc.units.length ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {inc.units.map((u) => (
                                    <span key={u} className="rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">{u}</span>
                                  ))}
                                </div>
                              ) : <p className="text-gray-500 dark:text-gray-400 text-xs">None recorded</p>}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Personnel ({inc.personnel.length})</p>
                              <div className="flex flex-wrap gap-1">
                                {inc.personnel.map((p) => (
                                  <span key={p} className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 px-2 py-0.5 text-xs text-red-700 dark:text-red-300">
                                    <span className="h-4 w-4 rounded-full bg-red-700 text-white text-xs flex items-center justify-center font-bold">
                                      {p.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                                    </span>
                                    {p.split(' ').slice(-1)[0]}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Injuries</p>
                              <p className={`text-sm font-semibold ${inc.injuries > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {inc.injuries > 0 ? `${inc.injuries} reported` : 'None'}
                              </p>
                            </div>
                            <div className="col-span-1 sm:col-span-3">
                              <ApparatusTimesPanel incidentId={inc.id} />
                            </div>
                            {/* 5.4 — the customer-visible change history for THIS
                                record. Lazy: only mounted when the row is open. */}
                            <div className="col-span-1 sm:col-span-3">
                              <RecordHistory recordType="incidents" recordId={inc.id} title="Change history" />
                            </div>
                            {inc.notes && (
                              <div className="col-span-2 sm:col-span-3">
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Narrative</p>
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{inc.notes}</p>
                              </div>
                            )}
                            {inc.photos?.length > 0 && (
                              <div className="col-span-2 sm:col-span-3">
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                  Scene Media ({inc.photos.length})
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {inc.photos.map((url, i) =>
                                    url.includes('/video/upload/') ? (
                                      <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                                        className="relative block h-20 w-20 sm:h-24 sm:w-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-red-400 hover:shadow-md transition-all flex-shrink-0 bg-gray-900"
                                        title={`Video ${i + 1} — open`}>
                                        <video src={url} className="h-full w-full object-cover opacity-80"
                                          preload="metadata" playsInline muted />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <div className="bg-black/50 rounded-full p-1.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                                              fill="white" className="h-4 w-4"><path d="M8 5v14l11-7z"/></svg>
                                          </div>
                                        </div>
                                        <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wide">
                                          Video
                                        </span>
                                      </a>
                                    ) : (
                                      <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                                        className="block h-20 w-20 sm:h-24 sm:w-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-red-400 hover:shadow-md transition-all flex-shrink-0"
                                        title={`Photo ${i + 1} — open full size`}>
                                        <img src={url} alt={`Scene photo ${i + 1}`}
                                          className="h-full w-full object-cover" />
                                      </a>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* AI Actions */}
                      <tr key={`${inc.id}-ai`} className="bg-gray-50 dark:bg-gray-950">
                        <td colSpan={9} className="px-8 py-3">
                          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">AI Actions</p>
                            <div className="flex flex-wrap gap-2">
                              <AIActionButton
                                action="analyze_incident"
                                context={{ module: 'incidents', recordId: inc.id, data: inc }}
                                label="Analyze Response"
                                variant="inline"
                                resultType="json"
                              />
                              {/* No "Draft Narrative" action: AI plays zero role in
                                  incident narratives (doctrine 2026-06-10) — the officer
                                  writes the narrative directly in the incident form. */}
                              <AIActionButton
                                action="draft_after_action"
                                context={{ module: 'incidents', recordId: inc.id, data: inc }}
                                label="Draft After-Action"
                                variant="inline"
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                      {/* Document Package (Phase 5) */}
                      <tr key={`${inc.id}-package`} className="bg-gray-50 dark:bg-gray-950">
                        <td colSpan={9} className="px-8 py-3">
                          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                            <DocumentPackagePanel incidentId={inc.id} incidentData={inc} />
                          </div>
                        </td>
                      </tr>
                      {/* Completeness Panel */}
                      <tr key={`${inc.id}-completeness`} className="bg-gray-50 dark:bg-gray-950">
                        <td colSpan={9} className="px-8 py-3">
                          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                            <CompletenessPanel incidentId={inc.id} incidentData={inc} />
                          </div>
                        </td>
                      </tr>
                      {/* Linked Meetings */}
                      <tr key={`${inc.id}-linked`} className="bg-gray-50 dark:bg-gray-950">
                        <td colSpan={9} className="px-8 py-4">
                          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                            <LinkedMeetings module="incidents" recordId={inc.id} recordLabel={inc.incidentNumber || inc.type} />
                            <Attachments module="incidents" recordId={inc.id} recordLabel={inc.incidentNumber || inc.type} />
                          </div>
                        </td>
                      </tr>
                    </>)}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        Showing {displayed.length} of {incidents.length} incidents
        {filterType !== 'All' && ` · Filtered by: ${filterType}`}
      </p>

      {formOpen && (
        <IncidentForm incident={editingIncident} nextNumber={nextNumber} aiPrefill={aiPrefill}
          onSave={handleSave} onClose={() => { setFormOpen(false); setEditingIncident(null); setAiPrefill(null); }} />
      )}
      {deletingIncident && (
        <DeleteConfirm member={deletingIncident} onConfirm={handleDelete} onCancel={() => setDeletingIncident(null)} />
      )}
      {timelineIncident && (
        <IncidentTimeline incident={timelineIncident} onClose={() => setTimelineIncident(null)} />
      )}
    </div>
  );
}
