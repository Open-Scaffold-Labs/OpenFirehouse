'use strict';
/**
 * server/src/cad/unitMatch.js — match CAD unit identifiers to fleet apparatus.
 *
 * Pure (no DB), so it can be unit-tested in isolation. CAD `units` fields come
 * in wildly different shapes: "Engine 6", "ENG6", "E-6", "E6", "L1", "BC",
 * "B14", "T1"... This resolves a token to a fleet apparatus by:
 *   1. exact normalized designation match ("Engine 6" === "engine 6"), then
 *   2. abbreviation: parse <alpha-prefix><number>, expand the prefix to one or
 *      more candidate apparatus types, and match against the fleet by type+number.
 *
 * FAIL-SAFE: an abbreviation is only accepted when it resolves to EXACTLY ONE
 * apparatus in the actual fleet. If a prefix is ambiguous (e.g. "T1" could be
 * Truck 1 or Tanker 1 and the fleet has both), we return null and skip it —
 * matching the wrong rig is worse than matching none. The fleet itself is the
 * disambiguator: "B14" → Brush 14 (no Battalion 14 exists), "B1" → Battalion 1
 * (no Brush 1 exists).
 */

// CAD prefix (lowercased alpha) -> candidate canonical apparatus types.
// Canonical type = the first word of an apparatus designation, lowercased
// (e.g. "Engine 6" -> "engine", "EMS 14" -> "ems", "Battalion 1" -> "battalion").
const PREFIX_TYPES = {
  engine: ['engine'], eng: ['engine'], e: ['engine'],
  ladder: ['ladder'], lad: ['ladder'], ld: ['ladder'], l: ['ladder'],
  truck: ['truck'], trk: ['truck'],
  tower: ['tower', 'ladder', 'truck'], twr: ['tower', 'ladder', 'truck'],
  quint: ['quint'], q: ['quint'],
  tanker: ['tanker'], tank: ['tanker'], tnk: ['tanker'], tk: ['tanker'],
  battalion: ['battalion'], batt: ['battalion'], bat: ['battalion'], bc: ['battalion'],
  brush: ['brush'], br: ['brush'], bru: ['brush'],
  rescue: ['rescue'], res: ['rescue'], rsq: ['rescue'], rsc: ['rescue'], r: ['rescue'],
  squad: ['squad'], sqd: ['squad'], sq: ['squad'], s: ['squad'],
  medic: ['medic'], med: ['medic'], m: ['medic'],
  ambulance: ['ambulance', 'ems'], amb: ['ambulance', 'ems'], a: ['ambulance', 'ems'],
  ems: ['ems', 'ambulance'],
  command: ['command'], cmd: ['command'], car: ['command'], c: ['command'],
  utility: ['utility'], util: ['utility'], ut: ['utility'], u: ['utility'],
  // Genuinely ambiguous single letters — resolved only by fleet uniqueness.
  t: ['truck', 'tanker'], b: ['battalion', 'brush'],
};

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseUnitList(units) {
  if (!units) return [];
  return String(units).split(/[,;/|]+/).map((s) => s.trim()).filter(Boolean);
}

function designationType(designation) {
  const first = String(designation || '').trim().split(/\s+/)[0] || '';
  return first.toLowerCase();
}

function designationNumber(designation) {
  const m = /(\d+)\s*$/.exec(String(designation || '').trim());
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Resolve one CAD unit token to a fleet apparatus, or null if no confident match.
 * @param {string} token  e.g. "Engine 6", "E6", "BC", "B14"
 * @param {Array<{id:number, designation:string}>} fleet
 * @returns {object|null} the matched apparatus, or null
 */
function matchApparatus(token, fleet) {
  if (!token || !Array.isArray(fleet) || !fleet.length) return null;
  const wanted = normalize(token);

  // 1. Exact normalized designation match.
  const exact = fleet.find((a) => normalize(a.designation) === wanted);
  if (exact) return exact;

  // 2. Abbreviation: <alpha prefix>[sep]<optional number>.
  const m = /^([a-z]+)[\s\-_]*0*(\d*)$/i.exec(token.trim());
  if (!m) return null;
  const prefix = m[1].toLowerCase();
  const num = m[2] ? parseInt(m[2], 10) : null;
  const candidates = PREFIX_TYPES[prefix];
  if (!candidates || !candidates.length) return null;

  const matches = fleet.filter((a) => {
    if (!candidates.includes(designationType(a.designation))) return false;
    if (num === null) return true; // no number in token -> any apparatus of that type
    return designationNumber(a.designation) === num;
  });

  // FAIL-SAFE: only accept a unique match.
  return matches.length === 1 ? matches[0] : null;
}

module.exports = { parseUnitList, matchApparatus, normalize, designationType, designationNumber };
