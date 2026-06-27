'use strict';
/**
 * server/src/avl/adapters/generic.js — OF canonical JSON AVL adapter (ADR-0003).
 *
 * OF's own documented ingest contract. Any integrator / thin forwarder can POST
 * this with no vendor code. Accepts a single fix, an array, or { fixes:[...] } /
 * { units:[...] }, and tolerates common field aliases so a department's middleware
 * rarely needs reshaping:
 *   deviceRef : deviceRef | device_id | deviceId | unit | unitId | id
 *   lat       : lat | latitude
 *   lng       : lng | lon | long | longitude
 *   heading   : heading | course | bearing      (degrees)
 *   speed     : speed (m/s)  | speed_mph | speed_kmh | speed_knots (converted)
 *   accuracy  : accuracy | accuracy_m | hdop(*5)  (metres)
 *   ts        : ts | timestamp | time            (epoch ms, epoch s, or ISO)
 *
 * Returns the canonical fix shape; validation + the 100 m gate are applied later
 * by the orchestrator (avl/fix.js). Pure + unit-tested.
 */

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function pick(o, keys) {
  for (const k of keys) {
    if (o[k] != null && o[k] !== '') return o[k];
  }
  return undefined;
}

function toEpochMs(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v < 1e12 ? Math.round(v * 1000) : Math.round(v); // s vs ms
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function speedToMs(o) {
  const ms = num(pick(o, ['speed', 'speed_ms', 'speedMs']));
  if (ms != null) return ms;
  const mph = num(pick(o, ['speed_mph', 'speedMph']));
  if (mph != null) return mph * 0.44704;
  const kmh = num(pick(o, ['speed_kmh', 'speedKmh']));
  if (kmh != null) return kmh / 3.6;
  const kn = num(pick(o, ['speed_knots', 'speedKnots', 'knots']));
  if (kn != null) return kn * 0.514444;
  return null;
}

function accuracyM(o) {
  const a = num(pick(o, ['accuracy', 'accuracy_m', 'accuracyM']));
  if (a != null) return a;
  const hdop = num(pick(o, ['hdop', 'HDOP']));
  if (hdop != null) return hdop * 5;
  return null;
}

function one(o) {
  if (!o || typeof o !== 'object') return null;
  const lat = num(pick(o, ['lat', 'latitude']));
  const lng = num(pick(o, ['lng', 'lon', 'long', 'longitude']));
  if (lat == null || lng == null) return null;
  const deviceRef = pick(o, ['deviceRef', 'device_id', 'deviceId', 'unit', 'unitId', 'id']);
  return {
    deviceRef: deviceRef != null ? String(deviceRef) : null,
    lat,
    lng,
    heading: num(pick(o, ['heading', 'course', 'bearing'])),
    speed: speedToMs(o),
    accuracy: accuracyM(o),
    ts: toEpochMs(pick(o, ['ts', 'timestamp', 'time'])),
  };
}

/**
 * @param {object|array|string} payload  parsed JSON (object/array) or a JSON string
 * @returns {Array<object>} canonical fixes
 */
function parse(payload) {
  let data = payload;
  if (typeof payload === 'string') {
    try { data = JSON.parse(payload); } catch { return []; }
  }
  let arr;
  if (Array.isArray(data)) arr = data;
  else if (data && Array.isArray(data.fixes)) arr = data.fixes;
  else if (data && Array.isArray(data.units)) arr = data.units;
  else if (data && typeof data === 'object') arr = [data];
  else return [];
  return arr.map(one).filter(Boolean);
}

module.exports = { parse };
