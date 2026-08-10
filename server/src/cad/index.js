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
 *
 * ─── 4C.2: PERSIST BEFORE PARSE ─────────────────────────────────────────────
 * The order of operations in handleVendorWebhook is the feature. A CAD that
 * gets a non-503 answer does NOTHING further (NENA-STA-024 §3.3.5.3.1) — there
 * is no dead-letter queue and no redelivery anywhere in this market. So every
 * byte must be durable before anything is allowed to fail on it:
 *
 *   1. AUTHENTICATE. Resolves the department from the connection secret.
 *      Deliberately FIRST — earlier this ran after the adapter lookup, which
 *      (a) meant an authenticated payload for a misrouted vendor was answered
 *      404 with nothing kept, and (b) disclosed the registered vendor list to
 *      unauthenticated callers.
 *   2. PERSIST THE RECEIPT and COMMIT it. Raw bytes + sender IP + department.
 *      If this fails we answer 503 — the only status that means "send it again"
 *      — because we are not holding a copy.
 *   3. ONLY NOW parse, route to the adapter, and run the pipeline.
 *   4. APPEND THE OUTCOME. Best-effort; the bytes are already safe.
 *
 * The raw bytes are captured even earlier, by cad/rawCapture.js mounted ahead of
 * the global express.json(), because express.json() answers 400 on malformed
 * JSON before this handler is ever entered — see that file for the proof.
 */

