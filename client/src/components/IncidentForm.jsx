import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Mic, MicOff, LocateFixed, Loader2, ChevronDown, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import { INCIDENT_TYPES, DISPOSITIONS, ALARM_LEVELS } from '../data/incidents';
import {
  NERIS_INCIDENT_TYPES, NERIS_ACTIONS_TACTICS, LEGACY_TYPE_MAP, nerisLabel,
  NERIS_NO_ACTION_REASONS, NERIS_HAZARD_DISPOSITIONS, toNerisPath, fromNerisPath,
  FF_PERFORMED_RESCUE_TYPES,
} from '../data/nerisTypes';
import { HAZMAT_CLASSES } from '../data/hazmat';
import {
  NerisCompletenessMeter, NerisReviewControls,
  FireModuleSection, MedicalPatientsSection, CasualtiesSection, AidSection,
  FireProtectionSection, EMPTY_FIRE_PROTECTION,
  NerisSubmissionPanel,
} from './NerisReportSections';
import PhotoCapture from './PhotoCapture';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { toLocalDay } from '../utils/localDay';
import useDialog from '../hooks/useDialog';
import { saveDraft, loadDraft, clearDraft, draftLabel } from '../utils/incidentDraft';
import AIWriteTextarea from './AIWriteTextarea';
import DictateInput from './DictateInput';
import { openTimePicker } from '../utils/timeInput';

/**
 * The date and time a NEW incident report opens with.
 *
 * 🔴 TWO DEFECTS LIVED IN THE TWO LINES THIS REPLACED, on a subpoenable legal record:
 *
 *   const today = new Date();                        // ← evaluated at MODULE LOAD
 *   date: today.toISOString().slice(0, 10),          // ← the UTC day, not the local day
 *   time: today.toTimeString().slice(0, 5),
 *
 * 1. `toISOString().slice(0,10)` is the **UTC** day. West of Greenwich that is
 *    tomorrow's date for the last hours of every local day — in America/New_York
 *    from 20:00 EDT / 19:00 EST. So an officer writing up a 21:30 call was handed
 *    a form pre-dated to the NEXT DAY. This is the same defect the calendar had
 *    (2026-08-05, `utils/localDay.js`); it existed here independently, which is why
 *    the rule is to grep the CLASS, not the file.
 * 2. `const today = new Date()` ran ONCE, when the module was first imported —
 *    not when the form opened. A dispatch console left up for a shift therefore
 *    prefilled the time the BUNDLE loaded. Measured on prod 2026-08-06: the form
 *    offered 19:33 when the wall clock read 19:34, one minute after page load;
 *    over a 12-hour tour that gap is the whole tour.
 *
 * Both are now computed per-call, at the moment the form is opened.
 */
