// NerisReportSections.jsx — Phase-2 NERIS capture sections for IncidentForm
// (docs/NERIS-BULLETPROOF-BUILD-2026-07-16.md, PHASE 2 APPENDIX P2-D1..D7).
//
// Pure presentational sections over IncidentForm's (form, setForm) state —
// the SAVE SHAPE is built in one place (IncidentForm's buildNerisSavePayload)
// so preview and submit can never drift (P2-D5). Every vocabulary here comes
// from data/nerisTypes.js, drift-tested against the server enum layer.
//
// `disabled` = the approved-lock (P2-D6/F22): while a report is approved its
// NERIS inputs are frozen (fieldset), revertibly — non-NERIS fields stay live.

// Real icons, not emoji: 🔥/🏥/🛡 render as a different picture on Windows, Android
// and macOS, don't match the weight of the text beside them, and a screen reader
// announces them in the middle of a section heading on a legal record. aria-hidden
// because the word next to each one is already the label.
import { ChevronDown, X, Flame, Ambulance, ShieldCheck } from 'lucide-react';
import {
  NERIS_FIRE_CONDITIONS, NERIS_WATER_SUPPLY, NERIS_FIRE_INVEST_NEED,
  NERIS_FIRE_INVEST_TYPES, NERIS_SUPPRESS_APPLIANCES, NERIS_FIRE_BLDG_DAMAGE,
  NERIS_ROOMS, NERIS_FIRE_CAUSE_IN, NERIS_FIRE_CAUSE_OUT,
  NERIS_CASUALTY_CAUSES, NERIS_CASUALTY_PERSON_TYPES, NERIS_CASUALTY_INJURIES,
  NERIS_RESCUE_TYPES, NERIS_REMOVALS, FF_PERFORMED_RESCUE_TYPES,
  NERIS_MEDICAL_PATIENT_CARE, NERIS_MEDICAL_TRANSPORT, NERIS_MEDICAL_PATIENT_STATUS,
  NERIS_AID_TYPES, NERIS_AID_DIRECTIONS,
  NERIS_FP_PRESENCE, NERIS_FP_QUESTIONS,
  NERIS_ALARM_SMOKE_TYPES, NERIS_ALARM_OPERATIONS, NERIS_OCCUPANT_RESPONSES,
  NERIS_ALARM_FAILURES, NERIS_ALARM_FIRE_TYPES, NERIS_ALARM_OTHER_TYPES,
  NERIS_SUPPRESS_FIRE_TYPES, NERIS_FULL_PARTIAL, NERIS_SUPPRESS_OPERATIONS,
  NERIS_SUPPRESS_NO_OPERATIONS, NERIS_SUPPRESS_COOKING_TYPES,
} from '../data/nerisTypes';

const selectCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-900';
const inputCls  = 'w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900';
const labelCls  = 'block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1';

function OptionList({ items }) {
  return items.map(({ code, label }) => <option key={code} value={code}>{label}</option>);
}

/** Small checkbox multi-select over [{code,label}] — mirrors the actions grid. */
function CheckGrid({ items, values, onToggle, disabled }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
      {items.map(({ code, label }) => {
        const checked = values.includes(code);
        return (
          <label key={code} className={`flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${checked ? 'bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200 font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
            <input type="checkbox" checked={checked} disabled={disabled}
              onChange={() => onToggle(code)}
              className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 focus:ring-red-500" />
            {label}
          </label>
        );
      })}
    </div>
  );
}

// ─── Live completeness meter (P2-D5/F27) ────────────────────────────────────
// preview = { completeness, errors, warnings } | null (null = degrade to '—';
// the meter INFORMS, it never blocks save — F12).
export function NerisCompletenessMeter({ preview }) {
  const pct = preview && Number.isFinite(preview.completeness) ? preview.completeness : null;
  const errors = preview?.errors || [];
  const warnings = preview?.warnings || [];
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <details className="group">
        <summary className="px-4 py-2 cursor-pointer select-none flex items-center gap-3">
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">NERIS completeness</span>
          <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct === null ? 'bg-gray-300 dark:bg-gray-700' : pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${pct === null ? 0 : pct}%` }} />
          </div>
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{pct === null ? '—' : `${pct}%`}</span>
          {errors.length > 0 && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">{errors.length} error{errors.length === 1 ? '' : 's'}</span>
          )}
          {warnings.length > 0 && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">{warnings.length} warning{warnings.length === 1 ? '' : 's'}</span>
          )}
          <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-3 space-y-1">
          {errors.length === 0 && warnings.length === 0 && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{pct === null ? 'Preview unavailable — the report still saves normally.' : 'No validation issues.'}</p>
          )}
          {errors.map((e, i) => (
            <p key={`e${i}`} className="text-[11px] text-red-600 dark:text-red-400">• {e}</p>
          ))}
          {/* amber-700, not 600: a NERIS validation warning sits on the white report
              card, where amber-600 measures 3.2:1. This is the text telling an officer
              why the legal record will not export — it has to be readable. */}
          {warnings.map((w, i) => (
            <p key={`w${i}`} className="text-[11px] text-amber-700 dark:text-amber-400">• {w}</p>
          ))}
          <p className="text-[11px] text-gray-500 dark:text-gray-400 pt-1">Completeness never blocks saving a draft — it gates NERIS export/submission.</p>
        </div>
      </details>
    </div>
  );
}

