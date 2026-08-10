/**
 * unitParse.js — turn a CAD "units" string into resolved unit rows.
 *
 * WHY THIS EXISTS
 * ---------------
 * `cad_alerts.units` is a comma-separated STRING ("Engine 1, Ladder 1, Rescue 1").
 * That is fine for DISPLAYING a dispatch and useless for ASKING QUESTIONS of it:
 *
 *   1. Substring search is wrong. `units LIKE '%Engine 1%'` also matches
 *      "Engine 10", "Engine 11", "Engine 100". Verified against our own data:
 *      5 matches, 3 of them false positives.
 *   2. A string has nowhere to put per-unit times. Each rig has its own
 *      dispatch/enroute/on-scene/clear clock. ISO travel-time credit, NFPA
 *      1710/1720 percentiles and LOSAP run counts are all computed from those.
 *      No query can recover them from a string — it's an information problem.
 *
 * So we parse the string into one row per unit per call, and keep the original
 * string verbatim as provenance. This module is the parser. It is PURE — no db,
 * no io — so it can be exhaustively unit-tested.
 *
 * THE HARD PART: the same rig appears under two names.
 * Real dispatches in our own data carry BOTH conventions, sometimes in one call:
 *   "Engine 1, Ladder 1, Rescue 1"      (long form)
 *   "E1, R1, BC1"                        (abbreviated)
 *   "E5, BC, B14, T1"                    (abbreviated, one with no number)
 * "E1" and "Engine 1" are the SAME APPARATUS. If we keyed the archive on the raw
 * token, a search for Engine 1 would silently MISS every call logged as "E1".
 * An undercount is more dangerous than an overcount: it's invisible, and it's the
 * direction that costs a volunteer their LOSAP credit.
 *
 * THE RULE WE DO NOT BREAK: never guess.
 * Some abbreviations are genuinely ambiguous. A department with a "Brush 14" and a
 * battalion can write "B14" and mean either. There is no safe inference. When a
 * token could resolve to more than one apparatus we resolve it to NULL, mark it
 * ambiguous, and surface it for a human to map. Assigning a run to the wrong rig
 * is a legal-record error — silence is better than a confident lie.
 */

/** Type words → the abbreviation prefixes departments actually use for them. */
const TYPE_ALIASES = [
  { full: 'ENGINE',        abbrs: ['E', 'ENG'] },
  { full: 'LADDER',        abbrs: ['L', 'LAD'] },
  { full: 'TRUCK',         abbrs: ['T', 'TRK'] },
  { full: 'TOWER LADDER',  abbrs: ['TL', 'TWR', 'TOWER'] },
  { full: 'RESCUE',        abbrs: ['R', 'RES'] },
  { full: 'SQUAD',         abbrs: ['SQ', 'SQD', 'S'] },
  { full: 'BATTALION',     abbrs: ['BC', 'BAT', 'B'] },
  { full: 'BRUSH',         abbrs: ['BR', 'B'] },        // 'B' collides with BATTALION — deliberate.
  // ── "T" IS NOT SAFE, AND THE STANDARDS SAY SO ──────────────────────────────
  // Researched against the standards bodies rather than folk convention:
  //   • NFPA calls it "mobile water supply apparatus"; the service says "tanker",
  //     but in ICS clear text they are designated TENDERS.
  //   • FEMA/NIMS resource typing names it "Water Tender – Firefighting (Tanker)"
  //     — Tender is the noun, Tanker is a parenthetical alias.
  //   • NWCG/wildland: "TANKER" MEANS AN AIRCRAFT. A ground water hauler is a
  //     Water Tender. NERIS mirrors this exactly: the aircraft value is AIR_TANKER
  //     while the ground apparatus is TENDER.
  //   • NFIRS kept Truck/Aerial (12) and Tanker/Tender (24) as DISTINCT codes.
  // There is no defensible default for a bare "T": in the vocabulary a NIMS-trained
  // officer uses on a mutual-aid incident, guessing "Tanker" can mean an aircraft.
  // So T stays claimed by BOTH types, which makes "T1" resolve only when the
  // department's own roster contains exactly one candidate — and ambiguous (human
  // mapping) when it owns both a Truck 1 and a Tanker 1. That roster-gated rule is
  // strictly better than any static convention, because it's grounded in the rigs
  // the department actually owns.
  { full: 'TANKER',        abbrs: ['TK', 'TNK', 'T'] },
  { full: 'TENDER',        abbrs: ['TND', 'TEND', 'WT'] },   // the ICS/NIMS-correct noun
  { full: 'MEDIC',         abbrs: ['M', 'MED'] },
  { full: 'AMBULANCE',     abbrs: ['A', 'AMB'] },
  { full: 'EMS',           abbrs: ['EMS'] },
  { full: 'HAZMAT',        abbrs: ['HM', 'HZ', 'HAZ'] },
  { full: 'CHIEF',         abbrs: ['C', 'CH'] },
  { full: 'COMMAND',       abbrs: ['CMD'] },
  { full: 'UTILITY',       abbrs: ['U', 'UTIL'] },
  { full: 'MARINE',        abbrs: ['MAR', 'BOAT'] },
  { full: 'AIR',           abbrs: ['AIR'] },
  { full: 'QUINT',         abbrs: ['QNT', 'Q'] },
  { full: 'PUMPER',        abbrs: ['PMP', 'P'] },
];

