'use strict';
/**
 * utils/nerisRegistry.js — the ONE NERIS station/unit registrar (SR build,
 * 2026-07-20). docs/NERIS-BULLETPROOF-BUILD-2026-07-16.md, SR decisions.
 *
 * DOCTRINE:
 * - Create-from-RMS with an EXPLICIT chief action (the market majority). No
 *   background sync; edits re-push via an explicit update action.
 * - RECONCILE-BEFORE-CREATE: the documented market failure is dual writers
 *   minting duplicate/mismatched ids. Vendors solve it by instructing humans;
 *   we solve it mechanically — read GET /entity (stations + nested units) and
 *   ADOPT an existing record before ever creating: stations match on our
 *   internal_id (deterministic — we send String(stations.id) at create) or
 *   exact station_id; units match on exact cad_designation_1.
 * - NOTHING GUESSED: a rig without a neris_type (the 0042 deliberately-unmapped
 *   families) or a missing staffing number is refused back to the human with a
 *   `needs` field — never defaulted onto a national registry.
 * - Stations before units (spec + market): a unit registers under its house's
 *   neris_station_id; unregistered house → needs:'station'.
 * - Local deletes NEVER auto-delete national records (deliberate — surfaced in
 *   the UI copy instead).
 * - Same error taxonomy as the submit engine: refused (4xx, terminal, human
 *   fixes) vs unavailable (retry later). Results are RETURNED, never thrown.
 */

const db = require('../db');
const defaultClient = require('./nerisClient');
const { isValidNerisType } = require('../constants/nerisUnitTypes');

