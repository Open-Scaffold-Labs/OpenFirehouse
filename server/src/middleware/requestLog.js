'use strict';
/**
 * middleware/requestLog.js — structured request logging (Phase 5.2).
 *
 * One JSON line per authenticated API request: who (user + station), what
 * (method + path), when, result (status + duration). Emitted via console.log
 * so Vercel's log drain captures it; greppable by kind:"of_request".
 *
 * Deliberately NEVER logs request bodies, query strings beyond the path, or
 * response payloads — exposure records and grievances are HIPAA-adjacent, so
 * the trail records THAT a record was touched, not its contents (the
 * audit_log table carries structured detail for write operations).
 */

function requestLog(req, res, next) {
  const startedAt = Date.now();
  res.on('finish', () => {
    try {
      // Strip query string — record ids live in the path; filters may not.
      const path = (req.originalUrl || req.url || '').split('?')[0];
      console.log(JSON.stringify({
        kind: 'of_request',
        ts: new Date().toISOString(),
        method: req.method,
        path,
        status: res.statusCode,
        ms: Date.now() - startedAt,
        userId: req.user?.id ?? null,
        stationId: req.user?.stationId ?? null,
        // P5 RLS coverage proof (A6): departmentId is the GUC value the request's
        // transaction set; txn=true means this request ran inside the per-request
        // DB transaction (middleware/dbTransaction.js). A scan asserting no authed
        // request logs departmentId:null / txn:false is the 100%-coverage gate.
        departmentId: req.user?.department_id ?? null,
        txn: req._p5txn === true,
      }));
    } catch (_) { /* logging must never break a request */ }
  });
  next();
}

module.exports = { requestLog };
