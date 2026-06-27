'use strict';
/**
 * constants/certs.js — Canonical fire-service certification taxonomy.
 *
 * SINGLE SOURCE OF TRUTH for certification identity across OpenFirehouse
 * (server scoring, seeds, apparatus position requirements, the qualifications
 * API + UI, and the mobile staffing board).
 *
 * Every cert is a coded entity { code, name, category }. Internal data should
 * store the `code`, so matching is code-to-code (no fuzzy string compare).
 *
 *   - CERTS            full list of { code, name, category }
 *   - CERT_BY_CODE     code -> { code, name, category }
 *   - CERT_CODES       Set of valid codes
 *   - CERT_TYPES       array of display names (preserves the legacy
 *                      qualifications.js /cert-types contract)
 *   - CATEGORIES       category -> human label
 *   - canonicalizeCert(label)  free-text/abbrev/em-dash label -> code | null
 *   - canonicalCerts(arr)      array of labels-or-codes -> array of codes
 *                              (drops anything unrecognized; deduped)
 *
 * canonicalizeCert exists for IMPORT robustness — when a real department
 * imports messy cert names ("FF II", "Driver/Operator — Pumper", "EMT-B").
 * It is NOT meant to be relied on for internal scoring; internal rows should
 * already hold codes.
 */

// ── The canonical taxonomy ──────────────────────────────────────────────────
// Extends the legacy CERT_TYPES list (was display-name-only in qualifications.js)
// with codes + the certs the apparatus-position templates reference
// (Interior, Forcible Entry, EVOC, ACLS/PALS, Tanker D/O, Technical Rescue).
const CERTS = [
  // Firefighter core
  { code: 'firefighter_1',            name: 'Firefighter I',                  category: 'firefighter' },
  { code: 'firefighter_2',            name: 'Firefighter II',                 category: 'firefighter' },
  { code: 'interior_qualified',       name: 'Interior Operations',            category: 'firefighter' },
  { code: 'forcible_entry',           name: 'Forcible Entry Operations',      category: 'firefighter' },
  { code: 'vehicle_extrication',      name: 'Vehicle Extrication',            category: 'firefighter' },

  // Officer / command
  { code: 'fire_officer_1',           name: 'Fire Officer I',                 category: 'officer' },
  { code: 'fire_officer_2',           name: 'Fire Officer II',                category: 'officer' },
  { code: 'incident_safety_officer',  name: 'Incident Safety Officer',        category: 'officer' },
  { code: 'blue_card_ic',             name: 'Blue Card IC',                   category: 'officer' },

  // Instructor / inspector / investigator
  { code: 'fire_instructor_1',        name: 'Fire Instructor I',              category: 'instructor' },
  { code: 'fire_inspector_1',         name: 'Fire Inspector I',               category: 'inspector' },
  { code: 'fire_investigator',        name: 'Fire Investigator',              category: 'inspector' },

  // Driver / operator
  { code: 'driver_operator_pumper',   name: 'Driver/Operator - Pumper',       category: 'driver' },
  { code: 'driver_operator_aerial',   name: 'Driver/Operator - Aerial',       category: 'driver' },
  { code: 'driver_operator_tanker',   name: 'Driver/Operator - Tanker/Tender',category: 'driver' },
  { code: 'driver_operator_wildland', name: 'Driver/Operator - Wildland',     category: 'driver' },
  { code: 'evoc',                     name: 'EVOC',                           category: 'driver' },
  { code: 'cdl_a',                    name: 'CDL - Class A',                  category: 'driver' },
  { code: 'cdl_b',                    name: 'CDL - Class B',                  category: 'driver' },

  // EMS
  { code: 'emt_basic',                name: 'EMT-Basic',                      category: 'ems' },
  { code: 'emt_advanced',             name: 'EMT-Advanced',                   category: 'ems' },
  { code: 'paramedic',                name: 'Paramedic',                      category: 'ems' },
  { code: 'acls',                     name: 'ACLS',                           category: 'ems' },
  { code: 'pals',                     name: 'PALS',                           category: 'ems' },
  { code: 'cpr_aed',                  name: 'CPR/AED',                        category: 'ems' },

  // HazMat
  { code: 'hazmat_awareness',         name: 'HazMat Awareness',               category: 'hazmat' },
  { code: 'hazmat_operations',        name: 'HazMat Operations',              category: 'hazmat' },
  { code: 'hazmat_technician',        name: 'HazMat Technician',              category: 'hazmat' },

  // Technical rescue
  { code: 'tech_rescue_awareness',    name: 'Technical Rescue - Awareness',   category: 'rescue' },
  { code: 'tech_rescue_operations',   name: 'Technical Rescue - Operations',  category: 'rescue' },
  { code: 'rope_rescue_awareness',    name: 'Rope Rescue - Awareness',        category: 'rescue' },
  { code: 'rope_rescue_operations',   name: 'Rope Rescue - Operations',       category: 'rescue' },
  { code: 'rope_rescue_technician',   name: 'Rope Rescue - Technician',       category: 'rescue' },
  { code: 'confined_space_rescue',    name: 'Confined Space Rescue',          category: 'rescue' },
  { code: 'trench_rescue',            name: 'Trench Rescue',                  category: 'rescue' },
  { code: 'water_rescue',             name: 'Water Rescue',                   category: 'rescue' },

  // NIMS / ICS
  { code: 'nims_ics_100',             name: 'NIMS ICS-100',                   category: 'nims' },
  { code: 'nims_ics_200',             name: 'NIMS ICS-200',                   category: 'nims' },
  { code: 'nims_ics_300',             name: 'NIMS ICS-300',                   category: 'nims' },
  { code: 'nims_ics_400',             name: 'NIMS ICS-400',                   category: 'nims' },

  // Health / safety
  { code: 'scba_fit_test',            name: 'SCBA Fit Test',                  category: 'safety' },
  { code: 'bloodborne_pathogens',     name: 'Bloodborne Pathogens',           category: 'safety' },
];

