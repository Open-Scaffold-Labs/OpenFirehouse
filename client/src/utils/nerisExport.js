/**
 * nerisExport.js — Transform OpenFirehouse incident data into NERIS-compliant JSON
 *
 * Based on the NERIS Core Data Schema v1.0 (ulfsri/neris-framework).
 * Generates the `core_mod_incident` structure for each incident report.
 *
 * Usage:
 *   import { toNerisIncident, validateNerisIncident, exportNerisBundle } from './nerisExport';
 *   const neris = toNerisIncident(nfirsReport, incidentData);
 *   const { valid, errors } = validateNerisIncident(neris);
 */

import { NERIS_INCIDENT_TYPES, LEGACY_TYPE_MAP } from '../data/nerisTypes';
import { getStateRules, applyStateRules } from '../data/stateNerisRules';

// ─── NERIS ID Generation ────────────────────────────────────────────────────

/**
 * Generate a NERIS incident ID in the format FDID:epoch_ms
 * e.g. "FD14001:1714762619000"
 *
 * W4.1 (2026-06-10): an unparseable date used to land verbatim as "FDID:NaN"
 * in a state submission id. Now falls back to Date.now(), same as no date.
 */
export function generateNerisId(fdid, incidentDate) {
  let epoch = incidentDate ? new Date(incidentDate).getTime() : Date.now();
  if (!Number.isFinite(epoch)) epoch = Date.now();
  return `${fdid}:${epoch}`;
}


// ─── Address Parser ─────────────────────────────────────────────────────────

/**
 * Parse a free-form address string into NERIS civic location fields.
 * This is a best-effort parser — real NERIS submissions should use
 * structured address entry or geocoding.
 */
function parseCivicLocation(address, defaultState = '') {
  if (!address) return {};

  const parts = address.split(',').map(s => s.trim());
  const streetPart = parts[0] || '';
  const city = parts[1] || '';
  const stateZip = parts[2] || '';

  // Try to extract street number and name
  const streetMatch = streetPart.match(/^(\d+[\w-]*)\s+(.+)/);
  const an_number = streetMatch ? streetMatch[1] : '';
  const streetName = streetMatch ? streetMatch[2] : streetPart;

  // Try to extract state and zip
  const szMatch = stateZip.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/);

  return {
    an_number,
    an_complete: an_number,
    sn_street_name: streetName,
    csop_postal_comm: city,
    // W4.1: no more hardcoded 'NJ' fallback — an address with no parseable
    // state uses the department's configured state (options.defaultState),
    // else empty + validation warning. Nationwide departments shouldn't get
    // silently filed as New Jersey.
    csop_state: szMatch ? szMatch[1] : (stateZip || defaultState || ''),
    csop_postal_code: szMatch ? szMatch[2] || '' : '',
    csop_country: 'US',
  };
}


// ─── NERIS Type Mapping ─────────────────────────────────────────────────────

/**
 * Convert a neris_type dotted code (e.g. "FIRE.STRUCTURE_FIRE.CHIMNEY_FIRE")
 * into the NERIS incident_final_type array format: [[cat, sub, type]]
 */
function mapIncidentType(nerisType, legacyType) {
  let code = nerisType;
  if (!code && legacyType) {
    code = LEGACY_TYPE_MAP[legacyType];
  }
  if (!code) return [['PUBSERV', 'CITIZEN_ASSIST', 'CITIZEN_ASSIST_SERVICE_CALL']];

  const parts = code.split('.');
  return [parts]; // Array of arrays — NERIS supports multiple types
}


// ─── Actions Mapping ────────────────────────────────────────────────────────

/**
 * Convert actions_taken array (e.g. ["COMMAND_AND_CONTROL.ESTABLISH_INCIDENT_COMMAND"])
 * into NERIS incident_actions_taken format: [[cat, subcat, detail], ...]
 */
function mapActionsTaken(actions) {
  if (!actions || !actions.length) return [];
  return actions.map(a => {
    const parts = a.split('.');
    return parts;
  });
}


// ─── Unit Response Builder ──────────────────────────────────────────────────

/**
 * Build unit_response array from incident data.
 * Uses available timestamp data from the incident and NFIRS report.
 */
