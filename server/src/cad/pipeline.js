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

const { cadAlerts: db, apparatus: apparatusDb, unitStatus, runWithDepartment, pool } = require('../db');
const { broadcastToStation } = require('../routes/push');
const { broadcastUnitStatusChanged, broadcastDispatchPing } = require('../config/supabaseRealtime');
const { parseUnitList, matchApparatus } = require('./unitMatch');
const { normalizeCadStatus } = require('./statusNormalize');
const { autoCreateFromCall } = require('../utils/autoCreateFromCall');
const { resolveAlertId } = require('./alertIdentity');

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
// ── PSAP call-time extraction (P2-D4, NERIS dispatch block) ──────────────────
// NERIS requires call_answered (911 call-taker pickup) and call_arrival (call
// arrival at the PSAP) — stamps that exist only inside the CAD/911 system.
// Adapters MAY set callAnsweredAt/callArrivalAt explicitly; otherwise we scan
// the raw payload for the common vendor field names. Conservative by design:
// compound names only (a bare `received` could mean anything), tolerant of
// ISO strings / epoch seconds / epoch millis, and a value that doesn't parse
// to a plausible instant is dropped — never guessed (a wrong federal
// timestamp is worse than a missing one).
const PSAP_KEYS = {
  answered: new Set(['callanswered', 'callansweredat', 'callanswertime', 'timecallanswered', 'callansweredtime']),
  arrival: new Set(['callarrival', 'callarrivalat', 'callarrivaltime', 'callreceived', 'callreceivedat', 'callreceivedtime', 'timecallreceived']),
};

function parsePsapInstant(v) {
  if (v === null || v === undefined || v === '') return null;
  let t;
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null);
  if (n !== null) {
    // epoch seconds vs millis: anything below 10^12 is seconds until 33658 AD
    t = new Date(n < 1e12 ? n * 1000 : n);
  } else if (typeof v === 'string') {
    t = new Date(v);
  } else {
    return null;
  }
  if (!Number.isFinite(t.getTime()) || t.getFullYear() < 2000) return null;
  return t.toISOString();
}

/** Scan an object (depth ≤ 2) for PSAP time keys. First hit wins per field. */
function extractPsapTimes(raw) {
  const found = { callAnsweredAt: null, callArrivalAt: null };
  if (!raw || typeof raw !== 'object') return found;
  const scan = (obj, depth) => {
    if (!obj || typeof obj !== 'object' || depth > 2) return;
    for (const [k, v] of Object.entries(obj)) {
      const norm = String(k).toLowerCase().replace(/[^a-z]/g, '');
      if (!found.callAnsweredAt && PSAP_KEYS.answered.has(norm)) {
        found.callAnsweredAt = parsePsapInstant(v);
      } else if (!found.callArrivalAt && PSAP_KEYS.arrival.has(norm)) {
        found.callArrivalAt = parsePsapInstant(v);
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        scan(v, depth + 1);
      }
    }
  };
  scan(raw, 0);
  return found;
}