const { processDispatch, processClose, processStatusUpdate } = require('./pipeline');
const { verifyWebhookSecret } = require('./webhookAuth');
const { persistReceipt, recordOutcome } = require('./ingestLog');

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
 * Express handler for POST /api/cad/:vendor.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleVendorWebhook(req, res) {
  const vendor = String(req.params.vendor || '').toLowerCase();

  // ── 1. AUTHENTICATE ───────────────────────────────────────────────────────
  // Runs before everything, including the adapter lookup, so that the tenant is
  // known before we are asked to store anything. 503 here means "we could not
  // check" (retryable); 401 means "this credential is wrong" (a retry cannot
  // help, and we deliberately store nothing — an unauthenticated caller must not
  // be able to write rows into a department's permanent, never-pruned log).
  let gate;
  try {
    gate = await verifyWebhookSecret(req);
  } catch (err) {
    console.error(`[cad/${vendor}] auth gate threw:`, err);
    return res.status(503).json({ error: 'Unable to verify CAD webhook credential. Retry.', code: 'CAD_AUTH_UNAVAILABLE' });
  }
  if (!gate.ok) {
    return res.status(gate.status).json({ error: gate.error, code: gate.code });
  }

  const conn         = gate.connection || {};
  const departmentId = conn.departmentId;
  const stationId    = conn.stationId ?? null;

  // ── 2. PERSIST THE RECEIPT, AND COMMIT, BEFORE ANY PARSE ──────────────────
  let logEventId = null;
  try {
    logEventId = await persistReceipt({
      departmentId,
      stationId,
      connectionId: conn.id ?? null,
      vendor,
      sourceIp: req.ip || null,
      rawBody: req.rawBody != null ? req.rawBody : '',
      headers: req.headers,
    });
  } catch (err) {
    // We are not holding a copy of this dispatch. 503 is the only honest answer:
    // it is the one status that asks the CAD to send it again.
    console.error(`[cad/${vendor}] INGEST RECEIPT FAILED — answering 503 so the CAD retries:`, err);
    return res.status(503).json({
      error: 'Unable to record inbound CAD message. Retry.',
      code: 'CAD_INGEST_UNAVAILABLE',
    });
  }

  // From here on the bytes are durable. Every exit records an outcome.
  const finish = async (status, parseStatus, body, { parseError = null, alertId = null } = {}) => {
    await recordOutcome({
      logEventId,
      departmentId,
      parseStatus,
      parseError,
      alertId,
      respondedStatus: status,
    });
    return res.status(status).json(body);
  };

  try {
    // ── 3. ROUTE + PARSE ────────────────────────────────────────────────────
    const adapter = REGISTRY.get(vendor);
    if (!adapter) {
      // Authenticated but misrouted. The bytes are kept, so this is recoverable
      // by hand — which is the entire point of storing before routing.
      return finish(404, 'unparseable', {
        error: `Unknown CAD vendor: ${vendor}`,
        available: ADAPTERS.map(a => a.name),
      }, { parseError: `unknown vendor: ${vendor}` });
    }

    // The body never parsed as an object (malformed JSON, a bare scalar, or a
    // content-type we could not read). Ack it: we HAVE it, and a retry of the
    // same malformed bytes would only produce the same result. It is recorded
    // as unparseable so the operator console can surface it loudly.
    if (req.rawBodyError) {
      return finish(200, 'unparseable', {
        ok: true,
        stored: true,
        parsed: false,
        logEventId,
        error: 'Payload could not be parsed; the raw message has been stored.',
        code: 'CAD_UNPARSEABLE',
      }, { parseError: req.rawBodyError });
    }

    // Optional per-adapter second factor (agency_id / vendor header).
    if (typeof adapter.authenticate === 'function') {
      const authResult = await adapter.authenticate(req);
      if (!authResult.ok) {
        return finish(authResult.status, 'unparseable', { error: authResult.error },
          { parseError: `adapter authenticate: ${authResult.error}` });
      }
    }

    const parseResult = await adapter.parse(req);
    if (!parseResult.ok) {
      return finish(200, 'unparseable', {
        ok: true,
        stored: true,
        parsed: false,
        logEventId,
        error: parseResult.error,
        code: 'CAD_UNPARSEABLE',
      }, { parseError: parseResult.error });
    }

    // Per-department CAD: the incident belongs to the authenticating connection's
    // department + house. Never taken from the body.
    parseResult.incident.stationId    = stationId != null ? stationId : parseResult.incident.stationId;
    parseResult.incident.departmentId = departmentId;

    // ── 4. PROCESS ──────────────────────────────────────────────────────────
    // Close/clear lifecycle event — ends the matched call (disposition
    // 'cad_closed'); never touches unit statuses (radio doctrine — the orphan
    // flag covers still-committed rigs until dispatch confirms by radio).
    if (parseResult.incident.close === true) {
      const { cleared, id } = await processClose(parseResult.incident);
      return finish(200, 'parsed', { ok: true, close: true, cleared, id }, { alertId: id });
    }

    // Unit-STATUS lifecycle event — CAD is telling us a unit changed status
    // (en route / on scene / available). This is how the market gets a real
    // arrival time onto the board. It is the dispatcher's action relayed, written
    // through the same canonical path as an on-board flip; NOT inference. Skips
    // (unmatched unit / unknown status) are RETURNED, never swallowed.
    if (parseResult.incident.statusUpdate === true) {
      const result = await processStatusUpdate(parseResult.incident);
      return finish(200, 'parsed', { ok: true, statusUpdate: true, ...result });
    }

    const { alert, duplicate } = await processDispatch(parseResult.incident);
    if (duplicate) return finish(200, 'parsed', { ok: true, duplicate: true });
    return finish(200, 'parsed', { ok: true, id: alert.id }, { alertId: alert && alert.id });
  } catch (err) {
    // The bytes are stored, so nothing is lost — but the call did not reach the
    // board, and firefighters are not looking at it. 503 asks the CAD to send it
    // again, which is the only mechanism that can still deliver it in time;
    // processDispatch dedupes on the vendor alert id, so a retry cannot create a
    // second call. If the CAD gives up anyway, the receipt is the recovery path.
    console.error(`[cad/${vendor}] webhook processing error (payload IS stored, id=${logEventId}):`, err);
    return finish(503, 'processing_failed', {
      error: 'CAD message stored but processing failed. Retry.',
      code: 'CAD_PROCESSING_FAILED',
      logEventId,
    }, { parseError: err && err.message ? err.message : String(err) });
  }
}

module.exports = {
  ADAPTERS,
  REGISTRY,
  listAdapters,
  handleVendorWebhook,
};
