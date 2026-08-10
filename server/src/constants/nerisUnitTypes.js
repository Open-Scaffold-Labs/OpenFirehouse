/**
 * nerisUnitTypes.js — the NERIS `type_unit` vocabulary, verbatim.
 *
 * NFIRS sunset in Feb 2026; NERIS is the federal standard now, and every RMS/CAD
 * vendor is being certified against it. Adopting its vocabulary verbatim means our
 * apparatus records are NERIS-submittable with no translation layer. We do NOT
 * invent an OpenFirehouse-local type vocabulary.
 *
 * Source: https://github.com/ulfsri/neris-framework
 *         core_schemas/value_sets/csv/type_unit.csv   (49 active values)
 *
 * ── WHAT NERIS ACTUALLY DOES ABOUT "T1 = TRUCK OR TANKER?" ──────────────────
 * NFIRS kept Truck/Aerial (12) and Tanker/Tender (24) as two numeric codes.
 * NERIS does something different, and better:
 *
 *   • TENDER      = "Water Tender/Tanker"  — ONE type covers both words.
 *   • AIR_TANKER  = "Fixed Wing, Fire Suppression" — the AIRCRAFT is a separate
 *                   type. In NWCG/wildland vocabulary "tanker" means an aircraft.
 *   • The aerial side is SPLIT FINER, not merged: seven types keyed on aerial
 *     length (<75' vs 75'+) and pump capability — LADDER_SMALL, LADDER_TALL,
 *     LADDER_QUINT, QUINT_TALL, PLATFORM, PLATFORM_QUINT, LADDER_TILLER.
 *   • There is NO "Brush" type — a brush truck is ENGINE_WUI.
 *   • There is NO "Battalion" type — a BC is CHIEF_STAFF_COMMAND.
 *
 * And the decisive design choice: NERIS ships a "Common Nomenclature/Radio
 * Designator" column that DOCUMENTS what crews call each rig ("Tanker, Tender,
 * Engine") — and then refuses to make those words authoritative. The unit's
 * identity is its registered cad_designation; the TYPE is a separately-submitted
 * field. THE STANDARD NEVER INFERS TYPE FROM THE DESIGNATOR.
 *
 * That is the same rule unitParse.js follows. We're aligned with the standard by
 * construction, not by coincidence.
 */

/** value → { label, nomenclature } — the 49 active NERIS unit types. */
const NERIS_UNIT_TYPES = {
  CREW_TRANS:          { label: 'Crew Transport',                              nomenclature: 'Crew Transport, Van' },
  ENGINE_STRUCT:       { label: 'Engine (Structural)',                         nomenclature: 'Engine, Pumper' },
  ENGINE_WUI:          { label: 'Engine (Wildland Interface)',                 nomenclature: 'Engine, Pumper, Brush' },
  BOAT:                { label: 'Fire/Rescue Boat, Small (<20 ft)',            nomenclature: 'Boat, Fire Boat' },
  BOAT_LARGE:          { label: 'Fire Boat, Large (20+ ft)',                   nomenclature: 'Boat, Fire Boat' },
  LADDER_SMALL:        { label: "Ladder/Truck <75', no suppression",           nomenclature: 'Ladder, Truck' },
  LADDER_QUINT:        { label: "Ladder/Truck <75', suppression capable",      nomenclature: 'Ladder, Truck, Quint' },
  LADDER_TALL:         { label: "Ladder/Truck 75'+, no suppression",           nomenclature: 'Ladder, Truck, Platform, Aerial' },
  QUINT_TALL:          { label: "Ladder/Truck 75'+, suppression capable",      nomenclature: 'Ladder, Truck, Platform, Aerial, Quint' },
  PLATFORM:            { label: "Elevated Platform >75', no suppression",      nomenclature: 'Ladder, Truck, Platform, Aerial' },
  PLATFORM_QUINT:      { label: "Elevated Platform >75', suppression capable", nomenclature: 'Ladder, Truck, Platform, Aerial, Quint' },
  LADDER_TILLER:       { label: 'Tractor-drawn Aerial (tiller)',               nomenclature: 'Ladder, Truck, Aerial' },
  ARFF:                { label: 'ARFF Response Vehicle',                       nomenclature: 'ARFF, Rescue, Engine, Foam' },
  FOAM:                { label: 'Foam Tender',                                 nomenclature: 'Foam' },
  TENDER:              { label: 'Water Tender/Tanker',                         nomenclature: 'Tanker, Tender, Engine' },
  CREW:                { label: 'Hand Crew',                                   nomenclature: 'Crew' },
  HELO_GENERAL:        { label: 'Helicopter, Multiuse',                        nomenclature: 'Helo, Helicopter' },
  HELO_FIRE:           { label: 'Helicopter, Fire Suppression',                nomenclature: 'Helo, Helicopter' },
  HELO_RESCUE:         { label: 'Helicopter, Rescue/EMS',                      nomenclature: 'Helo, Helicopter' },
  UAS_FIRE:            { label: 'Drone/UAV — Fire Suppression',                nomenclature: 'UAV, UAS, Drone' },
  UAS_RECON:           { label: 'Drone/UAV — Recon',                           nomenclature: 'UAV, UAS, Drone' },
  AIR_TANKER:          { label: 'Fixed Wing, Fire Suppression',                nomenclature: 'Airtanker' },
  AIR_EMS:             { label: 'Fixed Wing, EMS',                             nomenclature: '' },
  AIR_RECON:           { label: 'Fixed Wing, Recon/Other',                     nomenclature: '' },
  ALS_AMB:             { label: 'Ambulance, ALS',                              nomenclature: 'Ambulance, Medic, Squad' },
  BLS_AMB:             { label: 'Ambulance, BLS',                              nomenclature: 'Ambulance, Medic, Squad' },
  EMS_NOTRANS:         { label: 'EMS Response Vehicle (Non-Transport)',        nomenclature: 'Squad, Quick Response' },
  EMS_SUPV:            { label: 'EMS Supervisor',                              nomenclature: 'Command, Car, Unit' },
  MAB:                 { label: 'Medical Ambulance Bus',                       nomenclature: 'MCU, MAB, Bus' },
  CHIEF_STAFF_COMMAND: { label: 'Chief/Staff/Command Officer',                 nomenclature: 'Command, Car, Chief' },
  HAZMAT:              { label: 'Hazardous Materials Unit',                    nomenclature: 'HazMat' },
  DECON:               { label: 'Decontamination Unit',                        nomenclature: 'HazMat, Decon' },
  POV:                 { label: 'Privately Owned Vehicle',                     nomenclature: '' },
  RESCUE_HEAVY:        { label: 'Rescue, Multi-Function, Heavy',               nomenclature: 'Rescue, Squad' },
  RESCUE_MEDIUM:       { label: 'Rescue, Multi-Function, Medium',              nomenclature: 'Rescue, Squad' },
  RESCUE_LIGHT:        { label: 'Rescue, Multi-Function, Light',               nomenclature: 'Rescue, Squad' },
  RESCUE_USAR:         { label: 'Rescue, US&R',                                nomenclature: 'Rescue, Squad, USAR, Collapse' },
  RESCUE_WATER:        { label: 'Rescue, Water Rescue',                        nomenclature: 'Rescue, Squad, Water Rescue' },
  SCBA:                { label: 'SCBA Support Unit',                           nomenclature: 'Mask Unit, Air Support' },
  AIR_LIGHT:           { label: 'Air and Light Unit',                          nomenclature: 'Air and Light' },
  REHAB:               { label: 'Rehabilitation / Canteen Unit',               nomenclature: 'Rehab, RAC, Canteen' },
  MOBILE_ICP:          { label: 'Mobile Command Post',                         nomenclature: 'Command, Command Post' },
  MOBILE_COMMS:        { label: 'Mobile Communications',                       nomenclature: 'FieldComm, Mobile Dispatch' },
  DOZER:               { label: 'Bulldozer / Dozer',                           nomenclature: 'Dozer' },
  OTHER_GROUND:        { label: 'Other Ground Equipment',                      nomenclature: '' },
  ATV_EMS:             { label: 'All Terrain Vehicle, EMS/Rescue',             nomenclature: 'ATV, UTV' },
  ATV_FIRE:            { label: 'All Terrain Vehicle, Fire Suppression',       nomenclature: 'ATV, UTV' },
  INVEST:              { label: 'Fire Investigation Unit',                     nomenclature: '' },
  UTIL:                { label: 'General Purpose / Utility Unit',              nomenclature: 'Utility' },
};