/**
 * W4.1 (2026-06-10): times used to be emitted as `${date}T${HH:MM}:00Z` —
 * stamping the department's LOCAL wall-clock time with a Z (UTC) suffix, so
 * every state submission was off by the UTC offset. Now the local wall-clock
 * is parsed in the exporting browser's timezone (the department's own) and
 * converted to real UTC via toISOString(). Unparseable date/time pairs emit
 * no timestamp rather than a corrupt one. Also: controlledTime was read and
 * then silently dropped — now emitted as time_fire_control.
 */
function localToUtcIso(date, hhmm) {
  if (!date || !hhmm) return null;
  const t = new Date(`${date}T${hhmm}:00`);
  return Number.isFinite(t.getTime()) ? t.toISOString() : null;
}

function buildUnitResponse(incident, nfirsReport) {
  const units = incident?.units || [];
  if (!units.length) return [];

  // Get timestamps from NFIRS report if available
  const alarm = nfirsReport?.alarmTime || incident?.time;
  const arrival = nfirsReport?.arrivalTime;
  const controlled = nfirsReport?.controlledTime;
  const cleared = nfirsReport?.clearedTime;
  const date = nfirsReport?.incidentDate || incident?.date;

  const tDispatch = localToUtcIso(date, alarm);
  const tOnScene = localToUtcIso(date, arrival);
  const tControl = localToUtcIso(date, controlled);
  const tClear = localToUtcIso(date, cleared);

  return units.map(unitId => {
    const response = {
      unit_id_reported: unitId,
    };
    if (tDispatch) response.time_dispatch = tDispatch;
    if (tOnScene) response.time_on_scene = tOnScene;
    if (tControl) response.time_fire_control = tControl;
    if (tClear) response.time_unit_clear = tClear;
    return response;
  });
}

/** W4.1: numeric parse that PRESERVES legitimate zeros ($0 loss is data, not
 * absence) — only null/undefined/'' map to null. */
function numOrNull(v, parser = parseFloat) {
  if (v === null || v === undefined || v === '') return null;
  const n = parser(v);
  return Number.isFinite(n) ? n : null;
}


// ─── Main Transformer ───────────────────────────────────────────────────────

/**
 * Transform an OpenFirehouse NFIRS report + incident data into a
 * NERIS-compliant incident JSON object.
 *
 * @param {Object} nfirsReport - The NFIRS report record (from nfirs_reports table)
 * @param {Object} incident - The incident record (from incidents table or demo data)
 * @param {Object} options - { fdid, stationName }
 * @returns {Object} NERIS-compliant incident object
 */
