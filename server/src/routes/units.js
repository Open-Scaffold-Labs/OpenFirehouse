'use strict';
/**
 * routes/units.js — live per-unit (apparatus) status lifecycle (Phase 2).
 *
 *   GET   /api/units/status              — current status of every unit (any authed user, read)
 *   PATCH /api/units/:apparatusId/status — set one unit's status (dispatch/command any; rig officer own)
 *   POST  /api/units/reset               — reset all units to 'in_service' (dispatch/command)
 *
 * Mounted AFTER the global requireAuth in index.js, so req.user is populated.
 * Status changes broadcast over the existing station-scoped SSE channel
 * (Supabase Realtime) so boards/dashboards/TV update live.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireDispatch }        = require('../middleware/requireDispatch');
const { requireUnitStatusAuth }  = require('../middleware/requireUnitStatusAuth');
const { computeTimer }           = require('../utils/statusTimers');
const { broadcastUnitStatusChanged, broadcastUnitLocationsUpdate } = require('../config/supabaseRealtime');
const { parseUnitList, matchApparatus } = require('../cad/unitMatch');

// RADIO DOCTRINE: the app never auto-flips a unit's status — only dispatch
// does, after verbal radio traffic. The committed (non-dispatchable) statuses
// are dispatched / en route / on scene; a unit still committed whose call has
// been cleared is flagged `orphaned: true` so boards can remind dispatch to
// confirm its real status over the radio. The three DISPATCHABLE statuses are
// 'in_service' (ready, in quarters), 'returning' (back in service, heading to
// quarters), and 'on_the_air' (in service, in-district, out of quarters —
// driver training, district familiarization). 'out_of_service' (fuel / training
// / aerial check) is not dispatchable. (Status model: migration 0022, 2026-06-15.)
// Shared with routes/cad.js via cad/unitCommitment.js (single source of truth
// for "committed to which call"; re-exported below for test compatibility).
const {
  COMMITTED_STATUSES, unitOnActiveCall, clearSuggestionForUnit, rigGateApplies,
} = require('../cad/unitCommitment');

async function flagOrphanedUnits(stationId, units) {
  try {
    const committed = units.filter((u) => COMMITTED_STATUSES.has(u.status) && u.apparatus_id != null);
    if (!committed.length) return;
    const active = await db.cadAlerts.recent(stationId, 100); // uncleared only
    const fleet = units
      .filter((u) => u.apparatus_id != null)
      .map((u) => ({ id: u.apparatus_id, designation: u.designation }));
    const covered = new Set();
    for (const a of active || []) {
      for (const t of parseUnitList(a.units || '')) {
        const m = matchApparatus(t, fleet);
        if (m) covered.add(m.id);
      }
    }
    for (const u of units) {
      u.orphaned = COMMITTED_STATUSES.has(u.status) && u.apparatus_id != null && !covered.has(u.apparatus_id);
    }
  } catch (e) {
    // Best-effort flag — never fail the status read over it.
    console.warn('units/status orphan flag failed:', e.message);
  }
}

// GET /api/units/status — read current status of every unit (any authed user).
router.get('/status', async (req, res) => {
  try {
    // ONE runWithDepartment for list + orphan flag (the orphan check reads
    // cad_alerts, which under RLS returns EMPTY without the dept GUC — an
    // unwrapped call flags EVERY committed unit as orphaned; found live
    // 2026-07-12). GRACEFUL DEGRADATION: this is the hottest polled route and
    // the max:1 serverless pool can hit a connect-timeout when another txn
    // holds the client (lesson #12) — the BOARD MUST STILL RENDER, so on any
    // wrap failure fall back to a plain unwrapped list with no orphan flags
    // (best-effort by original design) instead of 500ing the board.
    // TWO-ZONE RULE (learned live 2026-07-12): /api/units mounts AFTER
    // middleware/dbTransaction — every request here ALREADY runs inside the
    // per-request txn with the dept GUC on the ONE pooled client (max:1).
    // Plain pool.query calls inherit it via ALS. NEVER call runWithDepartment
    // in this router: it tries to check out a SECOND client and deadlocks
    // into a 5s connect timeout (observed: every /units/status degraded).
    // (routes/cad.js is the opposite zone — mounted BEFORE the txn middleware
    // for webhook ingest, so THERE runWithDepartment is required.)
    const units = await db.unitStatus.list(req.user.department_id);
    await flagOrphanedUnits(req.user.department_id, units);
    // Status timers (0046): overdue computed AT READ TIME from updated_at +
    // latest dispatcher ack. Best-effort — never breaks the board.
    try {
      const config = await db.statusTimerConfig(req.user.department_id);
      const acks   = await db.unitStatusAcks.latestPerUnit(req.user.department_id);
      const now = new Date();
      for (const u of units) {
        u.timer = computeTimer(u.status, u.updated_at, acks.get(u.apparatus_id) ?? null, config, now);
      }
    } catch (te) {
      console.warn('status timers failed (board renders without them):', te.message);
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ data: units });
  } catch (e) {
    console.error('GET /units/status error:', e);
    res.status(500).json({ error: 'Failed to load unit statuses' });
  }
});

// PATCH /api/units/:apparatusId/status — set one unit's status.
router.patch('/:apparatusId/status', requireUnitStatusAuth, async (req, res) => {
  try {
    const apparatusId = Number(req.params.apparatusId);
    const { status, incidentId } = req.body || {};
    if (!db.UNIT_STATUS_VALUES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${db.UNIT_STATUS_VALUES.join(', ')}` });
    }
    const appt = Number.isInteger(apparatusId)
      ? await db.apparatus.findById(apparatusId, req.user.department_id)
      : null;
    const designation = appt?.designation || (req.body?.designation || '').trim();
    if (!appt && !designation) {
      return res.status(404).json({ error: 'Unknown apparatus' });
    }

    // SERVER-SIDE COMMITTED-STATUS PRECONDITION (2026-07-12). A rig-side actor
    // (unit login / run-list officer — req.rigActor from requireUnitStatusAuth)
    // may set a COMMITTED status only while its unit is named on an UNCLEARED
    // call: a committed status always attaches to an incident (the public CAD
    // functional standard's invariant — enforced here at the API layer, not
    // just the client's rigStepAllowed gate). Dispatch/command are exempt
    // (radio doctrine: they status ANY unit, any time), and the ladder's tail
    // (returning / in_service / on_the_air / out_of_service) never needs a
    // call — command terminated ≠ units released. Fail CLOSED on a read error:
    // a rig can't go EN ROUTE on a call the server can't see.
    // Gate refined 2026-07-13 (rigGateApplies): the active-call requirement
    // applies when a rig ENTERS the committed family or steps out of an
    // orphaned 'dispatched' — a rig already working (enroute/on_scene/
    // transporting/at_hospital) may always progress deeper and walk home.
    // (Fixes a live edge: enroute rig whose call cleared early was 409'd
    // pressing ON SCENE. Mirrors mobile rigStepAllowed.)
    let currentStatus = null;
    if (req.rigActor && COMMITTED_STATUSES.has(status)) {
      try {
        const list = await db.unitStatus.list(req.user.department_id);
        currentStatus = list.find((x) => x.apparatus_id === apparatusId)?.status ?? null;
      } catch { /* fail closed below via gate */ }
    }
    if (req.rigActor && rigGateApplies(currentStatus, status)) {
      let onCall = false;
      try {
        // Plain call — the per-request txn already carries the dept GUC here
        // (two-zone rule above); wrapping would deadlock the max:1 pool.
        onCall = await unitOnActiveCall(req.user.department_id, appt ? apparatusId : null, designation);
      } catch (e) {
        console.error('unitOnActiveCall check failed (fail closed):', e.message);
      }
      if (!onCall) {
        return res.status(409).json({
          error: 'This unit is not on an active call — EN ROUTE / ON SCENE need one. Confirm over the radio; dispatch can set any status.',
          code: 'NO_ACTIVE_CALL',
        });
      }
    }

    const row = await db.unitStatus.set(req.user.department_id, {
      apparatusId: appt ? apparatusId : null,
      designation,
      status,
      incidentId: incidentId || null,
      userId: req.user.id,
    });
    broadcastUnitStatusChanged(req.user.department_id, { apparatus_id: row.apparatus_id, status: row.status });

    // Last-unit clear suggestion (2026-07-12, the mature-CAD reverse prompt):
    // when DISPATCH/COMMAND moves a unit OUT of a committed status and that
    // leaves an active call with zero committed units, suggest closing the
    // call. Suggestion only — the dispatcher decides; rigs never see it
    // (clearing calls is a dispatch function). Best-effort: a failure here
    // must never fail the status write itself.
    let clearSuggestion = null;
    if (!req.rigActor && !COMMITTED_STATUSES.has(status) && appt) {
      try {
        // Plain call — ambient per-request GUC (two-zone rule).
        clearSuggestion = await clearSuggestionForUnit(req.user.department_id, apparatusId, designation);
      } catch (e) {
        console.warn('clearSuggestionForUnit failed (ignored):', e.message);
      }
    }

    res.json({ data: row, clearSuggestion });
  } catch (e) {
    console.error('PATCH /units/:apparatusId/status error:', e);
    res.status(500).json({ error: 'Failed to update unit status' });
  }
});

