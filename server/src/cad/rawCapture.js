'use strict';
/**
 * server/src/cad/rawCapture.js — capture the CAD payload's RAW bytes.
 *
 * WHY THIS IS A SEPARATE, EARLIER MIDDLEWARE
 * ------------------------------------------
 * The global express.json() cannot give us what 4C.2 needs, in two ways that
 * were both PROVEN against this codebase's own express version rather than
 * assumed:
 *
 *   1. WRONG CONTENT-TYPE → the bytes vanish, silently, with a 200.
 *      express.json() only parses when the content-type is application/json.
 *      Posting the exact same JSON as text/plain, as form-urlencoded, or with
 *      no content-type at all leaves req.body === {} and no error. Every CAD
 *      adapter reads `req.body || {}`, so it would parse an empty object and
 *      the dispatch would be lost with nothing kept. routes/cad.js already
 *      documents that real vendors do this ("some CAD vendors post non-JSON
 *      content-types … req.body can be undefined").
 *
 *   2. MALFORMED JSON → our handler is NEVER CALLED.
 *      A truncated body with content-type application/json makes express.json()
 *      throw inside the middleware chain; express answers 400 with an HTML error
 *      page before handleVendorWebhook runs. So a receipt written at the top of
 *      the handler would miss the single most important case — the unparseable
 *      message that NENA i3 §4.12.3.7 specifically requires be logged with its
 *      raw bytes. Persist-before-parse is only true if "persist" happens before
 *      the JSON parser, not before our handler.
 *
 * So: mount express.raw({type: () => true}) on /api/cad BEFORE the global
 * express.json(), keep the buffer, and do our own forgiving parse. Because
 * body-parser sets req._body once it has read the stream, the global
 * express.json() downstream sees the body as already parsed and skips it — the
 * same mechanism the Stripe raw-body webhook above it relies on.
 *
 * This middleware NEVER rejects. Its whole job is to make sure that whatever
 * arrived is in hand before anything is allowed to have an opinion about it.
 * A parse failure is recorded on the request and decided on later, by the
 * handler, which can keep the bytes and answer honestly.
 */

const express = require('express');

// 1 MB. A CAD dispatch is a few KB; the cap is a flood/abuse fence, not a
// functional limit. Mirrors the existing stripe-webhook raw limit.
const RAW_LIMIT = '1mb';

const captureBuffer = express.raw({ type: () => true, limit: RAW_LIMIT });

/**
 * Turn the captured Buffer into { req.rawBody, req.body }.
 *
 * req.rawBody      — the bytes as a utf8 string, verbatim, always set.
 * req.rawBodyError — a parse error message when the bytes were not JSON.
 * req.body         — the parsed object, or {} when it could not be parsed.
 *                    ({} preserves the existing contract every adapter and the
 *                    /simulate route already code against: `req.body || {}`.)
 */
function normalizeBody(req, _res, next) {
  const buf = Buffer.isBuffer(req.body) ? req.body : null;
  req.rawBody = buf ? buf.toString('utf8') : '';

  if (!req.rawBody) {
    req.body = {};
    return next();
  }

  const ctype = String((req.headers && req.headers['content-type']) || '').toLowerCase();

  try {
    if (ctype.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(req.rawBody);
      const obj = {};
      for (const [k, v] of params) obj[k] = v;
      req.body = obj;
      return next();
    }
    // Everything else: attempt JSON regardless of the declared content-type.
    // A vendor mislabeling JSON as text/plain is common and recoverable; we
    // would rather read it than stand on the header.
    req.body = JSON.parse(req.rawBody);
    if (req.body === null || typeof req.body !== 'object') {
      // A bare scalar ("5", "true", a quoted string) is valid JSON but is not a
      // dispatch. Treat it as unparseable rather than letting `req.body.foo`
      // throw somewhere further in.
      req.rawBodyError = 'Body is not a JSON object';
      req.body = {};
    }
  } catch (e) {
    req.rawBodyError = e.message;
    req.body = {};
  }
  return next();
}

module.exports = { captureBuffer, normalizeBody, RAW_LIMIT };