// The spec's cad_designation pattern (UnitPayload, v1.4.76) — validated BEFORE
// the wire so a bad designation is a local fix, not a national 422.
const CAD_DESIGNATION_RE = /^[\w()#\- ]{1,64}$/;

const errText = (err) => String((err && (err.detail || err.reason || err.message)) || 'unknown').slice(0, 300);
const failFrom = (err) => (err && err.name === 'NerisRefusedError'
  ? { ok: false, refused: true, reason: errText(err) }
  : { ok: false, refused: false, reason: errText(err) });

async function deptRow(departmentId) {
  const { rows } = await db.pool.query(
    'SELECT id, neris_id FROM departments WHERE id = $1', [departmentId]);
  return rows[0] || null;
}

async function stationRow(id, departmentId) {
  const { rows } = await db.pool.query(
    'SELECT id, name, address, city, state, zip, neris_station_id FROM stations WHERE id = $1 AND department_id = $2',
    [id, departmentId]);
  return rows[0] || null;
}

async function apparatusRow(id, departmentId) {
  const { rows } = await db.pool.query(
    'SELECT id, designation, type, neris_type, neris_unit_id, station_id FROM apparatus WHERE id = $1 AND department_id = $2',
    [id, departmentId]);
  return rows[0] || null;
}

/** SERVER-OWNED writers — the only paths that set the registry ids. */
async function setStationNerisId(id, departmentId, nerisStationId) {
  await db.pool.query(
    'UPDATE stations SET neris_station_id = $1 WHERE id = $2 AND department_id = $3',
    [nerisStationId, id, departmentId]);
}
async function setUnitNerisId(id, departmentId, nerisUnitId) {
  await db.pool.query(
    'UPDATE apparatus SET neris_unit_id = $1, "updatedAt" = NOW() WHERE id = $2 AND department_id = $3',
    [nerisUnitId, id, departmentId]);
}

/** Fetch the entity's registered stations (with nested units) for reconciliation. */
async function entityStations(client, entityId) {
  const got = await client.getEntity(entityId);
  const stations = (got.data && Array.isArray(got.data.stations)) ? got.data.stations : [];
  return stations;
}

function stationPayloadFor(station) {
  return {
    address_line_1: String(station.address || '').trim(),
    city: String(station.city || '').trim(),
    state: String(station.state || '').trim(),
    zip_code: String(station.zip || '').trim(),
    station_id: String(station.name || '').trim().slice(0, 128),
    internal_id: String(station.id),   // OUR deterministic reconciliation key
  };
}

/**
 * Register one house. Returns:
 *   { ok:true, neris_station_id, adopted }            — registered (or adopted)
 *   { ok:false, needs:'fields', missing:[…] }          — local data incomplete
 *   { ok:false, refused, reason }                      — NERIS refused / down
 */
async function registerStation(stationLocalId, departmentId, { client = defaultClient } = {}) {
  try {
    const dept = await deptRow(departmentId);
    const entityId = dept && String(dept.neris_id || '').trim();
    if (!entityId) return { ok: false, needs: 'entity_id' };
    if (!client.isConfigured()) return { ok: false, needs: 'credentials' };
    const station = await stationRow(stationLocalId, departmentId);
    if (!station) return { ok: false, needs: 'station_row' };
    if (station.neris_station_id) {
      return { ok: true, neris_station_id: station.neris_station_id, adopted: true, already: true };
    }

    const payload = stationPayloadFor(station);
    const missing = ['address_line_1', 'city', 'state', 'zip_code', 'station_id']
      .filter((k) => !payload[k]);
    if (missing.length) return { ok: false, needs: 'fields', missing };

    // Reconcile-before-create: adopt by our internal_id, else exact station_id.
    const existing = await entityStations(client, entityId);
    const match = existing.find((s) => s && (s.internal_id === payload.internal_id
      || s.station_id === payload.station_id));
    if (match && match.neris_id) {
      await setStationNerisId(station.id, departmentId, match.neris_id);
      return { ok: true, neris_station_id: match.neris_id, adopted: true };
    }

    const created = await client.createStation(entityId, payload);
    const nerisId = created.data && created.data.neris_id;
    if (!nerisId) return { ok: false, refused: false, reason: `created (HTTP ${created.status}) but no neris_id returned` };
    await setStationNerisId(station.id, departmentId, nerisId);
    return { ok: true, neris_station_id: nerisId, adopted: false };
  } catch (err) {
    return failFrom(err);
  }
}

/**
 * Register one rig under its (already-registered) house.
 * `input`: { staffing (required int ≥0), cad_designation_2?, dedicated_staffing? }
 */
async function registerUnit(apparatusLocalId, departmentId, input = {}, { client = defaultClient } = {}) {
  try {
    const dept = await deptRow(departmentId);
    const entityId = dept && String(dept.neris_id || '').trim();
    if (!entityId) return { ok: false, needs: 'entity_id' };
    if (!client.isConfigured()) return { ok: false, needs: 'credentials' };
    const rig = await apparatusRow(apparatusLocalId, departmentId);
    if (!rig) return { ok: false, needs: 'apparatus_row' };
    if (rig.neris_unit_id) return { ok: true, neris_unit_id: rig.neris_unit_id, adopted: true, already: true };

    // Nothing guessed (0042 doctrine): type + staffing are human facts.
    if (!isValidNerisType(rig.neris_type)) return { ok: false, needs: 'type' };
    const staffing = Number(input.staffing);
    if (!Number.isInteger(staffing) || staffing < 0) return { ok: false, needs: 'staffing' };
    const designation = String(rig.designation || '').trim();
    if (!CAD_DESIGNATION_RE.test(designation)) {
      return { ok: false, needs: 'designation', reason: 'CAD designation must be 1-64 chars of letters/digits/()#- and spaces' };
    }

    // Stations before units.
    const house = rig.station_id ? await stationRow(rig.station_id, departmentId) : null;
    const houseNerisId = house && house.neris_station_id;
    if (!houseNerisId) return { ok: false, needs: 'station' };

    // Reconcile-before-create: adopt by exact cad_designation_1 under ANY of
    // the entity's stations (a rig moved between houses must not double-mint).
    const existing = await entityStations(client, entityId);
    for (const s of existing) {
      const units = (s && Array.isArray(s.units)) ? s.units : [];
      const match = units.find((u) => u && u.cad_designation_1 === designation);
      if (match && match.neris_id) {
        await setUnitNerisId(rig.id, departmentId, match.neris_id);
        return { ok: true, neris_unit_id: match.neris_id, adopted: true };
      }
    }

    const payload = { staffing, type: rig.neris_type, cad_designation_1: designation };
    const cad2 = String(input.cad_designation_2 || '').trim();
    if (cad2) {
      if (!CAD_DESIGNATION_RE.test(cad2)) return { ok: false, needs: 'designation', reason: 'Second CAD designation is invalid' };
      payload.cad_designation_2 = cad2;
    }
    if (input.dedicated_staffing !== undefined) payload.dedicated_staffing = !!input.dedicated_staffing;

    const created = await client.createUnit(entityId, houseNerisId, payload);
    const nerisId = created.data && created.data.neris_id;
    if (!nerisId) return { ok: false, refused: false, reason: `created (HTTP ${created.status}) but no neris_id returned` };
    await setUnitNerisId(rig.id, departmentId, nerisId);
    return { ok: true, neris_unit_id: nerisId, adopted: false };
  } catch (err) {
    return failFrom(err);
  }
}

/**
 * Re-push local edits to an ALREADY-REGISTERED station (explicit chief action —
 * the market's manual "Update in NERIS" pattern; nothing auto-syncs).
 */
async function pushStationUpdate(stationLocalId, departmentId, { client = defaultClient } = {}) {
  try {
    const dept = await deptRow(departmentId);
    const entityId = dept && String(dept.neris_id || '').trim();
    if (!entityId) return { ok: false, needs: 'entity_id' };
    if (!client.isConfigured()) return { ok: false, needs: 'credentials' };
    const station = await stationRow(stationLocalId, departmentId);
    if (!station) return { ok: false, needs: 'station_row' };
    if (!station.neris_station_id) return { ok: false, needs: 'not_registered' };
    const payload = stationPayloadFor(station);
    const missing = ['address_line_1', 'city', 'state', 'zip_code', 'station_id']
      .filter((k) => !payload[k]);
    if (missing.length) return { ok: false, needs: 'fields', missing };
    const r = await client.patchStation(entityId, station.neris_station_id, payload);
    return { ok: true, neris_station_id: station.neris_station_id, http: r.status };
  } catch (err) { return failFrom(err); }
}

/**
 * Re-push local edits to an ALREADY-REGISTERED unit. Staffing is chief-entered
 * again (it is a human fact, not stored locally — same doctrine as register).
 */
async function pushUnitUpdate(apparatusLocalId, departmentId, input = {}, { client = defaultClient } = {}) {
  try {
    const dept = await deptRow(departmentId);
    const entityId = dept && String(dept.neris_id || '').trim();
    if (!entityId) return { ok: false, needs: 'entity_id' };
    if (!client.isConfigured()) return { ok: false, needs: 'credentials' };
    const rig = await apparatusRow(apparatusLocalId, departmentId);
    if (!rig) return { ok: false, needs: 'apparatus_row' };
    if (!rig.neris_unit_id) return { ok: false, needs: 'not_registered' };
    if (!isValidNerisType(rig.neris_type)) return { ok: false, needs: 'type' };
    const staffing = Number(input.staffing);
    if (!Number.isInteger(staffing) || staffing < 0) return { ok: false, needs: 'staffing' };
    const designation = String(rig.designation || '').trim();
    if (!CAD_DESIGNATION_RE.test(designation)) return { ok: false, needs: 'designation' };
    const house = rig.station_id ? await stationRow(rig.station_id, departmentId) : null;
    if (!house || !house.neris_station_id) return { ok: false, needs: 'station' };
    const payload = { staffing, type: rig.neris_type, cad_designation_1: designation };
    if (input.dedicated_staffing !== undefined) payload.dedicated_staffing = !!input.dedicated_staffing;
    const r = await client.patchUnit(entityId, house.neris_station_id, rig.neris_unit_id, payload);
    return { ok: true, neris_unit_id: rig.neris_unit_id, http: r.status };
  } catch (err) { return failFrom(err); }
}

/**
 * Registered-unit designation map for the incident transformer's unit linkage
 * (SR-D5): exact designation → neris_unit_id. Only registered rigs appear.
 */
async function registeredUnitMap(departmentId) {
  const { rows } = await db.pool.query(
    'SELECT designation, neris_unit_id FROM apparatus WHERE department_id = $1 AND neris_unit_id IS NOT NULL',
    [departmentId]);
  const map = {};
  for (const r of rows) {
    const d = String(r.designation || '').trim();
    if (d) map[d] = r.neris_unit_id;
  }
  return map;
}

module.exports = {
  registerStation,
  registerUnit,
  pushStationUpdate,
  pushUnitUpdate,
  registeredUnitMap,
  CAD_DESIGNATION_RE,
  // exported for tests
  stationPayloadFor,
};
