'use strict';
/**
 * nerisPayload.js — THE canonical NERIS incident transformer (D4: one brain).
 *
 * Emits the LIVE NERIS API `IncidentPayload` shape (api.neris.fsri.org/v1,
 * spec version pinned in constants/neris — generated from the vendored
 * OpenAPI snapshot, NOT the unmaintained GitHub framework CSVs).
 *
 * Replaces BOTH prior transformers:
 *   - client/src/utils/nerisExport.js  toNerisIncident (old core_mod_incident
 *     shape; its good parts — localToUtcIso, numOrNull, address parsing,
 *     legacy crosswalk — are ported here)
 *   - the stale inline copy that lived in routes/nfirsReports.js
 *     (hardcoded 'NJ14-001' FDID, csop_state:'NJ', fake-UTC `${date}T${t}:00Z`
 *     timestamps — all removed; see docs/NERIS-BULLETPROOF-BUILD-2026-07-16.md
 *     F8/F9)
 *
 * Honesty rules (F8):
 *   - No silent defaults. An unmappable incident type is a validation ERROR,
 *     never PUBSERV||CITIZEN_ASSIST||CITIZEN_ASSIST_SERVICE_CALL.
 *   - A missing department NERIS id is a validation ERROR, never a literal.
 *   - Data OF captures but the live spec has no lossless home for goes into
 *     `_meta.unexported` (+ a warning) — preserved, never guessed into the
 *     wrong payload field.
 *   - Validation NEVER blocks building/downloading (F12) — it rides alongside.
 */

const {
  NERIS_SPEC_VERSION,
  isValidIncidentType,
  isValidActionTactic,
  isValidNoaction,
} = require('../constants/neris');

// ─── Legacy crosswalk ────────────────────────────────────────────────────────
// Source of truth for the UI copy: client/src/data/nerisTypes.js
// LEGACY_TYPE_MAP. Kept byte-equal by server/src/tests/nerisClientDataDrift.
// Dotted internal dialect; converted to '||' paths at the boundary below.
const LEGACY_TYPE_MAP = {
  'Structure Fire':          'FIRE.STRUCTURE_FIRE.STRUCTURAL_INVOLVEMENT_FIRE',
  'Vehicle Fire':            'FIRE.TRANSPORTATION_FIRE.VEHICLE_FIRE_PASSENGER',
  'Brush / Wildland Fire':   'FIRE.OUTSIDE_FIRE.WILDFIRE_WILDLAND',
  'Dumpster / Rubbish Fire': 'FIRE.OUTSIDE_FIRE.DUMPSTER_OUTDOOR_CONTAINER_FIRE',
  'Vehicle Accident':        'HAZSIT.HAZARD_NONCHEM.MOTOR_VEHICLE_COLLISION',
  'Technical Rescue':        'RESCUE.OUTSIDE.EXTRICATION_ENTRAPPED',
  'Water Rescue':            'RESCUE.WATER.PERSON_IN_WATER_STANDING',
  'Medical / EMS':           'MEDICAL.ILLNESS.SICK_CASE',
  'Hazmat':                  'HAZSIT.HAZARDOUS_MATERIALS.HAZMAT_RELEASE_FACILITY',
  'Gas Leak':                'HAZSIT.HAZARDOUS_MATERIALS.GAS_LEAK_ODOR',
  'Public Assist':           'PUBSERV.CITIZEN_ASSIST.CITIZEN_ASSIST_SERVICE_CALL',
  'False Alarm':             'NOEMERG.FALSE_ALARM.ACCIDENTAL_ALARM',
  'Mutual Aid':              'PUBSERV.OTHER.MOVE_UP',
  'Other':                   'PUBSERV.CITIZEN_ASSIST.CITIZEN_ASSIST_SERVICE_CALL',
};

const NARRATIVE_MAX = 100000; // IncidentBasePayload outcome/impediment maxLength

// ─── Small helpers (ported from the W4.1-fixed client exporter) ─────────────

/** Dotted internal dialect → NERIS '||' path string (empty segments from
 *  bare 1/2-level values are filtered — mirrors client toNerisPath). */
function toPath(dotted) {
  if (!dotted || typeof dotted !== 'string') return null;
  return dotted.includes('||') ? dotted : dotted.split('.').filter(Boolean).join('||');
}

/**
 * Local wall-clock date + HH:MM → real UTC ISO string (F9).
 * NEVER `${date}T${time}:00Z` — that stamps local time as UTC.
 */
function localToUtcIso(date, hhmm) {
  if (!date || !hhmm) return null;
  const t = new Date(`${date}T${hhmm}:00`);
  return Number.isFinite(t.getTime()) ? t.toISOString() : null;
}

/** Timestamptz/Date/ISO-string → ISO string, or null. */
function anyToIso(v) {
  if (!v) return null;
  const t = v instanceof Date ? v : new Date(v);
  return Number.isFinite(t.getTime()) ? t.toISOString() : null;
}

