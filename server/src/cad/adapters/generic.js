'use strict';
/**
 * server/src/cad/adapters/generic.js
 *
 * Catch-all adapter for vendors without a dedicated implementation yet, and
 * for departments who want to roll their own dispatch-to-OpenFirehouse glue.
 * Accepts a normalized JSON payload directly.
 *
 * This is the adapter that backed the legacy POST /api/cad/incoming endpoint;
 * it is still mounted there for backward compatibility, plus newly available
 * at POST /api/cad/generic via the adapter registry.
 *
 * Expected fields (all optional except at least description-ish):
 *   description / call_type / nature / incident_type
 *   address / location / addr
 *   units / unit / resources
 *   details / comments / notes / narrative
 *   latitude / lat, longitude / lon
 *   incident_number / id / alert_id
 *   timestamp (unix epoch number, or ISO string) / dispatched_at
 *   source / vendor — used for display when no dedicated adapter exists
 *   agency_id — optional; used for CAD_STATION_MAP lookups
 */

const { resolveStationId } = require('../pipeline');

/** @type {import('../types').CadAdapter} */
module.exports = {
  name: 'generic',
  displayName: 'Generic / Custom',

  docs: {
    payloadFormat: 'JSON (any of the field aliases listed in adapter source)',
    notes:
      'Use this endpoint when your CAD vendor does not have a dedicated ' +
      'OpenFirehouse adapter. Either configure your CAD to POST a JSON ' +
      'payload with the common fields (description, address, units, ' +
      'latitude/longitude, timestamp), or write a small relay that ' +
      'translates from your CAD\'s native format.',
  },

  async parse(req) {
    const p = req.body || {};

    const alertId = String(p.incident_number || p.id || p.alert_id || `gen-${Date.now()}`);
    const address = String(p.address || p.location || p.addr || '');
    const units = String(p.units || p.unit || p.resources || '');
    const description = String(
      p.call_type || p.description || p.nature || p.incident_type || 'Dispatch'
    );
    const details = String(p.details || p.comments || p.notes || p.narrative || '');
    const latitude = parseFloat(p.latitude || p.lat) || null;
    const longitude = parseFloat(p.longitude || p.lon) || null;
    const source = String(p.source || p.vendor || 'cad');

    let dispatchedAt;
    if (p.timestamp && typeof p.timestamp === 'number') {
      dispatchedAt = new Date(p.timestamp * 1000).toISOString();
    } else if (p.timestamp || p.dispatched_at) {
      dispatchedAt = new Date(p.timestamp || p.dispatched_at).toISOString();
    } else {
      dispatchedAt = new Date().toISOString();
    }

    const stationId = resolveStationId('generic', p.agency_id);

    return {
      ok: true,
      incident: {
        alertId, address, units, description, details,
        latitude, longitude, dispatchedAt,
        raw: p,
        stationId,
        source,
      },
    };
  },
};
