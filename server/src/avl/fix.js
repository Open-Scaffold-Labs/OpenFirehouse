'use strict';
/**
 * server/src/avl/fix.js — canonical AVL fix validation + accuracy gate (ADR-0003).
 *
 * Pure helpers shared by the orchestrator and tests. Applies the SAME accuracy
 * discipline as the iPad path (drop fixes worse than 100 m) so a noisy hardware
 * feed can never put a wrong dot on the command map.
 */

const MAX_ACCURACY_M = 100;

function inRange(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    && !(lat === 0 && lng === 0); // null-island guard (a common "no fix" sentinel)
}

/** A single fix is keepable: valid coords + (no accuracy OR within the gate). */
function isValidFix(fix) {
  if (!fix || typeof fix !== 'object') return false;
  if (!inRange(fix.lat, fix.lng)) return false;
  if (fix.accuracy != null && Number.isFinite(fix.accuracy) && fix.accuracy > MAX_ACCURACY_M) return false;
  return true;
}

/**
 * Filter a batch of raw adapter fixes to the keepable ones. When the transport
 * supplies the device identity (e.g. NMEA has none), pass `defaultDeviceRef` to
 * stamp it onto fixes that lack their own.
 */
function normalizeFixes(rawFixes, defaultDeviceRef = null) {
  if (!Array.isArray(rawFixes)) return [];
  return rawFixes
    .map((f) => (f && f.deviceRef == null && defaultDeviceRef != null
      ? { ...f, deviceRef: String(defaultDeviceRef) }
      : f))
    .filter(isValidFix);
}

module.exports = { isValidFix, normalizeFixes, MAX_ACCURACY_M };