/** Numeric parse that PRESERVES legitimate zeros ($0 loss is data). */
function numOrNull(v, parser = parseFloat) {
  if (v === null || v === undefined || v === '') return null;
  const n = parser(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Free-form address → LocationPayload civic fields (best-effort). */
function parseLocation(address, defaultState) {
  if (!address) return {};
  const parts = String(address).split(',').map((s) => s.trim());
  const streetPart = parts[0] || '';
  const city = parts[1] || '';
  const stateZip = parts[2] || '';

  const streetMatch = streetPart.match(/^(\d+[\w-]*)\s+(.+)/);
  const completeNumber = streetMatch ? streetMatch[1] : null;
  const streetName = streetMatch ? streetMatch[2] : streetPart;
  const szMatch = stateZip.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/);

  const loc = {};
  if (completeNumber) loc.complete_number = completeNumber;
  if (streetName) loc.street = streetName;
  if (city) loc.postal_community = city;
  const state = szMatch ? szMatch[1] : (stateZip || defaultState || null);
  if (state) loc.state = state;
  const zip = szMatch ? szMatch[2] || null : null;
  if (zip) loc.postal_code = zip;
  loc.country = 'US';
  return loc;
}

/** incidents.units may be a JSON-text array, a real array, or a CSV string. */
function normalizeUnits(units) {
  if (!units) return [];
  if (Array.isArray(units)) return units.filter(Boolean);
  if (typeof units === 'string') {
    const s = units.trim();
    if (s.startsWith('[')) {
      try { return (JSON.parse(s) || []).filter(Boolean); } catch { /* fall through */ }
    }
    return s.split(',').map((u) => u.trim()).filter(Boolean);
  }
  return [];
}

/** jsonb column may arrive parsed (pg jsonb) or as a JSON string. */
function jsonbVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
}

// ─── Main builder ────────────────────────────────────────────────────────────

/**
 * @param {Object} args
 * @param {Object} [args.incident]     incidents row (with neris_* jsonb columns)
 * @param {Object} [args.nfirsReport]  nfirs_reports row (fields win over incident)
 * @param {Object} [args.department]   departments row ({ id, name, fdid, ... })
 * @param {Object} [args.station]      stations row (optional)
 * @param {Object} [args.cadAlert]     cad_alerts row (optional; call times/GPS)
 * @param {Array}  [args.unitTimes]    per-unit times from unit_status_history
 * @param {Object} [args.options]      { departmentNerisId, defaultState }
 * @returns {{ payload: Object, validation: {valid, errors, warnings, completeness}, _meta: Object }}
 */
