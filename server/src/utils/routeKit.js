'use strict';
/**
 * utils/routeKit.js — shared route boilerplate (W3.7, roadmap 5.5).
 *
 * Every NEW route should be written with this kit so auth, tenancy scoping,
 * validation, and error shape can't be individually forgotten. Existing
 * routes migrate opportunistically (don't drive-by refactor).
 *
 * Canonical new-route shape:
 *
 *   const { z } = require('zod');
 *   const { scoped, httpError, validate } = require('../utils/routeKit');
 *
 *   router.get('/:id',
 *     validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) }),
 *     scoped(async ({ req, stationId }) => {
 *       const { rows } = await pool.query(
 *         'SELECT * FROM things WHERE id = $1 AND department_id = $2',
 *         [req.params.id, stationId]
 *       );
 *       if (!rows.length) throw httpError(404, 'Not found', 'NOT_FOUND');
 *       return { data: rows[0] };
 *     })
 *   );
 *
 * What the kit guarantees:
 * - scoped(): refuses to run without req.user.department_id (so a route
 *   accidentally mounted before requireAuth fails CLOSED with 401, never
 *   falls back to station 1 — the push.js bug class), hands the handler the
 *   stationId so queries have no excuse not to use it, JSON-serializes the
 *   return value, and forwards thrown errors to the unified errorHandler.
 * - httpError(): intentional client-facing errors in the unified schema
 *   ({ error, code?, details? }) with correct status.
 * - validate: re-exported zod middleware (W3.3) so route files import one kit.
 */

const validate = require('../middleware/validate');

function httpError(status, message, code, details) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  if (details) err.details = details;
  return err;
}

function scoped(handler) {
  return async (req, res, next) => {
    try {
      const stationId = req.user?.stationId;
      if (!stationId) {
        // Fail CLOSED: never default to station 1.
        return res.status(401).json({ error: 'Authentication required', code: 'NO_STATION' });
      }
      const result = await handler({ req, res, stationId, user: req.user });
      if (res.headersSent) return; // handler streamed / responded itself
      if (result === undefined) return res.status(204).end();
      const status = result && result._status ? result._status : 200;
      if (result && result._status) delete result._status;
      res.status(status).json(result);
    } catch (err) {
      next(err);
    }
  };
}

/** Plain async wrapper for routes that are deliberately unscoped (public). */
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/**
 * flattenEngineErrors — a pure engine's structured refusals → the app-wide `details: string[]`.
 *
 * 🔴 WHY: `details` is string[] app-wide. errorHandler.normalizeDetails does not DROP an object
 * any more, but it falls back to JSON.stringify — so a clerk who fat-fingers an amount was shown
 *   {"code":"BAD_AMOUNT","at":"line 1","message":"amount is not a valid decimal","got":"12.345"}
 * instead of a sentence. routes/fiFeeSchedules.js got this right and left a comment saying so;
 * fiInvoices and fiPayments were written later and did not inherit the lesson. Same class as
 * "a guard that exists on one route and not another is not a guard" — here it is a LESSON that
 * existed on one route and not another, which is why it now lives in the shared kit instead of
 * as a third copy of the same `.map()`.
 *
 * `got` is deliberately included: the value the operator actually typed is the fastest way for
 * them to see what is wrong with it.
 */
function flattenEngineErrors(errors) {
  if (!Array.isArray(errors)) return undefined;
  return errors.map((e) => {
    if (typeof e === 'string') return e;
    if (!e || typeof e !== 'object') return String(e);
    const where = e.at ? `${e.at} — ` : '';
    const got = e.got === undefined ? '' : ` (got: ${JSON.stringify(e.got)})`;
    return `${where}${e.code || 'ERROR'}: ${e.message || 'refused'}${got}`;
  });
}

module.exports = { scoped, asyncRoute, httpError, validate, flattenEngineErrors };
