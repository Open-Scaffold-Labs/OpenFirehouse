import { useState, useEffect, useMemo } from 'react';
import { X, ChevronDown, ChevronUp, AlertTriangle, ShieldCheck, MapPin, CheckCircle, Loader2 } from 'lucide-react';
import { api } from '../utils/api';
import FieldTooltip from './FieldTooltip';
import AIWriteTextarea from './AIWriteTextarea';
import DictateInput from './DictateInput';
import {
  INCIDENT_TYPE_CODES, PROPERTY_USE_CODES, ACTIONS_TAKEN,
  AID_CODES, FIRE_CAUSE_CODES, FIRE_ORIGIN_CODES,
  STRUCTURE_TYPE_CODES, DETECTOR_PRESENCE, DETECTOR_OPERATION,
  SPRINKLER_PRESENCE, SPRINKLER_OPERATION, NFIRS_STATUSES, FDID,
} from '../data/nfirs';
import { generateNerisId } from '../utils/nerisExport';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

function Field({ label, required, children, hint, tooltip }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        {tooltip && <FieldTooltip text={tooltip} />}
      </label>
      {children}
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, type = 'text', ...rest }) {
  // Use DictateInput for text fields, plain input for others
  if (type === 'text') {
    return (
      <DictateInput
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="rounded-xl"
        {...rest}
      />
    );
  }
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
      {...rest}
    />
  );
}

function Select({ value, onChange, options, placeholder = 'Select…' }) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
    >
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o.code} value={o.code}>{o.label}</option>
      ))}
    </select>
  );
}

function Section({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-300"
      >
        {title}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div className="px-5 py-4 space-y-4 bg-white dark:bg-gray-900">{children}</div>}
    </div>
  );
}

// ─── Blank template ───────────────────────────────────────────────────────────

const blank = {
  fdid: FDID, incidentNumber: '', exposureNumber: '000',
  incidentDate: '', alarmTime: '', arrivalTime: '', controlledTime: '', clearedTime: '',
  incidentTypeCode: '', aidCode: 'N',
  streetNumber: '', streetPrefix: '', streetName: '', streetType: '', streetSuffix: '', aptSuite: '',
  city: 'Maplewood', state: 'MN', zip: '55117', crossStreet: '',
  propertyUseCode: '',
  action1: '', action2: '', action3: '',
  suppressionApparatus: 0, suppressionPersonnel: 0,
  emsApparatus: 0,         emsPersonnel: 0,
  otherApparatus: 0,       otherPersonnel: 0,
  civilianDeaths: 0, civilianInjuries: 0, fsDeaths: 0, fsInjuries: 0,
  propertyLoss: '', contentsLoss: '',
  isStructureFire: false,
  structureType: '', buildingStatus: '',
  storiesAboveGrade: '', storiesBelowGrade: '', mainFloorArea: '',
  fireOriginCode: '', fireCauseCode: '',
  contributingFactor1: '', contributingFactor2: '',
  detectorPresence: '', detectorOperation: '', detectorEffectiveness: '', detectorFailureReason: '',
  sprinklerPresence: '', sprinklerOperation: '', sprinklerFailureReason: '',
  status: 'Draft', narrativeStatement: '', preparedBy: '', officerInCharge: '', reviewedBy: '',
  linkedIncidentId: null,
  // NERIS-specific fields
  latitude: '', longitude: '',
  dispatchTime: '', onSceneTime: '', unitClearTime: '',
  respondingUnits: '',
};

// ─── Form ─────────────────────────────────────────────────────────────────────

