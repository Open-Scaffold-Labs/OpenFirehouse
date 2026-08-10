import DictateTextarea from './DictateTextarea';
import { useState, useEffect, useCallback } from 'react';
import {
  Microscope, Plus, Search, ChevronDown, ChevronUp,
  CheckCircle, XCircle, AlertTriangle, Pencil,
  FileText, Shield, Camera, ClipboardList,
} from 'lucide-react';
import FieldTooltip from './FieldTooltip';
import AIActionButton from './AIActionButton';
import {
  CAUSE_CLASSIFICATIONS, CAUSE_DETAILS,
  INVESTIGATION_STATUSES, STATUS_COLORS, ORIGIN_ROOMS,
  EVIDENCE_TYPES, INVESTIGATORS, SCENE_CHECKLIST,
} from '../data/investigations';
import { api } from '../utils/api';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n) {
  return n != null ? `$${Number(n).toLocaleString()}` : '—';
}

function StatusChip({ status }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
      {status}
    </span>
  );
}

function CauseBadge({ cause }) {
  const map = {
    Accidental:   'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
    Natural:      'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300',
    Incendiary:   'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300',
    Undetermined: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${map[cause] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
      {cause}
    </span>
  );
}

// ─── Scene Checklist Detail ────────────────────────────────────────────────────

function ChecklistDisplay({ checked }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {SCENE_CHECKLIST.map(item => {
        const done = checked.includes(item);
        return (
          <div key={item} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${done ? 'bg-green-50 dark:bg-green-950/50 border border-green-100 dark:border-green-900' : 'bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-700'}`}>
            {done
              ? <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
              : <XCircle    size={12} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />}
            <span className={`text-[11px] ${done ? 'text-green-800 dark:text-green-300 font-medium' : 'text-gray-400'}`}>{item}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Expanded Detail ──────────────────────────────────────────────────────────

function InvestigationDetail({ inv, onEdit }) {
  const Field = ({ label, value }) => (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs text-gray-800 dark:text-gray-100 font-medium">{value || '—'}</p>
    </div>
  );

  return (
    <div className="bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-700 px-6 py-5 space-y-5">

      {/* Overview grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="Case Number"    value={inv.caseNumber} />
        <Field label="Incident Date"  value={inv.incidentDate} />
        <Field label="Investigator"   value={inv.investigator} />
        <Field label="Co-Investigator" value={inv.coInvestigator} />
        <Field label="Occupancy Type" value={inv.occupancyType} />
        <Field label="Area of Origin" value={[inv.areaOfOrigin, inv.originRoom].filter(Boolean).join(' — ')} />
        <Field label="Cause Detail"   value={inv.causeDetail} />
        <Field label="Est. Loss"      value={fmt$(inv.estimatedLoss)} />
        <Field label="Owner"          value={inv.ownerName} />
        <Field label="Owner Phone"    value={inv.ownerPhone} />
        <Field label="Insurer"        value={inv.insuranceCarrier} />
        <Field label="Close Date"     value={inv.closeDate} />
      </div>

      {/* Injury / fatality callout */}
      {(inv.injuries > 0 || inv.fatalities > 0) && (
        <div className="flex gap-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-800 dark:text-red-300 font-medium">
            {inv.fatalities > 0 && <span className="font-black">{inv.fatalities} fatality{inv.fatalities > 1 ? 'ies' : ''}</span>}
            {inv.fatalities > 0 && inv.injuries > 0 && ' · '}
            {inv.injuries > 0 && <span>{inv.injuries} injury{inv.injuries > 1 ? 'ies' : ''}</span>}
          </div>
        </div>
      )}

      {/* Referrals */}
      {(inv.lawEnforcementNotified || inv.stateFMNotified) && (
        <div className="flex gap-2 flex-wrap">
          {inv.lawEnforcementNotified && (
            <span className="flex items-center gap-1.5 text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-full px-3 py-1 text-amber-800 dark:text-amber-300">
              <Shield size={11} /> Law enforcement notified
            </span>
          )}
          {inv.stateFMNotified && (
            <span className="flex items-center gap-1.5 text-xs font-semibold bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-900 rounded-full px-3 py-1 text-orange-800 dark:text-orange-300">
              <Shield size={11} /> State fire marshal notified
            </span>
          )}
        </div>
      )}

      {/* Scene checklist */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList size={13} className="text-gray-400" />
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Scene Checklist</p>
          <span className="text-[10px] text-gray-400">{inv.sceneChecklist.length}/{SCENE_CHECKLIST.length} items</span>
        </div>
        <ChecklistDisplay checked={inv.sceneChecklist} />
      </div>

      {/* Evidence log */}
      {inv.evidence?.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Camera size={13} className="text-gray-400" />
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Evidence / Documentation</p>
          </div>
          <div className="space-y-1.5">
            {inv.evidence.map(e => (
              <div key={e.id} className="flex gap-3 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2">
                <span className="text-[10px] font-bold text-gray-400 flex-shrink-0 mt-0.5 w-28 truncate">{e.type}</span>
                <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">{e.description}</span>
                <span className="font-mono text-[10px] text-gray-400 flex-shrink-0">{e.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Narrative */}
      {inv.narrative && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText size={13} className="text-gray-400" />
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Investigator Narrative</p>
          </div>
          <p className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3 leading-relaxed">{inv.narrative}</p>
        </div>
      )}

      {/* Linked Meetings */}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
        <LinkedMeetings module="investigations" recordId={inv.id} recordLabel={inv.caseNumber || 'Investigation'} />
        <Attachments module="investigations" recordId={inv.id} recordLabel={inv.caseNumber || 'Investigation'} />
      </div>

      {/* AI Actions */}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">AI Actions</p>
        <div className="flex flex-wrap gap-2">
          <AIActionButton
            action="investigate_incident"
            context={{ module: 'investigations', recordId: inv.id, data: inv }}
            label="AI Analysis"
            variant="inline"
            resultType="json"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={() => onEdit(inv)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-800 text-white rounded-lg hover:bg-gray-900">
          <Pencil size={11} /> Edit Case
        </button>
      </div>
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function InvestigationForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(null);
  const [members, setMembers] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get('/api/members').then(raw => {
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      const filtered = arr.filter(m => m.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name));
      setMembers(filtered);
    }).catch(() => {});
  }, []);

  const blank = {
    caseNumber: `FI-${new Date().getFullYear()}-???`,
    incidentDate: new Date().toISOString().slice(0, 10),
    address: '',
    occupancyType: '',
    cause: 'Undetermined',
    causeDetail: CAUSE_DETAILS['Undetermined'][0],
    status: 'Open',
    investigator: initial?.investigator ?? (members[0]?.name || ''),
    coInvestigator: '',
    areaOfOrigin: ORIGIN_ROOMS[0],
    originRoom: '',
    estimatedLoss: '',
    injuries: 0,
    fatalities: 0,
    ownerName: '',
    ownerPhone: '',
    insuranceCarrier: '',
    lawEnforcementNotified: false,
    stateFMNotified: false,
    sceneChecklist: [],
    evidence: [],
    narrative: '',
    closeDate: '',
  };

  if (!form) setForm(initial ?? blank);

  function toggleChecklist(item) {
    setForm(f => ({
      ...f,
      sceneChecklist: f.sceneChecklist.includes(item)
        ? f.sceneChecklist.filter(x => x !== item)
        : [...f.sceneChecklist, item],
    }));
  }

  function addEvidence() {
    setForm(f => ({ ...f, evidence: [...f.evidence, { id: Date.now(), type: EVIDENCE_TYPES[0], description: '', date: f.incidentDate }] }));
  }
  function setEvidence(i, key, val) {
    setForm(f => { const ev = [...f.evidence]; ev[i] = { ...ev[i], [key]: val }; return { ...f, evidence: ev }; });
  }
  function removeEvidence(i) {
    setForm(f => ({ ...f, evidence: f.evidence.filter((_, j) => j !== i) }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      ...form,
      id: form.id ?? Date.now(),
      createdDate: form.createdDate ?? form.incidentDate,
      estimatedLoss: form.estimatedLoss !== '' ? Number(form.estimatedLoss) : null,
      injuries:   Number(form.injuries)   || 0,
      fatalities: Number(form.fatalities) || 0,
    });
  }

  const TF = ({ label, k, type = 'text', placeholder, required, tooltip }) => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        {tooltip && <FieldTooltip text={tooltip} />}
      </label>
      <input type={type} value={form[k] ?? ''} onChange={e => set(k, e.target.value)}
        placeholder={placeholder}
        className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
        required={required} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-800 rounded-t-2xl">
          <h2 className="text-base font-bold text-white">{initial ? 'Edit Investigation' : 'New Fire Investigation'}</h2>
          <button onClick={onClose} aria-label="Close form" className="text-gray-400 hover:text-white"><XCircle size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TF label="Case Number"    k="caseNumber"   required />
            <TF label="Incident Date"  k="incidentDate" type="date" required />
          </div>

          <TF label="Address / Location" k="address" required />
          <TF label="Occupancy Type" k="occupancyType" placeholder="e.g. Residential — Single Family"
            tooltip="Describe the building's use at the time of the fire. Common examples: Residential — Single Family, Commercial — Restaurant, Industrial — Warehouse." />

          {/* Cause */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Cause Classification
                <FieldTooltip text="The top-level cause category. 'Undetermined' is valid during investigation — update when the cause is confirmed. 'Intentional' triggers law enforcement notification." />
              </label>
              <select value={form.cause} onChange={e => { set('cause', e.target.value); set('causeDetail', CAUSE_DETAILS[e.target.value]?.[0] ?? ''); }}
                aria-label="Cause Classification"
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300">
                {CAUSE_CLASSIFICATIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Cause Detail
                <FieldTooltip text="The specific mechanism or ignition source. Options update automatically based on the Cause Classification selected to the left." />
              </label>
              <select value={form.causeDetail} onChange={e => set('causeDetail', e.target.value)}
                aria-label="Cause Detail"
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100">
                {(CAUSE_DETAILS[form.cause] ?? []).map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* Status & Investigator */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                aria-label="Status"
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100">
                {INVESTIGATION_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Investigator</label>
              <select value={form.investigator} onChange={e => set('investigator', e.target.value)}
                aria-label="Investigator"
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100">
                <option value="">Select investigator…</option>
                {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                <option value="Other (external agency)">Other (external agency)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Area of Origin
                <FieldTooltip text="The general part of the building where the fire started. Use the right field to add a specific room or location detail (e.g. 'Basement utility room near water heater')." />
              </label>
              <select value={form.areaOfOrigin} onChange={e => set('areaOfOrigin', e.target.value)}
                aria-label="Area of Origin"
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100">
                {ORIGIN_ROOMS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <TF label="Origin Room / Detail" k="originRoom" placeholder="e.g. Basement utility room" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <TF label="Est. Loss ($)" k="estimatedLoss" type="number"
              tooltip="Combined property and contents loss estimate in dollars. Use 0 if no loss, leave blank if unknown. This feeds into the Incident Log and annual loss reports." />
            <TF label="Injuries"     k="injuries"      type="number"
              tooltip="Count of civilian injuries directly caused by this fire. Does not include firefighter injuries — those are tracked separately in member records." />
            <TF label="Fatalities"   k="fatalities"    type="number"
              tooltip="Count of civilian deaths. A value greater than 0 triggers a mandatory State Fire Marshal notification flag." />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TF label="Owner Name"   k="ownerName" />
            <TF label="Owner Phone"  k="ownerPhone" />
          </div>
          <TF label="Insurance Carrier" k="insuranceCarrier"
            tooltip="Name of the property's insurance company. Used for subrogation documentation and loss reporting — not required but strongly recommended for structure fires." />

          {/* Referrals */}
          <div className="flex gap-6">
            {[['lawEnforcementNotified', 'Law enforcement notified'], ['stateFMNotified', 'State fire marshal notified']].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)} className="rounded" />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</span>
              </label>
            ))}
          </div>

          {/* Scene checklist */}
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Scene Checklist</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {SCENE_CHECKLIST.map(item => (
                <label key={item} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.sceneChecklist.includes(item)} onChange={() => toggleChecklist(item)} className="rounded" />
                  <span className="text-xs text-gray-600 dark:text-gray-300">{item}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Evidence */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Evidence / Documentation</label>
              <button type="button" onClick={addEvidence} className="text-[10px] font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">+ Add Item</button>
            </div>
            <div className="space-y-2">
              {form.evidence.map((ev, i) => (
                <div key={ev.id} className="flex gap-2 items-start">
                  <select value={ev.type} onChange={e => setEvidence(i, 'type', e.target.value)}
                    aria-label="Evidence type"
                    className="w-32 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 flex-shrink-0 dark:text-gray-100">
                    {EVIDENCE_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <input value={ev.description} onChange={e => setEvidence(i, 'description', e.target.value)}
                    aria-label="Evidence description"
                    placeholder="Description"
                    className="flex-1 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100" />
                  <input type="date" value={ev.date} onChange={e => setEvidence(i, 'date', e.target.value)}
                    aria-label="Evidence date"
                    className="w-28 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 flex-shrink-0 dark:bg-gray-900 dark:text-gray-100" />
                  <button type="button" onClick={() => removeEvidence(i)} aria-label="Remove evidence item" className="text-gray-300 dark:text-gray-600 hover:text-red-500 mt-1"><XCircle size={14} /></button>
                </div>
              ))}
              {form.evidence.length === 0 && (
                <p className="text-[10px] text-gray-400 italic">No evidence items logged.</p>
              )}
            </div>
          </div>

          {/* Narrative */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Investigator Narrative</label>
            <DictateTextarea value={form.narrative} onChange={e => set('narrative', e.target.value)} rows={3}
              className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Co-Investigator</label>
              <select value={form.coInvestigator} onChange={e => set('coInvestigator', e.target.value)}
                aria-label="Co-Investigator"
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100">
                <option value="">— None —</option>
                {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>)}
              </select>
            </div>
            <TF label="Case Close Date" k="closeDate" type="date" />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700">Cancel</button>
            <button type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-gray-800 rounded-xl hover:bg-gray-900">
              {initial ? 'Save Changes' : 'Open Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function FireInvestigation() {
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [search,         setSearch]         = useState('');
  const [statusFlt,      setStatusFlt]      = useState('All');
  const [causeFlt,       setCauseFlt]       = useState('All');
  const [expandedId,     setExpandedId]     = useState(null);
  const [formOpen,       setFormOpen]       = useState(false);
  const [editing,        setEditing]        = useState(null);

  const fetchInvestigations = useCallback(async () => {
    try {
      const res = await api.get('/api/investigations');
      setInvestigations(res.data ?? []);
    } catch (e) {
      console.error('Failed to fetch investigations', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvestigations(); }, [fetchInvestigations]);

  const open   = investigations.filter(i => !i.closeDate).length;
  const incend = investigations.filter(i => i.cause === 'Incendiary').length;
  const totalLoss = investigations.reduce((s, i) => s + (i.estimatedLoss ?? 0), 0);
  const injuries  = investigations.reduce((s, i) => s + (i.injuries ?? 0), 0);

  const filtered = investigations.filter(inv => {
    const q     = search.toLowerCase();
    const matchQ = !q || inv.caseNumber.toLowerCase().includes(q) || inv.address.toLowerCase().includes(q);
    const matchS = statusFlt === 'All' || inv.status === statusFlt;
    const matchC = causeFlt  === 'All' || inv.cause  === causeFlt;
    return matchQ && matchS && matchC;
  });

  async function handleSave(data) {
    try {
      if (data.id && investigations.find(i => i.id === data.id)) {
        const { id, ...changes } = data;
        const res = await api.patch(`/api/investigations/${id}`, changes);
        setInvestigations(prev => prev.map(i => i.id === res.data.id ? res.data : i));
      } else {
        const { id: _ignore, ...body } = data;
        const res = await api.post('/api/investigations', body);
        setInvestigations(prev => [...prev, res.data]);
      }
    } catch (e) {
      console.error('Failed to save investigation', e);
    }
    setFormOpen(false); setEditing(null);
  }
  function openEdit(inv) { setEditing(inv); setFormOpen(true); }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading investigations…</div>;

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100">Fire Investigation</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            NFPA 921 · Cause &amp; origin · Evidence · Scene documentation
          </p>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true); }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-gray-800 text-white rounded-xl hover:bg-gray-900 shadow-sm">
          <Plus size={15} /> New Case
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Cases',   value: investigations.length, color: 'text-gray-900 dark:text-gray-100'  },
          { label: 'Open Cases',    value: open,                  color: 'text-blue-700 dark:text-blue-300'  },
          { label: 'Incendiary',    value: incend,                color: incend > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-400' },
          { label: 'Total Loss',    value: `$${totalLoss.toLocaleString()}`, color: 'text-amber-700 dark:text-amber-300' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 px-4 py-3 shadow-sm">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Incendiary alert */}
      {incend > 0 && (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 flex gap-3">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-800 dark:text-red-300 font-medium">
            {incend} incendiary {incend === 1 ? 'case' : 'cases'} on record. Ensure law enforcement and state fire marshal notifications are documented.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Search by case number or address"
            placeholder="Search by case number or address…"
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100" />
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {['All', 'Open', 'Active', 'Referred', 'Closed'].map(s => (
            <button key={s} onClick={() => setStatusFlt(s)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                statusFlt === s ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>{s}</button>
          ))}
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {['All', ...CAUSE_CLASSIFICATIONS].map(c => (
            <button key={c} onClick={() => setCauseFlt(c)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                causeFlt === c ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>{c}</button>
          ))}
        </div>
      </div>

      {/* Case list */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_1.5fr_1fr_0.8fr_1fr_1fr_24px] gap-4 px-5 py-2.5 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          <span>Case No.</span><span>Address</span><span>Date</span><span>Cause</span><span>Status</span><span>Investigator</span><span />
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-12">No investigations match your filters.</p>
        )}

        {filtered.map(inv => {
          const isOpen = expandedId === inv.id;
          return (
            <div key={inv.id} className="border-b border-gray-50 last:border-b-0">
              <div
                onClick={() => setExpandedId(isOpen ? null : inv.id)}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                aria-label={`Toggle details for case ${inv.caseNumber}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isOpen ? null : inv.id); } }}
                className="grid grid-cols-[1fr_1.5fr_1fr_0.8fr_1fr_1fr_24px] gap-4 px-5 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 items-center"
              >
                <span className="font-mono text-xs font-bold text-gray-800 dark:text-gray-100">{inv.caseNumber}</span>
                <div>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{inv.address}</p>
                  <p className="text-[10px] text-gray-400">{inv.occupancyType}</p>
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-300">{inv.incidentDate}</span>
                <CauseBadge cause={inv.cause} />
                <StatusChip status={inv.status} />
                <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{inv.investigator}</span>
                {isOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </div>
              {isOpen && <InvestigationDetail inv={inv} onEdit={openEdit} />}
            </div>
          );
        })}
      </div>

      {formOpen && (
        <InvestigationForm
          initial={editing}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
