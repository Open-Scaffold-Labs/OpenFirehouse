import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Plus, Search, ChevronDown, ChevronUp,
  CheckCircle, XCircle, AlertTriangle, Clock, FileText,
  Shield, Phone, Mail, Flame, Loader2,
} from 'lucide-react';
import {
  RESULT_COLORS, PERMIT_STATUS_COLORS, INSPECTION_TYPES,
  INSPECTION_RESULTS, VIOLATION_CODES,
} from '../data/fireInspections';
import { api } from '../utils/api';
import FireInspectionForm from './FireInspectionForm';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';
import AIActionButton from './AIActionButton';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resultIcon(result) {
  if (!result) return <Clock size={12} className="text-gray-400" />;
  if (result === 'Pass') return <CheckCircle size={12} className="text-green-600 dark:text-green-400" />;
  if (result === 'Fail') return <XCircle size={12} className="text-red-600 dark:text-red-400" />;
  return <AlertTriangle size={12} className="text-amber-500" />;
}

function openViolations(inspection) {
  return (inspection.violations ?? []).filter(v => v.status !== 'Corrected').length;
}

function daysTil(dateStr) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr) - new Date('2026-03-06')) / 86400000);
  return diff;
}

// ─── Property Card ─────────────────────────────────────────────────────────────