export default function NFIRSForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial ? { ...blank, ...initial } : { ...blank });
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState(null); // { valid, errors, warnings }
  const [members, setMembers] = useState([]);

  useEffect(() => {
    api.get('/api/members').then(raw => {
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setMembers(arr.filter(m => m.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, []);

  function set(key) {
    return (val) => setForm(f => ({ ...f, [key]: val }));
  }

  function setNum(key) {
    return (val) => setForm(f => ({ ...f, [key]: parseInt(val) || 0 }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave(form);
  }

  const isFireType = form.incidentTypeCode.startsWith('1') && !['130','131','132','133','134','135','136','137','138','140','141','142','143','150','151','152','153','154','155','160','162','163','164'].includes(form.incidentTypeCode);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl my-8">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-red-700 rounded-t-3xl">
          <div>
            <h2 className="text-base font-black text-white">
              {form.id ? `Edit NFIRS Report — ${form.incidentNumber}` : 'New NFIRS Report'}
            </h2>
            <p className="text-xs text-red-200 mt-0.5">NFIRS 5.0 · FDID {FDID}</p>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="p-1.5 text-red-200 hover:text-white hover:bg-white/10 rounded-xl">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Module 1: Basic ─────────────────────────────── */}
          <Section title="Module 1 — Basic (Required for All Incidents)">

            {/* ID / Status */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Incident Number" required>
                <Input value={form.incidentNumber} onChange={set('incidentNumber')} placeholder="26-0001" />
              </Field>
              <Field label="Exposure #" tooltip="Use '000' for the primary fire. Subsequent exposures (e.g. a neighboring structure ignited by the same fire) are numbered 001, 002, etc.">
                <Input value={form.exposureNumber} onChange={set('exposureNumber')} placeholder="000" />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={e => set('status')(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100">
                  {NFIRS_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="FDID" tooltip="Fire Department Identification number assigned by your state fire marshal. Pre-filled from Station Settings — change only if reporting for a mutual aid partner department.">
                <Input value={form.fdid} onChange={set('fdid')} />
              </Field>
            </div>

            {/* Dates & Times */}
            <div className="grid grid-cols-5 gap-4">
              <Field label="Incident Date" required>
                <Input type="date" value={form.incidentDate} onChange={set('incidentDate')} />
              </Field>
              <Field label="Alarm Time" required>
                <Input type="time" value={form.alarmTime} onChange={set('alarmTime')} />
              </Field>
              <Field label="Arrival Time" required>
                <Input type="time" value={form.arrivalTime} onChange={set('arrivalTime')} />
              </Field>
              <Field label="Controlled Time">
                <Input type="time" value={form.controlledTime} onChange={set('controlledTime')} />
              </Field>
              <Field label="Last Unit Cleared" required>
                <Input type="time" value={form.clearedTime} onChange={set('clearedTime')} />
              </Field>
            </div>

            {/* Incident Type & Aid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Incident Type Code" required tooltip="The 3–5 digit NFIRS code that classifies the incident (e.g. 111 = Building Fire, 321 = EMS call). Start typing to filter the list.">
                <Select value={form.incidentTypeCode} onChange={set('incidentTypeCode')}
                  options={INCIDENT_TYPE_CODES} placeholder="Select incident type…" />
              </Field>
              <Field label="Aid Given / Received" tooltip="'N' = No aid. Select 'Aid Given' if your unit assisted another department, or 'Aid Received' if another department assisted you. Affects state statistics.">
                <Select value={form.aidCode} onChange={set('aidCode')} options={AID_CODES} />
              </Field>
            </div>

            {/* Address */}
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Address</p>
            <div className="grid grid-cols-6 gap-3">
              <Field label="St. Number">
                <Input value={form.streetNumber} onChange={set('streetNumber')} placeholder="412" />
              </Field>
              <Field label="Prefix">
                <Input value={form.streetPrefix} onChange={set('streetPrefix')} placeholder="N" />
              </Field>
              <div className="col-span-2">
                <Field label="Street Name" required>
                  <Input value={form.streetName} onChange={set('streetName')} placeholder="Elmwood" />
                </Field>
              </div>
              <Field label="Type">
                <Input value={form.streetType} onChange={set('streetType')} placeholder="Dr" />
              </Field>
              <Field label="Suffix">
                <Input value={form.streetSuffix} onChange={set('streetSuffix')} placeholder="NW" />
              </Field>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Apt / Suite">
                <Input value={form.aptSuite} onChange={set('aptSuite')} />
              </Field>
              <Field label="City" required>
                <Input value={form.city} onChange={set('city')} />
              </Field>
              <Field label="State" required>
                <select value={form.state} onChange={e => set('state')(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100">
                  {US_STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="ZIP" required>
                <Input value={form.zip} onChange={set('zip')} placeholder="55117" />
              </Field>
            </div>
            <Field label="Cross Street">
              <Input value={form.crossStreet} onChange={set('crossStreet')} placeholder="Nearest cross street" />
            </Field>

            {/* Property Use */}
            <Field label="Property Use Code" required tooltip="Describes what the property was used for at the time of the incident (e.g. 419 = 1- or 2-family dwelling, 500 = Mercantile). Use the occupancy at the time of the incident, not the intended use.">
              <Select value={form.propertyUseCode} onChange={set('propertyUseCode')}
                options={PROPERTY_USE_CODES} placeholder="Select property use…" />
            </Field>

            {/* Actions Taken */}
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Actions Taken (up to 3)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Action 1" required>
                <Select value={form.action1} onChange={set('action1')} options={ACTIONS_TAKEN} />
              </Field>
              <Field label="Action 2">
                <Select value={form.action2} onChange={set('action2')} options={ACTIONS_TAKEN} />
              </Field>
              <Field label="Action 3">
                <Select value={form.action3} onChange={set('action3')} options={ACTIONS_TAKEN} />
              </Field>
            </div>

            {/* Resources */}
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Resources Used</p>
            <div className="grid grid-cols-6 gap-3">
              {[
                { label: 'Suppr. App',  key: 'suppressionApparatus'  },
                { label: 'Suppr. Pers', key: 'suppressionPersonnel'  },
                { label: 'EMS App',     key: 'emsApparatus'          },
                { label: 'EMS Pers',    key: 'emsPersonnel'          },
                { label: 'Other App',   key: 'otherApparatus'        },
                { label: 'Other Pers',  key: 'otherPersonnel'        },
              ].map(({ label, key }) => (
                <Field key={key} label={label}>
                  <Input type="number" value={form[key]} onChange={setNum(key)} min="0" />
                </Field>
              ))}
            </div>

            {/* Casualties */}
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Casualties</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Civilian Deaths',   key: 'civilianDeaths'   },
                { label: 'Civilian Injuries', key: 'civilianInjuries' },
                { label: 'FS Deaths',         key: 'fsDeaths'         },
                { label: 'FS Injuries',       key: 'fsInjuries'       },
              ].map(({ label, key }) => (
                <Field key={key} label={label}>
                  <Input type="number" value={form[key]} onChange={setNum(key)} min="0" />
                </Field>
              ))}
            </div>

            {/* Losses */}
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Estimated Dollar Losses</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Property Loss ($)" hint="Enter 0 if none; leave blank if unknown">
                <Input type="number" value={form.propertyLoss} onChange={set('propertyLoss')} min="0" placeholder="0" />
              </Field>
              <Field label="Contents Loss ($)">
                <Input type="number" value={form.contentsLoss} onChange={set('contentsLoss')} min="0" placeholder="0" />
              </Field>
            </div>
          </Section>

          {/* Module 3: Structure Fire ─────────────────────── */}
          <Section title="Module 3 — Structure Fire" defaultOpen={form.isStructureFire}>
            <div className="flex items-center gap-3 mb-2">
              <input type="checkbox" id="isStructureFire"
                checked={form.isStructureFire}
                onChange={e => setForm(f => ({ ...f, isStructureFire: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 accent-red-600"
              />
              <label htmlFor="isStructureFire" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                This is a structure fire (complete Module 3)
              </label>
            </div>

            {form.isStructureFire && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Field label="Structure Type">
                    <Select value={form.structureType} onChange={set('structureType')} options={STRUCTURE_TYPE_CODES} />
                  </Field>
                  <Field label="Stories Above Grade">
                    <Input type="number" value={form.storiesAboveGrade} onChange={set('storiesAboveGrade')} min="0" />
                  </Field>
                  <Field label="Stories Below Grade">
                    <Input type="number" value={form.storiesBelowGrade} onChange={set('storiesBelowGrade')} min="0" />
                  </Field>
                  <Field label="Main Floor Area (sq ft)">
                    <Input type="number" value={form.mainFloorArea} onChange={set('mainFloorArea')} min="0" />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Area of Fire Origin" tooltip="The room, area, or part of the structure where the fire started (e.g. Kitchen, Attic). If unknown, select 'Undetermined'.">
                    <Select value={form.fireOriginCode} onChange={set('fireOriginCode')} options={FIRE_ORIGIN_CODES} />
                  </Field>
                  <Field label="Fire Cause" tooltip="The broad cause classification: Intentional, Unintentional, Act of Nature, Unknown, or Under Investigation. This is not the same as the specific ignition source.">
                    <Select value={form.fireCauseCode} onChange={set('fireCauseCode')} options={FIRE_CAUSE_CODES} />
                  </Field>
                </div>

                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Detector</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Detector Presence" tooltip="Was a smoke or heat detector present in the area of origin? Choose 'None Present' only if confirmed absent — not if unknown.">
                    <Select value={form.detectorPresence} onChange={set('detectorPresence')} options={DETECTOR_PRESENCE} />
                  </Field>
                  <Field label="Detector Operation" tooltip="Did the detector alert occupants before the fire grew? 'Operated' = yes, 'Failed to Operate' = present but did not activate, 'Unknown' = cannot determine.">
                    <Select value={form.detectorOperation} onChange={set('detectorOperation')} options={DETECTOR_OPERATION} />
                  </Field>
                </div>

                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Sprinkler</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Sprinkler Presence" tooltip="Was an automatic sprinkler system installed in the area of origin? Partial systems count only if the area of origin was covered.">
                    <Select value={form.sprinklerPresence} onChange={set('sprinklerPresence')} options={SPRINKLER_PRESENCE} />
                  </Field>
                  <Field label="Sprinkler Operation" tooltip="Did the sprinkler system activate and suppress or control the fire? 'Operated' = activated as designed, even if fire was not fully controlled.">
                    <Select value={form.sprinklerOperation} onChange={set('sprinklerOperation')} options={SPRINKLER_OPERATION} />
                  </Field>
                </div>
              </>
            )}
          </Section>

          {/* NERIS Enhanced Fields ─────────────────────────── */}
          <Section title="NERIS — Enhanced Fields" defaultOpen={false}>
            <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 mb-3">
              <ShieldCheck size={13} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 dark:text-blue-300">
                These fields are required for NERIS-compliant exports. GPS coordinates and unit response times improve data quality and are mandatory for NERIS submission.
              </p>
            </div>

            {/* NERIS ID Preview */}
            <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 mb-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">NERIS Incident ID (auto-generated)</p>
              <p className="text-sm font-mono font-bold text-gray-700 dark:text-gray-300">
                {form.incidentDate ? generateNerisId(form.fdid || FDID, form.incidentDate) : '—'}
              </p>
            </div>

            {/* GPS Coordinates */}
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
              <MapPin size={11} /> GPS Location
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Latitude" tooltip="WGS84 latitude (e.g. 44.9537). Required for NERIS incident_point field. Can be captured from mobile GPS or looked up from the address.">
                <Input type="number" value={form.latitude} onChange={set('latitude')} placeholder="44.9537" step="0.0001" />
              </Field>
              <Field label="Longitude" tooltip="WGS84 longitude (e.g. -93.0900). Use negative values for Western hemisphere.">
                <Input type="number" value={form.longitude} onChange={set('longitude')} placeholder="-93.0900" step="0.0001" />
              </Field>
            </div>

            {/* Unit Response */}
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-2">Unit Response</p>
            <Field label="Responding Units" hint="Comma-separated unit IDs (e.g. Engine 14, Ladder 14, EMS 14)">
              <Input value={form.respondingUnits} onChange={set('respondingUnits')} placeholder="Engine 14, Ladder 14" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Dispatch Time" tooltip="Time the unit was dispatched. Maps to NERIS time_dispatch field.">
                <Input type="time" value={form.dispatchTime} onChange={set('dispatchTime')} />
              </Field>
              <Field label="On Scene Time" tooltip="Time the first unit arrived on scene. Maps to NERIS time_on_scene field.">
                <Input type="time" value={form.onSceneTime} onChange={set('onSceneTime')} />
              </Field>
              <Field label="Unit Clear Time" tooltip="Time the last unit cleared the scene. Maps to NERIS time_unit_clear field.">
                <Input type="time" value={form.unitClearTime} onChange={set('unitClearTime')} />
              </Field>
            </div>
          </Section>

          {/* Narrative & Officers ─────────────────────────── */}
          <Section title="Narrative & Authorization">
            <Field label="Narrative Statement">
              <AIWriteTextarea
                value={form.narrativeStatement}
                onChange={e => set('narrativeStatement')(e.target.value)}
                rows={4}
                placeholder="Describe the incident in plain language…"
                name="narrativeStatement"
                id="narrative"
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Prepared By">
                <select value={form.preparedBy || ''} onChange={e => set('preparedBy')(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100">
                  <option value="">Select member…</option>
                  {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>)}
                </select>
              </Field>
              <Field label="Officer in Charge" required>
                <select value={form.officerInCharge || ''} onChange={e => set('officerInCharge')(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100">
                  <option value="">Select officer…</option>
                  {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>)}
                </select>
              </Field>
              <Field label="Reviewed By">
                <select value={form.reviewedBy || ''} onChange={e => set('reviewedBy')(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100">
                  <option value="">Select reviewer…</option>
                  {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Linked Incident ID" hint="Optional — link to an existing Incident Log entry" tooltip="Enter the numeric ID from the Incident Log to cross-reference the dispatch record with this NFIRS report. Enables one-click navigation between the two.">
              <Input type="number" value={form.linkedIncidentId ?? ''} onChange={v => setForm(f => ({ ...f, linkedIncidentId: v ? parseInt(v) : null }))} placeholder="Incident Log ID" />
            </Field>
          </Section>

          {/* NJ State Validation ───────────────────────── */}
          <Section title="NJ State Validation" defaultOpen={false}>
            <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 mb-3">
              <ShieldCheck size={13} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 dark:text-blue-300">
                Validate this report against NJ Office of Fire Safety requirements before submission.
                Checks FDID format, required fields, structure fire modules, casualty reporting deadlines, and the 30-day submission window.
              </p>
            </div>

            <button
              type="button"
              disabled={validating}
              onClick={async () => {
                setValidating(true);
                setValidation(null);
                try {
                  const res = await api.post('/api/nfirs-reports/validate', {
                    ...form,
                    incidentType: form.incidentTypeCode,
                    ffDeaths: form.fsDeaths,
                    ffInjuries: form.fsInjuries,
                    civDeaths: form.civilianDeaths,
                    civInjuries: form.civilianInjuries,
                    date: form.incidentDate,
                    address: [form.streetNumber, form.streetName].filter(Boolean).join(' '),
                  });
                  setValidation(res.data);
                } catch (e) {
                  setValidation({ valid: false, errors: ['Validation request failed — check server connection.'], warnings: [] });
                } finally {
                  setValidating(false);
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-sm disabled:opacity-50"
            >
              {validating ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              {validating ? 'Validating…' : 'Validate for NJ Submission'}
            </button>

            {/* Validation results */}
            {validation && (
              <div className="mt-3 space-y-2">
                {/* Status badge */}
                <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border ${
                  validation.valid
                    ? 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-900'
                    : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900'
                }`}>
                  {validation.valid
                    ? <CheckCircle size={14} className="text-green-600 dark:text-green-400" />
                    : <X size={14} className="text-red-600 dark:text-red-400" />
                  }
                  <span className={`text-sm font-bold ${validation.valid ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                    {validation.valid ? 'Report passes NJ validation' : `${validation.errors?.length || 0} error(s) must be fixed`}
                  </span>
                </div>

                {/* Errors */}
                {validation.errors?.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 space-y-1">
                    <p className="text-xs font-bold text-red-800 dark:text-red-300">Errors (must fix)</p>
                    {validation.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-700 dark:text-red-300 flex items-start gap-1.5">
                        <X size={10} className="flex-shrink-0 mt-0.5" /> {e}
                      </p>
                    ))}
                  </div>
                )}

                {/* Warnings */}
                {validation.warnings?.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 space-y-1">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Warnings ({validation.warnings.length})</p>
                    {validation.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                        <AlertTriangle size={10} className="flex-shrink-0 mt-0.5" /> {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* NFIRS submission warning */}
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3">
            <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Marking a report <strong>Complete</strong> enables export for submission. Direct NFIRS electronic submission requires a certified FDID registered with USFA.
            </p>
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-2">
            <button type="submit"
              className="px-6 py-2.5 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-sm">
              {form.id ? 'Save Changes' : 'Create Report'}
            </button>
            <button type="button" onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
