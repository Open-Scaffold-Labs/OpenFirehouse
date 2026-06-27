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

  res.status(status).json({
    error: isClientError ? (err.message || 'Request failed') : 'Internal server error',
    ...(err.code ? { code: String(err.code) } : {}),
    ...(Array.isArray(err.details) ? { details: err.details } : {}),
  });
}

module.exports = { errorHandler, notFound };
