import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, Plus, Search, MapPin, Building2, Shield,
  AlertTriangle, Droplets, Flame, Zap, FileText,
  Phone, User, ChevronDown, ChevronUp, Pencil, Trash2,
  CheckCircle2, XCircle, Calendar, Wrench, Layers, Loader2, Download, Paperclip,
} from 'lucide-react';
import {
  RISK_LEVELS, RISK_COLORS,
  OCCUPANCY_TYPES,
} from '../data/prePlans';
import { api } from '../utils/api';
import PrePlanForm from './PrePlanForm';
import AIActionButton from './AIActionButton';
import AttachmentGallery from './AttachmentGallery';
import { loadMapKit, resolveCoordinate } from '../utils/mapkit';
import { nfpa291Class, nfpaGlyph } from '../utils/nfpa291';

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function RiskBadge({ level, size = 'sm' }) {
  const c = RISK_COLORS[level] ?? RISK_COLORS['Moderate'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold border text-xs ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {level} Risk
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color = 'text-gray-700 dark:text-gray-300' }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-start gap-3">
      <div className="p-2 bg-gray-50 dark:bg-gray-950 rounded-lg"><Icon size={18} className={color} /></div>
      <div>
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className={`text-2xl font-bold leading-none mt-0.5 ${color}`}>{value}</p>
      </div>
    </div>
  );
}

// ─── Pre-Plan Building Intel Map ──────────────────────────────────────────────

function PrePlanMap({ plan }) {
  const mapRef    = useRef(null);
  const mapObj    = useRef(null);
  const [status,  setStatus]  = useState('loading'); // loading | ready | error
  const [hydCount, setHydCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!mapRef.current || !plan.address) { setStatus('error'); return; }
      try {
        const mk = await loadMapKit();
        if (cancelled) return;

        // Geocode the address
        const coord = await resolveCoordinate(plan.address, mk);
        if (!coord || cancelled) { setStatus('error'); return; }

        mapObj.current = new mk.Map(mapRef.current, {
          mapType: mk.Map.MapTypes.Satellite,
          region: new mk.CoordinateRegion(coord, new mk.CoordinateSpan(0.004, 0.004)),
          showsUserLocation: false,
        });

        // Property pin
        const propAnn = new mk.MarkerAnnotation(coord, {
          color: '#dc2626',
          glyphText: '🏢',
          title: plan.occupancyName,
          subtitle: plan.address,
        });
        mapObj.current.addAnnotation(propAnn);

        // Fetch nearby hydrants
        try {
          const res = await api.get(`/api/hydrants/nearby?lat=${coord.latitude}&lng=${coord.longitude}&radius=500`);
          const nearby = res?.data ?? [];
          if (!cancelled && nearby.length) {
            setHydCount(nearby.length);
            const hydAnns = nearby.map(h => {
              const cls = nfpa291Class(h.flowRate);
              return new mk.MarkerAnnotation(
                new mk.Coordinate(h.lat, h.lng),
                {
                  color:     cls.pinColor,
                  glyphText: nfpaGlyph(cls),
                  title:     `#${h.hydrantNumber}`,
                  subtitle:  h.flowRate ? `${h.flowRate} GPM` : 'Unrated',
                }
              );
            });
            mapObj.current.addAnnotations(hydAnns);
          }
        } catch { /* hydrants optional — don't fail the map */ }

        if (!cancelled) setStatus('ready');
      } catch (err) {
        console.error('PrePlanMap error', err);
        if (!cancelled) setStatus('error');
      }
    }
    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-red-600" />
          <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Building Intel Map</p>
          {hydCount > 0 && (
            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 px-2 py-0.5 rounded-full">
              {hydCount} hydrant{hydCount !== 1 ? 's' : ''} within 500m
            </span>
          )}
        </div>
        {status === 'loading' && <Loader2 size={13} className="animate-spin text-gray-400" />}
      </div>

      {/* CRITICAL: explicit px height — MapKit's .mk-map-view is height:100% and resolves to 0 against min-height */}
      <div style={{ position: 'relative', height: '280px' }}>
        <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />

        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <div className="text-center">
              <MapPin size={24} className="mx-auto mb-2 text-gray-300" />
              <p className="text-xs text-gray-400">Map unavailable — address may not be geocodable</p>
            </div>
          </div>
        )}
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        )}
      </div>

      <div className="px-5 py-2 bg-gray-50 dark:bg-gray-950 flex items-center gap-3 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600 inline-block" /> Property</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> ≥1500 GPM</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> 1000+ GPM</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> 500+ GPM</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> &lt;500 GPM</span>
      </div>
    </div>
  );
}

