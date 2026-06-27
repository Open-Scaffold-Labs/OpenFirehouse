'use strict';
/**
 * server/src/cad/adapters/firstdue.js
 *
 * Adapter for FirstDue CAD (https://firstduesizeup.com).
 *
 * FirstDue is a fire-services CAD platform we integrate with for dispatch.
 * Its CAD product is the relevant piece here.
 * It exposes a documented REST API with OAuth 2.0 client-credentials auth,
 * which makes it the most "real-API" of the volunteer-friendly vendors.
 *
 * Integration model:
 *   - FirstDue pushes dispatches via webhook with an OAuth bearer token,
 *     OR we poll their /incidents endpoint on an interval (their docs
 *     support both; webhook is the recommended pattern for low latency).
 *   - The bearer token in the webhook should be verified by introspecting
 *     it against FirstDue's /oauth/introspect endpoint, OR by checking a
 *     pre-shared client credential out-of-band.
 *
 * NOTE — SCAFFOLD: like the IamResponding adapter, this is wired into the
 * registry but the parse() body is unverified against a real FirstDue
 * payload. Field names below come from the public API docs but the webhook
 * envelope format is not consistently documented.
 *
 * To complete this adapter:
 *   1. Register an OAuth client in the FirstDue admin panel (or with their
 *      partnerships team if client registration is gated).
 *   2. Capture a real webhook payload — easiest by running an ngrok tunnel
 *      against a staging FirstDue tenant.
 *   3. Confirm field mappings.
 *   4. Wire authenticate() to verify the bearer token against the FirstDue
 *      introspection endpoint OR a pre-shared client_id/client_secret pair.
 *   5. Flip SCAFFOLD to false and add tests.
 *
 * Reference: https://firstduesizeup.com/developers/cad-api
 */

const { resolveStationId } = require('../pipeline');

const SCAFFOLD = true;

/** @type {import('../types').CadAdapter} */
module.exports = {
  name: 'firstdue',
  displayName: 'FirstDue CAD',

  docs: {
    setupUrl: 'https://firstduesizeup.com/developers/cad-api',
    payloadFormat: 'JSON with OAuth 2.0 bearer token',
    notes:
      'FirstDue CAD posts dispatches with an OAuth 2.0 bearer token. Register ' +
      'an OAuth client in FirstDue and set FIRSTDUE_CLIENT_ID / ' +
      'FIRSTDUE_CLIENT_SECRET in env. The adapter will validate tokens against ' +
      'FirstDue\'s introspection endpoint.',
  },

  async authenticate(req) {
    if (SCAFFOLD) {
      return { ok: false, status: 501, error:
        'firstdue adapter is scaffold-only; see server/src/cad/adapters/firstdue.js' };
    }
    const auth = req.headers['authorization'] || '';
    if (!auth.startsWith('Bearer ')) {
      return { ok: false, status: 401, error: 'Missing Bearer token' };
    }
    const token = auth.slice(7);

    // TODO: call FirstDue's introspection endpoint to verify the token.
    // Cache the result for ~10 min since dispatches arrive in bursts.
    // const introspection = await fetch('https://firstduesizeup.com/oauth/introspect', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    //   body: new URLSearchParams({
    //     token,
    //     client_id: process.env.FIRSTDUE_CLIENT_ID,
    //     client_secret: process.env.FIRSTDUE_CLIENT_SECRET,
    //   }),
    // }).then(r => r.json());
    // if (!introspection.active) {
    //   return { ok: false, status: 401, error: 'Inactive FirstDue token' };
    // }
    // return { ok: true };

    return { ok: false, status: 501, error: 'firstdue token introspection not yet implemented' };
  },

  async parse(req) {
    if (SCAFFOLD) {
      return { ok: false, status: 501, error:
        'firstdue adapter is scaffold-only; see server/src/cad/adapters/firstdue.js' };
    }
    const p = req.body || {};

    // FirstDue's incident envelope nests payload one level deep in some
    // webhook configurations. Handle both flat and nested.
    const inc = p.incident || p.data || p;

    // TODO: confirm against real webhook capture.
    const alertId = String(inc.incident_number || inc.id || `fd-${Date.now()}`);
    const address = String(inc.address || inc.location || '');
    const units = Array.isArray(inc.units) ? inc.units.join(',') : String(inc.units || '');
    const description = String(inc.incident_type || inc.call_type || inc.nature || 'Dispatch');
    const details = String(inc.narrative || inc.comments || '');
    const latitude = parseFloat(inc.latitude) || null;
    const longitude = parseFloat(inc.longitude) || null;
    const dispatchedAt = inc.dispatched_at
      ? new Date(inc.dispatched_at).toISOString()
      : new Date().toISOString();

    const stationId = resolveStationId('firstdue', inc.agency_id || inc.tenant_id);

    return {
      ok: true,
      incident: {
        alertId, address, units, description, details,
        latitude, longitude, dispatchedAt,
        raw: p,
        stationId,
        source: 'firstdue',
      },
    };
  },
};