export function toNerisIncident(nfirsReport = {}, incident = {}, options = {}) {
  // W4.1: no more hardcoded 'NJ14-001' fallback — a missing FDID becomes an
  // empty id segment + a validation ERROR, not a silent New Jersey default.
  const fdid = options.fdid || nfirsReport.fdid || '';
  const incidentDate = nfirsReport.incidentDate || incident.date;
  const incidentTime = nfirsReport.alarmTime || incident.time;

  // Merge data from both sources — NFIRS report fields take priority
  const merged = { ...incident, ...nfirsReport };

  // Build the NERIS document
  const neris = {
    // ─── Identification ──────────────────────────────────────────────
    incident_neris_id: generateNerisId(fdid, incidentDate),
    incident_internal_id: merged.incidentNumber || merged.incident_number || '',

    // ─── Type Classification ─────────────────────────────────────────
    incident_final_type: mapIncidentType(
      merged.neris_type,
      merged.type || merged.incidentType
    ),
    incident_final_type_primary: [true], // First type is primary

    // ─── Location ────────────────────────────────────────────────────
    incident_point: null, // GPS coordinates — filled if available
    incident_location: parseCivicLocation(merged.address, options.defaultState),
    incident_people_present: merged.injuries > 0 || merged.civilianDeaths > 0 || merged.civilianInjuries > 0,

    // ─── Displacement ────────────────────────────────────────────────
    incident_displaced_number: merged.displacedNumber || 0,

    // ─── Rescues ─────────────────────────────────────────────────────
    incident_rescue_animal: merged.animalRescues || 0,

    // ─── Actions Taken ───────────────────────────────────────────────
    incident_actions_taken: mapActionsTaken(merged.actions_taken),

    // ─── Unit Response ───────────────────────────────────────────────
    unit_response: buildUnitResponse(incident, nfirsReport),

    // ─── Risk Reduction (alarms & suppression) ───────────────────────
    risk_reduction: {
      detector_present: merged.detectorPresence || null,
      detector_operation: merged.detectorOperation || null,
      sprinkler_present: merged.sprinklerPresence || null,
      sprinkler_operation: merged.sprinklerOperation || null,
    },

    // ─── Aid ─────────────────────────────────────────────────────────
    incident_aid_direction: merged.aidDirection || null,
    incident_aid_type: merged.aidType || null,
    incident_aid_department_name: merged.aidDepartment ? [merged.aidDepartment] : [],

    // ─── Narrative ───────────────────────────────────────────────────
    incident_narrative_outcome: merged.narrative || merged.notes || '',
    incident_narrative_impediment: merged.impediment || null,

    // ─── Casualties (mapped to rescue modules) ───────────────────────
    rescue_ff: [],
    rescue_nonff: [],

    // ─── Metadata ────────────────────────────────────────────────────
    _meta: {
      neris_version: '1.0',
      export_date: new Date().toISOString(),
      source: 'OpenFirehouse',
      fdid,
      station_name: options.stationName || '',
      original_incident_number: merged.incidentNumber || '',
      original_nfirs_report_id: nfirsReport.id || null,
    },
  };

  // ─── GPS coordinates if available ──────────────────────────────────
  if (merged.latitude && merged.longitude) {
    neris.incident_point = {
      type: 'Point',
      coordinates: [parseFloat(merged.longitude), parseFloat(merged.latitude)],
    };
  }

  // ─── Conditional: Fire module ──────────────────────────────────────
  const catCode = merged.neris_category || (merged.neris_type || '').split('.')[0];
  if (catCode === 'FIRE') {
    // W4.1: numeric fields go through numOrNull — the old truthiness checks
    // turned a legitimate $0 loss (or 0 stories) into null, silently deleting
    // reported data from a state submission.
    neris.fire = {
      structure_type: merged.structureType || null,
      stories_above_grade: numOrNull(merged.storiesAbove, parseInt),
      stories_below_grade: numOrNull(merged.storiesBelow, parseInt),
      fire_origin: merged.fireOrigin || null,
      fire_cause: merged.fireCause || null,
      fire_condition_on_arrival: merged.conditionOnArrival || null,
      property_loss: numOrNull(merged.propertyLoss),
      contents_loss: numOrNull(merged.contentsLoss),
    };
  }

  // ─── Conditional: HazSit module ────────────────────────────────────
  if (catCode === 'HAZSIT' || merged.hazmat_material) {
    neris.hazsit = {
      material: merged.hazmat_material || null,
      hazmat_class: merged.hazmat_class || null,
      quantity: merged.hazmat_quantity || null,
      ppe_level: merged.hazmat_ppe_level || null,
      decon_performed: merged.hazmat_decon || false,
      erg_guide: merged.hazmat_erg_guide || null,
      operations_narrative: merged.hazmat_operations || null,
      planning_narrative: merged.hazmat_planning || null,
      logistics_narrative: merged.hazmat_logistics || null,
      finance_narrative: merged.hazmat_finance || null,
      contractor: merged.hazmat_contractor || null,
      estimated_cost: merged.hazmat_cost || null,
    };
  }

  // ─── Conditional: Medical module ───────────────────────────────────
  if (catCode === 'MEDICAL') {
    neris.medical = [{
      patient_count: merged.injuries || 0,
      // Additional medical fields would come from a future EMS module
    }];
  }

  // ─── Casualty mapping ─────────────────────────────────────────────
  if (merged.firefighterDeaths > 0 || merged.firefighterInjuries > 0) {
    neris.rescue_ff.push({
      ff_deaths: parseInt(merged.firefighterDeaths) || 0,
      ff_injuries: parseInt(merged.firefighterInjuries) || 0,
    });
  }
  if (merged.civilianDeaths > 0 || merged.civilianInjuries > 0) {
    neris.rescue_nonff.push({
      civilian_deaths: parseInt(merged.civilianDeaths) || 0,
      civilian_injuries: parseInt(merged.civilianInjuries) || 0,
    });
  }

  // ─── No-action reason ─────────────────────────────────────────────
  if (!neris.incident_actions_taken.length) {
    if (merged.disposition === 'Cancelled En Route') {
      neris.incident_noaction = 'CANCELLED';
    } else if (merged.disposition === 'No Action Required') {
      neris.incident_noaction = 'NO_INCIDENT_FOUND';
    }
  }

  return neris;
}


// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate a NERIS incident object against required fields.
 * Returns { valid: boolean, errors: string[], warnings: string[], completeness: number }
 */
export function validateNerisIncident(neris, options = {}) {
  const errors = [];
  const warnings = [];

  // Required fields
  if (!neris.incident_neris_id) errors.push('Missing incident_neris_id');
  // W4.1: a missing FDID used to silently become 'NJ14-001'; now it's empty
  // and a hard error — a submission can't be attributed without it.
  if (!neris._meta?.fdid || String(neris.incident_neris_id || '').startsWith(':')) {
    errors.push('Missing FDID — set your department FDID in Station Settings');
  }
  if (neris.incident_location && !neris.incident_location.csop_state && neris.incident_location.sn_street_name) {
    warnings.push('Missing state in incident address — set the department state or use a full address');
  }
  if (!neris.incident_internal_id) errors.push('Missing incident_internal_id (incident number)');

  if (!neris.incident_final_type || !neris.incident_final_type.length) {
    errors.push('Missing incident_final_type (incident classification)');
  }

  if (!neris.incident_point) {
    warnings.push('Missing incident_point (GPS coordinates) — required for NERIS submission');
  }

  if (!neris.incident_location || !neris.incident_location.sn_street_name) {
    errors.push('Missing incident_location (address)');
  }

  if (!neris.unit_response || !neris.unit_response.length) {
    warnings.push('No unit_response data — add responding units with timestamps');
  } else {
    neris.unit_response.forEach((u, i) => {
      if (!u.time_dispatch) warnings.push(`Unit ${u.unit_id_reported || i}: missing dispatch time`);
      if (!u.time_on_scene) warnings.push(`Unit ${u.unit_id_reported || i}: missing on-scene time`);
    });
  }

  if (!neris.incident_actions_taken || !neris.incident_actions_taken.length) {
    if (!neris.incident_noaction) {
      warnings.push('No actions_taken or noaction reason — at least one is required');
    }
  }

  if (!neris.incident_narrative_outcome) {
    warnings.push('Missing narrative — recommended for complete NERIS report');
  }

  // W4.1: pluggable per-state rules (roadmap 2.4) — FDID format and
  // submission-deadline checks come from data/stateNerisRules.js instead of
  // being hardcoded NJ assumptions. OPT-IN via options.state (the export UI
  // passes the department's configured state) so plain validation calls keep
  // their documented behavior.
  if (options.state) {
    const stateResult = applyStateRules(neris, getStateRules(options.state));
    errors.push(...stateResult.errors);
    warnings.push(...stateResult.warnings);
  }

  // Calculate completeness
  const totalChecks = 12;
  let passed = 0;
  if (neris.incident_neris_id) passed++;
  if (neris.incident_internal_id) passed++;
  if (neris.incident_final_type?.length) passed++;
  if (neris.incident_point) passed++;
  if (neris.incident_location?.sn_street_name) passed++;
  if (neris.incident_people_present !== undefined) passed++;
  if (neris.unit_response?.length) passed++;
  if (neris.incident_actions_taken?.length || neris.incident_noaction) passed++;
  if (neris.incident_narrative_outcome) passed++;
  if (neris.incident_aid_direction !== undefined) passed++;
  if (neris.rescue_ff !== undefined) passed++;
  if (neris.risk_reduction) passed++;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    completeness: Math.round((passed / totalChecks) * 100),
  };
}


// ─── Bundle Export ──────────────────────────────────────────────────────────

/**
 * Export multiple incidents as a NERIS-compliant JSON bundle.
 * This is the format that would be submitted to the state/USFA.
 */
export function exportNerisBundle(reports, incidents, options = {}) {
  const incidentMap = {};
  (incidents || []).forEach(inc => {
    incidentMap[inc.incidentNumber || inc.incident_number] = inc;
  });

  const bundle = {
    neris_version: '1.0',
    export_date: new Date().toISOString(),
    source: 'OpenFirehouse',
    fdid: options.fdid || '', // W4.1: no hardcoded NJ default

    department_name: options.stationName || '',
    incident_count: reports.length,
    incidents: reports.map(report => {
      const incNum = report.incidentNumber || report.incident_number;
      const incident = incidentMap[incNum] || {};
      return toNerisIncident(report, incident, options);
    }),
  };

  return bundle;
}


/**
 * Download a NERIS bundle as a JSON file.
 */
export function downloadNerisJson(bundle, filename) {
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `neris_export_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
