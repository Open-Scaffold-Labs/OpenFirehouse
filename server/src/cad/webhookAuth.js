'use strict';
/**
 * server/src/cad/webhookAuth.js — central CAD-webhook authentication gate.
 *
 * Runs in handleVendorWebhook() BEFORE any adapter logic, so it covers every
 * ingest path — including `generic`, which has no adapter-level authenticate()
 * and was previously wide open, and the legacy /api/cad/incoming + /active911
 * aliases.
 *
 * Model: one shared secret per deployment (CAD_WEBHOOK_SECRET). The secret may
 * be presented as a header (preferred) or, because many CAD relays (Active911,
 * IamResponding) can only be configured with a plain URL and no custom headers,
 * as a query-string parameter:
 *   - header  X-CAD-Webhook-Secret: <secret>
 *   - header  Authorization: Bearer <secret>
 *   - query   ?key=<secret>   or   ?secret=<secret>
 *
 * requestLog.js logs only method/path/status (never query strings or bodies),
 * so a query-param secret does not land in OpenFirehouse's own logs. Upstream
 * proxies may still log query strings — prefer a header where the relay allows.
 *
 * FAIL-CLOSED RULE:
 *   - secret configured  → request must present a matching secret, else 401.
 *   - secret NOT set + production → 503 (reject). An unconfigured webhook in
 *     prod is a hole, not a convenience; this is the core M2 fix.
 *   - secret NOT set + non-production → allow (local/dev testing), warn once.
 *
 * The per-adapter authenticate() (e.g. Active911 agency_id, Zuercher header)
 * still runs after this as an optional SECOND factor; this gate is the primary
 * control and does not depend on any adapter implementing one.
 */

const crypto = require('crypto');

const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

let warnedMissing = false;

/** Constant-time string compare that does not leak length. */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

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
 * Per-DEPARTMENT auth (full per-dept CAD): if the presented secret matches a
 * department's cad_connection webhook secret (by sha256 hash), resolve that
 * connection — the inbound dispatch is attributed to its department + house.
 * Owner-side resolver (DEFINER) bypasses RLS; authorized by the secret itself.
 * Returns null when no connection matches (→ fall back to the global secret).
 */
async function resolveConnectionBySecret(presented) {
  if (!presented) return null;
  try {
    const db = require('../db');
    const hash = crypto.createHash('sha256').update(String(presented)).digest('hex');
    const r = await db.pool.query('SELECT * FROM public.of_cad_connection_by_webhook_secret($1)', [hash]);
    const row = r.rows && r.rows[0];
    if (row && row.department_id != null) {
      return { id: row.connection_id, departmentId: row.department_id, stationId: row.station_id, vendorId: row.vendor_id };
    }
  } catch (_) { /* fall through to the global secret */ }
  return null;
}

/**
 * @param {import('express').Request} req
 * @returns {Promise<{ ok: true, connection?: object } | { ok: false, status: number, error: string }>}
 */
async function verifyWebhookSecret(req) {
  const presented = presentedSecret(req);

  // PRIMARY: a department's own per-connection webhook secret.
  const connection = await resolveConnectionBySecret(presented);
  if (connection) return { ok: true, connection };

  // FALLBACK: the single global deployment secret (existing single-tenant setup).
  const configured = process.env.CAD_WEBHOOK_SECRET;

  if (!configured) {
    if (IS_PROD) {
      return {
        ok: false,
        status: 503,
        error: 'CAD webhook authentication is not configured. Set CAD_WEBHOOK_SECRET.',
      };
    }
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(
        '[cad/webhookAuth] CAD_WEBHOOK_SECRET is not set — webhooks are UNAUTHENTICATED ' +
        '(allowed only because this is not a production environment).'
      );
    }
    return { ok: true };
  }

  if (!presented || !safeEqual(presented, configured)) {
    return { ok: false, status: 401, error: 'Invalid or missing CAD webhook secret.' };
  }
  return { ok: true };
}

module.exports = { verifyWebhookSecret, IS_PROD };
