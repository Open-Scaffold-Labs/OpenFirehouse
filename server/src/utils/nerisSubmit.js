'use strict';
/**
 * utils/nerisSubmit.js — the ONE NERIS submission engine (Track B, 2026-07-20).
 * docs/NERIS-BULLETPROOF-BUILD-2026-07-16.md, Track B decisions TB-D1..D5.
 *
 * DOCTRINE:
 * - Submission is a MIRROR of the local record, never the other way around. The
 *   approve transition is the trigger; its outcome can NEVER fail or roll back
 *   the approval (submitAfterApproval is caught end-to-end, bounded by the
 *   client's timeout, and only ever WRITES the server-owned submission axis).
 * - TWO status axes: neris_submission_state (ours: not_submitted · submitted ·
 *   update_pending · submit_failed · refused) and neris_incident_status
 *   (NERIS's, stored VERBATIM — an unknown future value is stored + logged,
 *   never crashed on).
 * - Refused (4xx) is TERMINAL + LOUD: a human fixes the report and re-approves.
 *   Unavailable (5xx/network/timeout) is RETRYABLE + QUIET: the hourly sweep or
 *   a manual retry lands it (the syncCore refused-vs-failed lesson).
 * - The SUBMITTED window (live-learned 2026-07-20): a freshly-created NERIS
 *   record refuses updates until its async pipeline moves it. An update against
 *   a non-updatable status is "NOT YET" — recorded as update_pending, never
 *   surfaced as an error.
 * - Lost-ACK recovery: neris_id is deterministic (dept|incident_number|
 *   epoch(call_create) as first submitted). Before any create-retry we GET the
 *   constructed id; if the record exists, we ADOPT it instead of double-creating
 *   (a create retried past a dropped ACK must never mint a duplicate).
 * - NERIS rejection/refusal NEVER auto-flips the local review status — a human
 *   decides (market + radio-doctrine spirit: no silent state changes).
 */

const db = require('../db');
const defaultClient = require('./nerisClient');
const { buildNerisIncidentPayload } = require('./nerisPayload');

// The spec's incident-status enum (v1.4.76) — used to sanity-log unknowns only;
// storage stays verbatim (D2). Never used to refuse ingestion.
const NERIS_INCIDENT_STATUS_VALUES = Object.freeze([
  'SUBMITTED', 'PENDING_APPROVAL', 'PENDING_INCIDENT_DATA', 'APPROVED', 'REJECTED', 'FAILED', 'DELETED',
]);
// Statuses NERIS accepts a PUT against (live-learned + spec description).
const UPDATABLE_NERIS_STATUSES = new Set([
  'REJECTED', 'PENDING_INCIDENT_DATA', 'APPROVED', 'PENDING_APPROVAL',
]);
// Non-terminal statuses the sweep keeps polling.
const POLLABLE_NERIS_STATUSES = new Set([
  'SUBMITTED', 'PENDING_APPROVAL', 'PENDING_INCIDENT_DATA',
]);

const entry = (op, outcome, extra = {}) => ({ at: new Date().toISOString(), op, outcome, ...extra });

/** Sanitized, bounded error text for the submission log (never echo payloads). */
function errText(err) {
  return String((err && (err.detail || err.reason || err.message)) || 'unknown').slice(0, 300);
}

function statusOf(data) {
  if (!data) return null;
  const s = data.incident_status;
  if (s && typeof s === 'object' && typeof s.status === 'string') return s.status;
  if (typeof s === 'string') return s;
  return typeof data.status === 'string' ? data.status : null;
}

async function departmentRowFor(departmentId) {
  const { rows } = await db.pool.query(
    'SELECT id, name, fdid, neris_id, neris_submission_enabled FROM departments WHERE id = $1',
    [departmentId]
  );
  return rows[0] || null;
}

async function nfirsReportFor(incidentNumber, departmentId) {
  if (!incidentNumber) return {};
  const { rows } = await db.pool.query(
    'SELECT * FROM nfirs_reports WHERE "incidentNumber" = $1 AND department_id = $2 LIMIT 1',
    [incidentNumber, departmentId]
  );
  return rows[0] || {};
}

/** Build the submittable payload for a persisted incident (the ONE transformer,
 *  assembled exactly like the export route: incident + matching report + dept +
 *  the registered-unit map so unit_responses carry unit_neris_id, SR-D5). */
async function buildForIncident(incident, department) {
  const report = await nfirsReportFor(incident.incidentNumber, incident.department_id);
  const { registeredUnitMap } = require('./nerisRegistry');
  const registeredUnits = await registeredUnitMap(incident.department_id).catch(() => null);
  return buildNerisIncidentPayload({
    incident, nfirsReport: report, department,
    options: registeredUnits ? { registeredUnits } : {},
  });
}

