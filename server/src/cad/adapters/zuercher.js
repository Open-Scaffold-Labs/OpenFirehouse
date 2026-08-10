'use strict';
/**
 * server/src/cad/adapters/zuercher.js
 *
 * Adapter for Zuercher (CentralSquare's small-agency CAD product).
 *
 * Zuercher is the part of CentralSquare that exposes a public-ish REST API
 * without going through enterprise certification. They support webhook
 * push for dispatch events. Authentication is by API key in a custom
 * header.
 *
 * NOTE — SCAFFOLD: as with the other in-progress adapters, this is wired
 * into the registry but the field mapping needs to be confirmed against
 * a real Zuercher webhook capture.
 *
 * To complete this adapter:
 *   1. Get a Zuercher API key (request through the CentralSquare admin or
 *      reach out to a partner department).
 *   2. Capture a real webhook payload.
 *   3. Confirm field mappings — Zuercher's API uses snake_case and
 *      somewhat unusual call-type taxonomies.
 *   4. Flip SCAFFOLD to false and add tests.
 *
 * Reference: https://developer.zuercherportal.com/
 */

const { resolveStationId } = require('../pipeline');

const SCAFFOLD = true;

/** @type {import('../types').CadAdapter} */
module.exports = {
  name: 'zuercher',
  displayName: 'Zuercher (CentralSquare)',

  docs: {
    setupUrl: 'https://developer.zuercherportal.com/',
    payloadFormat: 'JSON with API key header',
    notes:
      'Zuercher webhooks include an X-Zuercher-Key header. Set ' +
      'ZUERCHER_API_KEY in env to the key issued by your CentralSquare ' +
      'admin; the adapter rejects requests whose header does not match.',
  },

  async authenticate(req) {
    if (SCAFFOLD) {
      return { ok: false, status: 501, error:
        'zuercher adapter is scaffold-only; see server/src/cad/adapters/zuercher.js' };
    }
    const expected = process.env.ZUERCHER_API_KEY;
    if (!expected) return { ok: true };
    const presented = req.headers['x-zuercher-key'];
    if (presented !== expected) {
      return { ok: false, status: 401, error: 'Zuercher API key mismatch' };
    }
    return { ok: true };
  },

  async parse(req) {
    if (SCAFFOLD) {
      return { ok: false, status: 501, error:
        'zuercher adapter is scaffold-only; see server/src/cad/adapters/zuercher.js' };
    }
    const p = req.body || {};

    // TODO: confirm against a real Zuercher webhook capture.
    // Raw vendor id ONLY — no fallback here. Synthesis moved to
    // processDispatch (cad/alertIdentity.js), which is the one place the
    // DEPARTMENT is known: NENA namespaces an identifier by the agency that
    // created it, and the old `${prefix}-${Date.now()}` fallback was
    // non-deterministic — a vendor retry minted a NEW id and defeated the
    // duplicate guard exactly when it was needed.
    const alertId = p.event_id || p.cad_event_number || null;
    const address = String(p.location_address || p.address || '');
    const units = Array.isArray(p.assigned_units)
      ? p.assigned_units.join(',')
      : String(p.units || '');
    const description = String(p.call_type_description || p.call_type || 'Dispatch');
    const details = String(p.narrative || p.comments || '');
    const latitude = parseFloat(p.location_lat || p.latitude) || null;
    const longitude = parseFloat(p.location_lon || p.longitude) || null;
    const dispatchedAt = p.dispatch_time
      ? new Date(p.dispatch_time).toISOString()
      : new Date().toISOString();

    const stationId = resolveStationId('zuercher', p.agency_id);

    return {
      ok: true,
      incident: {
        alertId, address, units, description, details,
        latitude, longitude, dispatchedAt,
        raw: p,
        stationId,
        source: 'zuercher',
      },
    };
  },
};
