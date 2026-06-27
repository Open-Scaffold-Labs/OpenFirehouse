import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Mic, MicOff, LocateFixed, Loader2, ChevronDown } from 'lucide-react';
import { api } from '../utils/api';
import { INCIDENT_TYPES, DISPOSITIONS, ALARM_LEVELS } from '../data/incidents';
import { NERIS_INCIDENT_TYPES, NERIS_ACTIONS_TACTICS, LEGACY_TYPE_MAP, nerisLabel } from '../data/nerisTypes';
import { HAZMAT_CLASSES } from '../data/hazmat';
import PhotoCapture from './PhotoCapture';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import AIWriteTextarea from './AIWriteTextarea';
import DictateInput from './DictateInput';

const today = new Date();
const emptyForm = {
  incidentNumber: '',
  date: today.toISOString().slice(0, 10),
  time: today.toTimeString().slice(0, 5),
  type: 'Structure Fire',
  // NERIS hierarchical type (dotted code, e.g. "FIRE.STRUCTURE_FIRE.CHIMNEY_FIRE")
  neris_type: 'FIRE.STRUCTURE_FIRE.STRUCTURAL_INVOLVEMENT_FIRE',
  neris_category: 'FIRE',
  neris_subcategory: 'STRUCTURE_FIRE',
  neris_detail: 'STRUCTURAL_INVOLVEMENT_FIRE',
  // NERIS actions & tactics (array of codes)
  actions_taken: [],
  alarmLevel: 'Working',
  address: '',
  units: [],
  personnel: [],
  disposition: 'Controlled / Extinguished',
  injuries: 0,
  notes: '',
  // Hazmat ICS fields (only used when type === 'Hazmat' or 'Gas Leak')
  hazmat_material: '',
  hazmat_class: '',
  hazmat_quantity: '',
  hazmat_decon: false,
  hazmat_ppe_level: '',
  hazmat_contractor: '',
  hazmat_cost: '',
  hazmat_report_number: '',
  hazmat_erg_guide: '',
  hazmat_operations: '',
  hazmat_planning: '',
  hazmat_logistics: '',
  hazmat_finance: '',
  photos: [],
};