function nowDefaults() {
  const d = new Date();
  return { date: toLocalDay(d), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
}

const emptyForm = {
  incidentNumber: '',
  // Placeholders only — every construction of a new form spreads nowDefaults()
  // over these. They exist so the shape of emptyForm stays complete.
  date: '',
  time: '',
  type: 'Structure Fire',
  // NERIS hierarchical type (dotted code, e.g. "FIRE.STRUCTURE_FIRE.CHIMNEY_FIRE")
  neris_type: 'FIRE.STRUCTURE_FIRE.STRUCTURAL_INVOLVEMENT_FIRE',
  neris_category: 'FIRE',
  neris_subcategory: 'STRUCTURE_FIRE',
  neris_detail: 'STRUCTURAL_INVOLVEMENT_FIRE',
  // NERIS multi-type list (P2-D7): up to 3 entries of { dotted, primary } —
  // the cascading picker above stages a type; "Add incident type" pushes it
  // here. Exactly one primary (first added defaults primary).
  neris_types_list: [],
  // NERIS actions & tactics (array of codes)
  actions_taken: [],
  // NERIS no-action reason (XOR with actions_taken — record either what was
  // done, or why nothing was done, never both). '' = not set.
  neris_noaction: '',
  // Fire module (P2-D1) — builds neris_fire_detail on save
  fire_location_kind: 'STRUCTURE',
  fire_floor_of_origin: '',
  fire_arrival_condition: '',
  fire_damage_type: '',
  fire_room_of_origin: '',
  fire_cause_in: '',
  fire_cause_out: '',
  fire_acres_burned: '',
  fire_water_supply: '',
  fire_investigation_needed: '',
  fire_investigation_types: [],
  fire_suppression_appliances: [],
  // Fire Protection modules (FP, 0063) — build neris_fire_protection on save.
  // Always capturable on ANY incident type (CRR); required only for structure
  // fires (server-enforced, surfaced via the completeness meter).
  fire_protection: EMPTY_FIRE_PROTECTION,
  // Medical per-patient entries — build neris_medical_details on save
  medical_patients: [],
  // Casualty & rescue entries (P2-D2) — build neris_casualty_rescues on save
  casualty_entries: [],
  // Structured aid entries — build neris_aids on save
  aid_entries: [],
  // Officer-entered PSAP times (P2-D4), HH:MM — combined with the incident
  // date into ISO on save → neris_dispatch_times
  psap_call_create: '',
  psap_call_answered: '',
  psap_call_arrival: '',
  // 4.1a-R — the CAD run number this report belongs to. THE association key.
  // Empty is legitimate and common (walk-in, still alarm, report written with no
  // CAD feed) — never guessed, never inferred from timing.
  cadRunNumber: '',
  alarmLevel: 'Working',
  address: '',
  units: [],
  personnel: [],
  disposition: 'Controlled / Extinguished',
  injuries: 0,
  notes: '',
  // Hazmat ICS fields (only used when type === 'Hazmat' or 'Gas Leak')
  hazmat_disposition: '',   // NERIS type_hazard_disposition (required by the spec)
  hazmat_evacuated: '',     // NERIS hazsit evacuated count (required by the spec)
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

// ─── NERIS save-payload builder (P2-D5: ONE shape for save AND preview) ──────

// Form-internal working keys — never sent to the API (the persisted NERIS
// columns are rebuilt from them below).
const FORM_ONLY_KEYS = [
  'neris_types_list',
  'fire_location_kind', 'fire_floor_of_origin', 'fire_arrival_condition',
  'fire_damage_type', 'fire_room_of_origin', 'fire_cause_in', 'fire_cause_out',
  'fire_acres_burned', 'fire_water_supply', 'fire_investigation_needed',
  'fire_investigation_types', 'fire_suppression_appliances',
  'fire_protection',
  'medical_patients', 'casualty_entries', 'aid_entries',
  'psap_call_create', 'psap_call_answered', 'psap_call_arrival',
];

// The 10 client-writable persisted NERIS fields (mirrors the server's
// NERIS_INCIDENT_FIELDS). Stripped wholesale while the report is approved —
// the server 409s NERIS_APPROVED_LOCKED if a PATCH touches ANY of them.
const NERIS_WRITABLE_KEYS = [
  'neris_incident_types', 'neris_actions', 'neris_noaction',
  'neris_fire_detail', 'neris_hazsit_detail', 'neris_medical_details',
  'neris_aids', 'neris_casualty_rescues', 'neris_dispatch_times',
  'neris_fire_protection',
];

/** Local wall-clock date+HH:MM → real UTC ISO. NEVER hand-concatenate a 'Z' (F9). */
function hhmmToIso(date, hhmm) {
  if (!date || !hhmm) return null;
  const d = new Date(`${date}T${hhmm}:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/** Persisted ISO → local HH:MM for a time input ('' when absent/unparseable). */
function isoToHHMM(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toTimeString().slice(0, 5) : '';
}

/** True when any selected type is a structure fire (dotted form) — drives the
 *  Fire Protection "Required" badge. The requirement itself (incl. the
 *  support-aid-given waiver) is enforced server-side and surfaced by the
 *  completeness meter — this is presentation, not a second validation brain. */
function selectedStructureFire(form) {
  const list = (form.neris_types_list || []).filter((t) => t && t.dotted);
  const dotteds = list.length ? list.map((t) => t.dotted) : (form.neris_type ? [form.neris_type] : []);
  return dotteds.some((d) => d === 'FIRE.STRUCTURE_FIRE' || d.startsWith('FIRE.STRUCTURE_FIRE.'));
}

/** Union of selected NERIS categories (dotted first segments) — drives the
 *  conditional module sections (P2-D7/F27). Falls back to the staged picker's
 *  category when the list is empty, mirroring the save fallback below. */
function selectedCategoriesFor(form) {
  const list = (form.neris_types_list || []).filter((t) => t && t.dotted);
  const cats = list.length
    ? list.map((t) => t.dotted.split('.')[0])
    : (form.neris_category ? [form.neris_category] : []);
  return [...new Set(cats)];
}

/**
 * Build the API body from the form — THE one shape, used by both handleSubmit
 * and the completeness-preview call so they can never drift (P2-D5).
 *
 * includeNeris=false (the approved-lock, P2-D6) strips every client-writable
 * NERIS field so non-NERIS edits still save while the report is approved.
 * neris_status / neris_review are ALWAYS stripped — they are route-owned and
 * the server 422s NERIS_STATUS_VIA_ROUTE on any save that carries them.
 */
function buildNerisSavePayload(form, { includeNeris = true } = {}) {
  const payload = { ...form, injuries: parseInt(form.injuries, 10) || 0 };
  for (const k of FORM_ONLY_KEYS) delete payload[k];
  delete payload.neris_status;   // route-owned (P2-D6) — never in a save payload
  delete payload.neris_review;   // route-owned (P2-D6) — never in a save payload

  if (!includeNeris) {
    for (const k of NERIS_WRITABLE_KEYS) delete payload[k];
    return payload;
  }

  const cats = selectedCategoriesFor(form);

  // ── Incident types (P2-D7): the built list, exactly one primary; fall back
  // to the staged picker (Phase-1 behavior) when the officer never used Add.
  const list = (form.neris_types_list || []).filter((t) => t && t.dotted);
  if (list.length) {
    let sawPrimary = false;
    payload.neris_incident_types = list.slice(0, 3).map((t) => {
      const primary = t.primary === true && !sawPrimary;
      if (primary) sawPrimary = true;
      return { value: toNerisPath(t.dotted), primary };
    });
    if (!sawPrimary) payload.neris_incident_types[0].primary = true;
  } else if (form.neris_type) {
    payload.neris_incident_types = [{ value: toNerisPath(form.neris_type), primary: true }];
  } else {
    delete payload.neris_incident_types;
  }

  // ── Actions XOR no-action: send BOTH keys explicitly so switching one
  // clears the other server-side (the DB CHECK rejects a record carrying both).
  if (form.neris_noaction) {
    payload.neris_noaction = form.neris_noaction;
    payload.neris_actions = null;
  } else if (form.actions_taken.length) {
    payload.neris_actions = form.actions_taken.map(toNerisPath);
    payload.neris_noaction = null;
  } else {
    payload.neris_actions = null;
    payload.neris_noaction = null;
  }

  // ── Hazsit detail (Phase 1) ──
  const anyHazmat = form.hazmat_disposition || form.hazmat_evacuated !== '' || form.hazmat_material
    || form.hazmat_class || form.hazmat_quantity || form.hazmat_ppe_level || form.hazmat_erg_guide;
  if (anyHazmat) {
    const detail = {};
    if (form.hazmat_disposition) detail.disposition = form.hazmat_disposition;
    if (form.hazmat_evacuated !== '' && Number.isInteger(Number(form.hazmat_evacuated)) && Number(form.hazmat_evacuated) >= 0) {
      detail.evacuated = Number(form.hazmat_evacuated);
    }
    for (const k of ['material', 'class', 'quantity', 'ppe_level', 'contractor', 'cost', 'report_number', 'erg_guide', 'operations', 'planning', 'logistics', 'finance']) {
      if (form[`hazmat_${k}`] !== '' && form[`hazmat_${k}`] !== undefined) detail[k] = form[`hazmat_${k}`];
    }
    detail.decon = !!form.hazmat_decon;
    payload.neris_hazsit_detail = detail;
  } else {
    payload.neris_hazsit_detail = null;
  }

  // ── Fire module (P2-D1) → neris_fire_detail ──
  // location_detail is a spec-complete-or-omitted branch: the server refuses a
  // half-built branch (422), so a partial one is left out of the payload — the
  // completeness meter surfaces the gap instead of the save failing (F12).
  if (cats.includes('FIRE')) {
    const detail = {};
    if (form.fire_location_kind === 'OUTSIDE') {
      if (form.fire_cause_out) {
        const ld = { type: 'OUTSIDE', cause: form.fire_cause_out };
        if (form.fire_acres_burned !== '') {
          const acres = Number(form.fire_acres_burned);
          if (Number.isFinite(acres) && acres >= 0) ld.acres_burned = acres;
        }
        detail.location_detail = ld;
      }
    } else {
      const floor = form.fire_floor_of_origin === '' ? NaN : Number(form.fire_floor_of_origin);
      if (Number.isInteger(floor) && form.fire_arrival_condition && form.fire_damage_type
          && form.fire_room_of_origin && form.fire_cause_in) {
        detail.location_detail = {
          type: 'STRUCTURE',
          floor_of_origin: floor,
          arrival_condition: form.fire_arrival_condition,
          damage_type: form.fire_damage_type,
          room_of_origin_type: form.fire_room_of_origin,
          cause: form.fire_cause_in,
        };
      }
    }
    if (form.fire_water_supply) detail.water_supply = form.fire_water_supply;
    if (form.fire_investigation_needed) detail.investigation_needed = form.fire_investigation_needed;
    if (form.fire_investigation_types.length) detail.investigation_types = form.fire_investigation_types;
    if (form.fire_suppression_appliances.length) detail.suppression_appliances = form.fire_suppression_appliances;
    payload.neris_fire_detail = Object.keys(detail).length ? detail : null;
  } else {
    payload.neris_fire_detail = null;
  }

  // ── Fire Protection modules (FP, 0063) → neris_fire_protection ──
  // Complete-or-omitted at the MODULE level: an unanswered presence means the
  // module is simply not sent (the meter surfaces the structure-fire
  // requirement); an answered one is built into the exact spec payload shape.
  // Built on ANY incident type — smoke-alarm data on routine calls is CRR data.
  const fpForm = form.fire_protection || EMPTY_FIRE_PROTECTION;
  const fpOut = {};
  {
    const m = fpForm.smoke_alarm;
    if (m.presence === 'NOT_PRESENT' || m.presence === 'NOT_APPLICABLE') {
      fpOut.smoke_alarm = { presence: { type: m.presence } };
    } else if (m.presence === 'PRESENT') {
      const pres = { type: 'PRESENT' };
      if (m.working === 'true') pres.working = true;
      else if (m.working === 'false') pres.working = false;
      if (m.alarm_types.length) pres.alarm_types = m.alarm_types;
      if (m.operation) {
        const afo = { type: m.operation };
        if (m.operation === 'OPERATED_ALERTED_OCCUPANT' && m.occupant_action) afo.occupant_action = m.occupant_action;
        if (m.operation === 'FAILED_TO_OPERATE' && m.failure_reason) afo.failure_reason = m.failure_reason;
        pres.operation = { alerted_failed_other: afo };
      }
      fpOut.smoke_alarm = { presence: pres };
    }
  }
  {
    const m = fpForm.fire_alarm;
    if (m.presence === 'NOT_PRESENT' || m.presence === 'NOT_APPLICABLE') {
      fpOut.fire_alarm = { presence: { type: m.presence } };
    } else if (m.presence === 'PRESENT') {
      const pres = { type: 'PRESENT' };
      if (m.alarm_type) pres.alarm_types = [m.alarm_type];   // spec: array, UI hint "Select one."
      if (m.operation_type) pres.operation_type = m.operation_type;
      fpOut.fire_alarm = { presence: pres };
    }
  }
  {
    const m = fpForm.other_alarm;
    if (m.presence === 'NOT_PRESENT' || m.presence === 'NOT_APPLICABLE') {
      fpOut.other_alarm = { presence: { type: m.presence } };
    } else if (m.presence === 'PRESENT') {
      const pres = { type: 'PRESENT' };
      if (m.alarm_types.length) pres.alarm_types = m.alarm_types;
      fpOut.other_alarm = { presence: pres };
    }
  }
  {
    const m = fpForm.fire_suppression;
    if (m.presence === 'NOT_PRESENT' || m.presence === 'NOT_APPLICABLE') {
      fpOut.fire_suppression = { presence: { type: m.presence } };
    } else if (m.presence === 'PRESENT') {
      const pres = { type: 'PRESENT' };
      const sysTypes = (m.suppression_types || [])
        .filter((s) => s && s.type)
        .map((s) => (s.full_partial ? { type: s.type, full_partial: s.full_partial } : { type: s.type }));
      if (sysTypes.length) pres.suppression_types = sysTypes;
      if (m.operation) {
        const eff = { type: m.operation };
        if ((m.operation === 'OPERATED_EFFECTIVE' || m.operation === 'OPERATED_NOT_EFFECTIVE')
            && m.sprinklers_activated !== '') {
          const n = Number(m.sprinklers_activated);
          if (Number.isInteger(n) && n >= 0) eff.sprinklers_activated = n;
        }
        if ((m.operation === 'OPERATED_NOT_EFFECTIVE' || m.operation === 'NO_OPERATION') && m.failure_reason) {
          eff.failure_reason = m.failure_reason;
        }
        pres.operation_type = { effectiveness: eff };
      }
      fpOut.fire_suppression = { presence: pres };
    }
  }
  {
    const m = fpForm.cooking_fire_suppression;
    if (m.presence === 'NOT_PRESENT' || m.presence === 'NOT_APPLICABLE') {
      fpOut.cooking_fire_suppression = { presence: { type: m.presence } };
    } else if (m.presence === 'PRESENT') {
      const pres = { type: 'PRESENT' };
      if (m.suppression_types.length) pres.suppression_types = m.suppression_types;
      // Cooking operation_type is the FLAT enum — not the nested effectiveness
      // payload fire_suppression uses. Spec-verified (v1.4.76).
      if (m.operation_type) pres.operation_type = m.operation_type;
      fpOut.cooking_fire_suppression = { presence: pres };
    }
  }
  payload.neris_fire_protection = Object.keys(fpOut).length ? fpOut : null;

  // ── Medical per-patient entries → neris_medical_details ──
  if (cats.includes('MEDICAL')) {
    const entries = form.medical_patients.map((p) => {
      const e = {};
      if (p.patient_care_evaluation) e.patient_care_evaluation = p.patient_care_evaluation;
      if (p.patient_status) e.patient_status = p.patient_status;
      if (p.transport_disposition) e.transport_disposition = p.transport_disposition;
      if (p.patient_care_report_id) e.patient_care_report_id = String(p.patient_care_report_id).slice(0, 255);
      return e;
    }).filter((e) => Object.keys(e).length > 0);
    payload.neris_medical_details = entries.length ? entries : null;
  } else {
    payload.neris_medical_details = null;
  }

  // ── Casualties & rescues (P2-D2) → neris_casualty_rescues ──
  // type = who the person IS; rescue_type = who PERFORMED the rescue (any
  // combination). removal rides ONLY the 3 firefighter-performed types.
  const casualties = form.casualty_entries.map((c) => {
    if (!c.type || !c.injury) return null;
    const e = { type: c.type, injury: c.injury };
    if (c.injury !== 'NONE' && c.cause) e.cause = c.cause;
    if (c.rescue_type) {
      e.rescue_type = c.rescue_type;
      if (c.removal && FF_PERFORMED_RESCUE_TYPES.includes(c.rescue_type)) e.removal = c.removal;
    }
    return e;
  }).filter(Boolean);
  payload.neris_casualty_rescues = casualties.length ? casualties : null;

  // ── Structured aid → neris_aids ──
  const aids = form.aid_entries.map((a) => {
    const e = {};
    if (a.aid_direction) e.aid_direction = a.aid_direction;
    if (a.aid_type) e.aid_type = a.aid_type;
    const nid = (a.department_neris_id || '').trim();
    if (nid) e.department_neris_id = nid;
    return e;
  }).filter((e) => e.aid_type || e.department_neris_id);
  payload.neris_aids = aids.length ? aids : null;

  // ── Officer-entered PSAP times (P2-D4) → neris_dispatch_times ──
  const times = {};
  const created = hhmmToIso(form.date, form.psap_call_create);
  const answered = hhmmToIso(form.date, form.psap_call_answered);
  const arrival = hhmmToIso(form.date, form.psap_call_arrival);
  if (created) times.call_create = created;
  if (answered) times.call_answered = answered;
  if (arrival) times.call_arrival = arrival;
  payload.neris_dispatch_times = Object.keys(times).length ? times : null;

  return payload;
}

/**
 * CadCallPicker — "which call is this report for?"
 *
 * 4.1a-R. The association between a CAD call and an incident record is keyed on
 * the CAD run number, and it is created HERE, when the report is written. The
 * Command Board never creates it (it reflects state, it does not activate it).
 *
 * Design notes, each load-bearing:
 *  - Choosing nothing is a first-class, unremarkable outcome. Plenty of reports
 *    have no CAD call — a walk-in, a still alarm, a department with no feed. The
 *    empty option is listed first and reads as normal, not as a skipped step.
 *  - Already-linked calls are SHOWN and disabled with the incident that owns
 *    them, never hidden. An officer who cannot find their call needs to see that
 *    it is already filed, not an unexplained absence.
 *  - Selecting a call PREFILLS address/time/units from the dispatch, because
 *    retyping what CAD already said is how transcription errors get in. Fields
 *    stay editable — the officer's correction always wins.
 *  - Nothing here blocks the save. If the list fails to load, the form still
 *    submits; the association is simply not made and Reconciliation catches it.
 */
function CadCallPicker({ form, setForm }) {
  const [calls, setCalls] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [days, setDays] = useState(7);
  const [filled, setFilled] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    (async () => {
      try {
        const res = await api.get(`/api/cad/alerts/selectable?days=${days}`);
        if (cancelled) return;
        setCalls(Array.isArray(res?.data) ? res.data : []);
        setState('ready');
      } catch (_) {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  function choose(runNumber) {
    const call = calls.find((c) => c.alert_id === runNumber);
    const changed = [];
    setForm((f) => {
      const next = { ...f, cadRunNumber: runNumber };
      if (!call) return next;
      // Prefill only what is EMPTY — never clobber something already typed.
      // And REPORT what changed: silently rewriting fields on a legal record,
      // possibly below the fold, is how an officer stops trusting the form.
      if (!f.address && call.address) { next.address = call.address; changed.push('address'); }
      if (!f.time && call.dispatched_at) {
        const d = new Date(call.dispatched_at);
        if (!Number.isNaN(d.getTime())) {
          next.time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          changed.push('time');
        }
      }
      return next;
    });
    setFilled(changed);
  }

  // A failed load must not look like "there are no calls" — different facts, and
  // the officer deserves the real one.
  if (state === 'error') {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3">
        <p className="text-sm text-amber-900 dark:text-amber-200">
          Couldn’t load recent CAD calls. You can still save this report — attach it to a call later in Reconciliation.
        </p>
      </div>
    );
  }

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? calls.filter((c) => [c.address, c.units, c.description, c.alert_id]
        .some((v) => (v || '').toLowerCase().includes(needle)))
    : calls;
  const takenCount = calls.filter((c) => c.incident_id != null).length;

  function Row({ call }) {
    const taken = call && call.incident_id != null;
    const value = call ? call.alert_id : '';
    const selected = form.cadRunNumber === value;
    const when = call?.dispatched_at ? new Date(call.dispatched_at) : null;
    const stamp = when && !Number.isNaN(when.getTime())
      ? when.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <label
        className={[
          'flex items-start gap-3 px-3 py-2.5 min-h-[44px] cursor-pointer border-b last:border-b-0',
          'border-gray-100 dark:border-gray-800',
          taken ? 'cursor-not-allowed opacity-60' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60',
          selected ? 'bg-red-50 dark:bg-red-950/30' : '',
        ].join(' ')}
      >
        <input
          type="radio"
          name="cadRunNumber"
          value={value}
          checked={selected}
          disabled={taken}
          onChange={() => choose(value)}
          className="mt-1 h-4 w-4 accent-red-600 shrink-0"
        />
        <span className="min-w-0 flex-1">
          {call ? (
            <>
              <span className="block text-sm text-gray-900 dark:text-gray-100">
                {stamp || 'time unknown'} · {call.address || 'no address'}
              </span>
              <span className="block text-xs text-gray-600 dark:text-gray-400 break-words">
                {call.units || 'no units'} · run {call.alert_id}
              </span>
              {taken && (
                <span className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Already on report {call.incident_number || '(another report)'}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="block text-sm text-gray-900 dark:text-gray-100">
                No CAD call — this report stands alone
              </span>
              <span className="block text-xs text-gray-600 dark:text-gray-400">
                Normal for a walk-in, a still alarm, or a department with no CAD feed.
              </span>
            </>
          )}
        </span>
      </label>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="bg-gray-50 dark:bg-gray-950 px-4 py-2">
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Which call is this?
        </p>
      </div>

      <div className="px-4 py-3">
        {state === 'loading' ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading recent calls…</p>
        ) : (
          <>
            {calls.length > 5 && (
              <>
                <label htmlFor="cadCallSearch" className="sr-only">Search calls</label>
                <input
                  id="cadCallSearch"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search address, unit, or run number"
                  className="mb-2 w-full min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900"
                />
              </>
            )}

            <div
              role="radiogroup"
              aria-label="CAD call for this report"
              className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <Row call={null} />
              {shown.map((c) => <Row key={c.id} call={c} />)}
              {shown.length === 0 && calls.length > 0 && (
                <p className="px-3 py-3 text-xs text-gray-600 dark:text-gray-400">
                  No call matches “{q}”. Clear the search to see all {calls.length}.
                </p>
              )}
              {calls.length === 0 && (
                <p className="px-3 py-3 text-xs text-gray-600 dark:text-gray-400">
                  No CAD calls in the last {days} days.
                </p>
              )}
            </div>

            {filled.length > 0 && (
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400" role="status">
                Filled in {filled.join(' and ')} from the dispatch — edit if it’s wrong.
              </p>
            )}

            {/* The window, stated. Showing already-linked calls exists so a missing
                call is never an unexplained absence; silently dropping calls older
                than the window would reintroduce exactly that. */}
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              Showing the last {days} days
              {takenCount > 0 && ` · ${takenCount} already on a report`}
              {days < 30 && (
                <>
                  {'. '}
                  <button
                    type="button"
                    onClick={() => setDays(30)}
                    className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Look back 30 days
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * @param {'modal'|'workspace'} layout
 *
 * ── WHY A LAYOUT PROP AND NOT A REWRITE (2026-08-07, spec INCIDENT-ENTRY) ────
 * This file is ~1,770 lines and carries the load-bearing doctrine of the legal
 * record: the AI-never-writes-the-narrative boundary, the approved-lock, the
 * closed result set, and `buildNerisSavePayload` as the ONE place the NERIS save
 * shape is built (P2-D5). Rewriting it to change how it LOOKS would put all of
 * that at risk to solve a layout problem.
 *
 * So the form's logic, state and payload are untouched. Only the shell and the
 * flow direction of the section stack change:
 *   'modal'     — the original 672px dialog. Still used for quick edits.
 *   'workspace' — full window, no app chrome, sections flow into 2-3 COLUMNS.
 *
 * Measured on production before this existed: the modal is hard-capped at 672px
 * (47% of a 1440 screen, 35% of a 1920 one — it never grows), showing 17 of 110
 * fields across 4.5 screens of scrolling.
 */
export default function IncidentForm({ incident, onSave, onClose, nextNumber, aiPrefill, layout = 'modal' }) {
  const isWorkspace = layout === 'workspace';
  // Lazy initialiser: nowDefaults() must run when the form MOUNTS, not when the
  // module loads. Passing `emptyForm` directly is what froze the clock before.
  const [form, setForm] = useState(() => ({ ...emptyForm, ...nowDefaults() }));
  const [errors, setErrors] = useState({});
  const [members, setMembers] = useState([]);
  const [apparatus, setApparatus] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Dialog semantics + focus management. Measured on prod 2026-08-06: without
  // this, Tab after opening the form walked the incident LIST behind it.
  // MUST be declared AFTER `loadingData` — reading it above its own `const` is a
  // temporal-dead-zone ReferenceError that throws the whole component, which is
  // exactly what happened on the first attempt: the dialog stopped mounting at
  // all, and the verification probe reported "Tab containment OK" because it was
  // asserting against a dialog that did not exist. Vacuous pass, caught by
  // hardening the probe to abort loudly when nothing mounts.
  // contentKey: this component renders a LOADING panel (0 focusable controls)
  // before the real form (143 of them), so focus must be re-placed on the swap.
  const dlg = useDialog({ contentKey: loadingData ? 'loading' : 'form' });

  // ── LOCAL DRAFT (spec R3, Matt 2026-08-07: "local until you explicitly save") ──
  // Deliberately NOT a server autosave. A half-written report stays private to
  // the machine it was typed on until a person commits it — the right default for
  // a subpoenable record in progress. It survives a closed window, which is what
  // makes the pop-out report window safe to close.
  // ⚠️ NEVER call this "Saved" in the UI — see utils/incidentDraft.js.
  const [draftNote, setDraftNote] = useState(null);

  // NERIS review chain (P2-D6): status lives server-side; the ONLY writer is
  // POST /:id/neris-status. null = new incident (no chip, no controls).
  const [nerisStatus, setNerisStatus] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState(null);

  // Live completeness preview (P2-D5): { completeness, errors, warnings } |
  // null (call failed → meter shows '—'; NEVER blocks save, F12).
  const [nerisPreview, setNerisPreview] = useState(null);

  // Track B: the submission axis mirror (server-owned; read-only here).
  const [nerisSubmission, setNerisSubmission] = useState(null);
  const submissionFromRecord = (rec) => (rec ? {
    uid: rec.neris_incident_uid || null,
    state: rec.neris_submission_state || 'not_submitted',
    nerisStatus: rec.neris_incident_status || null,
    log: Array.isArray(rec.neris_submission_log) ? rec.neris_submission_log : [],
  } : null);

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
      // Hydrate from the PERSISTED NERIS columns (migration 0060/0061) when
      // present — they are the record of truth for the NERIS axis.
      const storedTypes = Array.isArray(data.neris_incident_types) ? data.neris_incident_types : null;
      if (storedTypes && storedTypes.length && storedTypes[0].value) {
        // Multi-type list (P2-D7) from the persisted array; normalize to
        // exactly one primary (first entry wins when none is marked).
        const list = storedTypes
          .filter((t) => t && t.value)
          .map((t) => ({ dotted: fromNerisPath(t.value), primary: t.primary === true }));
        if (list.length && !list.some((t) => t.primary)) list[0].primary = true;
        data.neris_types_list = list;
        const prim = list.find((t) => t.primary) || list[0];
        const [cat, sub, detail] = prim.dotted.split('.');
        data.neris_type = prim.dotted;
        data.neris_category = cat || '';
        data.neris_subcategory = sub || '';
        data.neris_detail = detail || '';
      } else if (data.neris_type) {
        // Back-compat: an incident saved before multi-type carries only the
        // single dotted neris_type — seed the list from it.
        data.neris_types_list = [{ dotted: data.neris_type, primary: true }];
      }
      if (Array.isArray(data.neris_actions) && data.neris_actions.length) {
        data.actions_taken = data.neris_actions.map(fromNerisPath);
      }
      if (typeof data.neris_noaction !== 'string' || !data.neris_noaction) data.neris_noaction = data.neris_noaction || '';
      const hd = data.neris_hazsit_detail;
      if (hd && typeof hd === 'object') {
        if (hd.disposition) data.hazmat_disposition = hd.disposition;
        if (hd.evacuated !== undefined && hd.evacuated !== null) data.hazmat_evacuated = String(hd.evacuated);
        for (const k of ['material', 'class', 'quantity', 'ppe_level', 'contractor', 'cost', 'report_number', 'erg_guide', 'operations', 'planning', 'logistics', 'finance']) {
          if (hd[k] !== undefined && hd[k] !== null && data[`hazmat_${k}`] === '') data[`hazmat_${k}`] = hd[k];
        }
        if (typeof hd.decon === 'boolean') data.hazmat_decon = hd.decon;
      }
      // Fire module (P2-D1) from the persisted neris_fire_detail
      const fd = data.neris_fire_detail;
      if (fd && typeof fd === 'object') {
        const ld = fd.location_detail;
        if (ld && typeof ld === 'object') {
          if (ld.type === 'OUTSIDE') {
            data.fire_location_kind = 'OUTSIDE';
            if (ld.cause) data.fire_cause_out = ld.cause;
            if (ld.acres_burned !== undefined && ld.acres_burned !== null) data.fire_acres_burned = String(ld.acres_burned);
          } else if (ld.type === 'STRUCTURE') {
            data.fire_location_kind = 'STRUCTURE';
            if (Number.isInteger(ld.floor_of_origin)) data.fire_floor_of_origin = String(ld.floor_of_origin);
            if (ld.arrival_condition) data.fire_arrival_condition = ld.arrival_condition;
            if (ld.damage_type) data.fire_damage_type = ld.damage_type;
            if (ld.room_of_origin_type) data.fire_room_of_origin = ld.room_of_origin_type;
            if (ld.cause) data.fire_cause_in = ld.cause;
          }
        }
        // Legacy pre-P2 top-level capture — surface it in the branch input
        // (same type_fire_condition_arrival vocabulary) rather than hiding it.
        if (!data.fire_arrival_condition && fd.condition_arrival) data.fire_arrival_condition = fd.condition_arrival;
        if (fd.water_supply) data.fire_water_supply = fd.water_supply;
        if (fd.investigation_needed) data.fire_investigation_needed = fd.investigation_needed;
        if (Array.isArray(fd.investigation_types)) data.fire_investigation_types = fd.investigation_types;
        if (Array.isArray(fd.suppression_appliances)) data.fire_suppression_appliances = fd.suppression_appliances;
      }
      // Fire Protection modules (FP, 0063) from the persisted neris_fire_protection
      const pfp = data.neris_fire_protection;
      if (pfp && typeof pfp === 'object') {
        const fpState = {
          smoke_alarm: { ...EMPTY_FIRE_PROTECTION.smoke_alarm },
          fire_alarm: { ...EMPTY_FIRE_PROTECTION.fire_alarm },
          other_alarm: { ...EMPTY_FIRE_PROTECTION.other_alarm },
          fire_suppression: { ...EMPTY_FIRE_PROTECTION.fire_suppression },
          cooking_fire_suppression: { ...EMPTY_FIRE_PROTECTION.cooking_fire_suppression },
        };
        const presOf = (mod) => (pfp[mod] && pfp[mod].presence && typeof pfp[mod].presence === 'object')
          ? pfp[mod].presence : null;
        const saP = presOf('smoke_alarm');
        if (saP) {
          fpState.smoke_alarm.presence = saP.type || '';
          if (typeof saP.working === 'boolean') fpState.smoke_alarm.working = String(saP.working);
          if (Array.isArray(saP.alarm_types)) fpState.smoke_alarm.alarm_types = saP.alarm_types;
          const afo = saP.operation && saP.operation.alerted_failed_other;
          if (afo && typeof afo === 'object') {
            fpState.smoke_alarm.operation = afo.type || '';
            if (afo.occupant_action) fpState.smoke_alarm.occupant_action = afo.occupant_action;
            if (afo.failure_reason) fpState.smoke_alarm.failure_reason = afo.failure_reason;
          }
        }
        const faP = presOf('fire_alarm');
        if (faP) {
          fpState.fire_alarm.presence = faP.type || '';
          if (Array.isArray(faP.alarm_types) && faP.alarm_types.length) fpState.fire_alarm.alarm_type = faP.alarm_types[0];
          if (faP.operation_type) fpState.fire_alarm.operation_type = faP.operation_type;
        }
        const oaP = presOf('other_alarm');
        if (oaP) {
          fpState.other_alarm.presence = oaP.type || '';
          if (Array.isArray(oaP.alarm_types)) fpState.other_alarm.alarm_types = oaP.alarm_types;
        }
        const fsP = presOf('fire_suppression');
        if (fsP) {
          fpState.fire_suppression.presence = fsP.type || '';
          if (Array.isArray(fsP.suppression_types)) {
            fpState.fire_suppression.suppression_types = fsP.suppression_types
              .filter((s) => s && s.type)
              .map((s) => ({ type: s.type, full_partial: s.full_partial || '' }));
          }
          const eff = fsP.operation_type && fsP.operation_type.effectiveness;
          if (eff && typeof eff === 'object') {
            fpState.fire_suppression.operation = eff.type || '';
            if (eff.sprinklers_activated !== undefined && eff.sprinklers_activated !== null) {
              fpState.fire_suppression.sprinklers_activated = String(eff.sprinklers_activated);
            }
            if (eff.failure_reason) fpState.fire_suppression.failure_reason = eff.failure_reason;
          }
        }
        const ckP = presOf('cooking_fire_suppression');
        if (ckP) {
          fpState.cooking_fire_suppression.presence = ckP.type || '';
          if (Array.isArray(ckP.suppression_types)) fpState.cooking_fire_suppression.suppression_types = ckP.suppression_types;
          if (typeof ckP.operation_type === 'string') fpState.cooking_fire_suppression.operation_type = ckP.operation_type;
        }
        data.fire_protection = fpState;
      }
      // Medical per-patient entries from the persisted neris_medical_details
      if (Array.isArray(data.neris_medical_details)) {
        data.medical_patients = data.neris_medical_details.map((p) => ({
          patient_care_evaluation: p?.patient_care_evaluation || '',
          patient_status: p?.patient_status || '',
          transport_disposition: p?.transport_disposition || '',
          patient_care_report_id: p?.patient_care_report_id || '',
        }));
      }
      // Casualty & rescue entries from the persisted neris_casualty_rescues
      if (Array.isArray(data.neris_casualty_rescues)) {
        data.casualty_entries = data.neris_casualty_rescues.map((c) => ({
          type: c?.type || 'NONFF',
          injury: c?.injury || 'NONE',
          cause: c?.cause || '',
          rescue_type: c?.rescue_type || '',
          removal: c?.removal || '',
        }));
      }
      // Structured aid entries from the persisted neris_aids
      if (Array.isArray(data.neris_aids)) {
        data.aid_entries = data.neris_aids.map((a) => ({
          aid_direction: a?.aid_direction || 'GIVEN',
          aid_type: a?.aid_type || '',
          department_neris_id: a?.department_neris_id || '',
        }));
      }
      // Officer-entered PSAP times (P2-D4): persisted ISO → local HH:MM inputs
      const dtms = data.neris_dispatch_times;
      if (dtms && typeof dtms === 'object') {
        data.psap_call_create = isoToHHMM(dtms.call_create);
        data.psap_call_answered = isoToHHMM(dtms.call_answered);
        data.psap_call_arrival = isoToHHMM(dtms.call_arrival);
      }
      setNerisStatus(incident.neris_status || 'draft');
      setNerisSubmission(submissionFromRecord(incident));
      setForm(data);
    } else if (aiPrefill) {
      // AI-generated prefill: merge AI data into the empty form
      const data = { ...emptyForm, ...nowDefaults(), incidentNumber: nextNumber || '' };
      // Map AI fields to form fields
      if (aiPrefill.type) data.type = aiPrefill.type;
      if (aiPrefill.alarmLevel) data.alarmLevel = aiPrefill.alarmLevel;
      if (aiPrefill.address) data.address = aiPrefill.address;
      if (aiPrefill.disposition) data.disposition = aiPrefill.disposition;
      if (aiPrefill.injuries != null) data.injuries = aiPrefill.injuries;
      // NO `notes` HERE. The narrative is officer-written, always (doctrine,
      // 2026-06-10). This line used to read `aiPrefill.notes` into the narrative
      // box; the only thing preventing machine prose from landing in a subpoenable
      // record was a sentence in the model's prompt. Enforced in three places now:
      // the prompt, the server strip (routes/aiAction.js forbiddenResultKeys), and
      // this omission. Do not add it back.
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
      setNerisStatus(null);
      setForm(data);
    } else {
      setNerisStatus(null);
      setForm({ ...emptyForm, ...nowDefaults(), incidentNumber: nextNumber || '' });
    }
    setErrors({});
    setStatusError(null);
  }, [incident, nextNumber, aiPrefill]);

  const isEditing = Boolean(incident);

  // Restore a local draft ONCE, after the form has been seeded from the incident
  // (or from the empty defaults). Ordering matters: run it before that seeding
  // effect and the seed overwrites the officer's unsaved work, which is the exact
  // loss this feature exists to prevent.
  const draftRestored = useRef(false);
  useEffect(() => {
    if (loadingData || draftRestored.current) return;
    draftRestored.current = true;
    const d = loadDraft(incident?.id);
    if (!d) return;
    // Merge OVER the seeded form, not under it: the draft is the newer truth.
    setForm((prev) => ({ ...prev, ...d.form }));
    setDraftNote(draftLabel(d.savedAt));
  }, [loadingData, incident?.id]);

  // Persist on a debounce. Skipped while the fetch is in flight so the empty
  // pre-load state can never be written over a real draft.
  useEffect(() => {
    if (loadingData || !draftRestored.current) return undefined;
    const t = setTimeout(() => {
      if (saveDraft(incident?.id, form)) setDraftNote(draftLabel(new Date().toISOString()));
      // A FAILED write leaves the previous note alone rather than claiming a save
      // that did not happen — private mode and a full quota both land here.
    }, 800);
    return () => clearTimeout(t);
  }, [form, loadingData, incident?.id]);

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

  // Approved-lock (P2-D6/F22): NERIS inputs freeze; non-NERIS fields stay live.
  const nerisLocked = nerisStatus === 'approved';

  // Union of selected NERIS categories — drives conditional disclosure (F27).
  const selectedCategories = useMemo(
    () => selectedCategoriesFor(form),
    [form.neris_types_list, form.neris_category]
  );

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    // ONE payload builder for save + preview (P2-D5). While approved, NERIS
    // fields are stripped so non-NERIS edits don't 409 NERIS_APPROVED_LOCKED.
    // ⚠️ The local draft is NOT part of this. It never touches the payload.
    onSave(buildNerisSavePayload(form, { includeNeris: !nerisLocked }));
    // The draft has served its purpose the moment the record is committed.
    // Cleared HERE rather than in the parent's success handler on purpose:
    // leaving it would mean the next new report silently restores this one's
    // contents into a different incident.
    clearDraft(incident?.id);
    setDraftNote(null);
  }

  // ── Multi-type list handlers (P2-D7) ──────────────────────────────────────
  function addCurrentType() {
    setForm((p) => {
      const dotted = p.neris_type;
      if (!dotted) return p;
      const list = p.neris_types_list || [];
      // Duplicates are a no-op; the picker hides at 3.
      if (list.length >= 3 || list.some((t) => t.dotted === dotted)) return p;
      return { ...p, neris_types_list: [...list, { dotted, primary: list.length === 0 }] };
    });
  }
  function setPrimaryType(dotted) {
    setForm((p) => ({
      ...p,
      neris_types_list: p.neris_types_list.map((t) => ({ ...t, primary: t.dotted === dotted })),
    }));
  }
  function removeType(dotted) {
    setForm((p) => {
      const list = p.neris_types_list.filter((t) => t.dotted !== dotted);
      if (list.length && !list.some((t) => t.primary)) list[0] = { ...list[0], primary: true };
      return { ...p, neris_types_list: list };
    });
  }

  // ── Live completeness meter (P2-D5/F27): debounce the server preview.
  // Failures degrade silently to '—' — the meter informs, never blocks (F12).
  useEffect(() => {
    if (loadingData) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api.post('/api/incidents/neris-preview', buildNerisSavePayload(form));
        const v = res?.data?.validation;
        if (!cancelled && v) {
          setNerisPreview({
            completeness: v.completeness,
            errors: Array.isArray(v.errors) ? v.errors : [],
            warnings: Array.isArray(v.warnings) ? v.warnings : [],
          });
        }
      } catch {
        if (!cancelled) setNerisPreview(null);
      }
    }, 700);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form, loadingData]);

  // ── Review-chain actions (P2-D6): the status route is the ONE door.
  // 403/409 surface inline as plain text (the form has no toast pattern).
  async function handleNerisStatusAction(action) {
    if (!incident?.id) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      const res = await api.post(`/api/incidents/${incident.id}/neris-status`, { action });
      const updated = res?.data;
      if (updated?.neris_status) setNerisStatus(updated.neris_status);
      // Approve may have fired a NERIS submission — paint its outcome now.
      if (updated) setNerisSubmission(submissionFromRecord(updated));
    } catch (err) {
      setStatusError(err.message || 'Could not update the review status.');
    } finally {
      setStatusBusy(false);
    }
  }

  // ── Track B: submission retry / status refresh (the server engine is the
  // one brain; these only invoke it and repaint from the returned record).
  async function handleSubmissionAction(kind) {
    if (!incident?.id) return;
    setStatusBusy(true);
    try {
      const res = await api.post(`/api/incidents/${incident.id}/neris-submission/${kind}`, {});
      if (res?.data) setNerisSubmission(submissionFromRecord(res.data));
    } catch (err) {
      setStatusError(err.message || 'NERIS submission action failed.');
    } finally {
      setStatusBusy(false);
    }
  }

  // On-open status refresh (the market's on-demand pattern): once, when the
  // record is in NERIS with a non-terminal status. Failures stay silent.
  useEffect(() => {
    if (!incident?.id || !incident.neris_incident_uid) return;
    const st = incident.neris_incident_status;
    if (st === 'SUBMITTED' || st === 'PENDING_APPROVAL' || st === 'PENDING_INCIDENT_DATA') {
      api.post(`/api/incidents/${incident.id}/neris-submission/refresh`, {})
        .then((res) => { if (res?.data) setNerisSubmission(submissionFromRecord(res.data)); })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident?.id]);

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
        {/* The loading state is a dialog too — it is on screen for as long as the
            members/apparatus fetch takes, and a keyboard user landing here must
            not be tabbing the page behind it either. */}
        <div {...dlg.dialogProps} aria-labelledby={undefined} aria-label="Loading incident form" className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border border-gray-300 dark:border-gray-700 border-t-red-700 mx-auto mb-3"></div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading form…</p>
          </div>
        </div>
      </div>
    );
  }

  // In 'workspace' the form IS the window — no scrim, no rounded card floating in
  // the middle of a dimmed page, and critically NO max-w cap. `dialogProps` are
  // applied only in modal mode: a full-window report is not a dialog, has nothing
  // behind it to trap focus away from, and declaring aria-modal there would be a
  // lie about the document.
  //
  // 🔴 THIS WAS A `const Shell = ({children}) => …` COMPONENT AND THAT WAS A BUG.
  // A component DEFINED INSIDE render gets a NEW IDENTITY on every render, so
  // React unmounts and remounts the whole subtree each time — on this form that
  // is 110 fields, on every keystroke. It also broke the dialog outright: the
  // ref re-attached constantly, so focus never settled inside it and the
  // focus-containment gate failed with "focus was not moved into the dialog".
  // Caught by that gate, not by review. Never define a component in render.
  const body = (
    <>
      {/* fragment: header + form + footer */}
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 bg-red-700 ${isWorkspace ? 'flex-shrink-0' : ''}`}>
          <h2 id={dlg.titleId} className="text-lg font-semibold text-white">
            {isEditing ? `Edit Incident ${incident.incidentNumber}` : 'Log New Incident'}
          </h2>
          <button onClick={onClose} aria-label="Close form" className="text-red-200 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* THE DENSITY CHANGE, and it is one className.
            'modal'     — the original single column (space-y-4), 672px wide.
            'workspace' — the SAME children flowed into 2-3 CSS COLUMNS.
            Nothing inside any section moved, which is why this cannot touch the
            save payload.

            🔴 THIS WAS A CSS GRID AND THE GRID WAS BROKEN. `grid-cols-3` places
            items in ROWS, and a row's track is sized from the items in it — so a
            tall card and a short card in the same row leave a dead gap under the
            short one, and (measured on production, 1920px) FOUR pairs of sections
            actually OVERLAPPED, 613px wide and up to 159px deep: the CAD call
            picker drawn over the NERIS classification, Narrative over Fire
            Protection, Aid over the Fire Module. The geometry gate passed the
            whole time — 60 fields, 3 columns, 1.6 screens, all true — because it
            measured density and never asked whether two sections occupied the
            same pixels. A measurement that cannot fail on a visibly broken screen
            is the same blind spot as a contrast sweep that never renders a modal.

            CSS multi-column FLOWS the cards instead of placing them in a matrix,
            so a column simply continues where the last card ended: no row tracks,
            no dead gaps, and no way for two siblings to be assigned overlapping
            space. `break-inside-avoid` keeps a card whole. Reading order becomes
            down-then-across, which is how a two-column paper form already reads. */}
        {/* 🔴 THE SCROLLER AND THE COLUMNS MUST BE TWO DIFFERENT ELEMENTS.
            Putting `overflow-y-auto` on the multi-column element itself CONSTRAINS
            ITS HEIGHT, and a CSS column box that cannot grow taller grows
            SIDEWAYS instead: measured on the first attempt, scrollWidth 4256 against
            a clientWidth of 1440 — three viewports of horizontal overflow with 20
            fields parked off the right edge of a legal record, reachable only by a
            sideways scrollbar nobody looks for. It reported `screens: 1`, i.e. "no
            vertical scrolling", which read like a triumph and was the symptom.
            So: the FORM scrolls, the DIV inside it holds the columns at natural
            height. Neither job belongs to the other element. */}
        <form id="incident-report-form" onSubmit={handleSubmit} className={isWorkspace ? 'flex-1 min-h-0 overflow-y-auto' : ''}>
        <div className={isWorkspace
          ? 'px-6 py-5 columns-1 lg:columns-2 2xl:columns-3 gap-4 [&>*]:break-inside-avoid [&>*]:mb-4'
          : 'px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto'}>
          {/* NERIS review chain (P2-D6) — existing incidents only */}
          {isEditing && (
            <NerisReviewControls
              status={nerisStatus || 'draft'}
              busy={statusBusy}
              error={statusError}
              onAction={handleNerisStatusAction}
            />
          )}

          {/* Track B: submission state (server-owned mirror; hidden until it exists) */}
          {isEditing && (
            <NerisSubmissionPanel
              submission={nerisSubmission}
              busy={statusBusy}
              onRetry={() => handleSubmissionAction('retry')}
              onRefresh={() => handleSubmissionAction('refresh')}
            />
          )}

          {/* Live NERIS completeness (P2-D5) — informs, never blocks save */}
          <NerisCompletenessMeter preview={nerisPreview} />

          {/* 4.1a-R — WHICH CALL IS THIS? Asked FIRST, and only when the report is
              born. This is the market's documented field-user moment: a
              select-an-incident list of CAD calls at import. The officer at the
              call is the only human who knows which one it was — by March that
              knowledge is gone, and the association can only be repaired by an
              admin in Reconciliation.
              Editing an existing report does NOT show this: re-pointing a report
              to a different call is a conflict, not a form field. */}
          {!isEditing && <CadCallPicker form={form} setForm={setForm} />}

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
                onClick={openTimePicker}
                className="w-full cursor-pointer rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900" />
            </div>
          </div>

          {/* 911-center call times (P2-D4) — DEMOTED to a no-CAD-feed fallback.
              The market pattern is CAD-supplied: our webhook pipeline now lifts
              call_answered/call_arrival from vendor payloads automatically.
              These inputs exist ONLY for departments with no CAD data feed,
              transcribing from the printed/emailed dispatch report. */}
          <fieldset disabled={nerisLocked} className="disabled:opacity-60">
            <details className="group border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <summary className="bg-gray-50 dark:bg-gray-950 px-4 py-2 cursor-pointer select-none flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  911-center call times
                  {(form.psap_call_create || form.psap_call_answered || form.psap_call_arrival) && (
                    <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-medium rounded-full bg-gray-600 text-white">set</span>
                  )}
                </p>
                <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-4 py-3">
                <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
                  These normally come from your CAD feed automatically. Only enter them here — transcribed
                  from the dispatch report — if your dispatch center provides no data connection.
                </p>
                {/* CHRONOLOGICAL ORDER, and it is not cosmetic (2026-08-08 production
                    design pass). NERIS's own DispatchPayload lists these required
                    fields as call_arrival, call_answered, call_create, which matches
                    what actually happens: the call ARRIVES at the PSAP, is ANSWERED,
                    and then call PROCESSING BEGINS. They first shipped here in the
                    reverse of that, with call_create leading because it was the field
                    being added. An officer transcribing three near-identical times off
                    a printed dispatch report reads top-to-bottom; presenting them out
                    of sequence invites a transposition, and this is a legal record.
                    Three across on a wide screen so the sequence reads as one row —
                    two-up left the third orphaned beside dead space. */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Call received (911 center)</label>
                    <input type="time" name="psap_call_arrival" value={form.psap_call_arrival} onChange={handleChange}
                      onClick={openTimePicker}
                      aria-label="Call received (911 center)"
                      className="w-full cursor-pointer rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900" />
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">When the call reached the 911 center.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Call answered (911 center)</label>
                    <input type="time" name="psap_call_answered" value={form.psap_call_answered} onChange={handleChange}
                      onClick={openTimePicker}
                      aria-label="Call answered (911 center)"
                      className="w-full cursor-pointer rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900" />
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">When the 911 center answered.</p>
                  </div>
                  <div>
                    {/* call_create — NERIS: "Timestamp at which call processing begins."
                        Added 2026-08-08. Until then this field existed NOWHERE in the
                        product, while NERIS requires it — so the transformer manufactured
                        it from the incident's own clock, and a Command Board tap could
                        become the 911 call time. Its two siblings always had this input;
                        this one didn't, and that asymmetry WAS the defect. */}
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Call created (911 center)</label>
                    <input type="time" name="psap_call_create" value={form.psap_call_create} onChange={handleChange}
                      onClick={openTimePicker}
                      aria-label="Call created (911 center) — when call processing began"
                      className="w-full cursor-pointer rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-900" />
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">When call processing began.</p>
                  </div>
                </div>
              </div>
            </details>
          </fieldset>

          {/* NERIS Incident Type — Cascading Selectors */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-950 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">NERIS Incident Classification</p>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                {form.neris_type || '—'}
              </span>
            </div>
            <fieldset disabled={nerisLocked} className="px-4 py-3 space-y-3 disabled:opacity-60">
              {/* Selected types (P2-D7): up to 3, exactly one primary */}
              {form.neris_types_list.length > 0 && (
                <div className="space-y-1.5">
                  {form.neris_types_list.map((t) => (
                    <div key={t.dotted}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${t.primary ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50' : 'border-gray-200 dark:border-gray-700'}`}>
                      <label className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 cursor-pointer whitespace-nowrap">
                        <input type="radio" name="neris_primary_type" checked={t.primary}
                          onChange={() => setPrimaryType(t.dotted)}
                          className="h-3.5 w-3.5 border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 focus:ring-red-500" />
                        Primary
                      </label>
                      <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{nerisLabel(t.dotted)}</span>
                      <span className="hidden sm:inline text-[11px] text-gray-500 dark:text-gray-400 font-mono">{t.dotted}</span>
                      <button type="button" onClick={() => removeType(t.dotted)}
                        aria-label={`Remove ${nerisLabel(t.dotted)}`}
                        className="text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Picker — stages one type; hidden once 3 are selected */}
              {form.neris_types_list.length < 3 && (<>
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
                    {/* NO EMOJI HERE, and it is not an oversight — it is the one place
                        the usual fix is impossible. An <option> may contain TEXT ONLY
                        (HTML spec), so a lucide SVG cannot go inside it; the choice is
                        emoji or nothing. Nothing wins: `cat.label` already reads "Fire",
                        "Medical", "Hazmat", so the glyph carried no information a
                        classifying officer needed, while rendering as a different
                        picture on every OS and being read aloud mid-selection. The
                        `icon` field stays in nerisTypes.js — it is still correct for
                        the non-<option> surfaces that render it beside a label. */}
                    {Object.entries(NERIS_INCIDENT_TYPES).map(([code, cat]) => (
                      <option key={code} value={code}>{cat.label}</option>
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
              <button type="button" onClick={addCurrentType} disabled={!form.neris_type}
                className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                + Add incident type ({form.neris_types_list.length}/3)
              </button>
              </>)}
              {form.neris_types_list.length >= 3 && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Maximum of 3 incident types — remove one to change the selection.
                </p>
              )}
            </fieldset>
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
            {geoError   && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{geoError}</p>}
            {errors.address && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.address}</p>}
          </div>

          {/* Units / Personnel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Units Responding <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({form.units.length})</span>
              </label>
              <CheckList field="units" items={apparatusUnits} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Personnel <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({form.personnel.length})</span>
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
                    <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-medium rounded-full bg-blue-600 text-white">
                      {form.actions_taken.length}
                    </span>
                  )}
                </p>
                <ChevronDown className="h-4 w-4 text-blue-400 transition-transform group-open:rotate-180" />
              </summary>
              <fieldset disabled={nerisLocked} className="px-4 py-3 max-h-64 overflow-y-auto space-y-3 disabled:opacity-60">
                {Object.entries(NERIS_ACTIONS_TACTICS).map(([catCode, cat]) => (
                  <div key={catCode}>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{cat.label}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                      {cat.items.map((item) => {
                        // Bare single-level NERIS values (code:'') store just the category
                        const fullCode = item.code ? `${catCode}.${item.code}` : catCode;
                        const checked = form.actions_taken.includes(fullCode);
                        return (
                          <label key={fullCode} className={`flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors ${form.neris_noaction ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${checked ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                            <input type="checkbox" checked={checked}
                              disabled={!!form.neris_noaction}
                              onChange={() => {
                                setForm(p => ({
                                  ...p,
                                  // Selecting an action clears any no-action reason (XOR)
                                  neris_noaction: '',
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
              </fieldset>
            </details>
          </div>

          {/* NERIS No-Action Reason — XOR with Actions & Tactics */}
          <div className="border border-blue-200 dark:border-blue-900 rounded-xl overflow-hidden">
            <div className="bg-blue-50 dark:bg-blue-950/50 px-4 py-2 border-b border-blue-200 dark:border-blue-900">
              <p className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide">No Action Taken</p>
            </div>
            <fieldset disabled={nerisLocked} className="px-4 py-3 space-y-2 disabled:opacity-60">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Record either what was done, or why nothing was done — never both.
              </p>
              <div className="flex flex-wrap gap-2">
                {NERIS_NO_ACTION_REASONS.map(({ code, label }) => {
                  const selected = form.neris_noaction === code;
                  const blocked = form.actions_taken.length > 0;
                  return (
                    <button key={code} type="button"
                      disabled={blocked && !selected}
                      onClick={() => setForm(p => ({
                        ...p,
                        neris_noaction: selected ? '' : code,
                        // Selecting a no-action reason clears actions (XOR)
                        actions_taken: selected ? p.actions_taken : [],
                      }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        selected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : blocked
                            ? 'opacity-40 cursor-not-allowed border-gray-200 dark:border-gray-700 text-gray-400'
                            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}>
                      {label}
                    </button>
                  );
                })}
              </div>
              {form.actions_taken.length > 0 && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Actions are recorded — clear them to select a no-action reason.
                </p>
              )}
            </fieldset>
          </div>

          {/* Fire module (P2-D1) — only when a FIRE type is selected (F27) */}
          {selectedCategories.includes('FIRE') && (
            <FireModuleSection form={form} setForm={setForm} disabled={nerisLocked} />
          )}

          {/* Fire Protection modules (FP, 0063) — ALWAYS available (the official
              NERIS pattern: fire-protection data is CRR gold on any call);
              required only for structure fires, enforced server-side. */}
          <FireProtectionSection form={form} setForm={setForm} disabled={nerisLocked}
            requiredForStructureFire={selectedStructureFire(form)} />


          {/* Hazmat ICS Section — Hazmat / Gas Leak legacy types, or any HAZSIT NERIS type */}
          {(form.type === 'Hazmat' || form.type === 'Gas Leak' || form.neris_category === 'HAZSIT' || form.neris_subcategory === 'HAZARDOUS_MATERIALS' || selectedCategories.includes('HAZSIT')) && (
            <div className="border border-orange-200 dark:border-orange-900 rounded-xl overflow-hidden">
              <div className="bg-orange-50 dark:bg-orange-950/50 px-4 py-2 border-b border-orange-200 dark:border-orange-900">
                <p className="flex items-center gap-1.5 text-xs font-bold text-orange-800 dark:text-orange-300 uppercase tracking-wide"><AlertTriangle size={13} aria-hidden="true" /> Hazmat ICS Detail</p>
              </div>
              <fieldset disabled={nerisLocked} className="px-4 py-4 space-y-4 disabled:opacity-60">

                {/* NERIS-required hazsit fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Outcome (NERIS disposition) *</label>
                    <select name="hazmat_disposition" value={form.hazmat_disposition} onChange={handleChange}
                      aria-label="Hazmat Disposition"
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 dark:text-gray-100">
                      <option value="">— Select outcome —</option>
                      {NERIS_HAZARD_DISPOSITIONS.map(({ code, label }) => (
                        <option key={code} value={code}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">People Evacuated (count) *</label>
                    <input name="hazmat_evacuated" value={form.hazmat_evacuated} onChange={handleChange}
                      type="number" min="0" step="1" placeholder="0"
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 dark:text-gray-100" />
                  </div>
                </div>

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

              </fieldset>
            </div>
          )}

          {/* Medical patients — only when a MEDICAL type is selected (F27) */}
          {selectedCategories.includes('MEDICAL') && (
            <MedicalPatientsSection form={form} setForm={setForm} disabled={nerisLocked} />
          )}

          {/* Casualties & rescues (P2-D2) — always available, collapsed */}
          <CasualtiesSection form={form} setForm={setForm} disabled={nerisLocked} />

          {/* Structured aid — always available, collapsed */}
          <AidSection form={form} setForm={setForm} disabled={nerisLocked} />

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

          {/* Actions.
              In 'workspace' these move OUT of the scrolling body into the fixed
              footer below — the whole complaint was that Save sat 4.5 screens
              down. `col-span-full` keeps them on their own row in the grid. */}
          {!isWorkspace && (
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
          )}
        </div>
        </form>

        {/* PERSISTENT FOOTER (workspace only) — save state and the commit control,
            always on screen. `form="incident-report-form"` is what lets a submit
            button live OUTSIDE the <form> it submits; without it this button
            would silently do nothing, which on a legal record is the worst
            possible failure mode for a Save button. */}
        {isWorkspace && (
          <div className="flex-shrink-0 flex items-center gap-3 px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <p className="text-xs text-gray-500 dark:text-gray-400 flex-1 truncate">
              {draftNote || 'Nothing typed yet — this report has not been saved.'}
            </p>
            <button type="button" onClick={onClose}
              className="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" form="incident-report-form"
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm">
              {isEditing ? 'Save Changes' : 'Log Incident'}
            </button>
          </div>
        )}
    </>
  );

  return isWorkspace
    ? <div className="fixed inset-0 flex flex-col bg-gray-50 dark:bg-gray-950">{body}</div>
    : (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div {...dlg.dialogProps} className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
          {body}
        </div>
      </div>
    );
}
