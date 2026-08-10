'use strict';
/**
 * utils/resolveCrewSeats.js — resolve run-list crew to REAL SEATS on a rig.
 *
 * ─── WHAT THIS IS ACTUALLY FOR (read before changing it) ────────────────────
 *
 * `run_lists.payload.crew[].position_id` is NULL on 0 of 315 rows in production.
 * The gameplan called this a "hardcoded null" bug in two writers. It is not.
 * Checking the data instead of the code shows something worse:
 *
 *   SEAT TEMPLATE (apparatus_positions.position_name):
 *     Driver/Engineer · Officer · Nozzle · Backup/Utility · Roof/Search ·
 *     Outside Vent/Forcible Entry · Rescue Tech · Pump Operator · Paramedic
 *
 *   RUN LISTS (run_lists.payload.crew[].position_name):
 *     Captain · Firefighter · Battalion Chief · BC Aide
 *
 * The template records SEATS (a riding position — a job on the rig). The run list
 * records RANKS. They are not the same kind of thing, so most rows cannot be
 * matched by name, because THE SOURCE DATA HAS NO SEAT IN IT.
 *
 * ─── WHAT WE MUST NOT DO ────────────────────────────────────────────────────
 *
 * The tempting fix is a rank→seat heuristic: Captain→Officer, Firefighter→Nozzle.
 * DO NOT. Three firefighters ride Engine 1: which one is Nozzle, which is Backup,
 * which is on the line? The run list does not say, and a machine that decides is
 * INVENTING an accountability record. On a fireground, "we think Smith was on the
 * nozzle" is worse than "we don't know which seat Smith rode", because the first
 * one gets believed.
 *
 * OF doctrine, and it applies exactly here: never guess an identity, never infer a
 * position, never silently upgrade a partial match into a fact.
 *
 * ─── WHAT THIS DOES ─────────────────────────────────────────────────────────
 *
 * 1. Matches a crew row to a seat ONLY when the department's own template really
 *    contains that seat, via an explicit synonym table (Officer ≡ Captain ≡ Lt;
 *    Driver ≡ Engineer ≡ Chauffeur ≡ MPO). These are the same seat under different
 *    house names — not a guess.
 * 2. Where it cannot match, it leaves position_id NULL **and says why**, so the
 *    caller can tell the user "27 of 35 riders have no seat — Truck 1 has no seat
 *    template" instead of quietly writing nulls and reporting success.
 *
 * That second half is the whole point. The old code wrote null and returned 200.
 * This one writes null and TELLS YOU.
 */

// Same normalisation shape as constants/certs.js: lowercase, collapse punctuation
// and dashes to single spaces. "Driver/Engineer" and "driver - engineer" converge.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[‒–—―]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// SEAT SYNONYMS — the same riding position under different house names.
// This is NOT a rank→seat map. Every entry here is one seat with two names.
// A rank ("Firefighter") deliberately maps to NOTHING: a rank is not a seat.
const SEAT_SYNONYMS = {
  // The right-front seat. Every department calls its officer something different,
  // but it is one seat and the rig has one of it.
  'officer': 'officer',
  'company officer': 'officer',
  'captain': 'officer',
  'capt': 'officer',
  'lieutenant': 'officer',
  'lt': 'officer',
  'oic': 'officer',

  // The driver's seat.
  'driver': 'driver',
  'driver engineer': 'driver',
  'driver operator': 'driver',
  'driver attendant': 'driver',
  'engineer': 'driver',
  'chauffeur': 'driver',
  'mpo': 'driver',
  'motor pump operator': 'driver',
  'pump operator': 'driver',
  'operator': 'driver',

  // Chief officer seats.
  'battalion chief': 'battalion chief',
  'bc': 'battalion chief',
  'bc aide': 'aide',
  'aide': 'aide',
  'chief aide': 'aide',

  // Task seats — these exist ONLY in the template. A run list that names one of
  // these really is telling us the seat, and we honour it.
  'nozzle': 'nozzle',
  'nozzleman': 'nozzle',
  'backup': 'backup',
  'backup utility': 'backup',
  'roof': 'roof',
  'roof search': 'roof',
  'outside vent': 'outside vent',
  'outside vent forcible entry': 'outside vent',
  'ovm': 'outside vent',
  'irons': 'irons',
  'can': 'can',
  'rescue tech': 'rescue tech',
  'paramedic': 'paramedic',
  'medic': 'paramedic',
  'emt': 'emt',
};