export default function IncidentForm({ incident, onSave, onClose, nextNumber, aiPrefill }) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [members, setMembers] = useState([]);
  const [apparatus, setApparatus] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Speech-to-text for the narrative field
  const handleSpeechResult = useCallback((text) => {
    setForm((prev) => ({ ...prev, notes: prev.notes + text }));
  }, []);
  const { listening, supported: speechSupported, interimText, toggle: toggleMic } = useSpeechRecognition({
    onResult: handleSpeechResult,
  });

  // Geolocation: auto-fill address from GPS
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError,   setGeoError]   = useState(null);

  const fillAddressFromGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser.');
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await res.json();
          const a = data.address || {};
          // Build a human-readable address from Nominatim parts
          const street = [a.house_number, a.road].filter(Boolean).join(' ');
          const city   = a.city || a.town || a.village || a.county || '';
          const state  = a.state || '';
          const full   = [street, city, state].filter(Boolean).join(', ');
          setForm((prev) => ({ ...prev, address: full || data.display_name }));
        } catch {
          setGeoError('Could not look up address. Enter manually.');
        } finally {
          setGeoLoading(false);
        }
      },
      (err) => {
        setGeoError(err.code === 1 ? 'Location permission denied.' : 'Could not get location.');
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Fetch members and apparatus on mount
  useEffect(() => {
    async function fetch() {
      try {
        const [memRes, appRes] = await Promise.all([
          api.get('/api/members'),
          api.get('/api/apparatus'),
        ]);
        const members = Array.isArray(memRes?.data) ? memRes.data : Array.isArray(memRes) ? memRes : [];
        const apparatus = Array.isArray(appRes?.data) ? appRes.data : Array.isArray(appRes) ? appRes : [];
        setMembers(members);
        setApparatus(apparatus);
      } catch (err) {
        console.error('Failed to fetch dropdown data:', err);
      } finally {
        setLoadingData(false);
      }
    }
    fetch();
  }, []);

  const activeMembers = members
    .filter((m) => m.status === 'Active' || m.status === 'Probationary')
    .map((m) => m.name);

  const apparatusUnits = apparatus
    .filter((a) => a.status === 'In Service' || a.status === 'Reserve')
    .map((a) => a.designation);

  useEffect(() => {
    if (incident) {
      // If editing an older incident that lacks NERIS fields, derive them
      const data = { ...emptyForm, ...incident };
      if (!data.neris_type && data.type && LEGACY_TYPE_MAP[data.type]) {
        const code = LEGACY_TYPE_MAP[data.type];
        const [cat, sub, detail] = code.split('.');
        data.neris_type = code;
        data.neris_category = cat;
        data.neris_subcategory = sub;
        data.neris_detail = detail;
      }
      if (!data.actions_taken) data.actions_taken = [];
      setForm(data);
    } else if (aiPrefill) {
      // AI-generated prefill: merge AI data into the empty form
      const data = { ...emptyForm, incidentNumber: nextNumber || '' };
      // Map AI fields to form fields
      if (aiPrefill.type) data.type = aiPrefill.type;
      if (aiPrefill.alarmLevel) data.alarmLevel = aiPrefill.alarmLevel;
      if (aiPrefill.address) data.address = aiPrefill.address;
      if (aiPrefill.disposition) data.disposition = aiPrefill.disposition;
      if (aiPrefill.injuries != null) data.injuries = aiPrefill.injuries;
      if (aiPrefill.notes) data.notes = aiPrefill.notes;
      if (aiPrefill.time) data.time = aiPrefill.time;
      if (aiPrefill.dispatchTime) data.dispatchTime = aiPrefill.dispatchTime;
      if (aiPrefill.units) data.units = aiPrefill.units;
      if (aiPrefill.personnel) data.personnel = aiPrefill.personnel;
      // Derive NERIS from legacy type
      if (data.type && LEGACY_TYPE_MAP[data.type]) {
        const code = LEGACY_TYPE_MAP[data.type];
        const [cat, sub, detail] = code.split('.');
        data.neris_type = code;
        data.neris_category = cat;
        data.neris_subcategory = sub;
        data.neris_detail = detail;
      }
      if (!data.actions_taken) data.actions_taken = [];
      setForm(data);
    } else {
      setForm({ ...emptyForm, incidentNumber: nextNumber || '' });
    }
    setErrors({});
  }, [incident, nextNumber, aiPrefill]);

  const isEditing = Boolean(incident);

  function validate() {
    const errs = {};
    if (!form.incidentNumber.trim()) errs.incidentNumber = 'Incident number is required.';
    if (!form.date) errs.date = 'Date is required.';
    if (!form.address.trim()) errs.address = 'Address is required.';
    return errs;
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: undefined }));
  }

  function toggleItem(field, value) {
    setForm((p) => ({
      ...p,
      [field]: p[field].includes(value)
        ? p[field].filter((v) => v !== value)
        : [...p[field], value],
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onSave({ ...form, injuries: parseInt(form.injuries, 10) || 0 });
  }

  const CheckList = ({ field, items, maxH = 'max-h-40' }) => (
    <div className={`border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-100 dark:divide-gray-700 ${maxH} overflow-y-auto`}>
      {items.map((item) => {
        const selected = form[field].includes(item);
        return (
          <label key={item} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${selected ? 'bg-red-50 dark:bg-red-950/50' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => toggleItem(field, item)}
              className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 focus:ring-red-500"
            />
            <span className={`text-sm ${selected ? 'font-medium text-red-800 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'}`}>{item}</span>
          </label>
        );
      })}
    </div>
  );

  if (loadingData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border border-gray-300 dark:border-gray-700 border-t-red-700 mx-auto mb-3"></div>
            <p className="text-sm text-gray-400">Loading form…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-red-700">
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? `Edit Incident ${incident.incidentNumber}` : 'Log New Incident'}
          </h2>
          <button onClick={onClose} aria-label="Close form" className="text-red-200 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Incident # / Date / Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Incident # <span className="text-red-500">*</span></label>
              <input name="incidentNumber" value={form.incidentNumber} onChange={handleChange}
                aria-label="Incident number"
                placeholder="26-0011"
                className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 ${errors.incidentNumber ? 'border-red-400 bg-red-50 dark:bg-red-950/50' : 'border-gray-300 dark:border-gray-700'}`} />
              {errors.incidentNumber && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.incidentNumber}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date <span className="text-red-500">*</span></label>
              <input type="date" name="date" value={form.date} onChange={handleChange} aria-label="Date"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time</label>
              <input type="time" name="time" value={form.time} onChange={handleChange} aria-label="Time"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900" />
            </div>
          </div>

          {/* NERIS Incident Type — Cascading Selectors */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-950 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">NERIS Incident Classification</p>
              <span className="text-[10px] text-gray-400 font-mono">
                {form.neris_type || '—'}
              </span>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Category */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Category</label>
                  <select value={form.neris_category}
                    aria-label="NERIS Category"
                    onChange={(e) => {
                      const cat = e.target.value;
                      const subs = Object.keys(NERIS_INCIDENT_TYPES[cat]?.subcategories || {});
                      const firstSub = subs[0] || '';
                      const types = firstSub ? Object.keys(NERIS_INCIDENT_TYPES[cat].subcategories[firstSub].types) : [];
                      const firstType = types[0] || '';
                      const label = NERIS_INCIDENT_TYPES[cat]?.subcategories?.[firstSub]?.types?.[firstType]?.label || NERIS_INCIDENT_TYPES[cat]?.label || cat;
                      setForm(p => ({
                        ...p,
                        neris_category: cat,
                        neris_subcategory: firstSub,
                        neris_detail: firstType,
                        neris_type: `${cat}.${firstSub}.${firstType}`,
                        type: label,
                      }));
                    }}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900">
                    {Object.entries(NERIS_INCIDENT_TYPES).map(([code, cat]) => (
                      <option key={code} value={code}>{cat.icon} {cat.label}</option>
                    ))}
                  </select>
                </div>
                {/* Subcategory */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Subcategory</label>
                  <select value={form.neris_subcategory}
                    aria-label="NERIS Subcategory"
                    onChange={(e) => {
                      const sub = e.target.value;
                      const cat = form.neris_category;
                      const types = Object.keys(NERIS_INCIDENT_TYPES[cat]?.subcategories?.[sub]?.types || {});
                      const firstType = types[0] || '';
                      const label = NERIS_INCIDENT_TYPES[cat]?.subcategories?.[sub]?.types?.[firstType]?.label || sub;
                      setForm(p => ({
                        ...p,
                        neris_subcategory: sub,
                        neris_detail: firstType,
                        neris_type: `${cat}.${sub}.${firstType}`,
                        type: label,
                      }));
                    }}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900">
                    {Object.entries(NERIS_INCIDENT_TYPES[form.neris_category]?.subcategories || {}).map(([code, sub]) => (
                      <option key={code} value={code}>{sub.label}</option>
                    ))}
                  </select>
                </div>
                {/* Specific Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Type</label>
                  <select value={form.neris_detail}
                    aria-label="NERIS Type"
                    onChange={(e) => {
                      const detail = e.target.value;
                      const cat = form.neris_category;
                      const sub = form.neris_subcategory;
                      const label = NERIS_INCIDENT_TYPES[cat]?.subcategories?.[sub]?.types?.[detail]?.label || detail;
                      setForm(p => ({
                        ...p,
                        neris_detail: detail,
                        neris_type: `${cat}.${sub}.${detail}`,
                        type: label,
                      }));
                    }}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900">
                    {Object.entries(NERIS_INCIDENT_TYPES[form.neris_category]?.subcategories?.[form.neris_subcategory]?.types || {}).map(([code, t]) => (
                      <option key={code} value={code}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Alarm Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alarm Level</label>
              <select name="alarmLevel" value={form.alarmLevel} onChange={handleChange} aria-label="Alarm Level"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900">
                {ALARM_LEVELS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          {/* Address */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Address / Location <span className="text-red-500">*</span>
              </label>
              <button type="button" onClick={fillAddressFromGPS} disabled={geoLoading}
                title="Auto-fill address from GPS"
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:text-blue-600 disabled:opacity-50 transition-colors">
                {geoLoading
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <LocateFixed className="h-3 w-3" />}
                {geoLoading ? 'Locating…' : 'Use GPS'}
              </button>
            </div>
            <input name="address" value={form.address} onChange={handleChange}
              aria-label="Address / Location"
              placeholder="123 Main Street, Maplewood"
              className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 ${errors.address ? 'border-red-400 bg-red-50 dark:bg-red-950/50' : 'border-gray-300 dark:border-gray-700'}`} />
            {geoError   && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{geoError}</p>}
            {errors.address && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.address}</p>}
          </div>

          {/* Units / Personnel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Units Responding <span className="text-xs font-normal text-gray-400">({form.units.length})</span>
              </label>
              <CheckList field="units" items={apparatusUnits} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Personnel <span className="text-xs font-normal text-gray-400">({form.personnel.length})</span>
              </label>
              <CheckList field="personnel" items={activeMembers} />
            </div>
          </div>

          {/* Disposition / Injuries */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Disposition</label>
              <select name="disposition" value={form.disposition} onChange={handleChange} aria-label="Disposition"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900">
                {DISPOSITIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Injuries</label>
              <input type="number" name="injuries" value={form.injuries} min={0} onChange={handleChange} aria-label="Injuries"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900" />
            </div>
          </div>

          {/* NERIS Actions & Tactics */}
          <div className="border border-blue-200 dark:border-blue-900 rounded-xl overflow-hidden">
            <details className="group">
              <summary className="bg-blue-50 dark:bg-blue-950/50 px-4 py-2 border-b border-blue-200 dark:border-blue-900 cursor-pointer select-none flex items-center justify-between">
                <p className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide">
                  NERIS Actions & Tactics
                  {form.actions_taken.length > 0 && (
                    <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-600 text-white">
                      {form.actions_taken.length}
                    </span>
                  )}
                </p>
                <ChevronDown className="h-4 w-4 text-blue-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-4 py-3 max-h-64 overflow-y-auto space-y-3">
                {Object.entries(NERIS_ACTIONS_TACTICS).map(([catCode, cat]) => (
                  <div key={catCode}>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{cat.label}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                      {cat.items.map((item) => {
                        const fullCode = `${catCode}.${item.code}`;
                        const checked = form.actions_taken.includes(fullCode);
                        return (
                          <label key={fullCode} className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${checked ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                            <input type="checkbox" checked={checked}
                              onChange={() => {
                                setForm(p => ({
                                  ...p,
                                  actions_taken: checked
                                    ? p.actions_taken.filter(c => c !== fullCode)
                                    : [...p.actions_taken, fullCode],
                                }));
                              }}
                              className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-700 text-blue-600 dark:text-blue-400 focus:ring-blue-500" />
                            {item.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>

          {/* Hazmat ICS Section — shown only for Hazmat / Gas Leak */}
          {(form.type === 'Hazmat' || form.type === 'Gas Leak' || form.neris_category === 'HAZSIT' || form.neris_subcategory === 'HAZARDOUS_MATERIALS') && (
            <div className="border border-orange-200 dark:border-orange-900 rounded-xl overflow-hidden">
              <div className="bg-orange-50 dark:bg-orange-950/50 px-4 py-2 border-b border-orange-200 dark:border-orange-900">
                <p className="text-xs font-bold text-orange-800 dark:text-orange-300 uppercase tracking-wide">⚠ Hazmat ICS Detail</p>
              </div>
              <div className="px-4 py-4 space-y-4">

                {/* Operations */}
                <div>
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Operations</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Material Involved</label>
                      <input name="hazmat_material" value={form.hazmat_material} onChange={handleChange}
                        aria-label="Material Involved"
                        placeholder="e.g. Diesel Fuel, Chlorine"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-orange-400 dark:bg-gray-900 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Hazmat Class</label>
                      <select name="hazmat_class" value={form.hazmat_class} onChange={handleChange} aria-label="Hazmat Class"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-gray-900 dark:text-gray-100">
                        <option value="">— Select —</option>
                        {HAZMAT_CLASSES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Estimated Quantity</label>
                      <input name="hazmat_quantity" value={form.hazmat_quantity} onChange={handleChange}
                        aria-label="Estimated Quantity"
                        placeholder="e.g. 50 gallons"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-orange-400 dark:bg-gray-900 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">PPE Level Used</label>
                      <select name="hazmat_ppe_level" value={form.hazmat_ppe_level} onChange={handleChange} aria-label="PPE Level Used"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-gray-900 dark:text-gray-100">
                        <option value="">— Select —</option>
                        <option>Level A</option>
                        <option>Level B</option>
                        <option>Level C</option>
                        <option>Level D</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input type="checkbox" id="hazmat_decon" name="hazmat_decon"
                      checked={form.hazmat_decon}
                      onChange={e => setForm(p => ({ ...p, hazmat_decon: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 text-orange-600 dark:text-orange-400 focus:ring-orange-400" />
                    <label htmlFor="hazmat_decon" className="text-sm font-medium text-gray-700 dark:text-gray-300">Decontamination performed</label>
                  </div>
                  <textarea name="hazmat_operations" value={form.hazmat_operations} onChange={handleChange} rows={2}
                    aria-label="Hazmat operations notes"
                    placeholder="Actions taken, containment methods, decon process…"
                    className="w-full mt-2 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-orange-400 resize-none dark:bg-gray-900 dark:text-gray-100" />
                </div>

                {/* Planning */}
                <div>
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Planning</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">ERG Guide #</label>
                      <input name="hazmat_erg_guide" value={form.hazmat_erg_guide} onChange={handleChange}
                        aria-label="ERG Guide number"
                        placeholder="e.g. 128"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-orange-400 dark:bg-gray-900 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Report / Reference #</label>
                      <input name="hazmat_report_number" value={form.hazmat_report_number} onChange={handleChange}
                        aria-label="Report / Reference number"
                        placeholder="HZ-2026-XXX"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-orange-400 dark:bg-gray-900 dark:text-gray-100" />
                    </div>
                  </div>
                  <textarea name="hazmat_planning" value={form.hazmat_planning} onChange={handleChange} rows={2}
                    aria-label="Hazmat planning notes"
                    placeholder="Pre-incident plans referenced, CHEMTREC contacted, notifications made…"
                    className="w-full mt-2 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-orange-400 resize-none dark:bg-gray-900 dark:text-gray-100" />
                </div>

                {/* Logistics */}
                <div>
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Logistics</p>
                  <textarea name="hazmat_logistics" value={form.hazmat_logistics} onChange={handleChange} rows={2}
                    aria-label="Hazmat logistics notes"
                    placeholder="Equipment deployed, supplies consumed, mutual aid resources, contractor called…"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-orange-400 resize-none dark:bg-gray-900 dark:text-gray-100" />
                </div>

                {/* Finance */}
                <div>
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Finance</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Est. Cleanup Cost</label>
                      <input name="hazmat_cost" value={form.hazmat_cost} onChange={handleChange}
                        aria-label="Estimated cleanup cost"
                        placeholder="$0.00"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-orange-400 dark:bg-gray-900 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Contractor / Agency</label>
                      <input name="hazmat_contractor" value={form.hazmat_contractor} onChange={handleChange}
                        aria-label="Contractor / Agency"
                        placeholder="Environmental contractor name"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-orange-400 dark:bg-gray-900 dark:text-gray-100" />
                    </div>
                  </div>
                  <textarea name="hazmat_finance" value={form.hazmat_finance} onChange={handleChange} rows={2}
                    aria-label="Hazmat finance notes"
                    placeholder="Cost recovery notes, insurance, reimbursement details…"
                    className="w-full mt-2 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-orange-400 resize-none dark:bg-gray-900 dark:text-gray-100" />
                </div>

              </div>
            </div>
          )}

          {/* Notes / Narrative */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Narrative / Notes</label>
              {speechSupported && (
                <button type="button" onClick={toggleMic}
                  title={listening ? 'Stop dictation' : 'Dictate narrative'}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    listening
                      ? 'bg-red-600 text-white shadow-md animate-pulse'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600'
                  }`}>
                  {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  {listening ? 'Stop' : 'Dictate'}
                </button>
              )}
            </div>
            <AIWriteTextarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={4}
              placeholder="Incident narrative, cause, mutual aid, follow-up…"
            />
            {listening && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                Listening — speak clearly, tap Stop when done
              </p>
            )}
          </div>

          {/* Scene Media */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Scene Media
              <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">Photos &amp; video — optional</span>
            </label>
            <PhotoCapture
              photos={form.photos}
              onChange={(urls) => setForm((p) => ({ ...p, photos: urls }))}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors shadow-sm">
              {isEditing ? 'Save Changes' : 'Log Incident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