// ─── Review chain (P2-D6/F22) ────────────────────────────────────────────────
const STATUS_META = {
  draft:     { label: 'Draft',     cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' },
  in_review: { label: 'In review', cls: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' },
  approved:  { label: 'Approved',  cls: 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300' },
};

export function NerisReviewControls({ status, busy, error, onAction }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  const s = STATUS_META[status] ? status : 'draft';
  const btnCls = 'px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl">
      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">NERIS review</span>
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.cls}`}>{meta.label}</span>
      <span className="flex-1" />
      {s === 'draft' && (
        <button type="button" disabled={busy} onClick={() => onAction('submit_review')} className={btnCls}>
          Submit for review
        </button>
      )}
      {s === 'in_review' && (
        <>
          <button type="button" disabled={busy} onClick={() => onAction('approve')}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Approve
          </button>
          <button type="button" disabled={busy} onClick={() => onAction('return_to_draft')} className={btnCls}>
            Return to draft
          </button>
        </>
      )}
      {s === 'approved' && (
        <button type="button" disabled={busy} onClick={() => onAction('return_to_draft')} className={btnCls}>
          Return to draft
        </button>
      )}
      {s === 'approved' && (
        <p className="w-full text-[11px] text-green-700 dark:text-green-400">
          NERIS fields are locked while approved — return to draft to edit them. Other fields stay editable.
        </p>
      )}
      {error && <p className="w-full text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

// ─── Fire module (P2-D1) — shown only when a FIRE type is selected ──────────
export function FireModuleSection({ form, setForm, disabled }) {
  const set = (patch) => setForm((p) => ({ ...p, ...patch }));
  const toggleIn = (field) => (code) => setForm((p) => ({
    ...p,
    [field]: p[field].includes(code) ? p[field].filter((c) => c !== code) : [...p[field], code],
  }));
  const isStructure = form.fire_location_kind !== 'OUTSIDE';
  const investSelected = form.fire_investigation_needed;
  // Types multi-select appears once "investigation needed" says one happened
  // (YES / OTHER); the negative-ish values (NO / NO_CAUSE_OBVIOUS /
  // NOT_EVALUATED / NOT_APPLICABLE) have nothing to itemize.
  const showInvestTypes = investSelected === 'YES' || investSelected === 'OTHER';

  return (
    <div className="border border-red-200 dark:border-red-900 rounded-xl overflow-hidden">
      <div className="bg-red-50 dark:bg-red-950/50 px-4 py-2 border-b border-red-200 dark:border-red-900">
        <p className="flex items-center gap-1.5 text-xs font-bold text-red-800 dark:text-red-300 uppercase tracking-wide"><Flame size={13} aria-hidden="true" /> Fire Module (NERIS)</p>
      </div>
      <fieldset disabled={disabled} className="px-4 py-4 space-y-4 disabled:opacity-60">
        {/* Location kind toggle — the spec's location_detail discriminated union */}
        <div className="flex flex-wrap gap-2">
          {[['STRUCTURE', 'Structure fire'], ['OUTSIDE', 'Outside fire']].map(([kind, label]) => {
            const active = kind === 'STRUCTURE' ? isStructure : !isStructure;
            return (
              <button key={kind} type="button"
                onClick={() => set({ fire_location_kind: kind })}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-red-700 text-white border-red-700'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}>
                {label}
              </button>
            );
          })}
        </div>

        {isStructure ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Floor of origin <span className="text-red-500">*</span></label>
              <input type="number" step="1" value={form.fire_floor_of_origin}
                aria-label="Floor of origin"
                onChange={(e) => set({ fire_floor_of_origin: e.target.value })}
                placeholder="1" className={inputCls} />
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Below grade = negative (e.g. −1 for basement)</p>
            </div>
            <div>
              <label className={labelCls}>Condition on arrival <span className="text-red-500">*</span></label>
              <select value={form.fire_arrival_condition} aria-label="Condition on arrival"
                onChange={(e) => set({ fire_arrival_condition: e.target.value })} className={selectCls}>
                <option value="">— Select —</option>
                <OptionList items={NERIS_FIRE_CONDITIONS} />
              </select>
            </div>
            <div>
              <label className={labelCls}>Damage rating <span className="text-red-500">*</span></label>
              <select value={form.fire_damage_type} aria-label="Damage rating"
                onChange={(e) => set({ fire_damage_type: e.target.value })} className={selectCls}>
                <option value="">— Select —</option>
                <OptionList items={NERIS_FIRE_BLDG_DAMAGE} />
              </select>
            </div>
            <div>
              <label className={labelCls}>Room of origin <span className="text-red-500">*</span></label>
              <select value={form.fire_room_of_origin} aria-label="Room of origin"
                onChange={(e) => set({ fire_room_of_origin: e.target.value })} className={selectCls}>
                <option value="">— Select —</option>
                <OptionList items={NERIS_ROOMS} />
              </select>
            </div>
            <div>
              <label className={labelCls}>Cause <span className="text-red-500">*</span></label>
              <select value={form.fire_cause_in} aria-label="Fire cause (structure)"
                onChange={(e) => set({ fire_cause_in: e.target.value })} className={selectCls}>
                <option value="">— Select —</option>
                <OptionList items={NERIS_FIRE_CAUSE_IN} />
              </select>
            </div>
            <p className="sm:col-span-2 text-[11px] text-gray-500 dark:text-gray-400">
              Location detail is saved once all five fields above are set (NERIS requires the complete set).
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Cause <span className="text-red-500">*</span></label>
              <select value={form.fire_cause_out} aria-label="Fire cause (outside)"
                onChange={(e) => set({ fire_cause_out: e.target.value })} className={selectCls}>
                <option value="">— Select —</option>
                <OptionList items={NERIS_FIRE_CAUSE_OUT} />
              </select>
            </div>
            <div>
              <label className={labelCls}>Acres burned</label>
              <input type="number" min="0" step="any" value={form.fire_acres_burned}
                aria-label="Acres burned"
                onChange={(e) => set({ fire_acres_burned: e.target.value })}
                placeholder="0.25" className={inputCls} />
            </div>
          </div>
        )}

        {/* Common FirePayload fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Water supply <span className="text-red-500">*</span></label>
            <select value={form.fire_water_supply} aria-label="Water supply"
              onChange={(e) => set({ fire_water_supply: e.target.value })} className={selectCls}>
              <option value="">— Select —</option>
              <OptionList items={NERIS_WATER_SUPPLY} />
            </select>
          </div>
          <div>
            <label className={labelCls}>Investigation needed <span className="text-red-500">*</span></label>
            <select value={form.fire_investigation_needed} aria-label="Investigation needed"
              onChange={(e) => set({ fire_investigation_needed: e.target.value })} className={selectCls}>
              <option value="">— Select —</option>
              <OptionList items={NERIS_FIRE_INVEST_NEED} />
            </select>
          </div>
        </div>

        {showInvestTypes && (
          <div>
            <p className={labelCls}>Investigation types</p>
            <CheckGrid items={NERIS_FIRE_INVEST_TYPES} values={form.fire_investigation_types}
              onToggle={toggleIn('fire_investigation_types')} disabled={disabled} />
          </div>
        )}

        <div>
          <p className={labelCls}>Suppression appliances <span className="font-normal text-gray-500 dark:text-gray-400">(optional)</span></p>
          <CheckGrid items={NERIS_SUPPRESS_APPLIANCES} values={form.fire_suppression_appliances}
            onToggle={toggleIn('fire_suppression_appliances')} disabled={disabled} />
        </div>
      </fieldset>
    </div>
  );
}

// ─── Medical patients (P2 per-patient entries) — shown when MEDICAL ─────────
const emptyPatient = { patient_care_evaluation: '', patient_status: '', transport_disposition: '', patient_care_report_id: '' };

export function MedicalPatientsSection({ form, setForm, disabled }) {
  const patients = form.medical_patients;
  const update = (idx, patch) => setForm((p) => ({
    ...p,
    medical_patients: p.medical_patients.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
  }));
  const add = () => setForm((p) => ({ ...p, medical_patients: [...p.medical_patients, { ...emptyPatient }] }));
  const remove = (idx) => setForm((p) => ({ ...p, medical_patients: p.medical_patients.filter((_, i) => i !== idx) }));

  return (
    <div className="border border-emerald-200 dark:border-emerald-900 rounded-xl overflow-hidden">
      <div className="bg-emerald-50 dark:bg-emerald-950/50 px-4 py-2 border-b border-emerald-200 dark:border-emerald-900">
        <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">
          <Ambulance size={13} aria-hidden="true" /> Medical Patients (NERIS)
          {patients.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-medium rounded-full bg-emerald-600 text-white">{patients.length}</span>
          )}
        </p>
      </div>
      <fieldset disabled={disabled} className="px-4 py-4 space-y-3 disabled:opacity-60">
        {patients.length === 0 && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400">One entry per patient evaluated or treated.</p>
        )}
        {patients.map((m, idx) => (
          <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Patient {idx + 1}</p>
              <button type="button" onClick={() => remove(idx)} aria-label={`Remove patient ${idx + 1}`}
                className="text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Patient care evaluation <span className="text-red-500">*</span></label>
                <select value={m.patient_care_evaluation} aria-label={`Patient ${idx + 1} care evaluation`}
                  onChange={(e) => update(idx, { patient_care_evaluation: e.target.value })} className={selectCls}>
                  <option value="">— Select —</option>
                  <OptionList items={NERIS_MEDICAL_PATIENT_CARE} />
                </select>
              </div>
              <div>
                <label className={labelCls}>Patient status</label>
                <select value={m.patient_status} aria-label={`Patient ${idx + 1} status`}
                  onChange={(e) => update(idx, { patient_status: e.target.value })} className={selectCls}>
                  <option value="">— Select —</option>
                  <OptionList items={NERIS_MEDICAL_PATIENT_STATUS} />
                </select>
              </div>
              <div>
                <label className={labelCls}>Transport disposition</label>
                <select value={m.transport_disposition} aria-label={`Patient ${idx + 1} transport disposition`}
                  onChange={(e) => update(idx, { transport_disposition: e.target.value })} className={selectCls}>
                  <option value="">— Select —</option>
                  <OptionList items={NERIS_MEDICAL_TRANSPORT} />
                </select>
              </div>
              <div>
                <label className={labelCls}>Patient care report (PCR) #</label>
                <input value={m.patient_care_report_id} maxLength={255}
                  aria-label={`Patient ${idx + 1} PCR number`}
                  onChange={(e) => update(idx, { patient_care_report_id: e.target.value })}
                  placeholder="EMS PCR reference" className={inputCls} />
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={add}
          className="w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          + Add patient
        </button>
      </fieldset>
    </div>
  );
}

// ─── Casualties & rescues (P2-D2) — always available, collapsed ─────────────
const emptyCasualty = { type: 'NONFF', injury: 'NONE', cause: '', rescue_type: '', removal: '' };

export function CasualtiesSection({ form, setForm, disabled }) {
  const entries = form.casualty_entries;
  const update = (idx, patch) => setForm((p) => ({
    ...p,
    casualty_entries: p.casualty_entries.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
  }));
  const add = () => setForm((p) => ({ ...p, casualty_entries: [...p.casualty_entries, { ...emptyCasualty }] }));
  const remove = (idx) => setForm((p) => ({ ...p, casualty_entries: p.casualty_entries.filter((_, i) => i !== idx) }));

  return (
    <div className="border border-purple-200 dark:border-purple-900 rounded-xl overflow-hidden">
      <details className="group">
        <summary className="bg-purple-50 dark:bg-purple-950/50 px-4 py-2 border-b border-purple-200 dark:border-purple-900 cursor-pointer select-none flex items-center justify-between">
          <p className="text-xs font-bold text-purple-800 dark:text-purple-300 uppercase tracking-wide">
            Casualties &amp; Rescues
            {entries.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-medium rounded-full bg-purple-600 text-white">{entries.length}</span>
            )}
          </p>
          <ChevronDown className="h-4 w-4 text-purple-400 transition-transform group-open:rotate-180" />
        </summary>
        <fieldset disabled={disabled} className="px-4 py-4 space-y-3 disabled:opacity-60">
          {entries.length === 0 && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">One entry per person — injured or not, rescued or not.</p>
          )}
          {entries.map((c, idx) => {
            const injured = c.injury !== 'NONE';
            const ffPerformed = FF_PERFORMED_RESCUE_TYPES.includes(c.rescue_type);
            return (
              <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Person {idx + 1}</p>
                  <button type="button" onClick={() => remove(idx)} aria-label={`Remove person ${idx + 1}`}
                    className="text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"><X size={16} /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Person</label>
                    <select value={c.type} aria-label={`Person ${idx + 1} type`}
                      onChange={(e) => update(idx, { type: e.target.value })} className={selectCls}>
                      <OptionList items={NERIS_CASUALTY_PERSON_TYPES} />
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Injury</label>
                    <select value={c.injury} aria-label={`Person ${idx + 1} injury`}
                      onChange={(e) => update(idx, { injury: e.target.value })} className={selectCls}>
                      <OptionList items={NERIS_CASUALTY_INJURIES} />
                    </select>
                  </div>
                  {injured && (
                    <div>
                      <label className={labelCls}>Cause of injury</label>
                      <select value={c.cause} aria-label={`Person ${idx + 1} cause of injury`}
                        onChange={(e) => update(idx, { cause: e.target.value })} className={selectCls}>
                        <option value="">— Select —</option>
                        <OptionList items={NERIS_CASUALTY_CAUSES} />
                      </select>
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>Rescue performed</label>
                    <select value={c.rescue_type} aria-label={`Person ${idx + 1} rescue performed`}
                      onChange={(e) => {
                        const rescue_type = e.target.value;
                        // removal only rides FF-performed rescues — clear it
                        // when the performer changes to a non-FF branch.
                        const keepRemoval = FF_PERFORMED_RESCUE_TYPES.includes(rescue_type);
                        update(idx, { rescue_type, ...(keepRemoval ? {} : { removal: '' }) });
                      }} className={selectCls}>
                      <option value="">— Not recorded —</option>
                      <OptionList items={NERIS_RESCUE_TYPES} />
                    </select>
                  </div>
                  {ffPerformed && (
                    <div>
                      <label className={labelCls}>How were they removed? <span className="text-red-500">*</span></label>
                      <select value={c.removal} aria-label={`Person ${idx + 1} removal method`}
                        onChange={(e) => update(idx, { removal: e.target.value })} className={selectCls}>
                        <option value="">— Select —</option>
                        <OptionList items={NERIS_REMOVALS} />
                      </select>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <button type="button" onClick={add}
            className="w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            + Add person
          </button>
        </fieldset>
      </details>
    </div>
  );
}

// ─── Aid given / received (structured, type_aid) — always available ─────────
const emptyAid = { aid_direction: 'GIVEN', aid_type: '', department_neris_id: '' };

export function AidSection({ form, setForm, disabled }) {
  const entries = form.aid_entries;
  const update = (idx, patch) => setForm((p) => ({
    ...p,
    aid_entries: p.aid_entries.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
  }));
  const add = () => setForm((p) => ({ ...p, aid_entries: [...p.aid_entries, { ...emptyAid }] }));
  const remove = (idx) => setForm((p) => ({ ...p, aid_entries: p.aid_entries.filter((_, i) => i !== idx) }));

  return (
    <div className="border border-cyan-200 dark:border-cyan-900 rounded-xl overflow-hidden">
      <details className="group">
        <summary className="bg-cyan-50 dark:bg-cyan-950/50 px-4 py-2 border-b border-cyan-200 dark:border-cyan-900 cursor-pointer select-none flex items-center justify-between">
          <p className="text-xs font-bold text-cyan-800 dark:text-cyan-300 uppercase tracking-wide">
            Aid Given / Received
            {entries.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-medium rounded-full bg-cyan-600 text-white">{entries.length}</span>
            )}
          </p>
          <ChevronDown className="h-4 w-4 text-cyan-400 transition-transform group-open:rotate-180" />
        </summary>
        <fieldset disabled={disabled} className="px-4 py-4 space-y-3 disabled:opacity-60">
          {entries.length === 0 && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">One entry per partner department that gave or received aid.</p>
          )}
          {entries.map((a, idx) => (
            <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Aid {idx + 1}</p>
                <button type="button" onClick={() => remove(idx)} aria-label={`Remove aid entry ${idx + 1}`}
                  className="text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Direction</label>
                  <select value={a.aid_direction} aria-label={`Aid ${idx + 1} direction`}
                    onChange={(e) => update(idx, { aid_direction: e.target.value })} className={selectCls}>
                    <OptionList items={NERIS_AID_DIRECTIONS} />
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Aid type</label>
                  <select value={a.aid_type} aria-label={`Aid ${idx + 1} type`}
                    onChange={(e) => update(idx, { aid_type: e.target.value })} className={selectCls}>
                    <option value="">— Select —</option>
                    <OptionList items={NERIS_AID_TYPES} />
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Partner dept NERIS ID</label>
                  <input value={a.department_neris_id} maxLength={10}
                    aria-label={`Aid ${idx + 1} partner department NERIS ID`}
                    onChange={(e) => update(idx, { department_neris_id: e.target.value })}
                    placeholder="FD00000000" className={inputCls} />
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">FD######## or FM########</p>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={add}
            className="w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            + Add aid entry
          </button>
        </fieldset>
      </details>
    </div>
  );
}


// ─── Fire Protection (FP, 0063) — the five NERIS alarm/suppression modules ───
// Market pattern (official NERIS app + the platforms at scale): ONE grouped
// section, ALWAYS available on any incident type (smoke-alarm data on routine
// calls is the CRR dataset), enforced only for structure fires where the
// department is primary — that enforcement lives server-side and surfaces
// through the completeness meter (one brain, P2-D5/F37). Presence is a
// tri-state with NOTHING pre-selected: the NFIRS data proved defaults become
// data. Progressive disclosure mirrors the spec's discriminated unions exactly.
// Question wording = the spec's own x-ui-label strings (NERIS_FP_QUESTIONS).

export const EMPTY_FIRE_PROTECTION = Object.freeze({
  smoke_alarm: { presence: '', working: '', alarm_types: [], operation: '', occupant_action: '', failure_reason: '' },
  fire_alarm: { presence: '', alarm_type: '', operation_type: '' },
  other_alarm: { presence: '', alarm_types: [] },
  fire_suppression: { presence: '', suppression_types: [], operation: '', sprinklers_activated: '', failure_reason: '' },
  cooking_fire_suppression: { presence: '', suppression_types: [], operation_type: '' },
});

/** Tri-state presence control. No default; clicking the active pill clears it
 *  (reversible — an unanswered module is simply not exported). */
function PresenceToggle({ value, onChange, ariaLabel }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {NERIS_FP_PRESENCE.map(({ code, label }) => {
        const active = value === code;
        return (
          <button key={code} type="button" aria-pressed={active}
            onClick={() => onChange(active ? '' : code)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              active
                ? code === 'PRESENT'
                  ? 'bg-sky-700 text-white border-sky-700'
                  : 'bg-gray-700 text-white border-gray-700 dark:bg-gray-600 dark:border-gray-600'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ModuleRow({ title, question, children }) {
  return (
    <div className="border border-gray-100 dark:border-gray-800 rounded-lg px-3 py-3 space-y-2">
      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{title}</p>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">{question}</p>
      {children}
    </div>
  );
}

export function FireProtectionSection({ form, setForm, disabled, requiredForStructureFire }) {
  const fp = form.fire_protection;
  const setModule = (mod, patch) => setForm((p) => ({
    ...p,
    fire_protection: { ...p.fire_protection, [mod]: { ...p.fire_protection[mod], ...patch } },
  }));
  const toggleInModule = (mod, field) => (code) => setForm((p) => {
    const cur = p.fire_protection[mod][field];
    return {
      ...p,
      fire_protection: {
        ...p.fire_protection,
        [mod]: { ...p.fire_protection[mod], [field]: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] },
      },
    };
  });
  // fire_suppression.suppression_types is [{type, full_partial}] — coverage
  // extent rides each selected system, exactly as FireSuppressionTypePayload.
  const toggleSuppressType = (code) => setForm((p) => {
    const cur = p.fire_protection.fire_suppression.suppression_types;
    const has = cur.some((s) => s.type === code);
    return {
      ...p,
      fire_protection: {
        ...p.fire_protection,
        fire_suppression: {
          ...p.fire_protection.fire_suppression,
          suppression_types: has ? cur.filter((s) => s.type !== code) : [...cur, { type: code, full_partial: '' }],
        },
      },
    };
  });
  const setSuppressCoverage = (code, full_partial) => setForm((p) => ({
    ...p,
    fire_protection: {
      ...p.fire_protection,
      fire_suppression: {
        ...p.fire_protection.fire_suppression,
        suppression_types: p.fire_protection.fire_suppression.suppression_types
          .map((s) => (s.type === code ? { ...s, full_partial } : s)),
      },
    },
  }));

  const sa = fp.smoke_alarm; const fa = fp.fire_alarm; const oa = fp.other_alarm;
  const fs = fp.fire_suppression; const ck = fp.cooking_fire_suppression;

  return (
    <div className="border border-sky-200 dark:border-sky-900 rounded-xl overflow-hidden">
      <div className="bg-sky-50 dark:bg-sky-950/50 px-4 py-2 border-b border-sky-200 dark:border-sky-900 flex items-center gap-2 flex-wrap">
        <p className="flex items-center gap-1.5 text-xs font-bold text-sky-800 dark:text-sky-300 uppercase tracking-wide"><ShieldCheck size={13} aria-hidden="true" /> Fire Protection (NERIS)</p>
        {requiredForStructureFire ? (
          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">
            Required — structure fire
          </span>
        ) : (
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">
            Optional — helps community risk reduction
          </span>
        )}
      </div>
      <fieldset disabled={disabled} className="px-4 py-4 space-y-3 disabled:opacity-60">
        {requiredForStructureFire && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            NERIS requires all four alarm/suppression answers on a structure fire
            (waived only when every aid entry is support aid <em>given</em> to another department).
          </p>
        )}

        {/* 1 — Smoke alarm */}
        <ModuleRow title="Smoke alarm" question={NERIS_FP_QUESTIONS.smoke_alarm}>
          <PresenceToggle value={sa.presence} ariaLabel="Smoke alarm presence"
            onChange={(v) => setModule('smoke_alarm', { presence: v })} />
          {sa.presence === 'PRESENT' && (
            <div className="space-y-3 pt-1">
              {/* Order matches the spec (working → types → operation) so the
                  operation's conditional follow-ups always render LAST,
                  adjacent to their parent (design-critique pass, 2026-07-20). */}
              <div>
                <label className={labelCls}>Working / successfully tested?</label>
                <select value={sa.working} aria-label="Smoke alarm working"
                  onChange={(e) => setModule('smoke_alarm', { working: e.target.value })} className={selectCls}>
                  <option value="">— Not recorded —</option>
                  <option value="true">Yes — working or successfully tested</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <p className={labelCls}>Type(s) of smoke alarm — select all that apply</p>
                <CheckGrid items={NERIS_ALARM_SMOKE_TYPES} values={sa.alarm_types}
                  onToggle={toggleInModule('smoke_alarm', 'alarm_types')} disabled={disabled} />
              </div>
              <div>
                <label className={labelCls}>Did it operate as intended?</label>
                <select value={sa.operation} aria-label="Smoke alarm operation"
                  onChange={(e) => setModule('smoke_alarm', { operation: e.target.value, occupant_action: '', failure_reason: '' })}
                  className={selectCls}>
                  <option value="">— Not recorded —</option>
                  <OptionList items={NERIS_ALARM_OPERATIONS} />
                </select>
              </div>
              {sa.operation === 'OPERATED_ALERTED_OCCUPANT' && (
                <div>
                  <label className={labelCls}>Occupant reaction to the alarm</label>
                  <select value={sa.occupant_action} aria-label="Occupant reaction"
                    onChange={(e) => setModule('smoke_alarm', { occupant_action: e.target.value })} className={selectCls}>
                    <option value="">— Not recorded —</option>
                    <OptionList items={NERIS_OCCUPANT_RESPONSES} />
                  </select>
                </div>
              )}
              {sa.operation === 'FAILED_TO_OPERATE' && (
                <div>
                  <label className={labelCls}>Reason for the failure</label>
                  <select value={sa.failure_reason} aria-label="Smoke alarm failure reason"
                    onChange={(e) => setModule('smoke_alarm', { failure_reason: e.target.value })} className={selectCls}>
                    <option value="">— Not recorded —</option>
                    <OptionList items={NERIS_ALARM_FAILURES} />
                  </select>
                </div>
              )}
            </div>
          )}
        </ModuleRow>

        {/* 2 — Building fire alarm system */}
        <ModuleRow title="Fire alarm system" question={NERIS_FP_QUESTIONS.fire_alarm}>
          <PresenceToggle value={fa.presence} ariaLabel="Fire alarm system presence"
            onChange={(v) => setModule('fire_alarm', { presence: v })} />
          {fa.presence === 'PRESENT' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className={labelCls}>Type of system</label>
                <select value={fa.alarm_type} aria-label="Fire alarm system type"
                  onChange={(e) => setModule('fire_alarm', { alarm_type: e.target.value })} className={selectCls}>
                  <option value="">— Not recorded —</option>
                  <OptionList items={NERIS_ALARM_FIRE_TYPES} />
                </select>
              </div>
              <div>
                <label className={labelCls}>Did it operate as intended?</label>
                <select value={fa.operation_type} aria-label="Fire alarm operation"
                  onChange={(e) => setModule('fire_alarm', { operation_type: e.target.value })} className={selectCls}>
                  <option value="">— Not recorded —</option>
                  <OptionList items={NERIS_ALARM_OPERATIONS} />
                </select>
              </div>
            </div>
          )}
        </ModuleRow>

        {/* 3 — Other alarms (CO / gas / chemical) */}
        <ModuleRow title="Other alarms" question={NERIS_FP_QUESTIONS.other_alarm}>
          <PresenceToggle value={oa.presence} ariaLabel="Other alarm presence"
            onChange={(v) => setModule('other_alarm', { presence: v })} />
          {oa.presence === 'PRESENT' && (
            <div className="pt-1">
              <p className={labelCls}>Type(s) present — select all that apply</p>
              <CheckGrid items={NERIS_ALARM_OTHER_TYPES} values={oa.alarm_types}
                onToggle={toggleInModule('other_alarm', 'alarm_types')} disabled={disabled} />
            </div>
          )}
        </ModuleRow>

        {/* 4 — Fire suppression (sprinkler) system */}
        <ModuleRow title="Fire suppression system" question={NERIS_FP_QUESTIONS.fire_suppression}>
          <PresenceToggle value={fs.presence} ariaLabel="Fire suppression presence"
            onChange={(v) => setModule('fire_suppression', { presence: v })} />
          {fs.presence === 'PRESENT' && (
            <div className="space-y-3 pt-1">
              <div>
                <p className={labelCls}>System type(s) — select all that apply, with coverage</p>
                <div className="space-y-1">
                  {NERIS_SUPPRESS_FIRE_TYPES.map(({ code, label }) => {
                    const entry = fs.suppression_types.find((s) => s.type === code);
                    return (
                      <div key={code} className="flex items-center gap-2">
                        <label className={`flex-1 flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${entry ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-900 dark:text-sky-200 font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                          <input type="checkbox" checked={!!entry} disabled={disabled}
                            onChange={() => toggleSuppressType(code)}
                            className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-700 text-sky-600 focus:ring-sky-500" />
                          {label}
                        </label>
                        {entry && (
                          <select value={entry.full_partial} aria-label={`${label} coverage extent`}
                            onChange={(e) => setSuppressCoverage(code, e.target.value)}
                            className="rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900">
                            <option value="">Coverage…</option>
                            <OptionList items={NERIS_FULL_PARTIAL} />
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Operation</label>
                  <select value={fs.operation} aria-label="Fire suppression operation"
                    onChange={(e) => setModule('fire_suppression', { operation: e.target.value, sprinklers_activated: '', failure_reason: '' })}
                    className={selectCls}>
                    <option value="">— Not recorded —</option>
                    <OptionList items={NERIS_SUPPRESS_OPERATIONS} />
                  </select>
                </div>
                {(fs.operation === 'OPERATED_EFFECTIVE' || fs.operation === 'OPERATED_NOT_EFFECTIVE') && (
                  <div>
                    <label className={labelCls}>Sprinkler heads activated</label>
                    <input type="number" min="0" step="1" value={fs.sprinklers_activated}
                      aria-label="Sprinkler heads activated"
                      onChange={(e) => setModule('fire_suppression', { sprinklers_activated: e.target.value })}
                      placeholder="0" className={inputCls} />
                  </div>
                )}
              </div>
              {(fs.operation === 'OPERATED_NOT_EFFECTIVE' || fs.operation === 'NO_OPERATION') && (
                <div>
                  <label className={labelCls}>Reason it {fs.operation === 'NO_OPERATION' ? 'did not operate' : 'was not effective'}</label>
                  <select value={fs.failure_reason} aria-label="Suppression failure reason"
                    onChange={(e) => setModule('fire_suppression', { failure_reason: e.target.value })} className={selectCls}>
                    <option value="">— Not recorded —</option>
                    <OptionList items={NERIS_SUPPRESS_NO_OPERATIONS} />
                  </select>
                </div>
              )}
            </div>
          )}
        </ModuleRow>

        {/* 5 — Cooking fire suppression */}
        <ModuleRow title="Cooking fire protection" question={NERIS_FP_QUESTIONS.cooking_fire_suppression}>
          <PresenceToggle value={ck.presence} ariaLabel="Cooking fire protection presence"
            onChange={(v) => setModule('cooking_fire_suppression', { presence: v })} />
          {ck.presence === 'PRESENT' && (
            <div className="space-y-3 pt-1">
              <div>
                <p className={labelCls}>Type(s) present — select all that apply</p>
                <CheckGrid items={NERIS_SUPPRESS_COOKING_TYPES} values={ck.suppression_types}
                  onToggle={toggleInModule('cooking_fire_suppression', 'suppression_types')} disabled={disabled} />
              </div>
              <div>
                <label className={labelCls}>Operation</label>
                <select value={ck.operation_type} aria-label="Cooking suppression operation"
                  onChange={(e) => setModule('cooking_fire_suppression', { operation_type: e.target.value })} className={selectCls}>
                  <option value="">— Not recorded —</option>
                  <OptionList items={NERIS_SUPPRESS_OPERATIONS} />
                </select>
              </div>
            </div>
          )}
        </ModuleRow>

        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          "Not present" = checked and none there · "Not applicable" = no building involved.
          Unanswered modules simply aren't exported. Answers describe the area of fire origin.
        </p>
      </fieldset>
    </div>
  );
}


// ─── NERIS submission panel (Track B) ────────────────────────────────────────
// The two-axis status, painted honestly: OUR submission lifecycle + NERIS's own
// record status (which we poll — the market shows a checkmark and goes quiet;
// surfacing REJECTED loudly is the differentiator). Never a write path: retry
// and refresh call the server engine, the ONE brain.

const SUBMISSION_META = {
  APPROVED:              { label: 'In NERIS — Approved',            cls: 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300' },
  SUBMITTED:             { label: 'In NERIS — processing',          cls: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300' },
  PENDING_APPROVAL:      { label: 'In NERIS — pending approval',    cls: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300' },
  PENDING_INCIDENT_DATA: { label: 'In NERIS — pending data',        cls: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300' },
  REJECTED:              { label: 'NERIS REJECTED this report',     cls: 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300' },
  FAILED:                { label: 'NERIS processing FAILED',        cls: 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300' },
  DELETED:               { label: 'Deleted on NERIS',               cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' },
};

export function NerisSubmissionPanel({ submission, busy, onRetry, onRefresh }) {
  const { uid, state, nerisStatus, log } = submission || {};
  if (!uid && (!state || state === 'not_submitted')) return null;

  const last = Array.isArray(log) && log.length ? log[log.length - 1] : null;
  const lastError = last && last.error ? String(last.error) : null;

  let chip;
  let guidance = null;
  let showRetry = false;
  if (state === 'refused') {
    chip = { label: 'NERIS refused this submission', cls: SUBMISSION_META.REJECTED.cls };
    guidance = 'NERIS refused the report content. Return it to draft, correct the issues below, and re-approve — it will resubmit automatically.';
    showRetry = true;
  } else if (state === 'submit_failed') {
    chip = { label: 'Submission failed — will retry', cls: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' };
    guidance = 'NERIS could not be reached (or the report needs data — see the completeness meter). Retries run automatically every hour.';
    showRetry = true;
  } else if (state === 'update_pending') {
    chip = { label: 'Update queued for NERIS', cls: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' };
    guidance = 'Your approved changes will be re-sent automatically (NERIS accepts updates once it finishes processing the record).';
    showRetry = true;
  } else if (uid) {
    const meta = SUBMISSION_META[nerisStatus] || { label: `In NERIS — ${nerisStatus || 'submitted'}`, cls: SUBMISSION_META.SUBMITTED.cls };
    chip = meta;
    if (nerisStatus === 'REJECTED') {
      guidance = 'NERIS reviewed and rejected this record nationally. Return it to draft, correct it, and re-approve to resubmit.';
    }
  } else {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl">
      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">NERIS submission</span>
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${chip.cls}`}>{chip.label}</span>
      {uid && <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono truncate max-w-[16rem]" title={uid}>{uid}</span>}
      <span className="flex-1" />
      {uid && (
        <button type="button" disabled={busy} onClick={onRefresh}
          className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40">
          Refresh status
        </button>
      )}
      {showRetry && (
        <button type="button" disabled={busy} onClick={onRetry}
          className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors disabled:opacity-40">
          Retry now
        </button>
      )}
      {guidance && <p className="w-full text-[11px] text-gray-500 dark:text-gray-400">{guidance}</p>}
      {lastError && (state === 'refused' || state === 'submit_failed') && (
        <p className="w-full text-[11px] text-red-600 dark:text-red-400 break-words">Last response: {lastError}</p>
      )}
    </div>
  );
}
