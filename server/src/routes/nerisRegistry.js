'use strict';
/**
 * routes/nerisRegistry.js — chief-gated NERIS station/unit registration (SR).
 * Mounted at /api/neris-registry behind requireAuth. The engine
 * (utils/nerisRegistry) is the ONE brain — these routes authorize, invoke,
 * and audit. Explicit human actions only (the market pattern); no background
 * sync. Registration is allowed BEFORE submission is enabled — setup precedes
 * go-live.
 */

const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireChief } = require('../middleware/requireRole');
const { audit } = require('../utils/auditLog');
const { registerStation, registerUnit, pushStationUpdate, pushUnitUpdate } = require('../utils/nerisRegistry');
const { isValidNerisType } = require('../constants/nerisUnitTypes');

const router = express.Router();
const idParam = z.object({ id: z.string().regex(/^\d+$/) });

// ── GET /api/neris-registry/overview — everything the settings panel needs ────
// Houses + rigs with registration state, needs-flags, and a staffing prefill
// (the rig's Phase-E seat-template count — a SUGGESTION the chief confirms,
// never auto-submitted).
router.get('/overview', requireChief, scoped(async ({ user }) => {
  const [stations, apparatus, positions] = await Promise.all([
    db.pool.query(
      'SELECT id, name, address, city, state, zip, neris_station_id FROM stations WHERE department_id = $1 ORDER BY id ASC',
      [user.department_id]),
    db.pool.query(
      'SELECT id, designation, type, neris_type, neris_unit_id, station_id FROM apparatus WHERE department_id = $1 ORDER BY designation ASC',
      [user.department_id]),
    db.pool.query(
      `SELECT a.id AS apparatus_id, COUNT(p.id)::int AS position_count
       FROM apparatus a LEFT JOIN apparatus_positions p ON p.apparatus_id = a.id
       WHERE a.department_id = $1 GROUP BY a.id`,
      [user.department_id]),
  ]);
  const posMap = {};
  for (const r of positions.rows) posMap[r.apparatus_id] = r.position_count;
  const stationById = {};
  for (const s of stations.rows) stationById[s.id] = s;

  return { data: {
    stations: stations.rows.map((s) => ({
      ...s,
      registered: !!s.neris_station_id,
      missing_fields: ['address', 'city', 'state', 'zip'].filter((k) => !String(s[k] || '').trim()),
    })),
    apparatus: apparatus.rows.map((a) => {
      const house = a.station_id ? stationById[a.station_id] : null;
      return {
        ...a,
        registered: !!a.neris_unit_id,
        needs_type: !isValidNerisType(a.neris_type),
        needs_station: !house || !house.neris_station_id,
        staffing_prefill: posMap[a.id] || null,
      };
    }),
  } };
}));

// ── POST /api/neris-registry/stations/:id/register ────────────────────────────
router.post('/stations/:id/register', requireChief,
  validate({ params: idParam }),
  scoped(async ({ req, user }) => {
    const id = Number(req.params.id);
    audit(user.department_id, user, 'neris_register_station', 'stations', id, {});
    const result = await registerStation(id, user.department_id);
    if (!result.ok && result.needs) {
      throw httpError(422, registerNeedsMessage(result), 'REGISTRATION_INCOMPLETE', result);
    }
    if (!result.ok) {
      throw httpError(result.refused ? 422 : 503,
        result.refused ? `NERIS refused the registration: ${result.reason}` : `NERIS is unreachable: ${result.reason}`,
        result.refused ? 'NERIS_REFUSED' : 'NERIS_UNAVAILABLE');
    }
    return { data: result };
  })
);

// ── POST /api/neris-registry/apparatus/:id/register ───────────────────────────
const unitBody = z.object({
  staffing: z.number().int().min(0).max(50),
  cad_designation_2: z.string().max(64).optional(),
  dedicated_staffing: z.boolean().optional(),
});
router.post('/apparatus/:id/register', requireChief,
  validate({ params: idParam, body: unitBody }),
  scoped(async ({ req, user }) => {
    const id = Number(req.params.id);
    audit(user.department_id, user, 'neris_register_unit', 'apparatus', id, { staffing: req.body.staffing });
    const result = await registerUnit(id, user.department_id, req.body);
    if (!result.ok && result.needs) {
      throw httpError(422, registerNeedsMessage(result), 'REGISTRATION_INCOMPLETE', result);
    }
    if (!result.ok) {
      throw httpError(result.refused ? 422 : 503,
        result.refused ? `NERIS refused the registration: ${result.reason}` : `NERIS is unreachable: ${result.reason}`,
        result.refused ? 'NERIS_REFUSED' : 'NERIS_UNAVAILABLE');
    }
    return { data: result };
  })
);

// ── POST /api/neris-registry/stations/:id/push-update — re-push local edits ───
router.post('/stations/:id/push-update', requireChief,
  validate({ params: idParam }),
  scoped(async ({ req, user }) => {
    const id = Number(req.params.id);
    audit(user.department_id, user, 'neris_update_station', 'stations', id, {});
    const result = await pushStationUpdate(id, user.department_id);
    if (!result.ok && result.needs) throw httpError(422, registerNeedsMessage(result), 'REGISTRATION_INCOMPLETE', result);
    if (!result.ok) {
      throw httpError(result.refused ? 422 : 503,
        result.refused ? `NERIS refused the update: ${result.reason}` : `NERIS is unreachable: ${result.reason}`,
        result.refused ? 'NERIS_REFUSED' : 'NERIS_UNAVAILABLE');
    }
    return { data: result };
  })
);

// ── POST /api/neris-registry/apparatus/:id/push-update ────────────────────────
router.post('/apparatus/:id/push-update', requireChief,
  validate({ params: idParam, body: unitBody }),
  scoped(async ({ req, user }) => {
    const id = Number(req.params.id);
    audit(user.department_id, user, 'neris_update_unit', 'apparatus', id, { staffing: req.body.staffing });
    const result = await pushUnitUpdate(id, user.department_id, req.body);
    if (!result.ok && result.needs) throw httpError(422, registerNeedsMessage(result), 'REGISTRATION_INCOMPLETE', result);
    if (!result.ok) {
      throw httpError(result.refused ? 422 : 503,
        result.refused ? `NERIS refused the update: ${result.reason}` : `NERIS is unreachable: ${result.reason}`,
        result.refused ? 'NERIS_REFUSED' : 'NERIS_UNAVAILABLE');
    }
    return { data: result };
  })
);

function registerNeedsMessage(result) {
  switch (result.needs) {
    case 'entity_id': return 'Set your NERIS entity ID in Settings first.';
    case 'credentials': return 'NERIS credentials are not configured on the server.';
    case 'fields': return `The station is missing required fields for NERIS: ${(result.missing || []).join(', ')}.`;
    case 'type': return 'This rig needs its NERIS unit type chosen first (Apparatus page) — the legacy label is ambiguous and is never guessed.';
    case 'staffing': return 'Enter the unit\'s minimum staffing (a whole number, 0 or more).';
    case 'designation': return result.reason || 'The CAD designation is not NERIS-valid.';
    case 'station': return 'Register this rig\'s station first — units register under their house.';
    default: return 'Registration prerequisites are not met.';
  }
}

module.exports = router;