async function processDispatch(incident) {
  const {
    alertId, address, units, description, details,
    latitude, longitude, dispatchedAt, raw, stationId, source,
    departmentId: explicitDepartmentId,
  } = incident;

  // PSAP times: adapter-explicit fields win; else scan the raw payload.
  const psap = extractPsapTimes(raw);
  const callAnsweredAt = parsePsapInstant(incident.callAnsweredAt) || psap.callAnsweredAt;
  const callArrivalAt = parsePsapInstant(incident.callArrivalAt) || psap.callArrivalAt;

  // Resolve the house's REAL department (0020 resolver, bypasses RLS) so a
  // multi-house department's alert stores + broadcasts under the correct tenant.
  // Fallback to stationId preserves today's single-station behavior exactly
  // (where a station's department_id == its own id).
  // Prefer the department supplied by a matched per-dept CAD connection; else
  // resolve the house's department from the resolver; else fall back to stationId.
  let departmentId = explicitDepartmentId != null ? explicitDepartmentId : stationId;
  if (explicitDepartmentId == null) {
    try {
      // FIX 2026-07-12: was `db.pool.query` — but `db` here is the cadAlerts
      // NAMESPACE (line 16), which has no .pool, so this threw into the catch
      // on every call and the 0020 resolver never ran (masked: single-house
      // departments' station id == department id). Multi-house departments'
      // alerts would have landed under the wrong tenant.
      const dr = await pool.query('SELECT of_station_department($1) AS d', [stationId]);
      if (dr.rows[0]?.d != null) departmentId = dr.rows[0].d;
    } catch (_) { /* keep stationId fallback */ }
  }

  // ── THE CALL'S IDENTITY ─────────────────────────────────────────────────
  // Resolved HERE, not in the adapter, because this is the first point at which
  // the DEPARTMENT is known — and NENA namespaces an identifier by the agency
  // that created it. The adapters now hand up the raw vendor id or null.
  //
  // A vendor id always wins. When the CAD sends none we synthesize a
  // DETERMINISTIC content hash (cad/alertIdentity.js). The adapters used to fall
  // back to `${prefix}-${Date.now()}`, which is different on every attempt — so
  // a vendor retry (they retry on timeout; see the note below) minted a NEW id,
  // sailed past the duplicate guard, and stored the same call twice. On clear
  // that can mint two draft incidents: two incident numbers for one fire.
  const identity = resolveAlertId({
    vendorId: alertId,
    departmentId, source, address, units, description, dispatchedAt,
  });
  if (identity.source === 'synthesized') {
    // Loud, not silent. A CAD emitting id-less dispatches is a configuration
    // defect to fix with that vendor, and it must not be papered over forever.
    console.log(JSON.stringify({
      kind: 'of_cad_alert_id_synthesized', departmentId, source, alertId: identity.alertId,
    }));
  }

  // All DB writes for this dispatch run in the department context and COMMIT
  // before we broadcast — so the Realtime ping's authed refetch always finds the
  // row, and the writes satisfy the RLS WITH CHECK (department_id = the GUC).
  // db.create returns null on a duplicate alertId.
  const alert = await runWithDepartment(departmentId, null, async () => {
    const created = await db.create({
      alertId: identity.alertId, alertIdSource: identity.source,
      address, units, description, details,
      latitude, longitude, dispatchedAt, raw, stationId,
      callAnsweredAt, callArrivalAt,
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

/**
 * processClose — a CAD-sent close/clear event (2026-07-12, call-lifecycle
 * parity). Matches the department's UNCLEARED alert by the CAD's OWN alert id
 * (cad_alerts.alert_id) and closes it with the SYSTEM disposition 'cad_closed'.
 *
 * Doctrine: closes the CALL only. Unit statuses are NEVER touched by a machine
 * event — still-committed units surface via the orphan flag for dispatch to
 * confirm over the radio. Dept resolution mirrors processDispatch exactly.
 *
 * @param {{alertId: string, stationId: number, departmentId?: number}} evt
 * @returns {Promise<{cleared: boolean, id: number|null}>}
 */
async function processClose(evt) {
  const { alertId, stationId, departmentId: explicitDepartmentId } = evt;

  let departmentId = explicitDepartmentId != null ? explicitDepartmentId : stationId;
  if (explicitDepartmentId == null) {
    try {
      const dr = await pool.query('SELECT of_station_department($1) AS d', [stationId]);
      if (dr.rows[0]?.d != null) departmentId = dr.rows[0].d;
    } catch (_) { /* keep stationId fallback */ }
  }

  const row = await runWithDepartment(departmentId, null,
    () => db.closeByExternalId(String(alertId), departmentId));

  if (!row) return { cleared: false, id: null };

  // 4.1a-R.4b — the call is over, so mint the draft report. This is the market's
  // documented trigger: a report is created off the department's unit CLEAR
  // times and matched on the dispatch run number.
  //
  // NON-FATAL, ALWAYS. A failure here must never stop a call from clearing — the
  // close is the operational act and it wins. If no report gets made, the call
  // shows up in Reconciliation as MISSING, which is precisely what that screen
  // is for. Reported, never swallowed silently (the 4.1a lesson).
  let autoIncident = null;
  try {
    autoIncident = await runWithDepartment(departmentId, null,
      () => autoCreateFromCall({ alertRow: row, departmentId }));
  } catch (e) {
    console.error('[cad] auto-create from cleared call FAILED (the call still cleared):', e.message);
    autoIncident = { result: 'failed', incidentId: null, incidentNumber: null };
  }

  // Same ping as a new dispatch — clients refetch and the call leaves every
  // board (web feed, cab Active Call Log) within seconds.
  await broadcastDispatchPing(departmentId, row.id);
  return { cleared: true, id: row.id, autoIncident };
}

/**
 * processStatusUpdate — a CAD-sent UNIT STATUS event (2026-07-14, arrival parity).
 *
 * This is how the market puts a real ARRIVAL time on the board: the dispatcher
 * marks a unit on-scene in CAD, CAD pushes the status out, and it drives the
 * fireground clock. OF already ingests dispatch (processDispatch) and close
 * (processClose); this is the third lifecycle event.
 *
 * DOCTRINE — verified against middleware/requireUnitStatusAuth: a CAD status
 * update is the DISPATCHER'S action, relayed. "Dispatch + command may set ANY
 * unit's status" is already the rule. This is NOT inference (no GPS / geofence /
 * AVL / AI — that line is unmoved); it is a human's CAD keystroke arriving over
 * the webhook instead of being typed into OF's own board. It writes through the
 * SAME canonical path a dispatcher's on-board flip uses (unitStatus.set →
 * unit_statuses + unit_status_history in one txn), so the two can never disagree.
 *
 * FAIL SAFE, and REPORTED — the seat-resolver discipline:
 *   • A unit token that doesn't resolve to exactly one fleet apparatus is SKIPPED
 *     (matchApparatus never guesses).
 *   • A status word we don't recognise is SKIPPED (normalizeCadStatus → null).
 *   • Every skip is RETURNED with a reason, never swallowed. A CAD feed that
 *     silently drops arrivals is the exact silent-failure class we are killing.
 *
 * Dept resolution mirrors processDispatch/processClose exactly.
 *
 * @param {{ statusUpdates: Array<{unit: string, status: string, at?: string}>,
 *           stationId: number, departmentId?: number, alertId?: string }} evt
 * @returns {Promise<{applied: Array, skipped: Array, matched: number}>}
 */
async function processStatusUpdate(evt) {
  const { statusUpdates, stationId, departmentId: explicitDepartmentId, alertId } = evt;
  const updates = Array.isArray(statusUpdates) ? statusUpdates : [];
  if (!updates.length) return { applied: [], skipped: [], matched: 0 };

  let departmentId = explicitDepartmentId != null ? explicitDepartmentId : stationId;
  if (explicitDepartmentId == null) {
    try {
      const dr = await pool.query('SELECT of_station_department($1) AS d', [stationId]);
      if (dr.rows[0]?.d != null) departmentId = dr.rows[0].d;
    } catch (_) { /* keep stationId fallback */ }
  }

  const applied = [];
  const skipped = [];
  // Hoisted so a failed incident-link lookup rides out in the response instead of
  // dying inside the callback (0100 — the swallow this function is fixing).
  let incidentLinkError = null;

  await runWithDepartment(departmentId, null, async () => {
    let fleet;
    try { fleet = await apparatusDb.all(stationId); } catch { fleet = []; }

    // Attach these status changes to the call's incident record, so the per-unit
    // times are attributable and a turnout/travel number can be computed for THIS
    // call. The clock does not depend on it (firstUnitOnScene keys on
    // changed_at >= dispatched_at), but every response-time report does.
    //
    // 🔴 THIS BLOCK USED TO FAIL ON EVERY SINGLE CALL, SILENTLY, SINCE 2026-07-14.
    // cad_alerts.incident_id did not exist (added by migration 0100 on 2026-07-26),
    // so the SELECT threw 42703 and `catch (_)` ate it — leaving incidentId null
    // forever. 163 of 175 unit_status_history rows on prod carry no incident_id
    // because of it. The swallow is why nobody noticed for twelve days: a catch
    // that discards its error is a check that cannot fail (F11), inside a function
    // whose own header says its purpose is that "a CAD feed that silently drops
    // arrivals is the exact silent-failure class we are killing."
    //
    // A missing link is legitimate (no alertId, or the call was never linked to a
    // saved incident). A FAILING QUERY IS NOT — it is reported, never swallowed.
    let incidentId = null;
    if (alertId) {
      try {
        const r = await pool.query(
          'SELECT incident_id FROM cad_alerts WHERE alert_id = $1 AND station_id = $2 ORDER BY id DESC LIMIT 1',
          [String(alertId), stationId]
        );
        incidentId = r.rows[0]?.incident_id ?? null;
      } catch (e) {
        incidentLinkError = e.message;
        console.error('[CAD] incident-link lookup FAILED (status updates will be unattributed):', e.message);
      }
    }

    for (const u of updates) {
      const token  = String(u?.unit || '').trim();
      const rawSt  = String(u?.status || '').trim();
      if (!token)  { skipped.push({ unit: token, status: rawSt, reason: 'no_unit' }); continue; }

      // 1) map the CAD status word — unknown word flips nothing.
      const status = normalizeCadStatus(rawSt);
      if (!status) { skipped.push({ unit: token, status: rawSt, reason: 'unknown_status' }); continue; }

      // 2) resolve the unit — matchApparatus is fail-safe (exact single match only).
      const appt = matchApparatus(token, fleet);
      if (!appt) { skipped.push({ unit: token, status: rawSt, reason: 'unit_not_matched' }); continue; }

      // 3) write through the CANONICAL path. userId null = CAD source, matching the
      //    existing autoDispatchUnits convention (changed_by is null for both).
      try {
        await unitStatus.set(stationId, {
          apparatusId: appt.id, designation: appt.designation,
          status, incidentId, userId: null,
        });
        applied.push({ unit: appt.designation, status });
      } catch (e) {
        // e.g. an invalid status slipped the normaliser — reported, never silent.
        skipped.push({ unit: token, status: rawSt, reason: 'write_failed' });
      }
    }
  });

  if (applied.length > 0) {
    // Id-only ping — clients refetch the authed /api/units/status.
    broadcastUnitStatusChanged(departmentId, { cad: 'status', n: applied.length });
  }

  const out = { applied, skipped, matched: applied.length };
  // Surfaced, never swallowed: the caller (and the CAD vendor) learns that these
  // status updates could not be attributed to a call, and why.
  if (incidentLinkError) out.incidentLinkError = incidentLinkError;
  return out;
}

module.exports = {
  processDispatch, processClose, processStatusUpdate, resolveStationId,
  // exported for tests (P2-D4 PSAP extraction)
  extractPsapTimes, parsePsapInstant,
};