/**
 * The deterministic NERIS id this incident WOULD have been created under —
 * `dept|incident_number|epoch(call_create)` per the spec's neris_id description.
 * Used only for lost-ACK recovery probes. Returns null when call_create absent.
 */
function expectedNerisId(entityId, payload) {
  const num = payload && payload.dispatch && payload.dispatch.incident_number;
  const cc = payload && payload.dispatch && payload.dispatch.call_create;
  if (!entityId || !num || !cc) return null;
  const t = new Date(cc).getTime();
  if (!Number.isFinite(t)) return null;
  return `${entityId}|${num}|${Math.floor(t / 1000)}`;
}

/**
 * Core state machine. Loads fresh rows, builds, and performs exactly one
 * submission attempt (create or update). Writes the submission axis + log.
 * NEVER throws. Returns { attempted, state } for callers that surface results.
 *
 * `client` injectable for tests. `reason` tags the log ('approve'|'sweep'|'retry').
 */
async function attemptSubmission(incidentId, departmentId, { client = defaultClient, reason = 'approve' } = {}) {
  const write = (patch, logEnt) => db.incidents.nerisSubmissionUpdate(incidentId, departmentId, patch, logEnt);
  try {
    const incident = await db.incidents.findById(incidentId, departmentId);
    if (!incident || incident.neris_status !== 'approved') {
      // Only an approved report is ever mirrored (return_to_draft parks retries).
      return { attempted: false, state: incident ? incident.neris_submission_state : null };
    }
    const department = await departmentRowFor(departmentId);
    if (!department || department.neris_submission_enabled !== true || !String(department.neris_id || '').trim()) {
      return { attempted: false, state: incident.neris_submission_state };
    }
    if (!client.isConfigured()) {
      await write({ neris_submission_state: incident.neris_incident_uid ? 'update_pending' : 'submit_failed' },
        entry(reason, 'skipped_unconfigured', { error: 'NERIS credentials not configured' }));
      return { attempted: false, state: 'submit_failed' };
    }

    const entityId = String(department.neris_id).trim();
    const { payload, validation } = await buildForIncident(incident, department);

    // The hard gate lives at the SUBMISSION boundary (market-universal): an
    // invalid payload is never sent. Approval itself already succeeded — this
    // surfaces loudly as submit_failed(local_validation) in the chip.
    if (!validation.valid) {
      await write(
        { neris_submission_state: incident.neris_incident_uid ? 'update_pending' : 'submit_failed' },
        entry(reason, 'local_validation_failed', { errors: validation.errors.slice(0, 5) })
      );
      return { attempted: false, state: 'submit_failed' };
    }

    if (!incident.neris_incident_uid) {
      // ── CREATE path, with the lost-ACK recovery probe ─────────────────────
      if (incident.neris_submission_state === 'submit_failed') {
        const probe = expectedNerisId(entityId, payload);
        if (probe) {
          try {
            const got = await client.getIncident(entityId, probe);
            const st = statusOf(got.data);
            if (got.status === 200 && st) {
              await write({
                neris_incident_uid: probe,
                neris_submission_state: 'submitted',
                neris_incident_status: st,
                neris_submitted_at: new Date(),
                neris_status_checked_at: new Date(),
              }, entry(reason, 'adopted_existing', { neris_id: probe, neris_status: st }));
              return { attempted: true, state: 'submitted' };
            }
          } catch (probeErr) {
            // 4xx = record genuinely absent → proceed to create. 5xx → retry later.
            if (probeErr && probeErr.name === 'NerisUnavailableError') {
              await write({}, entry(reason, 'probe_unavailable', { error: errText(probeErr) }));
              return { attempted: true, state: incident.neris_submission_state };
            }
          }
        }
      }
      await client.validateIncident(entityId, payload);
      const created = await client.createIncident(entityId, payload);
      const uid = created.data && created.data.neris_id;
      const st = statusOf(created.data);
      if (!uid) {
        await write({ neris_submission_state: 'submit_failed' },
          entry(reason, 'created_no_uid', { http: created.status }));
        return { attempted: true, state: 'submit_failed' };
      }
      if (st && !NERIS_INCIDENT_STATUS_VALUES.includes(st)) {
        console.warn(`nerisSubmit: unknown NERIS incident status "${st}" — stored verbatim`);
      }
      await write({
        neris_incident_uid: uid,
        neris_submission_state: 'submitted',
        neris_incident_status: st || 'SUBMITTED',
        neris_submitted_at: new Date(),
        neris_status_checked_at: new Date(),
      }, entry(reason, 'created', { neris_id: uid, http: created.status, neris_status: st }));
      return { attempted: true, state: 'submitted' };
    }

    // ── UPDATE path (update-by-UID, honoring the SUBMITTED window) ──────────
    const uid = incident.neris_incident_uid;
    let got;
    try {
      got = await client.getIncident(entityId, uid);
    } catch (gErr) {
      if (gErr && gErr.name === 'NerisRefusedError' && gErr.status === 404) {
        // LIVE-LEARNED (proof run OF-TB-2026-07-20): a freshly-created record
        // 404s on GET while NERIS's async ingest runs. That 404 is "NOT YET
        // VISIBLE" — the fourth face of the window — never a terminal refusal.
        await write({ neris_submission_state: 'update_pending' },
          entry(reason, 'update_deferred_not_visible', { http: 404 }));
        return { attempted: true, state: 'update_pending' };
      }
      throw gErr;
    }
    const current = statusOf(got.data);
    if (current) {
      await write({ neris_incident_status: current, neris_status_checked_at: new Date() });
    }
    if (!current || !UPDATABLE_NERIS_STATUSES.has(current)) {
      // "Not yet" — the third category. Quiet; the sweep lands it.
      await write({ neris_submission_state: 'update_pending' },
        entry(reason, 'update_deferred_window', { neris_status: current }));
      return { attempted: true, state: 'update_pending' };
    }
    await client.validateIncident(entityId, payload);
    const put = await client.putIncident(entityId, uid, payload);
    await write({
      neris_submission_state: 'submitted',
      neris_status_checked_at: new Date(),
    }, entry(reason, 'updated', { neris_id: uid, http: put.status }));
    return { attempted: true, state: 'submitted' };
  } catch (err) {
    try {
      if (err && err.name === 'NerisRefusedError') {
        // TERMINAL — NERIS refused this content. Loud in the chip; a human
        // fixes the report and re-approves. Never blind-retried.
        await write({ neris_submission_state: 'refused' },
          entry(reason, 'refused', { http: err.status, error: errText(err) }));
        return { attempted: true, state: 'refused' };
      }
      // Retryable — NERIS failed to process (5xx/network/timeout) or an
      // unexpected local error. The record keeps (or gains) its retryable state.
      const inc = await db.incidents.findById(incidentId, departmentId).catch(() => null);
      const state = inc && inc.neris_incident_uid ? 'update_pending' : 'submit_failed';
      await write({ neris_submission_state: state },
        entry(reason, 'failed_retryable', { error: errText(err) }));
      return { attempted: true, state };
    } catch (writeErr) {
      // Even the failure-record write failed — log and stand down. The sweep's
      // approved+state predicate will still find the record via its old state.
      console.error('nerisSubmit: failed to record submission failure:', writeErr.message);
      return { attempted: true, state: null };
    }
  }
}

