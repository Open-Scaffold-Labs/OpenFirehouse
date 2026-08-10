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

    // ── Close/clear event (call-lifecycle parity, 2026-07-12) ────────────────
    // CADs that emit lifecycle events can end a call by POSTing the same
    // payload shape with `event` (or `type`/`status`) set to a close word and
    // the SAME incident identifier they dispatched with. Requires an explicit
    // id — a close event can never fall back to a generated one.
    const evtWord = String(p.event || p.type || p.status || '').toLowerCase();
    if (/^(clear|cleared|close|closed|clear_call|call_cleared|call_closed|end|ended)$/.test(evtWord)) {
      const closeId = p.incident_number || p.id || p.alert_id;
      if (!closeId) {
        return { ok: false, status: 400, error: 'Close event requires incident_number / id / alert_id' };
      }
      return {
        ok: true,
        incident: {
          close: true,
          alertId: String(closeId),
          stationId: resolveStationId('generic', p.agency_id),
        },
      };
    }

    // ── Unit-STATUS event (arrival parity, 2026-07-14) ───────────────────────
    // How the market puts a real arrival time on the board: CAD reports a unit
    // changed status (en route / on scene / available). Two accepted shapes:
    //   { event: 'status', unit_statuses: [{ unit: 'E41', status: 'on scene' }] }
    //   { event: 'status', unit: 'E41', status: 'on scene' }
    // The unit-status vocabulary is normalised downstream (statusNormalize.js);
    // an unrecognised status word or unmatched unit is skipped and REPORTED.
    if (/^(status|unit_status|unitstatus|unit_update|status_update|update)$/.test(evtWord)) {
      let statusUpdates = [];
      if (Array.isArray(p.unit_statuses)) {
        statusUpdates = p.unit_statuses.map((u) => ({
          unit: String(u?.unit || u?.designation || ''),
          status: String(u?.status || u?.state || ''),
          at: u?.at || u?.timestamp || null,
        }));
      } else if (p.unit || p.designation) {
        // A single unit's status. Note: p.status is the EVENT word here ('status'),
        // so a single-unit update must carry the real status in unit_status/state.
        statusUpdates = [{
          unit: String(p.unit || p.designation || ''),
          status: String(p.unit_status || p.new_status || p.state || ''),
          at: p.at || p.timestamp || null,
        }];
      }
      return {
        ok: true,
        incident: {
          statusUpdate: true,
          statusUpdates,
          alertId: p.incident_number || p.id || p.alert_id ? String(p.incident_number || p.id || p.alert_id) : null,
          stationId: resolveStationId('generic', p.agency_id),
        },
      };
    }

    // Raw vendor id ONLY — no fallback here. Synthesis moved to
    // processDispatch (cad/alertIdentity.js), which is the one place the
    // DEPARTMENT is known: NENA namespaces an identifier by the agency that
    // created it, and the old `${prefix}-${Date.now()}` fallback was
    // non-deterministic — a vendor retry minted a NEW id and defeated the
    // duplicate guard exactly when it was needed.
    const alertId = p.incident_number || p.id || p.alert_id || null;
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
