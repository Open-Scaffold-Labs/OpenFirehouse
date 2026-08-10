'use strict';
/**
 * server/src/cad/webhookAuth.js — central CAD-webhook authentication gate.
 *
 * Runs in handleVendorWebhook() BEFORE any adapter logic and BEFORE the payload
 * is parsed, so it covers every ingest path — including `generic`, which has no
 * adapter-level authenticate(), and the legacy /api/cad/incoming + /active911
 * aliases.
 *
 * MODEL (4C.2): a department's OWN per-connection webhook secret is the ONLY
 * accepted credential. The secret is matched by sha256 against
 * cad_connections.webhook_secret_hash through the owner-side DEFINER resolver
 * of_cad_connection_by_webhook_secret (migration 0021), which is authorized by
 * the secret itself.
 *
 * WHAT CHANGED AND WHY (4C.2) — the global CAD_WEBHOOK_SECRET is RETIRED.
 * Three reasons, in order of weight:
 *
 *   1. A global secret has NO DEPARTMENT. 4C.2 must write an ingest receipt
 *      before it parses anything, and a receipt has to belong to a tenant: the
 *      row carries department_id NOT NULL under the standard dept_isolation
 *      policy. A department-less receipt would have needed either a nullable
 *      tenant column (a row no department can read, and that RLS refuses to
 *      insert — `NULL = x` is NULL, never true) or a bypass function, which is
 *      Dale-gated. Retiring the fallback makes the tenant known BEFORE the parse,
 *      which is what the whole feature rests on.
 *   2. It was a shared credential across every department on the deployment.
 *      Rotating it for one agency rotates it for all of them.
 *   3. Its unset-behavior was a latent hole: IS_PROD was NODE_ENV==='production'
 *      || VERCEL, so a deployment with NEITHER set fell through to "allowed,
 *      unauthenticated, warn once". There is now no unauthenticated path in any
 *      environment, so that class of misconfiguration cannot exist.
 *
 * This is safe to do as a hard cutover ONLY because OF is pre-launch: no real
 * department is in service, so there is no live CAD relay to re-point. Local and
 * CI testing seeds a cad_connections row like any department would.
 *
 * PRESENTATION FORMS. Many CAD relays can only be configured with a plain URL
 * and no custom headers, so the secret is accepted as either:
 *   - header  X-CAD-Webhook-Secret: <secret>
 *   - header  Authorization: Bearer <secret>
 *   - query   ?key=<secret>   or   ?secret=<secret>
 * requestLog.js logs only method/path/status (never query strings or bodies), so
 * a query-param secret does not land in OpenFirehouse's own logs, and
 * cad/ingestLog.js redacts credential headers and stores no query string at all.
 * Upstream proxies may still log query strings — prefer a header where the relay
 * allows one.
 *
 * 401 vs 503 — THIS DISTINCTION IS LOAD-BEARING.
 * Per NENA-STA-024.1.1-2025 §3.3.5.3.1 the sender does NOTHING on a 401 and
 * RETRIES on a 503. So the two must mean exactly what they say:
 *   - 401 = "this credential is not valid."  A retry cannot help. Correct to
 *           drop, and correct NOT to store bytes (see below).
 *   - 503 = "we could not TELL whether it is valid."  A database outage is our
 *           failure, not the sender's, and it is the one case where we want the
 *           CAD to try again. Answering 401 here would make a transient DB blip
 *           permanently discard a live dispatch — the exact loss 4C.2 exists to
 *           prevent. This is why the lookup no longer swallows its errors.
 */

const crypto = require('crypto');

/** Pull the presented secret from header or query (header preferred). */
function presentedSecret(req) {
  const h = req.headers || {};
  if (h['x-cad-webhook-secret']) return String(h['x-cad-webhook-secret']);
  const auth = h['authorization'];
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  const q = req.query || {};
  if (q.key) return String(q.key);
  if (q.secret) return String(q.secret);
  return '';
}

/**
 * Resolve the department that owns this secret.
 *
 * Returns one of three DISTINCT outcomes — the distinction is the point:
 *   { connection }      a department owns this secret
 *   { none: true }      the lookup ran and matched nothing  → 401
 *   { unavailable, error } the lookup could not run          → 503
 *
 * The previous implementation wrapped this in `catch (_) {}` and fell through,
 * which collapsed "unavailable" into "no match" and would have answered 401 —
 * telling a CAD to permanently discard a dispatch because our database blinked.
 */
async function resolveConnectionBySecret(presented) {
  if (!presented) return { none: true };
  try {
    const db = require('../db');
    const hash = crypto.createHash('sha256').update(String(presented)).digest('hex');
    const r = await db.pool.query('SELECT * FROM public.of_cad_connection_by_webhook_secret($1)', [hash]);
    const row = r.rows && r.rows[0];
    if (row && row.department_id != null) {
      return {
        connection: {
          id: row.connection_id,
          departmentId: row.department_id,
          stationId: row.station_id,
          vendorId: row.vendor_id,
        },
      };
    }
    return { none: true };
  } catch (e) {
    console.error('[cad/webhookAuth] connection lookup unavailable:', e.message);
    return { unavailable: true, error: e.message };
  }
}

/**
 * @param {import('express').Request} req
 * @returns {Promise<{ ok: true, connection: object } | { ok: false, status: number, error: string, code: string }>}
 */
async function verifyWebhookSecret(req) {
  const presented = presentedSecret(req);

  if (!presented) {
    return {
      ok: false,
      status: 401,
      code: 'CAD_NO_CREDENTIAL',
      error: 'Missing CAD webhook secret.',
    };
  }

  const result = await resolveConnectionBySecret(presented);

  if (result.unavailable) {
    // Our fault, and retryable. 503 is the ONLY status the NENA state machine
    // treats as "send it again".
    return {
      ok: false,
      status: 503,
      code: 'CAD_AUTH_UNAVAILABLE',
      error: 'Unable to verify CAD webhook credential. Retry.',
    };
  }

  if (result.connection) return { ok: true, connection: result.connection };

  return {
    ok: false,
    status: 401,
    code: 'CAD_BAD_CREDENTIAL',
    error: 'Invalid CAD webhook secret.',
  };
}

module.exports = { verifyWebhookSecret, resolveConnectionBySecret, presentedSecret };
