'use strict';
/**
 * server/src/utils/cronAuth.js — central authentication gate for cron endpoints.
 *
 * Mounted BEFORE requireAuth, the /api/cron/* routes (reconcile, retention) are
 * publicly reachable. Vercel Cron presents the secret as
 *   Authorization: Bearer ${CRON_SECRET}
 * automatically. This gate verifies it.
 *
 * FAIL-CLOSED RULE (mirrors cad/webhookAuth.js, the M2 fix):
 *   - secret configured        → request must present a matching Bearer secret, else 401.
 *   - secret NOT set + prod     → 503 (reject). An unconfigured cron in prod is a
 *                                 hole (publicly triggerable job), not a convenience.
 *   - secret NOT set + non-prod → allow (local/dev + test convenience), warn once.
 *
 * Previously each cron route did `if (process.env.CRON_SECRET) { ...check... }`,
 * which ran the job OPEN whenever the secret was unset — the exact hole this closes.
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

/** Extract a Bearer token from the Authorization header (empty string if none). */
function presentedSecret(req) {
  const auth = (req.headers && req.headers['authorization']) || '';
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return '';
}

/**
 * @param {import('express').Request} req
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
function checkCronAuth(req) {
  const configured = process.env.CRON_SECRET;

  if (!configured) {
    if (IS_PROD) {
      return {
        ok: false,
        status: 503,
        error: 'Cron authentication is not configured. Set CRON_SECRET.',
      };
    }
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(
        '[utils/cronAuth] CRON_SECRET is not set — cron endpoints are UNAUTHENTICATED ' +
        '(allowed only because this is not a production environment).'
      );
    }
    return { ok: true };
  }

  const presented = presentedSecret(req);
  if (!presented || !safeEqual(presented, configured)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

module.exports = { checkCronAuth, IS_PROD };
