'use strict';
/**
 * server/src/cad/adapters/iamresponding.js
 *
 * Adapter for IamResponding (https://iamresponding.com).
 *
 * IamResponding is the second-largest CAD-relay product for volunteer fire
 * departments in the US (after Active911). Their integration model is a
 * JSON push to a customer-provided URL on dispatch and status-change events.
 * Authentication is by shared secret carried in either a header or a
 * payload field (their docs are inconsistent about which; both are observed
 * in customer accounts).
 *
 * NOTE — SCAFFOLD: this adapter is wired into the registry so the route URL
 * resolves, but the parse() and authenticate() bodies need to be confirmed
 * against a real IamResponding webhook capture before the adapter ships.
 * The field mapping below is plausible but unverified.
 *
 * To complete this adapter:
 *   1. Get a real IamResponding webhook payload (ask a partner department
 *      to forward one, or sign up for a developer account).
 *   2. Replace the placeholder field aliases in parse() with the actual
 *      keys the vendor sends.
 *   3. Decide which header / payload field carries the shared secret and
 *      verify it in authenticate().
 *   4. Add a test fixture in server/test/cad/iamresponding.fixtures.js.
 *   5. Remove the THROW-ON-USE guard at the top of parse().
 *
 * Reference: https://iamresponding.com/v3/Pages/api.aspx
 */

const { resolveStationId } = require('../pipeline');

const SCAFFOLD = true; // ← flip to false after validating against real payload

/** @type {import('../types').CadAdapter} */
module.exports = {
  name: 'iamresponding',
  displayName: 'IamResponding',

  docs: {
    setupUrl: 'https://iamresponding.com/v3/Pages/api.aspx',
    payloadFormat: 'JSON',
    notes:
      'IamResponding pushes JSON dispatch payloads to a customer-supplied URL. ' +
      'Configure the webhook in the IamResponding admin panel and set ' +
      'IAMRESPONDING_WEBHOOK_SECRET in env to require a matching shared secret ' +
      'on every request.',
  },

  async authenticate(req) {
    if (SCAFFOLD) {
      return { ok: false, status: 501, error:
        'iamresponding adapter is scaffold-only; see server/src/cad/adapters/iamresponding.js' };
    }
    const expected = process.env.IAMRESPONDING_WEBHOOK_SECRET;
    if (!expected) return { ok: true }; // No secret configured = public URL trust
    const presented =
      req.headers['x-iar-secret'] ||
      req.headers['x-webhook-secret'] ||
      (req.body && req.body.secret);
    if (presented !== expected) {
      return { ok: false, status: 401, error: 'IamResponding shared secret mismatch' };
    }
    return { ok: true };
  },

  async parse(req) {
    if (SCAFFOLD) {
      return { ok: false, status: 501, error:
        'iamresponding adapter is scaffold-only; see server/src/cad/adapters/iamresponding.js' };
    }
    const p = req.body || {};

    // TODO: confirm these field names against a real IamResponding payload.
    const alertId = String(p.callId || p.dispatch_id || p.id || `iar-${Date.now()}`);
    const address = String(p.address || p.location || '');
    const units = String(p.units || p.apparatus || '');
    const description = String(p.callType || p.nature || p.description || 'Dispatch');
    const details = String(p.narrative || p.comments || p.details || '');
    const latitude = parseFloat(p.lat || p.latitude) || null;
    const longitude = parseFloat(p.lng || p.lon || p.longitude) || null;
    const dispatchedAt = p.dispatchTime || p.dispatched_at
      ? new Date(p.dispatchTime || p.dispatched_at).toISOString()
      : new Date().toISOString();

    const stationId = resolveStationId('iamresponding', p.agencyId || p.departmentId);

    return {
      ok: true,
      incident: {
        alertId, address, units, description, details,
        latitude, longitude, dispatchedAt,
        raw: p,
        stationId,
        source: 'iamresponding',
      },
    };
  },
};
