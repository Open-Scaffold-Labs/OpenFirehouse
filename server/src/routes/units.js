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
const COMMITTED_STATUSES = new Set(['dispatched', 'enroute', 'on_scene']);

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
    const units = await db.unitStatus.list(req.user.department_id);
    await flagOrphanedUnits(req.user.department_id, units);
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
    const row = await db.unitStatus.set(req.user.department_id, {
      apparatusId: appt ? apparatusId : null,
      designation,
      status,
      incidentId: incidentId || null,
      userId: req.user.id,
    });
    broadcastUnitStatusChanged(req.user.department_id, { apparatus_id: row.apparatus_id, status: row.status });
    res.json({ data: row });
  } catch (e) {
    console.error('PATCH /units/:apparatusId/status error:', e);
    res.status(500).json({ error: 'Failed to update unit status' });
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
