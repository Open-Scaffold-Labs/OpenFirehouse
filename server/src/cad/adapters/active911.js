'use strict';
/**
 * server/src/cad/adapters/active911.js
 *
 * Adapter for the Active911 CAD-relay webhook.
 *
 * Active911 (https://active911.com) is the largest CAD-relay product for
 * volunteer fire departments in the US. Their webhook fires on dispatch
 * with a JSON body containing the call. Authentication is by configured
 * agency_id match — Active911 does not currently HMAC-sign their webhooks,
 * so the URL itself is the primary secret. Setting ACTIVE911_AGENCY_ID in
 * env adds a second factor that protects against URL leakage.
 *
 * Payload format (observed; not officially documented in stable form):
 *   {
 *     id: 12345,                              // or alert_id
 *     agency_id: "ABC123",                    // optional, may be agencyId
 *     description: "STRUCTURE FIRE",
 *     address: "123 Main St",
 *     city: "Springfield",
 *     state: "NJ",
 *     latitude: 40.71,
 *     longitude: -74.17,
 *     unit: "E41,L23",                        // or units
 *     details: "PD on scene, smoke visible",
 *     timestamp: 1717000000                    // unix epoch (seconds)
 *   }
 *
 * Setup: in the Active911 admin panel, add a webhook pointing at
 *   POST https://<openfirehouse-host>/api/cad/active911
 */

const { resolveStationId } = require('../pipeline');

/** @type {import('../types').CadAdapter} */
module.exports = {
  name: 'active911',
  displayName: 'Active911',

  docs: {
    setupUrl: 'https://active911.com/help/webhooks',
    payloadFormat: 'JSON',
    notes:
      'Active911 webhooks are public by URL — anyone who can reach the URL ' +
      'can post a dispatch. Set ACTIVE911_AGENCY_ID in env to require the ' +
      'webhook payload to carry a matching agency_id, which adds a second ' +
      'verification factor.',
  },

  async authenticate(req) {
    const configuredAgency = process.env.ACTIVE911_AGENCY_ID;
    if (!configuredAgency) {
      // No agency configured — webhook is effectively public, trust URL as secret.
      return { ok: true };
    }
    const p = req.body || {};
    const incomingAgency = String(p.agency_id || p.agencyId || '');
    if (incomingAgency !== configuredAgency) {
      return { ok: false, status: 403, error: 'Agency ID mismatch' };
    }
    return { ok: true };
  },

  async parse(req) {
    const p = req.body || {};

    // Raw vendor id ONLY — no fallback here. Synthesis moved to
    // processDispatch (cad/alertIdentity.js), which is the one place the
    // DEPARTMENT is known: NENA namespaces an identifier by the agency that
    // created it, and the old `${prefix}-${Date.now()}` fallback was
    // non-deterministic — a vendor retry minted a NEW id and defeated the
    // duplicate guard exactly when it was needed.
    const alertId = p.id || p.alert_id || null;
    const address = [p.address, p.city, p.state].filter(Boolean).join(', ');
    const units = String(p.unit || p.units || '');
    const description = String(p.description || p.nature || p.call_type || 'CAD Alert');
    const details = String(p.details || p.comments || p.notes || '');
    const latitude = parseFloat(p.latitude || p.lat) || null;
    const longitude = parseFloat(p.longitude || p.lon) || null;
    const dispatchedAt = p.timestamp
      ? new Date(Number(p.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    const stationId = resolveStationId('active911', p.agency_id || p.agencyId);

    return {
      ok: true,
      incident: {
        alertId, address, units, description, details,
        latitude, longitude, dispatchedAt,
        raw: p,
        stationId,
        source: 'active911',
      },
    };
  },
};