/**
 * Fire-and-record wrapper for the approve seam. NEVER throws; the approval
 * response includes whatever state resulted. (P5 note: this runs inside the
 * request; the client's timeout bounds how long the txn's connection is held.)
 */
async function submitAfterApproval(incidentId, departmentId, opts = {}) {
  return attemptSubmission(incidentId, departmentId, { ...opts, reason: opts.reason || 'approve' });
}

/** Status poll for one record (sweep + on-open refresh). NEVER throws. */
async function refreshNerisStatus(incidentId, departmentId, { client = defaultClient } = {}) {
  try {
    const incident = await db.incidents.findById(incidentId, departmentId);
    if (!incident || !incident.neris_incident_uid) return { refreshed: false };
    const department = await departmentRowFor(departmentId);
    if (!department || !String(department.neris_id || '').trim() || !client.isConfigured()) {
      return { refreshed: false };
    }
    const got = await client.getIncident(String(department.neris_id).trim(), incident.neris_incident_uid);
    const st = statusOf(got.data);
    if (!st) return { refreshed: false };
    if (!NERIS_INCIDENT_STATUS_VALUES.includes(st)) {
      console.warn(`nerisSubmit: unknown NERIS incident status "${st}" — stored verbatim`);
    }
    await db.incidents.nerisSubmissionUpdate(incidentId, departmentId, {
      neris_incident_status: st,
      neris_status_checked_at: new Date(),
    }, st === 'REJECTED' ? entry('poll', 'rejected_observed', { neris_status: st }) : null);
    return { refreshed: true, neris_status: st };
  } catch (err) {
    if (err && err.name === 'NerisRefusedError') {
      // A 4xx on GET (e.g. record deleted NERIS-side) — record the observation.
      await db.incidents.nerisSubmissionUpdate(incidentId, departmentId,
        { neris_status_checked_at: new Date() },
        entry('poll', 'get_refused', { http: err.status, error: errText(err) })).catch(() => {});
    }
    return { refreshed: false };
  }
}

module.exports = {
  attemptSubmission,
  submitAfterApproval,
  refreshNerisStatus,
  // exported for tests + the sweep
  NERIS_INCIDENT_STATUS_VALUES,
  UPDATABLE_NERIS_STATUSES,
  POLLABLE_NERIS_STATUSES,
  expectedNerisId,
};
