'use strict';
/**
 * server/src/cad/statusNormalize.js
 *
 * Map a CAD vendor's unit-status word to OpenFirehouse's canonical status.
 *
 * This is how the market gets a real ARRIVAL time onto the board: the dispatcher
 * marks a unit on-scene in CAD, CAD pushes that status out, and it drives the
 * fireground clock. OF's CAD pipeline already ingests dispatch + close; unit
 * STATUS is the third lifecycle event, and this is its vocabulary bridge.
 *
 * ── THE ONE RULE: FAIL SAFE. AN UNKNOWN WORD FLIPS NOTHING. ──────────────────
 *
 * CAD vendors use wildly different status codes ("AR", "OS", "10-97", "arrived",
 * "on scene", "onscene"). We map the ones we RECOGNISE and, for anything else,
 * return null so the caller SKIPS the unit and REPORTS it — never guesses.
 * Guessing a unit's status on a fireground is the exact failure OF's radio
 * doctrine exists to prevent. A status we cannot read is not a status.
 *
 * ── DOCTRINE ────────────────────────────────────────────────────────────────
 *
 * A CAD status update is the DISPATCHER'S action, relayed — a human at the CAD
 * terminal marking the unit after radio traffic. That is the "Dispatch may set
 * any unit's status" case that middleware/requireUnitStatusAuth already permits.
 * It is NOT inference: no GPS, no geofence, no AVL, no AI. That line is UNMOVED —
 * this module maps a human's CAD keystroke, nothing more.
 *
 * Canonical values (must match db.UNIT_STATUS_VALUES exactly):
 *   in_service · dispatched · enroute · on_scene · transporting · at_hospital ·
 *   returning · on_the_air · out_of_service
 */

// Normalise a raw CAD status token: lowercase, strip punctuation/radio codes to
// spaces, collapse whitespace. "On-Scene", "ON SCENE", "on_scene" all converge.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/10[\s-]?\d{1,2}/g, ' ')   // strip 10-codes (10-97, 10 8) before word match
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Explicit synonym table. Each maps a CAD word to ONE canonical OF status.
// We DELIBERATELY do not map mechanical states (out_of_service) — CAD does not
// own a rig's maintenance status, and we will not let a CAD feed take a rig OOS.
const STATUS_SYNONYMS = {
  // en route to the call
  'enroute': 'enroute', 'en route': 'enroute', 'enr': 'enroute', 'er': 'enroute',
  'responding': 'enroute', 'resp': 'enroute', 'mobile': 'enroute',

  // ON SCENE — the one that starts the fireground clock
  'on scene': 'on_scene', 'onscene': 'on_scene', 'on_scene': 'on_scene',
  'os': 'on_scene', 'ar': 'on_scene', 'arr': 'on_scene', 'arrived': 'on_scene',
  'arrival': 'on_scene', 'at scene': 'on_scene', 'on location': 'on_scene',

  // transport (EMS)
  'transporting': 'transporting', 'transport': 'transporting', 'tr': 'transporting',
  'enroute to hospital': 'transporting', 'transporting to hospital': 'transporting',

  'at hospital': 'at_hospital', 'at_hospital': 'at_hospital', 'ah': 'at_hospital',
  'arrived hospital': 'at_hospital', 'at facility': 'at_hospital',

  // returning / available / clear — a unit coming back is dispatchable again
  'returning': 'returning', 'rtn': 'returning', 'enroute to quarters': 'returning',
  'available on radio': 'on_the_air', 'on the air': 'on_the_air', 'ota': 'on_the_air',

  'available': 'in_service', 'avl': 'in_service', 'in service': 'in_service',
  'in_service': 'in_service', 'in quarters': 'in_service', 'clear': 'in_service',
  'available in quarters': 'in_service', 'complete': 'in_service',

  // dispatched — already the one auto transition, but a CAD status echo is fine
  'dispatched': 'dispatched', 'disp': 'dispatched', 'dsp': 'dispatched',
  'assigned': 'dispatched', 'toned': 'dispatched',
};

/**
 * @param {string} word  a raw CAD status token
 * @returns {string|null} the canonical OF status, or null if unrecognised
 */
function normalizeCadStatus(word) {
  const n = norm(word);
  if (!n) return null;
  return STATUS_SYNONYMS[n] || null;
}

module.exports = { normalizeCadStatus, norm, STATUS_SYNONYMS };
