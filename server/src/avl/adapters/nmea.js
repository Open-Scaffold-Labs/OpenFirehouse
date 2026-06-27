'use strict';
/**
 * server/src/avl/adapters/nmea.js — NMEA-0183 AVL adapter (ADR-0003).
 *
 * Parses the standard GPS sentences nearly every vehicle GPS modem/gateway can
 * emit, so a department whose hardware forwards raw NMEA is supported with no
 * vendor-specific code:
 *   - RMC (Recommended Minimum) — lat/lng + speed (knots) + course (heading)
 *   - GGA (Fix data)            — lat/lng + fix quality + HDOP (accuracy proxy)
 *
 * NMEA carries no device identity (it's just a GPS), so `deviceRef` is null here
 * and must be supplied by the transport/connection (the AVL device mapping).
 * Output is the canonical fix shape consumed by the orchestrator:
 *   { deviceRef, lat, lng, heading, speed, accuracy, ts }
 * lat/lng in decimal degrees; speed in m/s; accuracy in metres (HDOP*nominal).
 *
 * Pure + side-effect-free → unit-tested against known decode vectors.
 */

const KNOTS_TO_MS = 0.514444;
const HDOP_NOMINAL_M = 5; // accuracy(m) ≈ HDOP × nominal UERE — a conservative proxy

// "4807.038","N" -> 48.1173  (ddmm.mmmm + hemisphere -> signed decimal degrees)
function nmeaCoord(rawVal, hemi) {
  if (rawVal == null || rawVal === '') return null;
  const v = parseFloat(rawVal);
  if (!Number.isFinite(v)) return null;
  const deg = Math.floor(v / 100);
  const min = v - deg * 100;
  let dec = deg + min / 60;
  const h = String(hemi || '').toUpperCase();
  if (h === 'S' || h === 'W') dec = -dec;
  return dec;
}

// XOR checksum of the chars between '$' and '*'. Returns true if absent (some
// gateways omit it) or matching; false only on an explicit mismatch.
function checksumOk(sentence) {
  const star = sentence.lastIndexOf('*');
  if (star === -1) return true; // no checksum provided — accept
  const body = sentence.slice(sentence.indexOf('$') + 1, star);
  const given = sentence.slice(star + 1).trim().toUpperCase();
  if (!/^[0-9A-F]{2}$/.test(given)) return true; // malformed checksum field — don't reject the fix
  let x = 0;
  for (let i = 0; i < body.length; i++) x ^= body.charCodeAt(i);
  return x.toString(16).toUpperCase().padStart(2, '0') === given;
}

// fields without the trailing *checksum
function fieldsOf(sentence) {
  const star = sentence.lastIndexOf('*');
  return (star === -1 ? sentence : sentence.slice(0, star)).split(',');
}

function sentenceType(field0) {
  // e.g. "$GPRMC" / "GNRMC" / "GLGGA" -> last 3 chars
  return String(field0 || '').replace('$', '').slice(-3).toUpperCase();
}

/**
 * Parse a blob of one or more NMEA sentences into canonical fixes.
 * @param {string} raw
 * @returns {Array<object>}
 */
function parse(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const lines = raw.split(/[\r\n]+/).map((s) => s.trim()).filter((s) => s.startsWith('$'));
  const fixes = [];
  let lastAccuracy = null;

  // First pass: most recent GGA HDOP becomes the accuracy proxy for RMC fixes.
  for (const line of lines) {
    if (!checksumOk(line)) continue;
    const f = fieldsOf(line);
    if (sentenceType(f[0]) === 'GGA') {
      const hdop = parseFloat(f[8]);
      if (Number.isFinite(hdop)) lastAccuracy = hdop * HDOP_NOMINAL_M;
    }
  }

  for (const line of lines) {
    if (!checksumOk(line)) continue;
    const f = fieldsOf(line);
    const type = sentenceType(f[0]);

    if (type === 'RMC') {
      if (String(f[2]).toUpperCase() !== 'A') continue; // status A = valid fix
      const lat = nmeaCoord(f[3], f[4]);
      const lng = nmeaCoord(f[5], f[6]);
      if (lat == null || lng == null) continue;
      const knots = parseFloat(f[7]);
      const course = parseFloat(f[8]);
      fixes.push({
        deviceRef: null,
        lat, lng,
        heading: Number.isFinite(course) ? course : null,
        speed: Number.isFinite(knots) ? knots * KNOTS_TO_MS : null,
        accuracy: lastAccuracy,
        ts: null,
      });
    } else if (type === 'GGA') {
      const quality = parseInt(f[6], 10);
      if (!Number.isFinite(quality) || quality === 0) continue; // 0 = no fix
      const lat = nmeaCoord(f[2], f[3]);
      const lng = nmeaCoord(f[4], f[5]);
      if (lat == null || lng == null) continue;
      const hdop = parseFloat(f[8]);
      // Only emit a GGA fix when no RMC in this batch already covered the position.
      if (!fixes.some((x) => Math.abs(x.lat - lat) < 1e-6 && Math.abs(x.lng - lng) < 1e-6)) {
        fixes.push({
          deviceRef: null,
          lat, lng, heading: null, speed: null,
          accuracy: Number.isFinite(hdop) ? hdop * HDOP_NOMINAL_M : null,
          ts: null,
        });
      }
    }
  }
  return fixes;
}

module.exports = { parse, nmeaCoord, checksumOk };