// ─── Section accordion ────────────────────────────────────────────────────────

function Section({ title, icon: Icon, iconColor = 'text-red-600 dark:text-red-400', defaultOpen = true, collapseSignal, children }) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (collapseSignal) setOpen(false);
  }, [collapseSignal]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon size={16} className={iconColor} />
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{title}</span>
        </div>
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ─── Plan Detail ──────────────────────────────────────────────────────────────

function PlanDetail({ plan, onBack, onEdit, onDelete }) {
  const staleDays = plan.lastUpdated
    ? Math.floor((Date.now() - new Date(plan.lastUpdated)) / (1000 * 60 * 60 * 24))
    : null;
  const isStale = staleDays !== null && staleDays > 180;
  const [collapseSignal, setCollapseSignal] = useState(0);

  return (
    <div className="space-y-5">
      {/* Back + Collapse All */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-red-700 transition-colors font-medium"
        >
          <ArrowLeft size={16} />
          Back to Pre-Incident Plans
        </button>
        <button onClick={() => setCollapseSignal(s => s + 1)}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">
          Collapse All
        </button>
      </div>

      {/* Header card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className={`h-2 ${RISK_COLORS[plan.riskLevel]?.dot ?? 'bg-gray-400'}`} />
        <div className="px-6 py-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{plan.occupancyName}</h2>
              <p className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-sm mt-1">
                <MapPin size={13} className="text-gray-400" />
                {plan.address}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <RiskBadge level={plan.riskLevel} />
                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-0.5">
                  {plan.occupancyType}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <AIActionButton
                action="enhance_preplan"
                context={{ module: 'preplans', recordId: plan.id, data: plan }}
                label="Enhance Plan"
                variant="inline"
                resultType="json"
              />
              <AIActionButton
                action="generate_sizeup"
                context={{ module: 'preplans', recordId: plan.id, data: plan }}
                label="Tactical Size-Up"
                variant="inline"
                resultType="json"
              />
              <button onClick={() => onEdit(plan)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                <Pencil size={13} /> Edit
              </button>
              <a
                href={`/api/pre-plans/${plan.id}/export.pdf`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors no-underline"
              >
                <Download size={13} /> Export PDF
              </a>
              <button onClick={() => onDelete(plan.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors">
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>

          {/* Quick facts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-sm">
            {[
              { label: 'Construction',    value: plan.constructionType?.split('—')[1]?.trim() ?? plan.constructionType },
              { label: 'Year Built',      value: plan.yearBuilt ?? '—' },
              { label: 'Stories',         value: plan.stories ? `${plan.stories} floor${plan.stories > 1 ? 's' : ''}` : '—' },
              { label: 'Square Footage',  value: plan.sqFootage ? `${plan.sqFootage.toLocaleString()} sq ft` : '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="font-semibold text-gray-800 dark:text-gray-100">{value}</p>
              </div>
            ))}
          </div>

          {/* Update / inspection row */}
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Calendar size={12} className="text-gray-400" />
              Last Inspection: <span className="font-medium text-gray-700 dark:text-gray-300 ml-1">{fmtDate(plan.lastInspection)}</span>
            </span>
            <span className={`flex items-center gap-1 ${isStale ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}`}>
              <Wrench size={12} className={isStale ? 'text-amber-500' : 'text-gray-400'} />
              Last Updated: <span className="font-medium ml-1">{fmtDate(plan.lastUpdated)}</span>
              {isStale && <span className="text-amber-600 dark:text-amber-400"> — review recommended</span>}
            </span>
            <span className="flex items-center gap-1">
              <User size={12} className="text-gray-400" />
              By: <span className="font-medium text-gray-700 dark:text-gray-300 ml-1">{plan.lastUpdatedBy}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Building intel map + hydrant overlay */}
      <PrePlanMap plan={plan} />

      {/* General notes */}
      {plan.notes && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-2xl px-5 py-4">
          <p className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide mb-1">Tactical Notes</p>
          <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">{plan.notes}</p>
        </div>
      )}

      {/* Contacts */}
      <Section title="Contacts" icon={Phone} iconColor="text-blue-600 dark:text-blue-400" collapseSignal={collapseSignal}>
        {plan.contacts?.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {plan.contacts.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 first:pt-1">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{c.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{c.role}</p>
                </div>
                <a href={`tel:${c.phone}`}
                  className="text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline flex items-center gap-1">
                  <Phone size={12} /> {c.phone}
                </a>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-400 pt-1">No contacts on file.</p>}
      </Section>

      {/* Hazards */}
      <Section title={`Hazards (${plan.hazards?.length ?? 0})`} icon={AlertTriangle} iconColor="text-orange-600 dark:text-orange-400" collapseSignal={collapseSignal}>
        {plan.hazards?.length > 0 ? (
          <div className="space-y-3 pt-1">
            {plan.hazards.map((h, i) => (
              <div key={i} className="bg-orange-50 dark:bg-orange-950/50 border border-orange-100 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-orange-700 dark:text-orange-300 uppercase tracking-wide">{h.type}</span>
                </div>
                <p className="text-xs text-orange-800 dark:text-orange-300 flex items-start gap-1.5 mb-1">
                  <MapPin size={11} className="mt-0.5 flex-shrink-0 text-orange-500" />
                  {h.location}
                </p>
                {h.notes && <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{h.notes}</p>}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-400 pt-1">No hazards documented.</p>}
      </Section>

      {/* Access */}
      <Section title="Access Points" icon={MapPin} iconColor="text-emerald-600 dark:text-emerald-400" collapseSignal={collapseSignal}>
        <div className="space-y-3 pt-1 text-sm">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Primary</p>
            <p className="text-gray-800 dark:text-gray-100">{plan.access?.primary || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Secondary</p>
            <p className="text-gray-800 dark:text-gray-100">{plan.access?.secondary || '—'}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Knox Box</p>
              <p className="text-gray-800 dark:text-gray-100">
                {plan.access?.lockbox || '—'}
                {plan.access?.lockbox && (
                  <button onClick={() => onNavigate?.('knox-keys')} className="ml-2 text-[10px] text-red-600 dark:text-red-400 hover:text-red-800 font-semibold">View in Knox Mgmt</button>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Gate Code</p>
              <p className="font-mono text-gray-800 dark:text-gray-100">{plan.access?.gateCode || '—'}</p>
            </div>
          </div>
          {plan.access?.notes && (
            <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 dark:text-blue-300">
              {plan.access.notes}
            </div>
          )}
        </div>
      </Section>

      {/* Water Supply */}
      <Section title={`Water Supply (${plan.waterSupply?.length ?? 0} source${(plan.waterSupply?.length ?? 0) !== 1 ? 's' : ''})`} icon={Droplets} iconColor="text-blue-600 dark:text-blue-400" collapseSignal={collapseSignal}>
        {plan.waterSupply?.length > 0 ? (
          <div className="overflow-x-auto pt-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                  <th className="text-left py-2 pr-4">Type</th>
                  <th className="text-left py-2 pr-4">ID</th>
                  <th className="text-left py-2 pr-4">Distance</th>
                  <th className="text-left py-2 pr-4">Flow (GPM)</th>
                  <th className="text-left py-2">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {plan.waterSupply.map((w, i) => (
                  <tr key={i} className="hover:bg-blue-50 dark:hover:bg-blue-950/50">
                    <td className="py-2 pr-4 font-medium text-blue-700 dark:text-blue-300">{w.type}</td>
                    <td className="py-2 pr-4 font-mono text-gray-700 dark:text-gray-300">{w.hydrantId || '—'}</td>
                    <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">{w.distance ? `${w.distance} ft` : '—'}</td>
                    <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">{w.flowGPM ? `${w.flowGPM.toLocaleString()}` : '—'}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-300 text-xs">{w.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-gray-400 pt-1">No water supply sources documented.</p>}
      </Section>

      {/* Suppression */}
      <Section title="Suppression Systems" icon={Flame} iconColor="text-red-600 dark:text-red-400" collapseSignal={collapseSignal}>
        <div className="pt-1 space-y-4">
          {/* System presence */}
          <div className="flex flex-wrap gap-4">
            {[
              { label: 'Sprinkler System', value: plan.suppression?.sprinklered },
              { label: 'Standpipe',        value: plan.suppression?.standpipe   },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2">
                {value
                  ? <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
                  : <XCircle      size={16} className="text-gray-300 dark:text-gray-600"  />}
                <span className={`text-sm font-medium ${value ? 'text-green-700 dark:text-green-300' : 'text-gray-400'}`}>{label}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {[
              { label: 'FDC Location',   value: plan.suppression?.FDC       },
              { label: 'Alarm Panel',    value: plan.suppression?.alarmPanel },
              { label: 'Main Shutoff',   value: plan.suppression?.shutoff    },
            ].map(({ label, value }) => value ? (
              <div key={label}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
                <p className="text-gray-800 dark:text-gray-100">{value}</p>
              </div>
            ) : null)}
          </div>
          {plan.suppression?.notes && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-100 rounded-xl p-3 text-xs text-red-800 dark:text-red-300">
              {plan.suppression.notes}
            </div>
          )}
        </div>
      </Section>

      {/* Utilities */}
      <Section title="Utility Shutoffs" icon={Zap} iconColor="text-yellow-600 dark:text-yellow-400" collapseSignal={collapseSignal}>
        <div className="space-y-3 pt-1 text-sm">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Gas Shutoff</p>
            <p className="text-gray-800 dark:text-gray-100">{plan.utilities?.gasShutoff || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Electrical Panel</p>
            <p className="text-gray-800 dark:text-gray-100">{plan.utilities?.electrical || '—'}</p>
          </div>
          {plan.utilities?.notes && (
            <div className="bg-yellow-50 dark:bg-yellow-950/50 border border-yellow-100 rounded-xl p-3 text-xs text-yellow-800 dark:text-yellow-300">
              {plan.utilities.notes}
            </div>
          )}
        </div>
      </Section>

      {/* Attachments */}
      <Section title="Photos & Attachments" icon={Paperclip} iconColor="text-indigo-600 dark:text-indigo-400" collapseSignal={collapseSignal}>
        <div className="pt-1">
          <AttachmentGallery planId={plan.id} />
        </div>
      </Section>
    </div>
  );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({ plan, onClick }) {
  const c = RISK_COLORS[plan.riskLevel] ?? RISK_COLORS['Moderate'];
  const hazardCount = plan.hazards?.length ?? 0;
  const hydrantCount = plan.waterSupply?.length ?? 0;
  const staleDays = plan.lastUpdated
    ? Math.floor((Date.now() - new Date(plan.lastUpdated)) / (1000 * 60 * 60 * 24))
    : null;
  const isStale = staleDays !== null && staleDays > 180;

  return (
    <button
      onClick={onClick}
      className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-red-200 transition-all text-left w-full group"
    >
      <div className={`h-1.5 rounded-t-2xl ${c.dot}`} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="font-bold text-gray-900 dark:text-gray-100 leading-snug group-hover:text-red-700 transition-colors line-clamp-2">
              {plan.occupancyName}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
              <MapPin size={10} /> {plan.address}
            </p>
          </div>
          <RiskBadge level={plan.riskLevel} />
        </div>

        <p className="text-xs text-gray-400 mb-3 line-clamp-1">{plan.occupancyType}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 text-center border-t border-gray-100 dark:border-gray-700 pt-3 gap-1">
          <div>
            <p className="text-base font-bold text-gray-800 dark:text-gray-100">{hazardCount}</p>
            <p className="text-xs text-gray-400">Hazards</p>
          </div>
          <div className="border-x border-gray-100 dark:border-gray-700">
            <p className="text-base font-bold text-gray-800 dark:text-gray-100">{hydrantCount}</p>
            <p className="text-xs text-gray-400">Water Src.</p>
          </div>
          <div>
            <p className={`text-base font-bold ${isStale ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'}`}>
              {plan.stories ?? '—'}
            </p>
            <p className="text-xs text-gray-400">Stories</p>
          </div>
        </div>

        {isStale && (
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
              <AlertTriangle size={11} /> Plan review recommended
            </p>
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PreIncidentPlans({ onNavigate }) {
  const [plans,    setPlans]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [search,   setSearch]   = useState('');
  const [riskFilter, setRiskFilter] = useState('All');

  const fetchPlans = useCallback(async () => {
    try {
      const res = await api.get('/api/pre-plans');
      setPlans(res.data);
    } catch (e) { console.error('Failed to fetch pre-plans', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const filtered = useMemo(() => {
    return plans.filter((p) => {
      if (riskFilter !== 'All' && p.riskLevel !== riskFilter) return false;
      const q = search.toLowerCase();
      return !q || p.occupancyName.toLowerCase().includes(q) || p.address.toLowerCase().includes(q) || p.occupancyType.toLowerCase().includes(q);
    });
  }, [plans, search, riskFilter]);

  async function handleSave(plan) {
    try {
      if (plan.id && plans.some((p) => p.id === plan.id)) {
        const res = await api.patch(`/api/pre-plans/${plan.id}`, plan);
        setPlans((ps) => ps.map((p) => (p.id === plan.id ? res.data : p)));
        if (selected?.id === plan.id) setSelected(res.data);
      } else {
        const res = await api.post('/api/pre-plans', plan);
        setPlans((ps) => [...ps, res.data]);
      }
    } catch (e) { console.error('Failed to save pre-plan', e); }
    setFormOpen(false);
    setEditing(null);
  }

  async function handleDelete(id) {
    if (window.confirm('Delete this pre-incident plan?')) {
      try {
        await api.delete(`/api/pre-plans/${id}`);
        setPlans((ps) => ps.filter((p) => p.id !== id));
        setSelected(null);
      } catch (e) { console.error('Failed to delete pre-plan', e); }
    }
  }

  function handleEdit(plan) {
    setEditing(plan);
    setFormOpen(true);
  }

  // Stats
  const critical  = plans.filter((p) => p.riskLevel === 'Critical').length;
  const high      = plans.filter((p) => p.riskLevel === 'High').length;
  const needsUpdate = plans.filter((p) => {
    if (!p.lastUpdated) return true;
    return Math.floor((Date.now() - new Date(p.lastUpdated)) / (1000 * 60 * 60 * 24)) > 180;
  }).length;

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading pre-incident plans…</div>;

  if (selected) {
    return (
      <div className="p-6">
        <PlanDetail
          plan={selected}
          onBack={() => setSelected(null)}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
        {formOpen && (
          <PrePlanForm
            plan={editing}
            onSave={handleSave}
            onClose={() => { setFormOpen(false); setEditing(null); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pre-Incident Plans</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Occupancy hazards, access, water supply, and suppression info.</p>
        </div>
        <button
          onClick={() => { setEditing(null); setFormOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800 transition-colors shadow-sm"
        >
          <Plus size={16} /> Add Plan
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Building2}    label="Total Plans"      value={plans.length}  color="text-gray-700 dark:text-gray-300" />
        <StatCard icon={AlertTriangle} label="Critical Risk"   value={critical}      color="text-red-700 dark:text-red-300" />
        <StatCard icon={Shield}        label="High Risk"       value={high}          color="text-orange-600 dark:text-orange-400" />
        <StatCard icon={FileText}      label="Needs Review"    value={needsUpdate}   color="text-amber-600 dark:text-amber-400" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, address, or type…"
            aria-label="Search pre-incident plans"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="flex gap-1.5">
          {['All', ...RISK_LEVELS].map((r) => (
            <button
              key={r}
              onClick={() => setRiskFilter(r)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                riskFilter === r
                  ? 'bg-red-700 text-white border-red-700'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No pre-incident plans match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => (
            <PlanCard key={p.id} plan={p} onClick={() => setSelected(p)} />
          ))}
        </div>
      )}

      {formOpen && (
        <PrePlanForm
          plan={editing}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