const NERIS_UNIT_TYPE_VALUES = Object.keys(NERIS_UNIT_TYPES);

/**
 * Map a legacy free-text apparatus.type to a NERIS type — ONLY where the mapping
 * is unambiguous. Returns null when the legacy label does not carry enough
 * information to choose, which is a REAL and common case:
 *
 *   "Ladder"    → NERIS needs the aerial LENGTH (<75' vs 75'+) and whether it has
 *                 a PUMP. Seven candidate types. We cannot know from the word.
 *   "Rescue"    → heavy / medium / light / USAR / water. Five candidates.
 *   "Ambulance" → ALS vs BLS depends on the unit's LICENSURE. Two candidates.
 *
 * Guessing here would write a wrong type into a federally-reportable record. The
 * chief picks; we do not invent. (Same doctrine as unit resolution: an honest gap
 * beats a confident lie.)
 */
const LEGACY_TYPE_MAP = {
  'engine':            'ENGINE_STRUCT',
  'brush':             'ENGINE_WUI',          // NERIS has no Brush type — it IS the WUI engine
  'tanker':            'TENDER',              // NERIS: "Water Tender/Tanker" — one type, both words
  'tender':            'TENDER',
  'command':           'CHIEF_STAFF_COMMAND', // includes battalion/district/shift chiefs
  'battalion':         'CHIEF_STAFF_COMMAND',
  'utility':           'UTIL',
  'hazmat':            'HAZMAT',
  'boat':              'BOAT',
  'marine':            'BOAT',
  'investigation':     'INVEST',
  'rehab':             'REHAB',
  'dozer':             'DOZER',
  // Deliberately ABSENT (need a human — the legacy word is under-specified):
  //   ladder / truck / aerial / tower / quint  → 7 candidates (length + pump)
  //   rescue / squad                           → 5 candidates
  //   ambulance / ems / medic                  → ALS vs BLS (licensure)
};

/** @returns {string|null} NERIS type, or null when a human must choose. */
function nerisTypeFromLegacy(legacy) {
  if (!legacy) return null;
  const key = String(legacy).toLowerCase().trim().split(/[\s/]+/)[0];  // "Ladder / Aerial" → "ladder"
  return LEGACY_TYPE_MAP[key] || null;
}

function isValidNerisType(v) {
  return Object.prototype.hasOwnProperty.call(NERIS_UNIT_TYPES, v);
}

module.exports = {
  NERIS_UNIT_TYPES, NERIS_UNIT_TYPE_VALUES, LEGACY_TYPE_MAP,
  nerisTypeFromLegacy, isValidNerisType,
};