// POST /api/units/:apparatusId/status-ack — the dispatcher's recorded "status
// check" acknowledgment for an overdue unit (0046, LEITSC §1.7.3: "record the
// acknowledgement… which will automatically reset the timer"). Dispatch/command
// only — acknowledging a safety timer is a dispatch function. The ack is a
// HUMAN action following radio traffic; it never changes the unit's status.
router.post('/:apparatusId/status-ack', requireDispatch, async (req, res) => {
  try {
    const apparatusId = Number(req.params.apparatusId);
    if (!Number.isInteger(apparatusId)) return res.status(400).json({ error: 'Invalid apparatus id' });

    // Plain calls — ambient per-request GUC (two-zone rule at GET /status).
    const appt = await db.apparatus.findById(apparatusId, req.user.department_id);
    if (!appt) return res.status(404).json({ error: 'Unknown apparatus' });
    const list = await db.unitStatus.list(req.user.department_id);
    const u = list.find((x) => x.apparatus_id === apparatusId);
    const row = await db.unitStatusAcks.insert({
      departmentId: req.user.department_id,
      stationId: appt.station_id ?? null,
      apparatusId,
      designation: appt.designation || '',
      status: u?.status || 'unknown',
      statusSince: u?.updated_at ?? null,
      ackedBy: req.user.id,
    });

    broadcastUnitStatusChanged(req.user.department_id, { ack: apparatusId }); // boards refresh
    res.status(201).json({ data: { apparatusId, ackedAt: row.acked_at } });
  } catch (e) {
    console.error('POST /units/:apparatusId/status-ack error:', e);
    res.status(500).json({ error: 'Failed to record status check' });
  }
});