const CATEGORIES = {
  firefighter: 'Firefighter',
  officer:     'Officer / Command',
  instructor:  'Instructor',
  inspector:   'Inspector / Investigator',
  driver:      'Driver / Operator',
  ems:         'EMS',
  hazmat:      'HazMat',
  rescue:      'Technical Rescue',
  nims:        'NIMS / ICS',
  safety:      'Health & Safety',
};

const CERT_BY_CODE = Object.freeze(
  CERTS.reduce((acc, c) => { acc[c.code] = c; return acc; }, {})
);
const CERT_CODES = new Set(CERTS.map((c) => c.code));
const CERT_TYPES = CERTS.map((c) => c.name); // legacy display-name contract

// ── Normalization for import robustness ─────────────────────────────────────
// Fold case, em/en-dashes -> hyphen, and any run of non-alphanumerics -> single
// space. So "Driver/Operator — Pumper", "Driver/Operator - Pumper" and
// "driver/operator  pumper" all normalize identically.
function norm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[‒–—―]/g, '-') // figure/en/em/horizontal-bar dashes
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Alias table: normalized label -> canonical code. Canonical names + codes are
// auto-added below, so list only the *extra* spellings/abbreviations here.
const ALIAS_SOURCE = {
  // firefighter
  'ff i': 'firefighter_1', 'ffi': 'firefighter_1', 'ff 1': 'firefighter_1', 'firefighter 1': 'firefighter_1',
  'ff ii': 'firefighter_2', 'ffii': 'firefighter_2', 'ff 2': 'firefighter_2', 'firefighter 2': 'firefighter_2',
  'interior qualified': 'interior_qualified', 'interior': 'interior_qualified',
  'forcible entry': 'forcible_entry',
  'extrication': 'vehicle_extrication',
  // officer
  'fo i': 'fire_officer_1', 'fo1': 'fire_officer_1', 'fire officer 1': 'fire_officer_1',
  'fo ii': 'fire_officer_2', 'fo2': 'fire_officer_2', 'fire officer 2': 'fire_officer_2',
  'iso': 'incident_safety_officer', 'safety officer': 'incident_safety_officer',
  'blue card': 'blue_card_ic',
  'instructor i': 'fire_instructor_1', 'instructor 1': 'fire_instructor_1',
  // driver/operator — bare "Driver/Operator" defaults to pumper (most common)
  'driver operator': 'driver_operator_pumper', 'driver/operator': 'driver_operator_pumper',
  'driver operator pumps': 'driver_operator_pumper', 'pump operator': 'driver_operator_pumper',
  'pumper': 'driver_operator_pumper',
  'driver operator aerial': 'driver_operator_aerial', 'aerial operator': 'driver_operator_aerial',
  'driver operator tanker tender': 'driver_operator_tanker', 'driver operator tanker': 'driver_operator_tanker',
  'tanker operator': 'driver_operator_tanker', 'tender operator': 'driver_operator_tanker',
  'cdl b': 'cdl_b', 'cdl class b': 'cdl_b', 'cdl-b': 'cdl_b',
  'cdl a': 'cdl_a', 'cdl class a': 'cdl_a', 'cdl-a': 'cdl_a',
  // ems
  'emt': 'emt_basic', 'emt b': 'emt_basic', 'emt basic': 'emt_basic', 'emt-b': 'emt_basic', 'emr': 'emt_basic',
  'emt a': 'emt_advanced', 'aemt': 'emt_advanced', 'emt advanced': 'emt_advanced',
  'medic': 'paramedic',
  'cpr': 'cpr_aed', 'aed': 'cpr_aed', 'cpr aed': 'cpr_aed',
  // hazmat
  'hazmat': 'hazmat_operations', 'hazmat ops': 'hazmat_operations', 'haz mat operations': 'hazmat_operations',
  'hazmat aware': 'hazmat_awareness', 'haz mat awareness': 'hazmat_awareness',
  'hazmat tech': 'hazmat_technician',
  // technical rescue
  'technical rescue awareness': 'tech_rescue_awareness', 'tech rescue awareness': 'tech_rescue_awareness',
  'technical rescue operations': 'tech_rescue_operations', 'tech rescue operations': 'tech_rescue_operations',
  'technical rescue': 'tech_rescue_operations',
  'confined space': 'confined_space_rescue', 'confined space operations': 'confined_space_rescue',
  'rope rescue': 'rope_rescue_operations',
  // nims
  'ics 100': 'nims_ics_100', 'ics 200': 'nims_ics_200', 'ics 300': 'nims_ics_300', 'ics 400': 'nims_ics_400',
};

