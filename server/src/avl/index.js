'use strict';
/**
 * server/src/avl/index.js — AVL ingestion orchestrator (ADR-0003).
 *
 * Pipeline (mirrors the iPad PATCH path, but the source is a hardware feed):
 *   secret -> connection (dept+vendor)  [deviceAuth, DEFINER resolver, bypasses RLS]
 *   raw payload -> adapter.parse -> canonical fixes
 *   normalize + 100m accuracy gate
 *   per fix: device_ref -> apparatus_id (dept-scoped) -> unit_locations upsert -> realtime broadcast
 *
 * All persistence runs inside runWithDepartment so the dept GUC is set and RLS
 * applies as of_app on prod (no-op passthrough locally when P5_TXN is off). The
 * GUC-aware pool.query chokepoint reuses the context client — no second
 * connection, so the max:1 pool can't deadlock.
 */
const db = require('../db');
const { getAdapter } = require('./adapters');
const { normalizeFixes } = require('./fix');
const { broadcastUnitLocationsUpdate } = require('../config/supabaseRealtime');

/**
 * Ingest one feed POST.
 * @param {object} conn  resolved AVL connection { connectionId, departmentId, vendorId }
 * @param {object|string} payload  parsed JSON body (object/array) or raw text (NMEA)
 * @param {string|null} defaultDeviceRef  request-level device id for feeds that don't carry one (NMEA)
 * @returns {Promise<{ingested:number, unmapped:number, dropped:number, received:number}>}
 */
async function ingest(conn, payload, defaultDeviceRef = null) {
  const adapter = getAdapter(conn.vendorId);
  const raw = adapter.parse(payload);
  const fixes = normalizeFixes(raw, defaultDeviceRef);
  const result = { received: raw.length, ingested: 0, unmapped: 0, dropped: raw.length - fixes.length };

  if (!fixes.length) return result;

  await db.runWithDepartment(conn.departmentId, null, async () => {
    for (const fix of fixes) {
      if (!fix.deviceRef) { result.unmapped += 1; continue; }
      // device_ref -> apparatus (dept-scoped; RLS via the dept GUC on prod)
      const dev = await db.query(
        'SELECT apparatus_id FROM avl_devices WHERE department_id=$1 AND device_ref=$2 AND status=$3 LIMIT 1',
        [conn.departmentId, fix.deviceRef, 'Active'],
      );
      if (!dev.rows.length) { result.unmapped += 1; continue; }
      const apparatusId = dev.rows[0].apparatus_id;
      const appt = await db.apparatus.findById(apparatusId, conn.departmentId);
      if (!appt) { result.unmapped += 1; continue; }

      const row = await db.unitLocations.upsert(conn.departmentId, {
        apparatusId,
        stationId: appt.station_id,
        latitude: fix.lat,
        longitude: fix.lng,
        heading: fix.heading,
        speed: fix.speed,
        accuracy: fix.accuracy,
      });
      // id + coords only on the channel (no PII) — same as the iPad path.
      broadcastUnitLocationsUpdate(conn.departmentId, {
        apparatusId, designation: appt.designation,
        lat: row.latitude, lng: row.longitude, heading: row.heading, speed: row.speed,
        updatedAt: row.updated_at,
      });
      result.ingested += 1;
    }
    if (result.ingested > 0) {
      await db.query(
        'UPDATE avl_connections SET fixes_ingested = fixes_ingested + $1, last_fix_at = NOW(), updated_at = NOW() WHERE id = $2',
        [result.ingested, conn.connectionId],
      );
    }
  });

  return result;
}

module.exports = { ingest };
