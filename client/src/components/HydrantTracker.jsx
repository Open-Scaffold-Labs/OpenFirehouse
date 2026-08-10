import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Droplets, Plus, Search, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, XCircle, Clock, Pencil, Loader2,
  MapPin, Navigation, LocateFixed,
} from 'lucide-react';
import { loadMapKit } from '../utils/mapkit';
import HydrantImport from './HydrantImport';
import HydrantMapView from './HydrantMapView';
import {
  HYDRANT_STATUSES, HYDRANT_TYPES, MAIN_SIZES,
  OUTLET_SIZES, FLOW_CLASSES, STATUS_COLORS, getFlowClass,
} from '../data/hydrants';
import { api } from '../utils/api';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';

// ─── Flow class badge ──────────────────────────────────────────────────────

function FlowBadge({ gpm }) {
  const fc = getFlowClass(gpm);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${fc.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${fc.dot}`} />
      {fc.label}
    </span>
  );
}

// ─── Status chip ──────────────────────────────────────────────────────────

function StatusChip({ status }) {
  const icons = { 'In Service': CheckCircle, 'Out of Service': XCircle, 'Needs Inspection': Clock };
  const Icon = icons[status] ?? Clock;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>
      <Icon size={10} /> {status}
    </span>
  );
}

// ─── Days since / until ───────────────────────────────────────────────────

function testDueLabel(nextTestDue) {
  if (!nextTestDue) return { label: 'Not tested', urgent: true };
  const days = Math.round((new Date(nextTestDue) - new Date('2026-03-06')) / 86400000);
  if (days < 0)  return { label: `${Math.abs(days)}d overdue`, urgent: true };
  if (days === 0) return { label: 'Due today', urgent: true };
  if (days <= 90) return { label: `Due in ${days}d`, urgent: days <= 30 };
  return { label: `Due ${nextTestDue}`, urgent: false };
}

// ─── Expanded detail ─────────────────────────────────────────────────────

function ExpandedDetail({ h, onEdit }) {
  const fc = getFlowClass(h.flowRate);
  const due = testDueLabel(h.nextTestDue);

  const Row = ({ label, value }) => (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs text-gray-800 dark:text-gray-100 font-medium">{value || '—'}</p>
    </div>
  );

  return (
    <div className="bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-700 px-6 py-4 space-y-4">

      {/* Location */}
      <div>
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Location</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Row label="Address"      value={h.streetAddress} />
          <Row label="Intersection" value={h.intersection || '—'} />
          <Row label="City / State" value={`${h.city}, ${h.state} ${h.zip}`} />
          {h.lat && h.lng ? (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">GPS Coordinates</p>
              <p className="text-xs text-gray-800 dark:text-gray-100 font-medium flex items-center gap-1">
                <MapPin size={10} className="text-green-500 shrink-0" />
                {parseFloat(h.lat).toFixed(6)}, {parseFloat(h.lng).toFixed(6)}
              </p>
              <a
                href={`https://maps.apple.com/?ll=${h.lat},${h.lng}&q=Hydrant+${h.hydrantNumber}`}
                target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-blue-500 hover:underline"
              >Open in Maps</a>
            </div>
          ) : (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">GPS Coordinates</p>
              <p className="text-xs text-gray-400 italic">Not yet mapped — edit hydrant to pin</p>
            </div>
          )}
        </div>
      </div>

      {/* Specs */}
      <div>
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Specifications</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Row label="Type"         value={h.type} />
          <Row label="Manufacturer" value={h.manufacturer} />
          <Row label="Model"        value={h.model} />
          <Row label="Year"         value={h.yearInstalled} />
          <Row label="Main Size"    value={h.mainSize} />
          <Row label="Outlet Size"  value={h.outletSize} />
          <Row label="# Outlets"   value={h.numOutlets} />
          <Row label="Owned By"     value={h.ownedBy} />
        </div>
      </div>

      {/* Flow test */}
      <div>
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Flow Test Data</p>
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Static PSI',   value: h.staticPressure   ? `${h.staticPressure} PSI`   : '—' },
            { label: 'Residual PSI', value: h.residualPressure ? `${h.residualPressure} PSI` : '—' },
            { label: 'Flow Rate',    value: h.flowRate         ? `${h.flowRate.toLocaleString()} GPM` : '—' },
            { label: 'ISO Class',    value: fc.label },
            { label: 'Tested By',    value: h.testedBy },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white dark:bg-gray-900 rounded-lg p-2.5 border border-gray-100 dark:border-gray-700 text-center">
              <p className="text-sm font-black text-gray-800 dark:text-gray-100">{value}</p>
              <p className="text-[9px] text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
          <Row label="Last Test Date" value={h.lastTestDate} />
          <Row label="Next Test Due"  value={h.nextTestDue} />
          <Row label="Last Inspection" value={h.lastInspectionDate} />
        </div>
      </div>

      {/* Notes */}
      {h.notes && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Notes</p>
          <p className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2 leading-relaxed">
            {h.notes}
          </p>
        </div>
      )}

      {/* Linked Meetings */}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
        <LinkedMeetings module="hydrants" recordId={h.id} recordLabel={h.hydrantNumber || 'Hydrant'} />
        <Attachments module="hydrants" recordId={h.id} recordLabel={h.hydrantNumber || 'Hydrant'} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={() => onEdit(h)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700">
          <Pencil size={11} /> Edit Hydrant
        </button>
      </div>
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────

// ─── GPS Pin-Drop Widget ──────────────────────────────────────────────────

function GpsWidget({ lat, lng, onChange }) {
  const mapRef    = useRef(null);
  const mapObj    = useRef(null);
  const markerRef = useRef(null);
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle | loading | done | error

  // Build or update the map when lat/lng are known
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!mapRef.current) return;
      try {
        const mk = await loadMapKit();
        if (cancelled) return;
        const coord = (lat && lng)
          ? new mk.Coordinate(parseFloat(lat), parseFloat(lng))
          : null;
        if (!mapObj.current) {
          mapObj.current = new mk.Map(mapRef.current, {
            mapType: mk.Map.MapTypes.Standard,
            showsUserLocation: false,
            isScrollEnabled: true,
            isZoomEnabled: true,
            region: coord
              ? new mk.CoordinateRegion(coord, new mk.CoordinateSpan(0.005, 0.005))
              : undefined,
          });
          // Click to place/move pin
          mapObj.current.addEventListener('select', () => {});
          mapObj.current._impl?.addEventListener('click', (e) => {
            const point = mapObj.current.convertPointOnPageToCoordinate(new DOMPoint(e.clientX, e.clientY));
            if (!point) return;
            placeMarker(mk, point.latitude, point.longitude);
            onChange(point.latitude, point.longitude);
          });
        }
        if (coord) placeMarker(mk, parseFloat(lat), parseFloat(lng));
      } catch (err) {
        console.error('GpsWidget init error', err);
      }
    }
    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function placeMarker(mk, mlat, mlng) {
    if (!mapObj.current) return;
    if (markerRef.current) mapObj.current.removeAnnotation(markerRef.current);
    const coord = new mk.Coordinate(mlat, mlng);
    const ann = new mk.MarkerAnnotation(coord, {
      color: '#dc2626',
      glyphText: '💧',
      title: 'Hydrant',
    });
    mapObj.current.addAnnotation(ann);
    mapObj.current.setRegionAnimated(
      new mk.CoordinateRegion(coord, new mk.CoordinateSpan(0.003, 0.003)), true
    );
    markerRef.current = ann;
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) return;
    setGpsStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setGpsStatus('done');
        onChange(latitude, longitude);
        try {
          const mk = await loadMapKit();
          placeMarker(mk, latitude, longitude);
        } catch {}
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">GPS Location</p>
        <button type="button" onClick={handleUseMyLocation}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/40 border border-blue-200 dark:border-blue-700 transition-colors">
          {gpsStatus === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <LocateFixed size={12} />}
          {gpsStatus === 'loading' ? 'Getting location…' : 'Use My Location'}
        </button>
      </div>

      {/* Map — MUST use explicit px height, never min-height */}
      <div ref={mapRef} style={{ height: '200px', borderRadius: '12px', overflow: 'hidden' }}
        className="w-full border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800" />

      <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
        Tap the map to pin the exact hydrant location, or use "Use My Location" when standing at the hydrant.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Latitude</label>
          <input type="number" step="any" value={lat ?? ''} placeholder="e.g. 40.7128"
            onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : null, lng)}
            className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Longitude</label>
          <input type="number" step="any" value={lng ?? ''} placeholder="e.g. -74.0060"
            onChange={e => onChange(lat, e.target.value ? parseFloat(e.target.value) : null)}
            className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100" />
        </div>
      </div>

      {lat && lng && (
        <p className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1">
          <MapPin size={10} /> {parseFloat(lat).toFixed(6)}, {parseFloat(lng).toFixed(6)}
        </p>
      )}
      {gpsStatus === 'error' && (
        <p className="text-[10px] text-red-500">Location access denied. Enter coordinates manually or tap the map.</p>
      )}
    </div>
  );
}