function PropertyCard({ property, inspections, permits, onAddInspection, onAddPermit }) {
  const [open, setOpen] = useState(false);
  const propInspections = inspections.filter(i => i.propertyId === property.id);
  const propPermits     = permits.filter(p => p.propertyId === property.id);
  const latest          = propInspections.sort((a, b) => (b.completedDate ?? '').localeCompare(a.completedDate ?? ''))[0];
  const openViol        = propInspections.reduce((n, i) => n + openViolations(i), 0);
  const expiredPermits  = propPermits.filter(p => p.status === 'Expired').length;

  const hasAlert = openViol > 0 || expiredPermits > 0 || property.sprinklered === false;

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl border shadow-sm overflow-hidden ${hasAlert ? 'border-amber-300 dark:border-amber-800' : 'border-gray-100 dark:border-gray-700'}`}>
      {/* Card header */}
      <div
        onClick={() => setOpen(o => !o)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`Toggle details for ${property.name}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
        className="px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 flex items-start gap-4"
      >
        {/* Icon */}
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          property.hazmatOnsite ? 'bg-red-100 dark:bg-red-950/50' : 'bg-blue-50 dark:bg-blue-950/50'
        }`}>
          {property.hazmatOnsite
            ? <Flame size={18} className="text-red-600 dark:text-red-400" />
            : <Building2 size={18} className="text-blue-600 dark:text-blue-400" />
          }
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black text-gray-900 dark:text-gray-100">{property.name}</p>
            {property.hazmatOnsite && (
              <span className="text-[9px] font-bold bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded-full">HAZMAT</span>
            )}
            {!property.sprinklered && (
              <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full">No Sprinkler</span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{property.address}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{property.occupancyType} · {property.squareFootage?.toLocaleString()} sq ft · {property.stories} {property.stories === 1 ? 'story' : 'stories'}</p>
        </div>

        {/* Badges */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {latest ? (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${RESULT_COLORS[latest.result] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
              {resultIcon(latest.result)} {latest.result ?? 'Scheduled'}
            </span>
          ) : (
            <span className="text-[10px] text-gray-400">No inspections</span>
          )}
          {openViol > 0 && (
            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-full">
              {openViol} open violation{openViol > 1 ? 's' : ''}
            </span>
          )}
          {expiredPermits > 0 && (
            <span className="text-[10px] font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 px-2 py-0.5 rounded-full">
              {expiredPermits} expired permit{expiredPermits > 1 ? 's' : ''}
            </span>
          )}
          {open ? <ChevronUp size={14} className="text-gray-400 mt-1" /> : <ChevronDown size={14} className="text-gray-400 mt-1" />}
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 space-y-5 bg-gray-50 dark:bg-gray-950">
          {/* Owner info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Owner / Contact</p>
              <p className="font-semibold text-gray-800 dark:text-gray-100">{property.ownerName}</p>
              {property.contactName && <p className="text-gray-600 dark:text-gray-300">Contact: {property.contactName}</p>}
              <div className="flex gap-3 mt-1">
                {property.ownerPhone && (
                  <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400"><Phone size={10} />{property.ownerPhone}</span>
                )}
                {property.ownerEmail && (
                  <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400"><Mail size={10} />{property.ownerEmail}</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Building Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-gray-700 dark:text-gray-300">
                <span>Occupant Load: <strong>{property.occupantLoad}</strong></span>
                <span>Sprinklered: <strong>{property.sprinklered ? 'Yes' : 'No'}</strong></span>
                <span>Alarm Monitored: <strong>{property.alarmMonitored ? 'Yes' : 'No'}</strong></span>
                <span>HazMat On-Site: <strong>{property.hazmatOnsite ? 'Yes' : 'No'}</strong></span>
              </div>
            </div>
          </div>

          {/* Inspections */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Inspection History</p>
              <button onClick={() => onAddInspection(property)}
                className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
                <Plus size={10} /> Add Inspection
              </button>
            </div>
            {propInspections.length === 0
              ? <p className="text-xs text-gray-400">No inspections on record.</p>
              : (
                <div className="space-y-2">
                  {propInspections
                    .sort((a,b) => (b.scheduledDate ?? '').localeCompare(a.scheduledDate ?? ''))
                    .map(insp => (
                      <div key={insp.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <p className="text-xs font-bold text-gray-800 dark:text-gray-100">{insp.type}</p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">
                              Scheduled: {insp.scheduledDate}
                              {insp.completedDate && ` · Completed: ${insp.completedDate}`}
                              {` · Inspector: ${insp.inspectorName}`}
                            </p>
                          </div>
                          {insp.result && (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${RESULT_COLORS[insp.result]}`}>
                              {resultIcon(insp.result)} {insp.result}
                            </span>
                          )}
                        </div>
                        {insp.violations.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {insp.violations.map((v, vi) => {
                              const def = VIOLATION_CODES.find(c => c.code === v.code);
                              return (
                                <div key={vi} className={`flex items-start gap-2 text-[10px] px-2 py-1 rounded-lg ${
                                  v.status === 'Corrected' ? 'bg-green-50 dark:bg-green-950/50 text-green-800 dark:text-green-300' : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                                }`}>
                                  <span className="font-mono font-bold">{v.code}</span>
                                  <span className="flex-1">{def?.desc ?? v.code}</span>
                                  <span className="font-bold flex-shrink-0">{v.status}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {insp.notes && (
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 italic">{insp.notes}</p>
                        )}
                      </div>
                    ))}
                </div>
              )}
          </div>

          {/* Permits */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Permits</p>
              <button onClick={() => onAddPermit(property)}
                className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
                <Plus size={10} /> Add Permit
              </button>
            </div>
            {propPermits.length === 0
              ? <p className="text-xs text-gray-400">No permits on record.</p>
              : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {propPermits.map(permit => {
                    const days = daysTil(permit.expiresDate);
                    return (
                      <div key={permit.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-gray-800 dark:text-gray-100 truncate">{permit.type}</p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${PERMIT_STATUS_COLORS[permit.status]}`}>
                            {permit.status}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-gray-500 dark:text-gray-400">{permit.permitNumber}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                          Expires: {permit.expiresDate}
                          {days !== null && days <= 90 && days >= 0 && (
                            <span className="text-amber-600 dark:text-amber-400 font-bold ml-1">({days}d remaining)</span>
                          )}
                          {days !== null && days < 0 && (
                            <span className="text-red-600 dark:text-red-400 font-bold ml-1">(expired {Math.abs(days)}d ago)</span>
                          )}
                        </p>
                        {permit.conditions && (
                          <p className="text-[10px] text-gray-400 mt-1 line-clamp-2">{permit.conditions}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
          </div>

          {/* AI Actions */}
          <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">AI Actions</p>
            <div className="flex flex-wrap gap-2">
              <AIActionButton
                action="analyze_inspection"
                context={{ module: 'inspections', recordId: property.id, data: property }}
                label="Risk Analysis"
                variant="inline"
                resultType="json"
              />
              <AIActionButton
                action="crr_analysis"
                context={{ module: 'inspections' }}
                label="CRR Analysis"
                variant="inline"
                resultType="json"
              />
            </div>
          </div>

          {/* Linked Meetings */}
          <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
            <LinkedMeetings module="inspections" recordId={property.id} recordLabel={property.name || 'Inspection'} />
            <Attachments module="inspections" recordId={property.id} recordLabel={property.name || 'Inspection'} />
          </div>

          {property.notes && (
            <p className="text-[10px] text-gray-500 dark:text-gray-400 italic border-t border-gray-100 dark:border-gray-700 pt-3">{property.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FireInspections() {
  const [properties,   setProperties]   = useState([]);
  const [inspections,  setInspections]  = useState([]);
  const [permits,      setPermits]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [search,       setSearch]       = useState('');
  const [filterAlert,  setFilterAlert]  = useState(false);
  const [formOpen,     setFormOpen]     = useState(false);
  const [formMode,     setFormMode]     = useState('inspection'); // 'inspection' | 'permit'
  const [activeProperty, setActiveProperty] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [prRes, insRes, pmRes] = await Promise.all([
        api.get('/api/fi-properties'),
        api.get('/api/fi-inspections'),
        api.get('/api/fi-permits'),
      ]);
      setProperties(prRes.data  ?? []);
      setInspections(insRes.data ?? []);
      setPermits(pmRes.data      ?? []);
    } catch (e) {
      setError('Could not load fire inspection data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Stats
  const totalOpen = inspections.reduce((n, i) => n + openViolations(i), 0);
  const expiredPm = permits.filter(p => p.status === 'Expired').length;
  const dueSoon   = permits.filter(p => { const d = daysTil(p.expiresDate); return d !== null && d >= 0 && d <= 90; }).length;
  const noSpklr   = properties.filter(p => !p.sprinklered).length;

  const filtered = properties.filter(p => {
    const q = search.toLowerCase();
    const matchQ = !q || p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q);
    if (!matchQ) return false;
    if (!filterAlert) return true;
    const propInsp = inspections.filter(i => i.propertyId === p.id);
    const propPerm = permits.filter(pm => pm.propertyId === p.id);
    const hasOpen  = propInsp.some(i => openViolations(i) > 0);
    const hasExp   = propPerm.some(pm => pm.status === 'Expired');
    const noSpr    = !p.sprinklered;
    return hasOpen || hasExp || noSpr;
  });

  async function handleSaveInspection(data) {
    try {
      if (data.id) {
        const res = await api.patch(`/api/fi-inspections/${data.id}`, data);
        setInspections(prev => prev.map(i => i.id === data.id ? res.data : i));
      } else {
        const res = await api.post('/api/fi-inspections', data);
        setInspections(prev => [...prev, res.data]);
      }
      setFormOpen(false);
    } catch (e) {
      console.error('Failed to save inspection', e);
    }
  }

  async function handleSavePermit(data) {
    try {
      if (data.id) {
        const res = await api.patch(`/api/fi-permits/${data.id}`, data);
        setPermits(prev => prev.map(p => p.id === data.id ? res.data : p));
      } else {
        const res = await api.post('/api/fi-permits', data);
        setPermits(prev => [...prev, res.data]);
      }
      setFormOpen(false);
    } catch (e) {
      console.error('Failed to save permit', e);
    }
  }

  function openInspectionForm(property) {
    setActiveProperty(property);
    setFormMode('inspection');
    setFormOpen(true);
  }

  function openPermitForm(property) {
    setActiveProperty(property);
    setFormMode('permit');
    setFormOpen(true);
  }

  if (loading) return (
    <div className="p-6 flex items-center gap-2 text-gray-500 dark:text-gray-400">
      <Loader2 size={16} className="animate-spin" /> Loading fire inspection data…
    </div>
  );

  if (error) return (
    <div className="p-6 space-y-2">
      <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
      <button onClick={load} className="text-sm text-red-600 dark:text-red-400 underline">Retry</button>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100">Fire Inspections & Permits</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{properties.length} properties · {inspections.length} inspections on record</p>
        </div>
        <button onClick={() => { setActiveProperty(null); setFormMode('inspection'); setFormOpen(true); }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-sm">
          <Plus size={15} /> New Inspection
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Open Violations', value: totalOpen, color: totalOpen > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-gray-100', bg: totalOpen > 0 ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900' : '' },
          { label: 'Expired Permits', value: expiredPm, color: expiredPm > 0 ? 'text-red-700 dark:text-red-300'   : 'text-gray-900 dark:text-gray-100', bg: expiredPm > 0 ? 'bg-red-50 dark:bg-red-950/50   border-red-200 dark:border-red-900'   : '' },
          { label: 'Permits Due ≤90d', value: dueSoon,  color: dueSoon > 0  ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-gray-100', bg: '' },
          { label: 'Unsprinklered',   value: noSpklr,  color: noSpklr > 0  ? 'text-orange-700 dark:text-orange-300': 'text-gray-900 dark:text-gray-100', bg: noSpklr > 0 ? 'bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-900' : '' },
        ].map(s => (
          <div key={s.label} className={`bg-white dark:bg-gray-900 rounded-2xl border px-4 py-3 shadow-sm ${s.bg || 'border-gray-100 dark:border-gray-700'}`}>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Search property name or address"
            placeholder="Search property name or address…"
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100" />
        </div>
        <button onClick={() => setFilterAlert(f => !f)}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border transition-colors ${
            filterAlert
              ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
              : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}>
          <AlertTriangle size={13} />
          Alerts Only
        </button>
      </div>

      {/* Property cards */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-12">No properties match your search.</p>
        )}
        {filtered.map(property => (
          <PropertyCard
            key={property.id}
            property={property}
            inspections={inspections}
            permits={permits}
            onAddInspection={openInspectionForm}
            onAddPermit={openPermitForm}
          />
        ))}
      </div>

      {/* Form modal */}
      {formOpen && (
        <FireInspectionForm
          mode={formMode}
          property={activeProperty}
          properties={properties}
          onSaveInspection={handleSaveInspection}
          onSavePermit={handleSavePermit}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