function buildNerisIncidentPayload({
  incident = {}, nfirsReport = {}, department = {}, station = {},
  cadAlert = null, unitTimes = null, options = {},
} = {}) {
  const errors = [];
  const warnings = [];
  const unexported = {};

  // NFIRS report fields take priority (long-standing merge precedent).
  const merged = { ...incident, ...nfirsReport };

  // ── Department NERIS id — never hardcoded, never defaulted (F8) ──────────
  const departmentNerisId = strOrNull(
    options.departmentNerisId
    || department.neris_id
    || department.fdid
    || station.fdid
    || nfirsReport.fdid
  ) || '';
  if (!departmentNerisId) {
    errors.push('Missing department NERIS ID — set your department FDID / NERIS ID in Settings');
  } else if (!/^(FD|FM)\d{8}$/.test(departmentNerisId)) {
    warnings.push(`Department ID "${departmentNerisId}" is not NERIS format (FD########) — request your NERIS ID via the NERIS portal before live submission`);
  }

  const incidentNumber = strOrNull(merged.incidentNumber || merged.incident_number) || '';
  if (!incidentNumber) errors.push('Missing incident number');

  // ── Incident types: stored (D2) → legacy crosswalk → error, never default ─
  let incidentTypes = [];
  let typeSource = 'stored';
  const stored = jsonbVal(incident.neris_incident_types);
  if (Array.isArray(stored) && stored.length) {
    incidentTypes = stored
      .filter((t) => t && typeof t.value === 'string')
      .map((t) => ({ type: t.value, primary: t.primary === true }));
  } else {
    typeSource = 'legacy_crosswalk';
    const dotted = merged.neris_type
      || LEGACY_TYPE_MAP[merged.type || merged.incidentType] || null;
    const path = toPath(dotted);
    if (path && isValidIncidentType(path)) {
      incidentTypes = [{ type: path, primary: true }];
    }
  }
  for (const t of incidentTypes) {
    if (!isValidIncidentType(t.type)) {
      errors.push(`Invalid incident type: "${String(t.type).slice(0, 120)}"`);
    }
  }
  if (!incidentTypes.length) {
    typeSource = 'none';
    const raw = merged.neris_type || merged.type || merged.incidentType || '(none)';
    errors.push(`Unmappable incident type: "${String(raw).slice(0, 120)}" — select a NERIS incident type on the incident record`);
  } else if (!incidentTypes.some((t) => t.primary === true)) {
    incidentTypes[0].primary = true;
    warnings.push('No primary incident type flagged — first type marked primary');
  }
  const hasCat = (cat) => incidentTypes.some((t) => typeof t.type === 'string' && t.type.startsWith(`${cat}||`));

  // ── Actions XOR no-action (D3) ────────────────────────────────────────────
  let actionsTactics = null;
  const storedActions = jsonbVal(incident.neris_actions);
  const storedNoaction = strOrNull(incident.neris_noaction);
  let legacyActions = null;
  if ((!Array.isArray(storedActions) || !storedActions.length) && !storedNoaction
      && Array.isArray(merged.actions_taken) && merged.actions_taken.length) {
    legacyActions = merged.actions_taken.map(toPath).filter(Boolean);
  }
  const actionList = (Array.isArray(storedActions) && storedActions.length)
    ? storedActions : legacyActions;
  if (actionList && actionList.length) {
    for (const a of actionList) {
      if (!isValidActionTactic(a)) errors.push(`Invalid action/tactic: "${String(a).slice(0, 120)}"`);
    }
    actionsTactics = { action_noaction: { type: 'ACTION', actions: actionList } };
  } else if (storedNoaction) {
    if (!isValidNoaction(storedNoaction)) {
      errors.push(`Invalid no-action reason: "${String(storedNoaction).slice(0, 120)}"`);
    }
    actionsTactics = { action_noaction: { type: 'NOACTION', noaction_type: storedNoaction } };
  } else {
    warnings.push('No actions taken or no-action reason recorded — record what was done, or why nothing was done');
  }

  // ── Location + point ──────────────────────────────────────────────────────
  let location;
  if (nfirsReport.streetName || nfirsReport.streetNumber) {
    location = {};
    if (strOrNull(nfirsReport.streetNumber)) location.complete_number = String(nfirsReport.streetNumber).trim();
    if (strOrNull(nfirsReport.streetName)) location.street = String(nfirsReport.streetName).trim();
    if (strOrNull(nfirsReport.city)) location.postal_community = String(nfirsReport.city).trim();
    const st = strOrNull(nfirsReport.state) || strOrNull(options.defaultState);
    if (st) location.state = st;
    if (strOrNull(nfirsReport.zip)) location.postal_code = String(nfirsReport.zip).trim();
    location.country = 'US';
  } else {
    location = parseLocation(merged.address, options.defaultState);
  }
  if (!location.street) errors.push('Missing incident address (street)');
  if (location.street && !location.state) {
    warnings.push('Missing state in incident address — set the department state or use a full address');
  }

  let point = null;
  const lat = numOrNull(merged.latitude) ?? numOrNull(cadAlert && cadAlert.latitude);
  const lng = numOrNull(merged.longitude) ?? numOrNull(cadAlert && cadAlert.longitude);
  if (lat !== null && lng !== null) {
    point = { crs: 4326, geometry: { type: 'Point', coordinates: [lng, lat] } };
  } else {
    warnings.push('Missing GPS coordinates — recommended for NERIS submission');
  }

  // ── Narratives (officer-authored only; AI never writes these) ────────────
  let outcomeNarrative = strOrNull(merged.narrative || merged.narrativeStatement || merged.notes);
  if (outcomeNarrative && outcomeNarrative.length > NARRATIVE_MAX) {
    outcomeNarrative = outcomeNarrative.slice(0, NARRATIVE_MAX);
    warnings.push(`Outcome narrative truncated to ${NARRATIVE_MAX} characters (NERIS limit)`);
  }
  let impedimentNarrative = strOrNull(merged.impediment);
  if (impedimentNarrative && impedimentNarrative.length > NARRATIVE_MAX) {
    impedimentNarrative = impedimentNarrative.slice(0, NARRATIVE_MAX);
    warnings.push(`Impediment narrative truncated to ${NARRATIVE_MAX} characters (NERIS limit)`);
  }
  if (!outcomeNarrative) warnings.push('Missing narrative — recommended for a complete NERIS report');

  // ── Unit responses ────────────────────────────────────────────────────────
  const incDate = merged.incidentDate || incident.date;
  const tDispatch = localToUtcIso(incDate, merged.dispatchTime || merged.alarmTime || incident.time);
  const tEnroute = localToUtcIso(incDate, merged.enrouteTime);
  const tOnScene = localToUtcIso(incDate, merged.onSceneTime || merged.arrivalTime);
  const tClear = localToUtcIso(incDate, merged.unitClearTime || merged.clearedTime);

  let unitResponses = [];
  if (Array.isArray(unitTimes) && unitTimes.length) {
    unitResponses = unitTimes.map((u) => {
      const r = { reported_unit_id: strOrNull(u.unit || u.designation || u.reported_unit_id) || 'UNKNOWN' };
      const d = anyToIso(u.dispatch || u.dispatched_at); if (d) r.dispatch = d;
      const e = anyToIso(u.enroute || u.enroute_at); if (e) r.enroute_to_scene = e;
      const o = anyToIso(u.on_scene || u.on_scene_at); if (o) r.on_scene = o;
      const c = anyToIso(u.unit_clear || u.cleared_at); if (c) r.unit_clear = c;
      return r;
    });
  } else {
    const units = normalizeUnits(merged.respondingUnits || incident.units);
    unitResponses = units.map((uid) => {
      const r = { reported_unit_id: uid };
      if (tDispatch) r.dispatch = tDispatch;
      if (tEnroute) r.enroute_to_scene = tEnroute;
      if (tOnScene) r.on_scene = tOnScene;
      if (tClear) r.unit_clear = tClear;
      return r;
    });
  }
  // ── Registered-unit linkage (SR-D5): when the caller supplies the dept's
  // registered-unit map (designation → neris_unit_id, from utils/nerisRegistry
  // .registeredUnitMap), an EXACT designation match attaches unit_neris_id
  // alongside the verbatim reported_unit_id. Never fuzzy, never guessed — an
  // unmatched designation simply exports without the registry link (the spec's
  // own fallback semantics). Clean national unit attribution ahead of NERIS's
  // 2026 data-quality flagging.
  const registeredUnits = (options.registeredUnits && typeof options.registeredUnits === 'object')
    ? options.registeredUnits : null;
  if (registeredUnits) {
    for (const r of unitResponses) {
      const uid = registeredUnits[r.reported_unit_id];
      if (typeof uid === 'string' && uid) r.unit_neris_id = uid;
    }
  }
  if (!unitResponses.length) warnings.push('No unit response data — add responding units with timestamps');

  // ── Dispatch block (API-required) ─────────────────────────────────────────
  // PSAP call times (P2-D4/F28): ONE precedence rule — the CAD-carried column
  // wins, the officer-entered fallback (incidents.neris_dispatch_times) is next,
  // and a time NOBODY recorded stays a validation error. Never defaulted, never
  // invented (no call_answered := call_create).
  const officerTimes = jsonbVal(incident.neris_dispatch_times);
  const officerTimesObj = (officerTimes && typeof officerTimes === 'object' && !Array.isArray(officerTimes)) ? officerTimes : {};
  // call_create is a PSAP time. It comes from the CAD integration or it does not
  // exist — the same rule P2-D4 already applies to call_answered and call_arrival.
  //
  // 🔴 THE `|| tDispatch` FALLBACK THAT USED TO BE HERE WAS A HOLE (removed 2026-08-08,
  // Matt's ruling). `tDispatch` resolves to merged.dispatchTime || merged.alarmTime ||
  // incident.time, and the Command Board used to WRITE incident.time from
  // milestones.dispatched — on a manual activation, the moment a dispatcher clicked
  // "Activate Incident". So the click moment became the 911 call time on a subpoenable
  // record, and it slipped past P2-D4 because it never touched a NERIS-named field: it
  // rode in as a generic column and only became a PSAP time inside this transformer.
  // The board's writer is gone; this fallback goes with it. A time nobody recorded stays
  // a validation error (below) — never an invented one.
  //
  // THE ASYMMETRY THAT WAS THE REAL BUG (fixed 2026-08-08). `call_answered` and
  // `call_arrival` each have TWO legs: the CAD column, then an explicit, purpose-named
  // value an officer typed off the dispatch report — and `null` (→ validation error) if
  // neither exists. `call_create` had only ONE leg and then reached for `tDispatch`, a
  // GENERIC incident column. So it was the only PSAP time in the payload that software
  // could manufacture, and the Command Board was simply the ugliest way that column got
  // populated. Giving it the same second leg as its siblings is what actually closes the
  // class of defect; deleting the board writer only closed one door into it.
  //
  // NERIS v1.4.78 makes all three REQUIRED on DispatchPayload, and defines call_create as
  // "Timestamp at which call processing begins" — a PSAP fact. It comes from the CAD, or
  // from a human who read the dispatch record. Never from us.
  const callCreate = anyToIso(cadAlert && cadAlert.dispatched_at)
    || anyToIso(officerTimesObj.call_create) || null;
  const incidentClear = anyToIso(cadAlert && cadAlert.cleared_at) || tClear;
  const dispatch = {
    incident_number: incidentNumber,
    call_create: callCreate,
    call_answered: anyToIso(cadAlert && cadAlert.call_answered_at)
      || anyToIso(officerTimesObj.call_answered) || null,
    call_arrival: anyToIso(cadAlert && cadAlert.call_arrival_at)
      || anyToIso(officerTimesObj.call_arrival) || null,
    location,
    unit_responses: unitResponses,
  };
  if (incidentClear) dispatch.incident_clear = incidentClear;
  const cadDisposition = strOrNull(cadAlert && cadAlert.disposition);
  if (cadDisposition && cadDisposition !== 'cad_closed') dispatch.disposition = cadDisposition.slice(0, 255);
  if (!dispatch.call_create) errors.push('Missing dispatch call_create time (required by NERIS)');
  if (!dispatch.call_answered) errors.push('Missing dispatch call_answered time (required by NERIS — capture from CAD or enter it in the dispatch times section)');
  if (!dispatch.call_arrival) errors.push('Missing dispatch call_arrival time (required by NERIS — capture from CAD or enter it in the dispatch times section)');

  // ── Conditional modules — build the spec shapes from what's stored; never guess ──
  // Fire (required when a FIRE type is final). FirePayload's location_detail is
  // a discriminated union — the emitted const `type` comes from the branch WE
  // build (F24), so STRUCTURE data can never ride out under an OUTSIDE const
  // (or vice versa). Unknown/missing branch type → no location_detail is
  // emitted and the per-required-field errors below name it.
  let fireDetail = null;
  const storedFire = jsonbVal(incident.neris_fire_detail);
  if (storedFire && typeof storedFire === 'object' && !Array.isArray(storedFire)) {
    fireDetail = {};
    const ld = (storedFire.location_detail && typeof storedFire.location_detail === 'object'
                && !Array.isArray(storedFire.location_detail)) ? storedFire.location_detail : null;
    if (ld && ld.type === 'OUTSIDE') {
      const out = { type: 'OUTSIDE' };
      if (strOrNull(ld.cause)) out.cause = ld.cause;
      const acres = numOrNull(ld.acres_burned);
      if (acres !== null) out.acres_burned = acres;
      fireDetail.location_detail = out;
    } else if (ld && ld.type === 'STRUCTURE') {
      const st = { type: 'STRUCTURE' };
      if (ld.floor_of_origin !== undefined && ld.floor_of_origin !== null) {
        st.floor_of_origin = ld.floor_of_origin; // negative = below grade; 0 = unknown
      }
      for (const k of ['arrival_condition', 'damage_type', 'room_of_origin_type', 'cause']) {
        if (strOrNull(ld[k])) st[k] = ld[k];
      }
      if (typeof ld.progression_evident === 'boolean') st.progression_evident = ld.progression_evident;
      fireDetail.location_detail = st;
    }
    if (strOrNull(storedFire.water_supply)) fireDetail.water_supply = storedFire.water_supply;
    if (strOrNull(storedFire.investigation_needed)) fireDetail.investigation_needed = storedFire.investigation_needed;
    if (Array.isArray(storedFire.investigation_types)) fireDetail.investigation_types = storedFire.investigation_types;
    if (Array.isArray(storedFire.suppression_appliances) && storedFire.suppression_appliances.length) {
      fireDetail.suppression_appliances = storedFire.suppression_appliances;
    }
    // Legacy pre-P2 keys (top-level condition_arrival, etc.): no lossless home
    // in FirePayload — preserved, not guessed into a branch (F8).
    const legacyFireKeys = Object.keys(storedFire).filter((k) => ![
      'location_detail', 'water_supply', 'investigation_needed',
      'investigation_types', 'suppression_appliances',
    ].includes(k));
    if (legacyFireKeys.length) {
      unexported.fire = {};
      for (const k of legacyFireKeys) unexported.fire[k] = storedFire[k];
      warnings.push('Legacy fire-detail fields have no lossless FirePayload home — preserved in _meta.unexported');
    }
    if (!Object.keys(fireDetail).length) fireDetail = null;
  }
  const fireErrorsBefore = errors.length;
  if (hasCat('FIRE')) {
    const f = fireDetail || {};
    for (const req of ['location_detail', 'water_supply', 'investigation_needed', 'investigation_types']) {
      if (f[req] === undefined || f[req] === null) {
        errors.push(`Fire module: missing required field "${req}" (fire-typed incident)`);
      }
    }
    const ld = f.location_detail;
    if (ld && ld.type === 'STRUCTURE') {
      for (const req of ['floor_of_origin', 'arrival_condition', 'damage_type', 'room_of_origin_type', 'cause']) {
        if (ld[req] === undefined || ld[req] === null) {
          errors.push(`Fire module: location_detail missing required "${req}" (STRUCTURE branch)`);
        }
      }
    } else if (ld && ld.type === 'OUTSIDE') {
      if (ld.cause === undefined || ld.cause === null) {
        errors.push('Fire module: location_detail missing required "cause" (OUTSIDE branch)');
      }
    }
  }
  // Completeness input: the fire module counts complete when the incident is
  // not fire-typed, or when it is and every branch-required field is present.
  const fireModuleComplete = !hasCat('FIRE') || errors.length === fireErrorsBefore;

  // Hazsit (evacuated + disposition required when a HAZSIT type is final)
  let hazsitDetail = null;
  const storedHazsit = jsonbVal(incident.neris_hazsit_detail);
  if (storedHazsit && typeof storedHazsit === 'object') {
    hazsitDetail = {};
    if (storedHazsit.evacuated !== undefined && storedHazsit.evacuated !== null) {
      hazsitDetail.evacuated = storedHazsit.evacuated;
    }
    if (strOrNull(storedHazsit.disposition)) hazsitDetail.disposition = storedHazsit.disposition;
    if (Array.isArray(storedHazsit.chemicals) && storedHazsit.chemicals.length) {
      hazsitDetail.chemicals = storedHazsit.chemicals;
    }
    // Legacy ICS hazmat block (material/ppe/decon/section narratives/cost):
    // no lossless home in HazsitPayload — preserved, not guessed (F8).
    const legacyKeys = Object.keys(storedHazsit)
      .filter((k) => !['evacuated', 'disposition', 'chemicals'].includes(k));
    if (legacyKeys.length) {
      unexported.hazmat = {};
      for (const k of legacyKeys) unexported.hazmat[k] = storedHazsit[k];
    }
    if (!Object.keys(hazsitDetail).length) hazsitDetail = null;
  }
  if (hasCat('HAZSIT')) {
    if (!hazsitDetail || hazsitDetail.evacuated === undefined) {
      errors.push('Hazsit module: missing required field "evacuated" (hazsit-typed incident)');
    }
    if (!hazsitDetail || !hazsitDetail.disposition) {
      errors.push('Hazsit module: missing required field "disposition" (hazsit-typed incident)');
    }
  }

  // Medical (one entry per patient; patient_care_evaluation required per entry)
  let medicalDetails = null;
  const storedMedical = jsonbVal(incident.neris_medical_details);
  if (Array.isArray(storedMedical) && storedMedical.length) {
    medicalDetails = storedMedical;
    storedMedical.forEach((m, i) => {
      if (!m || !strOrNull(m.patient_care_evaluation)) {
        errors.push(`Medical module: patient ${i + 1} missing required "patient_care_evaluation"`);
      }
    });
  } else if (hasCat('MEDICAL')) {
    warnings.push('Medical-typed incident with no per-patient details — add patient care evaluation(s)');
  }

  // Aid
  let aids = null;
  const storedAids = jsonbVal(incident.neris_aids);
  if (Array.isArray(storedAids) && storedAids.length) {
    aids = storedAids;
    storedAids.forEach((a, i) => {
      for (const req of ['department_neris_id', 'aid_type', 'aid_direction']) {
        if (!a || !strOrNull(a[req])) errors.push(`Aid entry ${i + 1}: missing required "${req}"`);
      }
      // NERIS cross-field rule 17: an aid entity cannot be the incident's own entity.
      if (a && departmentNerisId && a.department_neris_id === departmentNerisId) {
        errors.push(`Aid entry ${i + 1}: the aid department cannot be your own department (${departmentNerisId})`);
      }
    });
  }

  // ── Fire Protection modules (FP, migration 0063) ──────────────────────────
  // The five IncidentPayload alarm/suppression modules, stored VERBATIM in
  // incidents.neris_fire_protection (the spec's own shape — D2) and emitted as
  // TOP-LEVEL payload keys: in the spec they are SIBLINGS of fire_detail, not
  // children of it. Requirement rule mirrored from the live NERIS validator
  // (the 422 proven live 2026-07-20): a FIRE||STRUCTURE_FIRE incident requires
  // smoke_alarm + fire_alarm + other_alarm + fire_suppression — and a
  // FIRE||STRUCTURE_FIRE||CONFINED_COOKING_APPLIANCE_FIRE type additionally
  // requires cooking_fire_suppression — unless ALL aids are SUPPORT_AID GIVEN
  // (we only supported another department's call). No aids recorded = we were
  // primary = modules required. Value membership is nerisValidate's job; the
  // shape gate here only refuses to emit a block with no presence answer.
  const FP_MODULE_KEYS = ['smoke_alarm', 'fire_alarm', 'other_alarm', 'fire_suppression'];
  const fpErrorsBefore = errors.length;
  const storedFireProtection = jsonbVal(incident.neris_fire_protection);
  const fireProtection = {};
  if (storedFireProtection && typeof storedFireProtection === 'object' && !Array.isArray(storedFireProtection)) {
    for (const k of [...FP_MODULE_KEYS, 'cooking_fire_suppression']) {
      const mod = storedFireProtection[k];
      if (mod === undefined || mod === null) continue;
      if (mod && typeof mod === 'object' && !Array.isArray(mod)
          && mod.presence && typeof mod.presence === 'object' && !Array.isArray(mod.presence)
          && strOrNull(mod.presence.type)) {
        fireProtection[k] = mod;   // verbatim spec shape — values validated by nerisValidate
      } else {
        errors.push(`Fire protection: "${k}" is malformed — expected { presence: { type: "PRESENT" | "NOT_PRESENT" | "NOT_APPLICABLE", ... } }`);
      }
    }
  }
  // Hierarchical path membership (structural, like hasCat): any 3-level
  // structure-fire subtype IS a structure fire. Values were exact-validated above.
  const hasStructureFireType = incidentTypes.some((t) => typeof t.type === 'string'
    && (t.type === 'FIRE||STRUCTURE_FIRE' || t.type.startsWith('FIRE||STRUCTURE_FIRE||')));
  const hasConfinedCookingType = incidentTypes.some((t) =>
    t.type === 'FIRE||STRUCTURE_FIRE||CONFINED_COOKING_APPLIANCE_FIRE');
  const allAidsSupportGiven = Array.isArray(storedAids) && storedAids.length > 0
    && storedAids.every((a) => a && a.aid_type === 'SUPPORT_AID' && a.aid_direction === 'GIVEN');
  if (hasStructureFireType && !allAidsSupportGiven) {
    for (const k of FP_MODULE_KEYS) {
      if (!fireProtection[k]) {
        errors.push(`Fire protection: "${k}" module is required for a structure fire — answer Present / Not Present / Not Applicable`);
      }
    }
    if (hasConfinedCookingType && !fireProtection.cooking_fire_suppression) {
      errors.push('Fire protection: "cooking_fire_suppression" module is required for a confined cooking appliance fire');
    }
  }
  const fireProtectionComplete = errors.length === fpErrorsBefore;

  // Casualty/rescue entries (P2-D2): our stored capture format → the spec's
  // CasualtyRescuePayload discriminated unions. Emit ONLY what we capture
  // honestly — never a guessed sub-object.
  //   injury NONE            → NoinjuryPayload { type: 'UNINJURED' } (the spec const)
  //   injury INJURED_*       → InjuryPayload { type, cause? }
  //   rescue_type NONFF-perf → NonFfRescuePayload { type } (only `type` required)
  //   rescue_type FF-perf + removal captured → FfRescuePayload with the
  //     removal_or_nonremoval union (REMOVAL_FROM_STRUCTURE → RemovalPayload;
  //     EXTRICATION/DISENTANGLEMENT/RECOVERY/OTHER → NonremovalPayload)
  //   rescue_type FF-perf, NO removal captured → OMITTED + warning naming the
  //     gap (FfRescuePayload REQUIRES removal_or_nonremoval — never invented).
  // NOTE (corrected same-session): entry.type = WHO THE PERSON IS; rescue_type
  // = who PERFORMED the rescue. Any combination is valid — a civilian rescued
  // by a firefighter is NONFF + RESCUED_BY_FIREFIGHTER.
  const FF_PERFORMED_RESCUES = ['RESCUED_BY_FIREFIGHTER', 'RESCUED_BY_FF_RIT', 'EVAC_ASSISTED_BY_FIREFIGHTER'];
  let casualtyRescues = null;
  const storedCasualties = jsonbVal(incident.neris_casualty_rescues);
  if (Array.isArray(storedCasualties) && storedCasualties.length) {
    casualtyRescues = storedCasualties
      .filter((e) => e && typeof e === 'object')
      .map((e, i) => {
        const entry = { type: e.type };
        if (e.injury === 'NONE') {
          entry.casualty = { injury_or_noninjury: { type: 'UNINJURED' } };
        } else if (e.injury === 'INJURED_NONFATAL' || e.injury === 'INJURED_FATAL') {
          const injury = { type: e.injury };
          if (strOrNull(e.cause)) injury.cause = e.cause;
          entry.casualty = { injury_or_noninjury: injury };
        }
        if (strOrNull(e.rescue_type)) {
          if (FF_PERFORMED_RESCUES.includes(e.rescue_type)) {
            if (strOrNull(e.removal)) {
              entry.rescue = {
                ffrescue_or_nonffrescue: {
                  type: e.rescue_type,
                  removal_or_nonremoval: { type: e.removal },
                },
              };
            } else {
              warnings.push(`Casualty/rescue entry ${i + 1}: firefighter-performed rescue "${e.rescue_type}" is missing the removal method NERIS requires — record how the person was removed, or the rescue sub-object is omitted from the export`);
            }
          } else {
            entry.rescue = { ffrescue_or_nonffrescue: { type: e.rescue_type } };
          }
        }
        return entry;
      });
    if (!casualtyRescues.length) casualtyRescues = null;
  }

  // Casualty counts + detector/sprinkler: OF stores counts/labels; the live
  // spec wants structured payloads → preserve + warn ONLY when there are no
  // structured entries (structured capture supersedes the legacy counts path).
  const casualtyCounts = {
    ff_deaths: numOrNull(merged.fsDeaths ?? merged.firefighterDeaths, parseInt),
    ff_injuries: numOrNull(merged.fsInjuries ?? merged.firefighterInjuries, parseInt),
    civilian_deaths: numOrNull(merged.civilianDeaths, parseInt),
    civilian_injuries: numOrNull(merged.civilianInjuries, parseInt),
  };
  if (!casualtyRescues && Object.values(casualtyCounts).some((v) => v !== null && v > 0)) {
    unexported.casualty_counts = casualtyCounts;
    warnings.push('Casualty counts recorded but structured casualty/exposure payloads are not yet captured — counts preserved in _meta.unexported');
  }
  const riskReduction = {
    detector_present: merged.detectorPresence ?? null,
    detector_operation: merged.detectorOperation ?? null,
    sprinkler_present: merged.sprinklerPresence ?? null,
    sprinkler_operation: merged.sprinklerOperation ?? null,
  };
  // Structured fire-protection capture supersedes the legacy detector/sprinkler
  // labels (same pattern as casualty counts) — legacy values are NEVER crosswalked
  // into the modules (no silent defaulting of a legal record; the result_code
  // lesson). Preserved + flagged only when no structured capture exists.
  if (Object.values(riskReduction).some((v) => v !== null && v !== undefined && v !== '')
      && !Object.keys(fireProtection).length) {
    unexported.risk_reduction = riskReduction;
    warnings.push('Legacy detector/sprinkler labels recorded but the Fire Protection modules are not filled in — record them in the Fire Protection section (legacy labels are never auto-mapped); preserved in _meta.unexported');
  }
  const lossFigures = {
    property_loss: numOrNull(merged.propertyLoss),
    contents_loss: numOrNull(merged.contentsLoss),
  };
  if (lossFigures.property_loss !== null || lossFigures.contents_loss !== null) {
    unexported.loss = lossFigures;
    warnings.push('Loss estimates recorded but the NERIS fire location-detail loss mapping is Phase 2 — preserved in _meta.unexported');
  }
  const controlledIso = localToUtcIso(incDate, merged.controlledTime);
  if (controlledIso) {
    unexported.time_fire_control = controlledIso;
    warnings.push('Fire-controlled time recorded — tactic timestamps mapping is Phase 2; preserved in _meta.unexported');
  }

  // ── Assemble ──────────────────────────────────────────────────────────────
  const base = {
    department_neris_id: departmentNerisId,
    incident_number: incidentNumber,
    location,
  };
  if (point) base.point = point;
  if (outcomeNarrative) base.outcome_narrative = outcomeNarrative;
  if (impedimentNarrative) base.impediment_narrative = impedimentNarrative;
  const peoplePresent = (numOrNull(merged.injuries, parseInt) || 0) > 0
    || (casualtyCounts.civilian_deaths || 0) > 0
    || (casualtyCounts.civilian_injuries || 0) > 0;
  base.people_present = peoplePresent;
  const displaced = numOrNull(merged.displacedNumber, parseInt);
  if (displaced !== null) base.displacement_count = displaced;
  const animals = numOrNull(merged.animalRescues, parseInt);
  if (animals !== null) base.animals_rescued = animals;

  const payload = {
    base,
    incident_types: incidentTypes,
    dispatch,
    actions_tactics: actionsTactics,
    unit_responses: unitResponses,
    fire_detail: fireDetail,
    hazsit_detail: hazsitDetail,
    medical_details: medicalDetails,
    casualty_rescues: casualtyRescues,
    aids,
    // Fire Protection modules (FP) — top-level IncidentPayload siblings of
    // fire_detail, emitted verbatim from incidents.neris_fire_protection.
    smoke_alarm: fireProtection.smoke_alarm || null,
    fire_alarm: fireProtection.fire_alarm || null,
    other_alarm: fireProtection.other_alarm || null,
    fire_suppression: fireProtection.fire_suppression || null,
    cooking_fire_suppression: fireProtection.cooking_fire_suppression || null,
  };

  // ── Completeness (15 checks; 12 adapted from the old client validator +
  //    Phase-2's fire-module and PSAP-call-times checks + FP's fire-protection
  //    check) ─────────────────────────────────────────────────────────────────
  const checks = [
    !!departmentNerisId,
    !!incidentNumber,
    incidentTypes.length > 0,
    !!point,
    !!location.street,
    !!dispatch.call_create,
    unitResponses.length > 0,
    !!actionsTactics,
    !!outcomeNarrative,
    !!location.state,
    !!incidentClear,
    base.people_present !== undefined,
    fireModuleComplete,
    !!(dispatch.call_answered && dispatch.call_arrival),
    fireProtectionComplete,
  ];
  const completeness = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  const _meta = {
    spec_version: NERIS_SPEC_VERSION,
    payload_shape: 'IncidentPayload/v1',
    export_date: new Date().toISOString(),
    source: 'OpenFirehouse',
    type_source: typeSource,
    department_name: department.name || '',
    station_name: station.name || '',
    original_incident_number: incidentNumber,
    original_nfirs_report_id: nfirsReport.id || null,
    original_incident_id: incident.id || null,
    unexported: Object.keys(unexported).length ? unexported : null,
  };

  return {
    payload,
    validation: { valid: errors.length === 0, errors, warnings, completeness },
    _meta,
  };
}

module.exports = {
  buildNerisIncidentPayload,
  // exported for tests (drift check + timestamp goldens)
  LEGACY_TYPE_MAP,
  localToUtcIso,
  toPath,
  numOrNull,
};