/**
 * Normalize a token for comparison: upper-case, collapse internal whitespace,
 * strip surrounding punctuation, strip leading zeros from the unit number.
 * Does NOT expand abbreviations — normalization and resolution are separate
 * steps on purpose.
 *   "  engine  1 " → "ENGINE 1"   ·   "e1" → "E1"   ·   "E01" → "E1"
 *
 * LEADING ZEROS: mature production CAD emits zero-padded designators (a large
 * metro fire CAD's live feed publishes E01, T03, B02, E38). "E01" and "E1" are
 * the same rig, and if we didn't strip the pad, a department whose CAD pads would
 * have every single call fail to resolve. Padding is department-local, never
 * universal — so we normalize it away for MATCHING and always keep unit_raw for
 * DISPLAY. (Edge case worth knowing: a station-encoded scheme where E1 and E01 are
 * genuinely different rigs would be merged by this. No such fleet exists in our
 * data; if one ever registers, it has to be caught at apparatus registration.)
 */
function normalizeToken(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^\w\s/-]/g, ' ')   // drop stray punctuation, keep - and /
    .replace(/\s+/g, ' ')
    .trim()
    // Unpad every digit run: E01→E1, E010→E10, ENGINE 007→ENGINE 7.
    // (A \b-anchored regex does NOT work here — "E01" is all word characters, so
    // there is no word boundary before the zero and the pad survives.)
    .replace(/\d+/g, (n) => String(parseInt(n, 10)));
}

/**
 * Split the CAD units string into raw tokens.
 * Delimiters seen in the wild: comma, semicolon, slash, pipe. NOT space — "Tower
 * Ladder 1" and "Engine 1" contain spaces and must survive as single units.
 */
function splitUnits(unitsString) {
  if (unitsString == null) return [];
  return String(unitsString)
    .split(/[,;|/]+/)
    .map(t => t.trim())
    .filter(Boolean);
}

/**
 * Expand a normalized token into the candidate forms it could denote.
 * "E1"        → ["E1", "ENGINE 1"]
 * "ENGINE 1"  → ["ENGINE 1", "E1", "ENG1", …]   (so a long-form token still matches
 *                                                 an apparatus recorded short-form)
 * "B14"       → ["B14", "BATTALION 14", "BRUSH 14"]   ← two candidates ⇒ ambiguous
 * "BC"        → ["BC", "BATTALION"]                    (no number — a bare chief unit)
 */
function candidateForms(norm) {
  const out = new Set([norm]);

  // <PREFIX><NUMBER> e.g. E1, BC1, TL2, B14 — optional space between.
  const m = norm.match(/^([A-Z]+)\s*(\d+)$/);
  if (m) {
    const [, prefix, num] = m;
    for (const t of TYPE_ALIASES) {
      if (t.abbrs.includes(prefix)) out.add(`${t.full} ${num}`);
      if (t.full === prefix)        for (const a of t.abbrs) out.add(`${a}${num}`);
    }
    // "<FULL WORD><number>" with no space, e.g. "ENGINE1"
    for (const t of TYPE_ALIASES) {
      if (t.full === prefix) out.add(`${t.full} ${num}`);
    }
  }

  // "<FULL> <NUM>" e.g. ENGINE 1 / TOWER LADDER 1 → add the short forms.
  const w = norm.match(/^([A-Z]+(?:\s[A-Z]+)*)\s(\d+)$/);
  if (w) {
    const [, words, num] = w;
    for (const t of TYPE_ALIASES) {
      if (t.full === words) for (const a of t.abbrs) out.add(`${a}${num}`);
    }
  }

  // Bare prefix with no number, e.g. "BC" (the battalion chief), "CMD".
  if (/^[A-Z]+$/.test(norm)) {
    for (const t of TYPE_ALIASES) {
      if (t.abbrs.includes(norm)) out.add(t.full);
      if (t.full === norm)        for (const a of t.abbrs) out.add(a);
    }
  }

  return [...out];
}