// POST /api/units/reset — dispatch/command resets every committed unit to 'in_service'.
router.post('/reset', requireDispatch, async (req, res) => {
  try {
    const reset = await db.unitStatus.resetAll(req.user.department_id, req.user.id);
    broadcastUnitStatusChanged(req.user.department_id, { reset });
    res.json({ data: { reset } });
  } catch (e) {
    console.error('POST /units/reset error:', e);
    res.status(500).json({ error: 'Failed to reset units' });
  }
});

// ─── Live rig GPS (Phase 1, migration 0023) ─────────────────────────────────

// GET /api/units/locations — every rig's position in the last 5 min (dept-scoped).
router.get('/locations', async (req, res) => {
  try {
    const rows = await db.unitLocations.listActive(req.user.department_id);
    res.set('Cache-Control', 'no-store');
    res.json({
      data: rows.map((r) => ({
        apparatusId: r.apparatus_id, designation: r.designation, type: r.type,
        lat: r.latitude, lng: r.longitude, heading: r.heading, speed: r.speed,
        accuracy: r.accuracy, status: r.status, updatedAt: r.updated_at,
      })),
    });
  } catch (e) {
    console.error('GET /units/locations error:', e);
    res.status(500).json({ error: 'Failed to load unit locations' });
  }
});

// PATCH /api/units/:apparatusId/location — the crew's device reports its rig's GPS.
// Any authed user; fire-and-forget from the client (204). Low-quality fixes are dropped.
router.patch('/:apparatusId/location', async (req, res) => {
  try {
    const apparatusId = Number(req.params.apparatusId);
    const { latitude, longitude, heading, speed, accuracy } = req.body || {};
    if (!Number.isInteger(apparatusId)) {
      return res.status(400).json({ error: 'Invalid apparatus id' });
    }
    if (typeof latitude !== 'number' || typeof longitude !== 'number'
        || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'latitude/longitude out of range' });
    }
    // Drop cold-start / urban-canyon noise so the map never shows a wrong position.
    if (typeof accuracy === 'number' && accuracy > 100) {
      return res.status(400).json({ error: 'GPS accuracy too low', code: 'LOW_ACCURACY' });
    }
    const appt = await db.apparatus.findById(apparatusId, req.user.department_id);
    if (!appt) return res.status(404).json({ error: 'Unknown apparatus' });

    const row = await db.unitLocations.upsert(req.user.department_id, {
      apparatusId,
      stationId: appt.station_id,
      latitude, longitude,
      heading: typeof heading === 'number' ? heading : null,
      speed: typeof speed === 'number' ? speed : null,
      accuracy: typeof accuracy === 'number' ? accuracy : null,
    });
    // Id + coords only — no PII on the channel.
    broadcastUnitLocationsUpdate(req.user.department_id, {
      apparatusId, designation: appt.designation,
      lat: row.latitude, lng: row.longitude, heading: row.heading, speed: row.speed,
      updatedAt: row.updated_at,
    });
    res.status(204).end();
  } catch (e) {
    console.error('PATCH /units/:apparatusId/location error:', e);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

module.exports = router;
// Exported for tests (unitStatusPrecondition.test.js).
module.exports.unitOnActiveCall  = unitOnActiveCall;
module.exports.COMMITTED_STATUSES = COMMITTED_STATUSES;