/** Canonical seat key, or null if the label is not a seat (e.g. it's a rank). */
function seatKey(label) {
  const n = norm(label);
  if (!n) return null;
  return SEAT_SYNONYMS[n] || null;
}

/** Reasons a crew row ended up seatless. Surfaced to the user, never swallowed. */
const UNSEATED = {
  NO_APPARATUS:     'no_apparatus',       // crew row has no rig at all
  NO_TEMPLATE:      'no_seat_template',   // the rig has no apparatus_positions rows
  NOT_A_SEAT:       'position_is_a_rank', // "Firefighter"/"Captain" — a rank, not a seat
  NO_MATCHING_SEAT: 'no_matching_seat',   // a real seat name, but this rig hasn't got it
  SEAT_TAKEN:       'seat_already_filled',// two people claiming one seat
};

/**
 * resolveCrewSeats(crew, seats) -> { crew, seated, unseated, issues }
 *
 * @param {Array<{apparatus_id?:number, position_name?:string, member_name?:string}>} crew
 * @param {Array<{id:number, apparatus_id:number, position_name:string}>} seats
 *        every apparatus_positions row for this department
 *
 * Pure. No DB. The caller fetches `seats` and persists the result.
 */
function resolveCrewSeats(crew, seats) {
  const byApparatus = new Map();       // apparatus_id -> [{id, key, position_name}]
  for (const s of seats || []) {
    if (!byApparatus.has(s.apparatus_id)) byApparatus.set(s.apparatus_id, []);
    byApparatus.get(s.apparatus_id).push({
      id: s.id,
      key: seatKey(s.position_name),
      position_name: s.position_name,
    });
  }

  const taken = new Set();             // "apparatusId:seatId" — one body per seat
  const issues = [];
  let seated = 0;

  const out = (crew || []).map((c) => {
    const apparatusId = c.apparatus_id ?? null;
    const label = c.position_name || '';

    const fail = (reason) => {
      issues.push({
        member_name: c.member_name || '(unnamed)',
        apparatus_name: c.apparatus_name || null,
        position_name: label,
        reason,
      });
      // NULL, explicitly. We do not invent a seat we were not given.
      return { ...c, position_id: null };
    };

    if (apparatusId == null) return fail(UNSEATED.NO_APPARATUS);

    const rigSeats = byApparatus.get(apparatusId);
    if (!rigSeats || !rigSeats.length) return fail(UNSEATED.NO_TEMPLATE);

    const key = seatKey(label);
    // A RANK IS NOT A SEAT. "Firefighter" tells us nothing about where they rode,
    // and we will not decide for them.
    if (!key) return fail(UNSEATED.NOT_A_SEAT);

    const match = rigSeats.find((s) => s.key === key && !taken.has(`${apparatusId}:${s.id}`));
    if (!match) {
      const existsButFull = rigSeats.some((s) => s.key === key);
      return fail(existsButFull ? UNSEATED.SEAT_TAKEN : UNSEATED.NO_MATCHING_SEAT);
    }

    taken.add(`${apparatusId}:${match.id}`);
    seated += 1;
    return { ...c, position_id: match.id, position_name: match.position_name };
  });

  return {
    crew: out,
    seated,
    unseated: out.length - seated,
    issues,
  };
}

module.exports = { resolveCrewSeats, seatKey, norm, UNSEATED, SEAT_SYNONYMS };
