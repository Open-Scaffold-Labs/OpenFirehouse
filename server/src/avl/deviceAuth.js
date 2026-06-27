'use strict';
/**
 * server/src/avl/deviceAuth.js — AVL feed authentication (ADR-0003).
 *
 * A hardware AVL feed is NOT a logged-in user — it authenticates with a
 * per-department shared secret (stored hashed). Mirrors cad/webhookAuth.js:
 *   - secret presented via  X-AVL-Secret header | Authorization: Bearer | ?key= | ?secret=
 *   - sha256(secret) resolved to a department by the SECURITY DEFINER fn
 *     of_avl_connection_by_webhook_secret (bypasses RLS — the feed is anon).
 *
 * Fail-closed: anything we can't positively resolve to an active connection is
 * rejected. DB errors (e.g. the table/fn not yet applied on an environment) are
 * caught and treated as "unauthenticated" so a route mount can never crash.
 */
const crypto = require('crypto');
const db = require('../db');

function presentedSecret(req) {
  const h = req.get('x-avl-secret');
  if (h) return h.trim();
  const auth = req.get('authorization');
  if (auth && /^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, '').trim();
  const q = req.query || {};
  if (q.key) return String(q.key).trim();
  if (q.secret) return String(q.secret).trim();
  return null;
}

/**
 * Resolve a presented secret to its AVL connection.
 * @returns {Promise<null | {connectionId:number, departmentId:number, vendorId:string}>}
 */
async function resolveConnection(presented) {
  if (!presented) return null;
  try {
    const hash = crypto.createHash('sha256').update(String(presented)).digest('hex');
    const r = await db.pool.query(
      'SELECT * FROM public.of_avl_connection_by_webhook_secret($1)', [hash],
    );
    if (!r.rows.length) return null;
    const row = r.rows[0];
    return {
      connectionId: row.connection_id,
      departmentId: row.department_id,
      vendorId: row.vendor_id || 'generic',
    };
  } catch (_e) {
    // table/fn absent or transient DB error → treat as unauthenticated (never throw)
    return null;
  }
}

/** Express helper: returns the resolved connection or null (caller 401s on null). */
async function verifyAvlSecret(req) {
  return resolveConnection(presentedSecret(req));
}

module.exports = { verifyAvlSecret, resolveConnection, presentedSecret };
