'use strict';
/**
 * server/src/cad/pipeline.js — shared persist + broadcast for CAD dispatches.
 *
 * Every CAD adapter ends here. Given a normalized CadIncident (see types.js),
 * the pipeline:
 *   1. Persists the alert to cad_alerts, returning null if it's a duplicate.
 *   2. Broadcasts a minimal Supabase Realtime ping to the station's clients.
 *   3. Fires station-scoped push notifications via the push channel.
 *
 * The pipeline is intentionally adapter-agnostic. It does not know whether
 * the incoming dispatch came from Active911, IamResponding, or a hand-typed
 * payload — it only knows how to handle a CadIncident.
 */

const { cadAlerts: db, apparatus: apparatusDb, unitStatus, runWithDepartment } = require('../db');
const { broadcastToStation } = require('../routes/push');
const { broadcastUnitStatusChanged, broadcastDispatchPing } = require('../config/supabaseRealtime');
const { parseUnitList, matchApparatus } = require('./unitMatch');

// ── Auto-light the board on a new dispatch ────────────────────────────────────
// Parse the CAD `units` field and set each apparatus we recognize in our fleet
// to 'dispatched', so the unit-status board / TV light up automatically when a
// call drops. Matching (see unitMatch.js) handles full names AND abbreviations
// ("Engine 6", "E6", "ENG6", "BC", "B14"...), and is FAIL-SAFE: an abbreviation
// is only accepted when it resolves to exactly one fleet apparatus — ambiguous
// or unknown CAD units are skipped, never guessed.

async function autoDispatchUnits(stationId, unitsStr, departmentId = stationId) {
  const tokens = parseUnitList(unitsStr);
  if (!tokens.length) return 0;
  let fleet;
  try { fleet = await apparatusDb.all(stationId); } catch { return 0; }
  if (!fleet || !fleet.length) return 0;
  const seen = new Set();
  let count = 0;
  for (const token of tokens) {
    const appt = matchApparatus(token, fleet);
    if (!appt || seen.has(appt.id)) continue; // unknown/ambiguous, or already handled
    seen.add(appt.id);
    try {
      await unitStatus.set(stationId, {
        apparatusId: appt.id, designation: appt.designation, status: 'dispatched', userId: null,
      });
      count++;
    } catch (e) { /* one bad unit must not stop the rest */ }
  }
  if (count > 0) broadcastUnitStatusChanged(departmentId, { auto: 'dispatched', n: count });
  return count;
}

// NOTE (radio doctrine, 2026-06-10): there is intentionally NO auto-release
// mirror of autoDispatchUnits. Unit statuses change only when dispatch flips
// them after verbal radio traffic; units still committed to a cleared call
// are flagged `orphaned` by GET /api/units/status instead.

/**
 * Process a normalized CAD incident.
 *
 * @param {import('./types').CadIncident} incident
 * @returns {Promise<{alert: any, duplicate: boolean}>}
 */
async function processDispatch(incident) {
  const {
    alertId, address, units, description, details,
    latitude, longitude, dispatchedAt, raw, stationId, source,
    departmentId: explicitDepartmentId,
  } = incident;

  // Resolve the house's REAL department (0020 resolver, bypasses RLS) so a
  // multi-house department's alert stores + broadcasts under the correct tenant.
  // Fallback to stationId preserves today's single-station behavior exactly
  // (where a station's department_id == its own id).
  // Prefer the department supplied by a matched per-dept CAD connection; else
  // resolve the house's department from the resolver; else fall back to stationId.
  let departmentId = explicitDepartmentId != null ? explicitDepartmentId : stationId;
  if (explicitDepartmentId == null) {
    try {
      const dr = await db.pool.query('SELECT of_station_department($1) AS d', [stationId]);
      if (dr.rows[0]?.d != null) departmentId = dr.rows[0].d;
    } catch (_) { /* keep stationId fallback */ }
  }

  // All DB writes for this dispatch run in the department context and COMMIT
  // before we broadcast — so the Realtime ping's authed refetch always finds the
  // row, and the writes satisfy the RLS WITH CHECK (department_id = the GUC).
  // db.create returns null on a duplicate alertId.
  const alert = await runWithDepartment(departmentId, null, async () => {
    const created = await db.create({
      alertId, address, units, description, details,
      latitude, longitude, dispatchedAt, raw, stationId,
    });
    if (!created) return null;
    // Auto-set the dispatched apparatus to 'dispatched' so the unit-status board
    // and TV light up the instant a call drops. Best-effort — a failure here must
    // NOT block the CAD response (vendors treat non-2xx as a delivery failure and
    // may retry, double-dispatching the call).
    try {
      await autoDispatchUnits(stationId, created.units, departmentId);
    } catch (autoErr) {
      console.warn(`[cad/${source}] auto-dispatch unit status failed:`, autoErr.message);
    }
    return created;
  });

  if (!alert) {
    return { alert: null, duplicate: true };
  }

  // Reliable real-time dispatch: broadcast a minimal "new dispatch" ping over
  // Supabase Realtime (SSE does NOT deliver across serverless instances).
  // Clients refetch the authz'd /api/cad/alerts for the real data — no call
  // details/PII on the public channel. Fired AFTER commit so the refetch finds
  // the row. Awaited so it sends before the serverless function returns.
  await broadcastDispatchPing(departmentId, alert.id);

  // Best-effort push notification to all station members. A push failure
  // must not block the response to the CAD vendor — vendors interpret
  // non-2xx responses as a delivery failure and may retry, double-dispatching
  // the call.
  try {
    await broadcastToStation(stationId, {
      title: `🚨 ${description}`,
      body:  address || 'Incoming dispatch',
      data:  { type: 'cad_alert', id: alert.id, url: '/?page=live-dispatch' },
      requireInteraction: true,
    });
  } catch (pushErr) {
    console.warn(`[cad/${source}] push notification failed:`, pushErr.message);
  }

  return { alert, duplicate: false };
}

/**
 * Resolve which station this dispatch belongs to.
 *
 * Default behaviour (no env config): stationId = 1. This matches the
 * single-tenant behaviour OpenFirehouse has shipped since the first
 * Active911 webhook.
 *
 * Multi-tenant deployments can map vendor-supplied agency identifiers to
 * station IDs via env config:
 *
 *   CAD_STATION_MAP='{"active911:42":1,"iamresponding:dept-101":1,"firstdue:abc":2}'
 *
 * The key format is `<vendor-slug>:<vendor-agency-id>`. The matching adapter
 * passes the vendor-agency-id it pulled from the payload.
 *
 * @param {string} vendor
 * @param {string|null|undefined} vendorAgencyId
 * @returns {number} stationId
 */
function resolveStationId(vendor, vendorAgencyId) {
  const raw = process.env.CAD_STATION_MAP;
  if (raw && vendorAgencyId) {
    try {
      const map = JSON.parse(raw);
      const key = `${vendor}:${vendorAgencyId}`;
      if (map[key]) return Number(map[key]);
    } catch (e) {
      console.warn('[cad/pipeline] CAD_STATION_MAP failed to parse:', e.message);
    }
  }
  return Number(process.env.CAD_DEFAULT_STATION_ID || 1);
}

module.exports = { processDispatch, resolveStationId };