function HydrantForm({ initial, onSave, onClose }) {
  const blank = {
    hydrantNumber: '', streetAddress: '', intersection: '',
    city: '', state: 'IN', zip: '',
    type: 'Dry Barrel', manufacturer: '', model: '', yearInstalled: '',
    mainSize: '6"', outletSize: '4.5"', numOutlets: 2,
    status: 'In Service',
    staticPressure: '', residualPressure: '', flowRate: '',
    lastTestDate: '', nextTestDue: '', testedBy: '',
    lastInspectionDate: '', ownedBy: 'City Water Dept', notes: '',
    lat: null, lng: null,
  };
  const [form, setForm] = useState(initial ?? blank);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...form });
  }

  const Field = ({ label, k, type = 'text', options, required, half }) => (
    <div className={half ? '' : ''}>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {options ? (
        <select value={form[k] ?? ''} onChange={e => set(k, e.target.value)} aria-label={label}
          className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100">
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={form[k] ?? ''} onChange={e => set(k, e.target.value)} aria-label={label}
          className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
          required={required} />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-red-700 rounded-t-2xl">
          <h2 className="text-base font-bold text-white">{initial ? 'Edit Hydrant' : 'Add Hydrant'}</h2>
          <button onClick={onClose} aria-label="Close form" className="text-red-200 hover:text-white"><XCircle size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Hydrant Number" k="hydrantNumber" required />
            <Field label="Status" k="status" options={HYDRANT_STATUSES} />
          </div>

          <Field label="Street Address" k="streetAddress" required />
          <Field label="Nearest Intersection" k="intersection" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="City" k="city" required />
            <Field label="State" k="state" required />
            <Field label="ZIP" k="zip" />
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Specifications</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Type" k="type" options={HYDRANT_TYPES} />
              <Field label="Year Installed" k="yearInstalled" type="number" />
              <Field label="Manufacturer" k="manufacturer" />
              <Field label="Model" k="model" />
              <Field label="Main Size" k="mainSize" options={MAIN_SIZES} />
              <Field label="Outlet Size" k="outletSize" options={OUTLET_SIZES} />
              <Field label="Number of Outlets" k="numOutlets" type="number" />
              <Field label="Owned By" k="ownedBy" />
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Flow Test Data</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Static Pressure (PSI)" k="staticPressure" type="number" />
              <Field label="Residual Pressure (PSI)" k="residualPressure" type="number" />
              <Field label="Flow Rate (GPM)" k="flowRate" type="number" />
              <Field label="Last Test Date" k="lastTestDate" type="date" />
              <Field label="Next Test Due" k="nextTestDue" type="date" />
              <Field label="Tested By" k="testedBy" />
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Inspection</p>
            <Field label="Last Inspection Date" k="lastInspectionDate" type="date" />
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <GpsWidget
              lat={form.lat}
              lng={form.lng}
              onChange={(lat, lng) => setForm(f => ({ ...f, lat, lng }))}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Notes</label>
            <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} aria-label="Notes" rows={2}
              className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none dark:bg-gray-900 dark:text-gray-100" />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700">Cancel</button>
            <button type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700">
              {initial ? 'Save Changes' : 'Add Hydrant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function HydrantTracker() {
  const [hydrants,   setHydrants]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState('');
  const [statusFlt,  setStatusFlt]  = useState('All');
  const [classFlt,   setClassFlt]   = useState('All');
  const [expandedId, setExpandedId] = useState(null);
  const [formOpen,      setFormOpen]      = useState(false);
  const [editing,       setEditing]       = useState(null);
  const [importOpen,    setImportOpen]    = useState(false);
  const [mapViewOpen,   setMapViewOpen]   = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const res = await api.get('/api/hydrants');
      setHydrants(res.data ?? []);
    } catch (e) {
      setError('Could not load hydrants.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = hydrants.filter(h => {
    const q = search.toLowerCase();
    const matchQ = !q
      || h.hydrantNumber.toLowerCase().includes(q)
      || h.streetAddress.toLowerCase().includes(q)
      || (h.intersection || '').toLowerCase().includes(q);
    const matchS = statusFlt === 'All' || h.status === statusFlt;
    const matchC = classFlt  === 'All' || getFlowClass(h.flowRate).id === classFlt;
    return matchQ && matchS && matchC;
  });

  const stats = {
    total:          hydrants.length,
    inService:      hydrants.filter(h => h.status === 'In Service').length,
    oos:            hydrants.filter(h => h.status === 'Out of Service').length,
    needsInsp:      hydrants.filter(h => h.status === 'Needs Inspection').length,
    overdue:        hydrants.filter(h => {
      if (!h.nextTestDue) return true;
      return new Date(h.nextTestDue) < new Date('2026-03-06');
    }).length,
  };

  async function handleSave(data) {
    try {
      if (data.id && hydrants.find(h => h.id === data.id)) {
        const res = await api.patch(`/api/hydrants/${data.id}`, data);
        setHydrants(prev => prev.map(h => h.id === data.id ? res.data : h));
      } else {
        const res = await api.post('/api/hydrants', data);
        setHydrants(prev => [...prev, res.data]);
      }
      setFormOpen(false);
      setEditing(null);
    } catch (e) {
      console.error('Failed to save hydrant', e);
    }
  }

  function openEdit(h) { setEditing(h); setFormOpen(true); }

  if (loading) return (
    <div className="p-6 flex items-center gap-2 text-gray-500 dark:text-gray-400">
      <Loader2 size={16} className="animate-spin" /> Loading hydrant data…
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
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100">Hydrant Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Water supply inventory · ISO flow classifications · Test records</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMapViewOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm">
            <MapPin size={15} /> Map View
          </button>
          <button onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm">
            <Navigation size={15} /> Import
          </button>
          <button onClick={() => { setEditing(null); setFormOpen(true); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-sm">
            <Plus size={15} /> Add Hydrant
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Total Hydrants', value: stats.total,     color: 'text-gray-900 dark:text-gray-100' },
          { label: 'In Service',     value: stats.inService, color: 'text-green-700 dark:text-green-300' },
          { label: 'Out of Service', value: stats.oos,       color: 'text-red-700 dark:text-red-300'   },
          { label: 'Needs Inspection', value: stats.needsInsp, color: 'text-amber-700 dark:text-amber-300' },
          { label: 'Test Overdue',   value: stats.overdue,   color: stats.overdue > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-400' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 px-4 py-3 shadow-sm">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ISO Flow Class Legend */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-5 py-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">ISO Flow Classes</p>
        <div className="flex flex-wrap gap-3">
          {FLOW_CLASSES.map(fc => {
            const count = hydrants.filter(h => getFlowClass(h.flowRate).id === fc.id).length;
            return (
              <button key={fc.id}
                onClick={() => setClassFlt(classFlt === fc.id ? 'All' : fc.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                  classFlt === fc.id ? fc.color + ' ring-2 ring-offset-1 ring-gray-400' : fc.color
                }`}>
                <span className={`w-2 h-2 rounded-full ${fc.dot}`} />
                {fc.label}
                <span className="font-black">{count}</span>
                <span className="text-[9px] opacity-70">{fc.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Search hydrant number, address, intersection"
            placeholder="Search hydrant number, address, intersection…"
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100" />
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {['All', ...HYDRANT_STATUSES].map(s => (
            <button key={s} onClick={() => setStatusFlt(s)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                statusFlt === s ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>{s}</button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[0.8fr_2fr_1.5fr_1fr_1.2fr_1.2fr_1fr_24px] gap-4 px-5 py-2.5 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          <span>Hydrant #</span>
          <span>Address</span>
          <span>Type / Specs</span>
          <span>Status</span>
          <span>Flow Class</span>
          <span>Flow Rate</span>
          <span>Next Test Due</span>
          <span />
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-12">No hydrants match your filters.</p>
        )}

        {filtered.map(h => {
          const fc   = getFlowClass(h.flowRate);
          const due  = testDueLabel(h.nextTestDue);
          const isOpen = expandedId === h.id;
          return (
            <div key={h.id} className="border-b border-gray-50 last:border-b-0">
              <div
                onClick={() => setExpandedId(isOpen ? null : h.id)}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                aria-label={`Toggle details for hydrant ${h.hydrantNumber}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isOpen ? null : h.id); } }}
                className="grid grid-cols-[0.8fr_2fr_1.5fr_1fr_1.2fr_1.2fr_1fr_24px] gap-4 px-5 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 items-center"
              >
                <span className="font-mono text-sm font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                  <Droplets size={13} className={fc.dot.replace('bg-', 'text-')} />
                  {h.hydrantNumber}
                  {h.lat && h.lng && <MapPin size={10} className="text-green-500" title="GPS location mapped" />}
                </span>
                <div>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{h.streetAddress}</p>
                  {h.intersection && <p className="text-[10px] text-gray-400 truncate">{h.intersection}</p>}
                </div>
                <div>
                  <p className="text-xs text-gray-700 dark:text-gray-300">{h.type}</p>
                  <p className="text-[10px] text-gray-400">{h.mainSize} main · {h.outletSize} outlet</p>
                </div>
                <span><StatusChip status={h.status} /></span>
                <span><FlowBadge gpm={h.flowRate} /></span>
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  {h.flowRate ? `${h.flowRate.toLocaleString()} GPM` : '—'}
                </span>
                <span className={`text-xs font-semibold ${due.urgent ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  {due.urgent && <AlertTriangle size={11} className="inline mr-1" />}
                  {due.label}
                </span>
                {isOpen
                  ? <ChevronUp size={14} className="text-gray-400" />
                  : <ChevronDown size={14} className="text-gray-400" />
                }
              </div>
              {isOpen && <ExpandedDetail h={h} onEdit={openEdit} />}
            </div>
          );
        })}
      </div>

      {/* OOS warning */}
      {stats.oos > 0 && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3">
          <AlertTriangle size={14} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
            <strong>{stats.oos} hydrant{stats.oos > 1 ? 's are' : ' is'} Out of Service.</strong> Notify mutual aid partners and update pre-incident plans for affected areas.
          </p>
        </div>
      )}

      {formOpen && (
        <HydrantForm initial={editing} onSave={handleSave} onClose={() => { setFormOpen(false); setEditing(null); }} />
      )}

      {importOpen && (
        <HydrantImport
          onClose={() => setImportOpen(false)}
          onImported={() => { setImportOpen(false); load(); }}
        />
      )}

      {mapViewOpen && (
        <HydrantMapView
          hydrants={hydrants}
          onClose={() => setMapViewOpen(false)}
        />
      )}
    </div>
  );
}
