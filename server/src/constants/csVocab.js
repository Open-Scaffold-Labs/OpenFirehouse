'use strict';
/**
 * constants/csVocab.js — the controlled-substance vocabulary (Phase 2.7, migration 0087).
 * Spec: docs/PHASE2-NARCOTICS-SPEC-2026-07-26.md. Anchored on 21 CFR §1304.27
 * (91 FR 5241). CLOSED SETS, owned by the server — the fi result-axis lesson:
 * nothing may ever pattern-match a custody value, and a client-supplied value
 * outside these sets is refused, not defaulted.
 */

const SCHEDULES = ['II', 'III', 'IV', 'V'];

const LOCATION_KINDS = ['vault', 'safe', 'box', 'other'];
const SEAL_MODES = ['none', 'single', 'multi'];

/** Item lifecycle — written ONLY by the event door. */
const ITEM_STATUSES = [
  'in_stock', 'administered', 'wasted', 'expired', 'broken', 'transferred', 'destroyed',
];

/**
 * The event kinds and what each one requires/does. This table IS the doctrine:
 *   role      — minimum author (member = any credentialed member; the crew works the call)
 *   witness   — witness (2nd human, own PIN + e-signature) REQUIRED
 *   terminal  — the item status this event drives (null = no status change)
 *   counterpart — §1304.27(b) registrant fields required
 */
const EVENT_KINDS = {
  acquire:          { role: 'officer', witness: false, terminal: null,          counterpart: true },
  deliver:          { role: 'officer', witness: false, terminal: null,          counterpart: false },
  restock_hospital: { role: 'member',  witness: false, terminal: null,          counterpart: true },
  transfer:         { role: 'officer', witness: false, terminal: null,          counterpart: false },
  administer:       { role: 'member',  witness: false, terminal: 'administered', counterpart: false },
  waste:            { role: 'member',  witness: true,  terminal: 'wasted',      counterpart: false }, // §1304.27(a)(11)
  expire:           { role: 'officer', witness: true,  terminal: 'expired',     counterpart: false },
  break:            { role: 'member',  witness: true,  terminal: 'broken',      counterpart: false },
  // 'cs_manager' = chief-level OR the users.cs_manager capability grant (market
  // ruling 2026-07-26: admin-configurable access, the fleet_maintenance pattern).
  // Destruction additionally requires BOTH signatures (§1317.95(c): two employees
  // sign the destruction record) — enforced in the event door.
  destroy:          { role: 'cs_manager', witness: true,  terminal: 'destroyed', counterpart: true },
  count_adjust:     { role: 'cs_manager', witness: false, terminal: null,        counterpart: false },
};

const COUNT_KINDS = ['on_coming', 'off_going', 'audit', 'biennial'];

const DISCREPANCY_RESOLUTIONS = ['found', 'documentation_error', 'reported'];

/** §1304.27(c): the designated location must notify within 72 hours. */
const NOTIFY_HOURS = 72;

module.exports = {
  SCHEDULES, LOCATION_KINDS, SEAL_MODES, ITEM_STATUSES,
  EVENT_KINDS, COUNT_KINDS, DISCREPANCY_RESOLUTIONS, NOTIFY_HOURS,
};
