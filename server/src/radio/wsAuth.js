'use strict';
// Radio WebSocket auth resolver.
//
// Resolves the broadcast bucket key (a department_id) for a /ws/radio
// connection from EITHER a verified JWT or a TV PIN. A client-claimed
// station/department id is NEVER trusted — that was a cross-tenant
// subscription hole where any client could send {stationId:N} and receive
// another department's live radio traffic. Extracted from index.js so the
// auth is unit-testable (the WS server only boots under require.main).
const jwt = require('jsonwebtoken');
const { ACCESS_SECRET } = require('../config/jwtSecret');
const db = require('../db');
const { findStationByPin } = require('../config/tvPin');

/**
 * Resolve the department_id bucket key for a radio WS auth message.
 * @param {{type?:string, token?:string, pin?:string}} msg  the WS auth message
 * @returns {Promise<number|null>}  department_id to subscribe to, or null to reject
 */
async function resolveRadioWsTenant(msg) {
  if (!msg || msg.type !== 'auth') return null;

  // ── JWT path (logged-in clients) ──────────────────────────────────────────
  // Verify the token and DERIVE the tenant (mirrors requireAuth). Bucket key is
  // the department_id, matching the broadcast side (radio.js → radioWsBroadcast).
  if (msg.token) {
    try {
      const payload = jwt.verify(msg.token, ACCESS_SECRET);
      const user = await db.users.findById(payload.sub);
      if (user && user.station_id) {
        const deptId = await db.users.resolveDepartmentId(payload.sub, user.station_id);
        if (deptId != null) return deptId;
      }
    } catch { /* invalid/expired token → reject */ }
    return null;
  }

  // ── TV PIN path (TV displays) ─────────────────────────────────────────────
  // Hashed compare; key by the PIN'd house's DEPARTMENT (not the station id) so
  // a multi-house department's TV displays share the broadcast bucket.
  if (msg.pin) {
    const { pool } = db;
    const station = await findStationByPin(pool, msg.pin, 'id, department_id');
    if (station) return station.department_id != null ? station.department_id : station.id;
    return null;
  }

  return null;
}

module.exports = { resolveRadioWsTenant };
