'use strict';
/**
 * middleware/errorHandler.js — unified error responses (W3.7, roadmap 5.4).
 *
 * THE error schema, app-wide:
 *   { error: string, code?: string, details?: string[] }
 *
 * - error:   human-readable, safe to show a firefighter on a glove screen
 * - code:    stable machine token (BUDGET_EXCEEDED, VALIDATION_FAILED, ...)
 * - details: optional per-field strings (validation), never stack traces
 *
 * Routes that throw (or call next(err)) land here. Status resolution:
 * err.status || err.statusCode || 500. Messages on 5xx are replaced with a
 * generic string in production-style responses (the real error is logged,
 * sanitized) so internals and provider error bodies never reach clients.
 * Use utils/routeKit.httpError(status, message, code) for intentional
 * client-facing errors.
 */

const { sanitizeAIError } = require('../config/aiModel');

// 404 for unmatched /api paths — same schema, mounted after all routes.
function notFound(req, res) {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
const MAX_DETAIL_ENTRIES = 50;
const MAX_DETAIL_CHARS = 500;

/** One detail entry → a bounded string. Never a stack, never an unbounded blob. */
function toEntry(value) {
  if (typeof value === 'string') return value.slice(0, MAX_DETAIL_CHARS);
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return String(value).slice(0, MAX_DETAIL_CHARS);
  try { return JSON.stringify(value).slice(0, MAX_DETAIL_CHARS); } catch { return '[unserializable]'; }
}

/**
 * Normalize `err.details` to the documented `string[]`.
 *
 * 🔴 WHY THIS EXISTS: the previous line was `Array.isArray(err.details) ? … : {}` — anything
 * that was not already an array was **DROPPED IN SILENCE**. Six call sites across the repo
 * passed an object (`{ missing }`, `{ conflicts }`, `{ status, detail }`), and three of them
 * were the only place the user could have learned WHICH item was wrong:
 *   · fiSchedule    — "one or more properties were not found", with no list
 *   · shiftPatterns — "pattern conflicts with existing shifts", with no conflicts
 *   · departments   — "NERIS refused the lookup", with no refusal reason
 * Six independent authors reached for the same shape, which says the INTERFACE was wrong, not
 * the callers. Fixing the interface once beats six patches and stops the trap recurring.
 * (The other three sites already interpolated their list into the message, so they lost nothing
 * — they just get it in `details` too now.)
 */
function normalizeDetails(details) {
  if (details === null || details === undefined) return null;
  if (Array.isArray(details)) {
    return details.slice(0, MAX_DETAIL_ENTRIES).map(toEntry);
  }
  if (typeof details === 'object') {
    const out = [];
    for (const [key, value] of Object.entries(details)) {
      if (Array.isArray(value)) {
        // One line per element, so a list of conflicts reads as a list.
        for (const el of value.slice(0, MAX_DETAIL_ENTRIES)) out.push(`${key}: ${toEntry(el)}`);
      } else {
        out.push(`${key}: ${toEntry(value)}`);
      }
      if (out.length >= MAX_DETAIL_ENTRIES) break;
    }
    return out.slice(0, MAX_DETAIL_ENTRIES);
  }
  return [toEntry(details)];
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = Number(err.status || err.statusCode) || 500;
  // express.json parse failures arrive here with status 400 + type
  const isClientError = status >= 400 && status < 500;

  if (!isClientError) {
    console.error(
      `[error] ${req.method} ${req.originalUrl} → ${status}:`,
      sanitizeAIError(err.stack || err.message)
    );
  }

  if (res.headersSent) return next(err);

  // ⚠️ `details` is returned for CLIENT errors ONLY. A 5xx message is already genericized so
  // internals cannot reach a client — forwarding details on a 5xx would have walked straight
  // past that guard. Nothing in the repo relies on 5xx details; they are logged above.
  const details = isClientError ? normalizeDetails(err.details) : null;

  res.status(status).json({
    error: isClientError ? (err.message || 'Request failed') : 'Internal server error',
    ...(err.code ? { code: String(err.code) } : {}),
    ...(details && details.length ? { details } : {}),
  });
}

module.exports = { errorHandler, notFound, normalizeDetails };
