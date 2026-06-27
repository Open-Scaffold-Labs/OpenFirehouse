'use strict';
/**
 * middleware/dbTransaction.js — per-request DB transaction + RLS GUC (P5).
 *
 * Runs AFTER requireAuth (so req.user.department_id is known) and BEFORE the
 * route handlers. For each authenticated request it:
 *   1. checks out ONE pooled client,
 *   2. BEGIN,
 *   3. SET LOCAL app.department_id / app.user_id  (the GUCs RLS policies read),
 *   4. runs the rest of the request inside an AsyncLocalStorage context so that
 *      db.js's overridden pool.query uses THIS client (utils/dbContext.js),
 *   5. COMMITs *before the response flushes* on success (statusCode < 400),
 *      ROLLBACKs on error / 4xx-5xx / client abort,
 *   6. releases the client.
 *
 * Commit-before-flush (not on the 'finish' event) matches the codebase's
 * house transaction pattern (routes/importRunList.js): the response bytes are
 * never sent until COMMIT succeeds, so a client can never see "200 OK" for a
 * write that failed to commit. We intercept res.end — the single sink that
 * res.json and res.send both funnel through — so one wrap covers every path.
 *
 * OPT-IN: does nothing unless process.env.P5_TXN === 'on'. Merging this file is
 * therefore behavior-neutral in production until the flag is deliberately set.
 * SET LOCAL scopes the GUCs to this transaction only; COMMIT/ROLLBACK discards
 * them, so a pooler reusing the connection cannot leak a stale department.
 */

const { pool } = require('../db');
const dbContext = require('../utils/dbContext');

module.exports = function dbTransaction(req, res, next) {
  if (process.env.P5_TXN !== 'on') return next();

  // requireAuth guarantees these; fail CLOSED if somehow absent rather than
  // running queries with no department context.
  if (!req.user || req.user.department_id == null) {
    return res.status(401).json({ error: 'No department context.', code: 'NO_DB_CONTEXT' });
  }

  pool.connect().then(async (client) => {
    let settled = false;
    const settle = async (commit) => {
      if (settled) return;
      settled = true;
      try {
        await client.query(commit ? 'COMMIT' : 'ROLLBACK');
      } catch (e) {
        console.error('[dbTxn] settle failed:', e.message);
      } finally {
        client.release();
      }
    };

    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.department_id', $1, true)", [String(req.user.department_id)]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [String(req.user.id)]);
    } catch (e) {
      await settle(false);
      return next(e);
    }

    req._p5txn = true;

    // Commit-before-flush: intercept res.end so COMMIT (or ROLLBACK on 4xx/5xx)
    // completes before any byte is written. res.json/res.send funnel through end.
    const rawEnd = res.end.bind(res);
    res.end = function (...args) {
      if (settled) return rawEnd(...args);
      const ok = res.statusCode < 400;
      settle(ok).then(() => rawEnd(...args)).catch(() => rawEnd(...args));
      return res;
    };

    // Client aborted before the response finished → roll back, release.
    res.on('close', () => { if (!settled) settle(false); });

    // Run the remainder of the request with this client as the ambient context.
    dbContext.run({ client }, () => next());
  }).catch(next);
};