/**
 * Resolve one token against the department's fleet.
 *
 * @param {string} rawToken
 * @param {Array<{id:number, designation:string, aliases?:string[]}>} fleet
 * @returns {{unit_raw, unit_norm, apparatus_id:number|null, ambiguous:boolean}}
 *
 * Resolution order, most-certain first:
 *   1. EXACT normalized designation match           → certain
 *   2. Department-configured alias (apparatus.aliases) → certain (a human said so)
 *   3. Derived abbreviation expansion               → only if it hits EXACTLY ONE rig
 * Anything that hits 0 rigs → apparatus_id NULL, ambiguous FALSE (mutual aid: a real
 * unit that simply isn't in our fleet — keep it as text, never drop it).
 * Anything that hits >1 rig → apparatus_id NULL, ambiguous TRUE (needs a human).
 */
function resolveToken(rawToken, fleet = []) {
  const unit_norm = normalizeToken(rawToken);
  const base = { unit_raw: String(rawToken).trim(), unit_norm, apparatus_id: null, ambiguous: false };
  if (!unit_norm) return null;

  const byNorm = fleet.map(a => ({
    id: a.id,
    norm: normalizeToken(a.designation),
    aliases: (a.aliases || []).map(normalizeToken),
  }));

  // 1. exact designation
  const exact = byNorm.filter(a => a.norm === unit_norm);
  if (exact.length === 1) return { ...base, apparatus_id: exact[0].id };
  if (exact.length > 1)   return { ...base, ambiguous: true };  // duplicate designations in the fleet

  // 2. department-configured alias — a human explicitly mapped this
  const aliased = byNorm.filter(a => a.aliases.includes(unit_norm));
  if (aliased.length === 1) return { ...base, apparatus_id: aliased[0].id };
  if (aliased.length > 1)   return { ...base, ambiguous: true };

  // 3. derived expansion — only when it lands on exactly one rig
  const forms = candidateForms(unit_norm);
  const hits = byNorm.filter(a =>
    forms.includes(a.norm) || a.aliases.some(al => forms.includes(al)));
  const unique = [...new Set(hits.map(h => h.id))];
  if (unique.length === 1) return { ...base, apparatus_id: unique[0] };
  if (unique.length > 1)   return { ...base, ambiguous: true };   // e.g. B14 → Brush 14 AND Battalion 14

  // 0 hits — mutual aid or a rig not yet in the fleet. Keep it. Never drop it.
  return base;
}

/**
 * Parse a full CAD units string into rows ready for cad_alert_units.
 *
 * Dedupe is by RESOLVED APPARATUS first, normalized token second. This matters:
 * a CAD string of "Engine 1, E1" is the SAME RIG written twice. Deduping only on
 * the token would emit two rows both pointing at apparatus 1 and DOUBLE that rig's
 * run count — the precise silent inflation this whole module exists to prevent.
 * Unresolved tokens (mutual aid) fall back to token-dedupe, since we have no id to
 * compare them on.
 */
function parseUnits(unitsString, fleet = []) {
  const rows = [];
  const seenApparatus = new Set();   // resolved rigs already on this call
  const seenTokens = new Set();      // unresolved/mutual-aid tokens
  let seq = 0;
  for (const tok of splitUnits(unitsString)) {
    const r = resolveToken(tok, fleet);
    if (!r) continue;

    if (r.apparatus_id != null) {
      if (seenApparatus.has(r.apparatus_id)) continue;  // "Engine 1" AND "E1" → one row
      seenApparatus.add(r.apparatus_id);
    } else {
      if (seenTokens.has(r.unit_norm)) continue;
      seenTokens.add(r.unit_norm);
    }
    rows.push({ ...r, seq: seq++ });
  }
  return rows;
}

module.exports = { parseUnits, resolveToken, normalizeToken, splitUnits, candidateForms, TYPE_ALIASES };