// Build the resolved alias map: canonical names + codes first, then the extras.
const ALIASES = {};
for (const c of CERTS) {
  ALIASES[norm(c.name)] = c.code;
  ALIASES[norm(c.code)] = c.code;
}
for (const [label, code] of Object.entries(ALIAS_SOURCE)) {
  if (!CERT_CODES.has(code)) throw new Error(`certs.js alias maps to unknown code: ${code}`);
  ALIASES[norm(label)] = code;
}

/**
 * canonicalizeCert(label) -> canonical code | null
 * Accepts a code, a canonical display name, or a known alias/abbreviation.
 */
function canonicalizeCert(label) {
  if (label == null) return null;
  const key = norm(label);
  if (!key) return null;
  return ALIASES[key] || null;
}

/**
 * canonicalCerts(arr) -> array of unique canonical codes (unrecognized dropped).
 * Accepts a JSON string or an array.
 */
function canonicalCerts(arr) {
  let list = arr;
  if (typeof arr === 'string') {
    try { list = JSON.parse(arr); } catch (_) { list = [arr]; }
  }
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const code = canonicalizeCert(item);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

module.exports = {
  CERTS,
  CERT_BY_CODE,
  CERT_CODES,
  CERT_TYPES,
  CATEGORIES,
  canonicalizeCert,
  canonicalCerts,
};
