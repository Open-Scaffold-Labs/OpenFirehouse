'use strict';
/**
 * server/src/cad/index.js — CAD adapter registry + generic webhook handler.
 *
 * Adapters live in server/src/cad/adapters/<vendor>.js. Each exports a
 * CadAdapter (see types.js). The registry below maps adapter.name → adapter,
 * and exposes a single Express handler that dispatches POST /api/cad/:vendor
 * to the matching adapter.
 *
 * Adding a new vendor is one line in the require list plus one new adapter
 * file. No changes to routes/cad.js are needed.
 */

const { processDispatch } = require('./pipeline');
const { verifyWebhookSecret } = require('./webhookAuth');

const active911     = require('./adapters/active911');
const generic       = require('./adapters/generic');
const iamresponding = require('./adapters/iamresponding');
const firstdue      = require('./adapters/firstdue');
const zuercher      = require('./adapters/zuercher');

/** @type {import('./types').CadAdapter[]} */
const ADAPTERS = [
  active911,
  generic,
  iamresponding,
  firstdue,
  zuercher,
];

/** @type {Map<string, import('./types').CadAdapter>} */
const REGISTRY = new Map(ADAPTERS.map(a => [a.name, a]));

/**
 * Public adapter list for the settings page and webhook-URL response.
 *
 * @returns {{name: string, displayName: string, scaffold: boolean, docs?: object}[]}
 */
function listAdapters() {
  return ADAPTERS.map(a => ({
    name: a.name,
    displayName: a.displayName,
    // Crude scaffold detection: read the source file once and check for the
    // SCAFFOLD flag. For now, we surface it from the adapter directly.
    scaffold: !!a._scaffold,
    docs: a.docs || null,
  }));
}

/**
 * Express handler for POST /api/cad/:vendor. Looks up the adapter, runs
 * authenticate() then parse(), pipes the result through the shared
 * pipeline.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleVendorWebhook(req, res) {
  const vendor = String(req.params.vendor || '').toLowerCase();
  const adapter = REGISTRY.get(vendor);

  if (!adapter) {
    return res.status(404).json({
      error: `Unknown CAD vendor: ${vendor}`,
      available: ADAPTERS.map(a => a.name),
    });
  }

  try {
    // Central gate — runs for EVERY adapter (incl. `generic`, which has no
    // authenticate() and was previously unauthenticated) and both legacy
    // aliases. Fail-closed in production when CAD_WEBHOOK_SECRET is unset.
    const gate = await verifyWebhookSecret(req);
    if (!gate.ok) {
      return res.status(gate.status).json({ error: gate.error });
    }

    // Optional per-adapter second factor (agency_id / vendor header).
    if (typeof adapter.authenticate === 'function') {
      const authResult = await adapter.authenticate(req);
      if (!authResult.ok) {
        return res.status(authResult.status).json({ error: authResult.error });
      }
    }

    const parseResult = await adapter.parse(req);
    if (!parseResult.ok) {
      return res.status(parseResult.status).json({ error: parseResult.error });
    }

    // Per-department CAD: when the webhook authenticated via a department's own
    // connection secret, the incident belongs to THAT connection's department +
    // house — overrides the env-map (CAD_STATION_MAP) station resolution.
    if (gate.connection) {
      if (gate.connection.stationId != null) parseResult.incident.stationId = gate.connection.stationId;
      if (gate.connection.departmentId != null) parseResult.incident.departmentId = gate.connection.departmentId;
    }

    const { alert, duplicate } = await processDispatch(parseResult.incident);
    if (duplicate) return res.json({ ok: true, duplicate: true });
    return res.json({ ok: true, id: alert.id });
  } catch (err) {
    console.error(`[cad/${vendor}] webhook error:`, err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

module.exports = {
  ADAPTERS,
  REGISTRY,
  listAdapters,
  handleVendorWebhook,
};
