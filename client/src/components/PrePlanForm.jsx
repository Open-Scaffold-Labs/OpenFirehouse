import { useState, useEffect, useMemo } from 'react';
import { X, Building2, Save, Plus, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import {
  OCCUPANCY_TYPES, RISK_LEVELS, CONSTRUCTION_TYPES,
  HAZARD_TYPES, WATER_SUPPLY_TYPES,
} from '../data/prePlans';
import { initialMembers } from '../data/members';
import AIWriteTextarea from './AIWriteTextarea';
import DictateInput from './DictateInput';

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100';
const TEXTAREA = `${INPUT} resize-none`;

function Field({ label, required, children, half }) {
  return (
    <div className={half ? '' : ''}>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
        active ? 'bg-red-700 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      {label}
    </button>
  );
}

const TABS = ['Basic Info', 'Hazards', 'Access', 'Water Supply', 'Suppression', 'Utilities', 'Evacuation'];

// NFPA 1620 completeness scoring — 8 components, each worth 12.5 pts
function nfpa1620Score(form) {
  const checks = [
    { label: 'Building info',     done: !!(form.occupancyName && form.address && form.constructionType) },
    { label: 'Access',            done: !!(form.access?.primary) },
    { label: 'Water supply',      done: form.waterSupply?.length > 0 },
    { label: 'Hazardous materials', done: form.hazards?.length > 0 },
    { label: 'Occupancy details', done: !!(form.occupancyType && (form.stories || form.sqFootage)) },
    { label: 'Suppression systems', done: !!(form.suppression?.sprinklered || form.suppression?.standpipe || form.suppression?.FDC) },
    { label: 'Utilities',         done: !!(form.utilities?.gasShutoff || form.utilities?.electrical) },
    { label: 'Evacuation routes', done: !!(form.evacuationRoutes) },
  ];
  const done = checks.filter(c => c.done).length;
  return { score: Math.round((done / checks.length) * 100), done, total: checks.length, checks };
}

const BLANK = {
  occupancyName:   '',
  address:         '',
  occupancyType:   'Commercial — Retail',
  riskLevel:       'Moderate',
  constructionType:'Type V — Wood Frame',
  yearBuilt:       '',
  stories:         '',
  sqFootage:       '',
  lastInspection:  '',
  lastUpdated:     new Date().toISOString().slice(0, 10),
  lastUpdatedBy:   '',
  contacts:        [{ name: '', role: '', phone: '' }],
  hazards:         [],
  access: { primary: '', secondary: '', lockbox: '', gateCode: '', notes: '' },
  waterSupply:     [],
  suppression: { sprinklered: false, standpipe: false, FDC: '', alarmPanel: '', shutoff: '', notes: '' },
  utilities:   { gasShutoff: '', electrical: '', notes: '' },
  notes:            '',
  evacuationRoutes: '',
  reviewedBy:       '',
  reviewedAt:       '',
  reviewNotes:      '',
};

export default function PrePlanForm({ plan, onSave, onClose }) {
  const isEdit = Boolean(plan?.id);
  const [tab,    setTab]    = useState(0);
  const [form,   setForm]   = useState(isEdit ? { ...BLANK, ...plan } : BLANK);
  const [errors, setErrors] = useState({});
  const [members, setMembers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Fetch members on mount
  useEffect(() => {
    async function fetch() {
      try {
        const raw = await api.get('/api/members');
        const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        setMembers(arr);
      } catch (err) {
        console.error('Failed to fetch members:', err);
      } finally {
        setLoadingData(false);
      }
    }
    fetch();
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Generic setters
  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }
  function setNested(section, field) {
    return (e) => setForm((f) => ({ ...f, [section]: { ...f[section], [field]: e.target.value } }));
  }
  function setNestedBool(section, field) {
    return (e) => setForm((f) => ({ ...f, [section]: { ...f[section], [field]: e.target.checked } }));
  }

  // Contacts
  function setContact(i, field, value) {
    setForm((f) => {
      const contacts = [...f.contacts];
      contacts[i] = { ...contacts[i], [field]: value };
      return { ...f, contacts };
    });
  }
  function addContact()    { setForm((f) => ({ ...f, contacts: [...f.contacts, { name: '', role: '', phone: '' }] })); }
  function removeContact(i){ setForm((f) => ({ ...f, contacts: f.contacts.filter((_, idx) => idx !== i) })); }

  // Hazards
  function setHazard(i, field, value) {
    setForm((f) => {
      const hazards = [...f.hazards];
      hazards[i] = { ...hazards[i], [field]: value };
      return { ...f, hazards };
    });
  }
  function addHazard()    { setForm((f) => ({ ...f, hazards: [...f.hazards, { type: 'Electrical', location: '', notes: '' }] })); }
  function removeHazard(i){ setForm((f) => ({ ...f, hazards: f.hazards.filter((_, idx) => idx !== i) })); }

  // Water Supply
  function setWater(i, field, value) {
    setForm((f) => {
      const waterSupply = [...f.waterSupply];
      waterSupply[i] = { ...waterSupply[i], [field]: value };
      return { ...f, waterSupply };
    });
  }
  function addWater()    { setForm((f) => ({ ...f, waterSupply: [...f.waterSupply, { type: 'Hydrant', hydrantId: '', distance: '', flowGPM: '', location: '' }] })); }
  function removeWater(i){ setForm((f) => ({ ...f, waterSupply: f.waterSupply.filter((_, idx) => idx !== i) })); }

  function validate() {
    const errs = {};
    if (!form.occupancyName.trim()) errs.occupancyName = 'Name required';
    if (!form.address.trim())       errs.address       = 'Address required';
    return errs;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); setTab(0); return; }
    onSave({
      ...form,
      id: plan?.id,
      yearBuilt:  form.yearBuilt  ? Number(form.yearBuilt)  : null,
      stories:    form.stories    ? Number(form.stories)    : null,
      sqFootage:  form.sqFootage  ? Number(form.sqFootage)  : null,
      waterSupply: form.waterSupply.map((w) => ({
        ...w,
        distance: w.distance ? Number(w.distance) : null,
        flowGPM:  w.flowGPM  ? Number(w.flowGPM)  : null,
      })),
    });
  }

  const activeMembers = initialMembers.filter((m) => m.status !== 'Inactive');

  if (loadingData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border border-gray-300 dark:border-gray-700 border-t-red-700 mx-auto mb-3"></div>
            <p className="text-sm text-gray-400">Loading form…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-red-600 dark:text-red-400" />
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {isEdit ? 'Edit Pre-Incident Plan' : 'New Pre-Incident Plan'}
            </h2>
          </div>
          <button onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* NFPA 1620 Completeness Score */}
        {(() => {
          const { score, done, total } = nfpa1620Score(form);
          const color = score >= 90 ? 'text-green-600 dark:text-green-400' :
                        score >= 60 ? 'text-amber-600 dark:text-amber-400' :
                                      'text-red-600 dark:text-red-400';
          const bar   = score >= 90 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';
          return (
            <div className="px-6 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 flex items-center gap-4 flex-shrink-0">
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">NFPA 1620 Completeness</p>
              <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full ${bar} rounded-full transition-all duration-500`} style={{ width: `${score}%` }} />
              </div>
              <span className={`text-xs font-black whitespace-nowrap ${color}`}>{score}% ({done}/{total})</span>
            </div>
          );
        })()}

        {/* Tabs */}
        <div className="flex gap-1 px-6 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 overflow-x-auto">
          {TABS.map((t, i) => (
            <TabBtn key={t} label={t} active={tab === i} onClick={() => setTab(i)} />
          ))}
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-4">

            {/* Tab 0: Basic Info */}
            {tab === 0 && (
              <>
                <Field label="Occupancy Name" required>
                  <input type="text" className={INPUT} value={form.occupancyName}
                    onChange={set('occupancyName')} placeholder="e.g. Maplewood Elementary School" />
                  {errors.occupancyName && <p className="text-xs text-red-500 mt-1">{errors.occupancyName}</p>}
                </Field>
                <Field label="Address" required>
                  <input type="text" className={INPUT} value={form.address}
                    onChange={set('address')} placeholder="123 Main St, Maplewood" />
                  {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Occupancy Type">
                    <select className={INPUT} value={form.occupancyType} onChange={set('occupancyType')}>
                      {OCCUPANCY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Risk Level">
                    <select className={INPUT} value={form.riskLevel} onChange={set('riskLevel')}>
                      {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Construction Type">
                  <select className={INPUT} value={form.constructionType} onChange={set('constructionType')}>
                    {CONSTRUCTION_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Year Built">
                    <input type="number" className={INPUT} value={form.yearBuilt}
                      onChange={set('yearBuilt')} placeholder="e.g. 1985" min={1800} max={2030} />
                  </Field>
                  <Field label="Stories">
                    <input type="number" className={INPUT} value={form.stories}
                      onChange={set('stories')} placeholder="1" min={1} max={100} />
                  </Field>
                  <Field label="Sq. Footage">
                    <input type="number" className={INPUT} value={form.sqFootage}
                      onChange={set('sqFootage')} placeholder="e.g. 12000" min={0} />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Last Inspection Date">
                    <input type="date" className={INPUT} value={form.lastInspection} onChange={set('lastInspection')} />
                  </Field>
                  <Field label="Last Updated By">
                    <select className={INPUT} value={form.lastUpdatedBy} onChange={set('lastUpdatedBy')}>
                      <option value="">— Select member —</option>
                      {members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Tactical Notes">
                  <AIWriteTextarea rows={3} value={form.notes} onChange={e => set('notes')(e.target.value)}
                    placeholder="Key tactical considerations, special circumstances, operational notes…" name="notes" id="preplan-notes" />
                </Field>
                {/* Contacts */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Contacts</label>
                    <button type="button" onClick={addContact}
                      className="flex items-center gap-1 text-xs text-red-700 dark:text-red-300 font-semibold hover:underline">
                      <Plus size={12} /> Add Contact
                    </button>
                  </div>
                  <div className="space-y-2">
                    {form.contacts.map((c, i) => (
                      <div key={i} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 items-center">
                        <input type="text" className={INPUT} value={c.name}
                          onChange={(e) => setContact(i, 'name', e.target.value)} placeholder="Name" aria-label="Contact name" />
                        <input type="text" className={INPUT} value={c.role}
                          onChange={(e) => setContact(i, 'role', e.target.value)} placeholder="Role / Title" aria-label="Contact role or title" />
                        <div className="flex gap-1">
                          <input type="text" className={INPUT} value={c.phone}
                            onChange={(e) => setContact(i, 'phone', e.target.value)} placeholder="Phone" aria-label="Contact phone" />
                          <button type="button" onClick={() => removeContact(i)}
                            aria-label="Remove contact"
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Tab 1: Hazards */}
            {tab === 1 && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-600 dark:text-gray-300">Document all known hazards.</p>
                  <button type="button" onClick={addHazard}
                    className="flex items-center gap-1 text-xs text-red-700 dark:text-red-300 font-semibold hover:underline">
                    <Plus size={12} /> Add Hazard
                  </button>
                </div>
                {form.hazards.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">No hazards added yet.</p>
                )}
                {form.hazards.map((h, i) => (
                  <div key={i} className="bg-orange-50 dark:bg-orange-950/50 border border-orange-100 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">Hazard {i + 1}</span>
                      <button type="button" onClick={() => removeHazard(i)} aria-label="Remove hazard"
                        className="text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                    </div>
                    <select className={INPUT} value={h.type} aria-label="Hazard type"
                      onChange={(e) => setHazard(i, 'type', e.target.value)}>
                      {HAZARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input type="text" className={INPUT} value={h.location}
                      onChange={(e) => setHazard(i, 'location', e.target.value)} placeholder="Location (e.g. Basement — Boiler Room)" aria-label="Hazard location" />
                    <textarea className={`${TEXTAREA}`} rows={2} value={h.notes}
                      onChange={(e) => setHazard(i, 'notes', e.target.value)} placeholder="Notes…" aria-label="Hazard notes" />
                  </div>
                ))}
              </div>
            )}

            {/* Tab 2: Access */}
            {tab === 2 && (
              <>
                <Field label="Primary Access">
                  <input type="text" className={INPUT} value={form.access.primary}
                    onChange={setNested('access','primary')} placeholder="Main entrance — Elm Street (front)" />
                </Field>
                <Field label="Secondary Access">
                  <input type="text" className={INPUT} value={form.access.secondary}
                    onChange={setNested('access','secondary')} placeholder="Service gate — Oak Lane (rear)" />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Knox Box Location & ID">
                    <input type="text" className={INPUT} value={form.access.lockbox}
                      onChange={setNested('access','lockbox')} placeholder="Knox Box #K-047 — main entrance" />
                  </Field>
                  <Field label="Gate Code">
                    <input type="text" className={INPUT} value={form.access.gateCode}
                      onChange={setNested('access','gateCode')} placeholder="e.g. 4419" />
                  </Field>
                </div>
                <Field label="Access Notes">
                  <textarea className={TEXTAREA} rows={3} value={form.access.notes}
                    onChange={setNested('access','notes')} placeholder="Congestion times, special conditions, apparatus positioning…" />
                </Field>
              </>
            )}

            {/* Tab 3: Water Supply */}
            {tab === 3 && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-600 dark:text-gray-300">Hydrants, dry hydrants, and other water sources.</p>
                  <button type="button" onClick={addWater}
                    className="flex items-center gap-1 text-xs text-red-700 dark:text-red-300 font-semibold hover:underline">
                    <Plus size={12} /> Add Source
                  </button>
                </div>
                {form.waterSupply.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">No water supply sources added yet.</p>
                )}
                {form.waterSupply.map((w, i) => (
                  <div key={i} className="bg-blue-50 dark:bg-blue-950/50 border border-blue-100 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Source {i + 1}</span>
                      <button type="button" onClick={() => removeWater(i)} aria-label="Remove water source"
                        className="text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select className={INPUT} value={w.type} aria-label="Water source type"
                        onChange={(e) => setWater(i, 'type', e.target.value)}>
                        {WATER_SUPPLY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input type="text" className={INPUT} value={w.hydrantId}
                        onChange={(e) => setWater(i, 'hydrantId', e.target.value)} placeholder="ID (e.g. H-114)" aria-label="Water source ID" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input type="number" className={INPUT} value={w.distance}
                        onChange={(e) => setWater(i, 'distance', e.target.value)} placeholder="Distance (ft)" min={0} aria-label="Distance in feet" />
                      <input type="number" className={INPUT} value={w.flowGPM}
                        onChange={(e) => setWater(i, 'flowGPM', e.target.value)} placeholder="Flow (GPM)" min={0} aria-label="Flow in GPM" />
                    </div>
                    <input type="text" className={INPUT} value={w.location}
                      onChange={(e) => setWater(i, 'location', e.target.value)} placeholder="Location description" aria-label="Water source location" />
                  </div>
                ))}
              </div>
            )}

            {/* Tab 4: Suppression */}
            {tab === 4 && (
              <>
                <div className="flex gap-6">
                  {[['sprinklered','Sprinkler System'],['standpipe','Standpipe']].map(([field, label]) => (
                    <label key={field} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="rounded"
                        checked={form.suppression[field]}
                        onChange={setNestedBool('suppression', field)} />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
                    </label>
                  ))}
                </div>
                <Field label="FDC Location">
                  <input type="text" className={INPUT} value={form.suppression.FDC}
                    onChange={setNested('suppression','FDC')} placeholder="e.g. South wall — facing parking lot" />
                </Field>
                <Field label="Alarm Panel Location">
                  <input type="text" className={INPUT} value={form.suppression.alarmPanel}
                    onChange={setNested('suppression','alarmPanel')} placeholder="e.g. Main lobby — north wall" />
                </Field>
                <Field label="Main Shutoff Location">
                  <input type="text" className={INPUT} value={form.suppression.shutoff}
                    onChange={setNested('suppression','shutoff')} placeholder="e.g. Mechanical room B-12, basement" />
                </Field>
                <Field label="Notes">
                  <textarea className={TEXTAREA} rows={3} value={form.suppression.notes}
                    onChange={setNested('suppression','notes')} placeholder="Coverage areas, last test date, special considerations…" />
                </Field>
              </>
            )}

            {/* Tab 5: Utilities */}
            {tab === 5 && (
              <>
                <Field label="Gas Shutoff Location">
                  <input type="text" className={INPUT} value={form.utilities.gasShutoff}
                    onChange={setNested('utilities','gasShutoff')} placeholder="e.g. Rear of building — yellow handle" />
                </Field>
                <Field label="Electrical Panel Location">
                  <input type="text" className={INPUT} value={form.utilities.electrical}
                    onChange={setNested('utilities','electrical')} placeholder="e.g. Basement Room B-01; secondary panels per wing" />
                </Field>
                <Field label="Notes">
                  <textarea className={TEXTAREA} rows={3} value={form.utilities.notes}
                    onChange={setNested('utilities','notes')} placeholder="Generator location, UPS systems, special considerations…" />
                </Field>
              </>
            )}

            {/* Tab 6: Evacuation & Review */}
            {tab === 6 && (
              <>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Evacuation Routes (NFPA 1620 §7)</p>
                    <Field label="Primary & Secondary Evacuation Routes">
                      <textarea className={TEXTAREA} rows={4} value={form.evacuationRoutes ?? ''}
                        onChange={e => setForm(f => ({ ...f, evacuationRoutes: e.target.value }))}
                        placeholder="Describe primary and secondary evacuation routes, assembly points, stairwell locations, and any special occupant considerations (mobility-impaired, locked units, etc.)…" />
                    </Field>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Plan Review & Approval</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Reviewed By">
                        <input type="text" className={INPUT} value={form.reviewedBy ?? ''}
                          onChange={e => setForm(f => ({ ...f, reviewedBy: e.target.value }))}
                          placeholder="Officer name" />
                      </Field>
                      <Field label="Review Date">
                        <input type="date" className={INPUT} value={form.reviewedAt ? form.reviewedAt.slice(0,10) : ''}
                          onChange={e => setForm(f => ({ ...f, reviewedAt: e.target.value }))} />
                      </Field>
                    </div>
                    <Field label="Review Notes">
                      <textarea className={TEXTAREA} rows={3} value={form.reviewNotes ?? ''}
                        onChange={e => setForm(f => ({ ...f, reviewNotes: e.target.value }))}
                        placeholder="Notes from the plan review, items requiring follow-up, date of next drill, etc." />
                    </Field>
                  </div>

                  {/* Completeness breakdown */}
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">NFPA 1620 Completeness Checklist</p>
                    <div className="space-y-2">
                      {nfpa1620Score(form).checks.map(c => (
                        <div key={c.label} className="flex items-center gap-2">
                          {c.done
                            ? <CheckCircle size={14} className="text-green-500 shrink-0" />
                            : <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
                          <span className={`text-xs ${c.done ? 'text-gray-700 dark:text-gray-300' : 'text-amber-600 dark:text-amber-400'}`}>{c.label}</span>
                          {!c.done && <span className="text-[10px] text-gray-400">— not yet filled</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 px-6 py-4 flex justify-between items-center">
            <div className="flex gap-2">
              {tab > 0 && (
                <button type="button" onClick={() => setTab((t) => t - 1)}
                  className="px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                  ← Previous
                </button>
              )}
              {tab < TABS.length - 1 && (
                <button type="button" onClick={() => setTab((t) => t + 1)}
                  className="px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                  Next →
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button type="submit"
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 transition-colors">
                <Save size={14} />
                {isEdit ? 'Save Changes' : 'Create Plan'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
