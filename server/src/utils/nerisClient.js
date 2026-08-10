'use strict';
/**
 * nerisClient — the ONE outbound HTTP client for the NERIS API (Phase 3, Track A).
 *
 * Doctrines (docs/NERIS-BULLETPROOF-BUILD-2026-07-16.md):
 *  - ONE client. No second NERIS HTTP path may ever exist (the two-transformers lesson).
 *  - Refused vs failed (the syncCore lesson applied to a national API):
 *      · 4xx  → NerisRefusedError    — NERIS REFUSED this. Terminal. Tell the human.
 *      · 5xx / network / timeout → NerisUnavailableError — NERIS FAILED to process.
 *        Retryable. Never reported to an officer as a refusal of their work.
 *  - Never echo a payload into an error or a log. Error detail carries the server's
 *    message text only, sanitized (config/aiModel sanitizeAIError catches bearer/keys).
 *  - Dormant until configured: missing creds throw NerisConfigError (maps to 503),
 *    never a boot failure — the app runs fine for departments not submitting.
 *  - SAFE BASE URL DEFAULT: the TEST environment. Production submission requires
 *    explicitly setting NERIS_API_BASE=https://api.neris.fsri.org/v1 — a deliberate
 *    ops act, so nothing ever submits nationally by accident (train-mode doctrine).
 *
 * Auth (verified against the vendored OpenAPI snapshot v1.4.76 + live test env):
 *  POST {base}/token, HTTP Basic (client id/secret), body form-encoded
 *  grant_type=client_credentials → { access_token, expires_in, token_type:'bearer' }.
 *  Token cached in-memory with a 60s expiry skew; one automatic re-mint + retry on 401.
 *
 * Env:
 *  NERIS_CLIENT_ID / NERIS_CLIENT_SECRET  — integration credentials (Vercel, Sensitive)
 *  NERIS_API_BASE — optional; defaults to the TEST API base (api-test.neris.fsri.org).
 */

const NERIS_TEST_BASE = 'https://api-test.neris.fsri.org/v1';

// NERIS API Integration Best Practices (neris.fsri.org, 2026-03-26): requests
// without an identifying User-Agent can be 403'd at the WAF, and anomalous
// traffic risks permanent blocking. One explicit, stable UA for every call.
const USER_AGENT = 'OpenFirehouse/1.0 (Open Scaffold Labs; openscaffoldlabs.com)';
const NERIS_PROD_BASE = 'https://api.neris.fsri.org/v1';
const EXTERNAL_TIMEOUT_MS = 10_000; // house cap on external calls (routes/hazmat.js precedent)
const TOKEN_SKEW_MS = 60_000;       // refresh this long before expires_in elapses

class NerisConfigError extends Error {
  constructor(message) { super(message); this.name = 'NerisConfigError'; this.code = 'NERIS_UNCONFIGURED'; }
}
/** NERIS refused the request (4xx). Terminal — surface to the human, do not retry. */
class NerisRefusedError extends Error {
  constructor(status, detail) {
    super(`neris_refused_${status}${detail ? `: ${detail}` : ''}`);
    this.name = 'NerisRefusedError'; this.status = status; this.detail = detail || null;
    this.terminal = true; this.retryable = false;
  }
}
/** NERIS failed to process (5xx / network / timeout). Retryable — say nothing alarming. */
class NerisUnavailableError extends Error {
  constructor(reason, status = null) {
    super(`neris_unavailable${status ? `_${status}` : ''}: ${reason}`);
    this.name = 'NerisUnavailableError'; this.status = status; this.reason = reason;
    this.terminal = false; this.retryable = true;
  }
}

// ── module state (per serverless instance) ───────────────────────────────────
let fetchImpl = (...args) => globalThis.fetch(...args);
let tokenCache = { accessToken: null, expiresAtMs: 0 };

function config() {
  const clientId = process.env.NERIS_CLIENT_ID;
  const clientSecret = process.env.NERIS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new NerisConfigError('NERIS_CLIENT_ID / NERIS_CLIENT_SECRET not set — NERIS submission is not configured for this deployment.');
  }
  const base = (process.env.NERIS_API_BASE || NERIS_TEST_BASE).replace(/\/+$/, '');
  return { clientId, clientSecret, base };
}

function sanitize(text) {
  try {
    const { sanitizeAIError } = require('../config/aiModel');
    return sanitizeAIError(text);
  } catch {
    return String(text == null ? '' : text);
  }
}

/** Compact, payload-free detail from a NERIS error body. Never echoes our request. */
function extractDetail(bodyText) {
  if (!bodyText) return null;
  try {
    const parsed = JSON.parse(bodyText);
    const d = parsed.detail ?? parsed.message ?? parsed.error ?? parsed;
    const s = typeof d === 'string' ? d : JSON.stringify(d);
    return sanitize(s).slice(0, 2000);
  } catch {
    const text = String(bodyText);
    // A proxy/WAF refusal is an HTML error PAGE, not an API error object. Passing
    // it through meant a fire officer saw raw markup — verified live 2026-08-03,
    // the settings panel rendered "<html> <head><title>403 Forbidden</title>…
    // <center>nginx</center>" as its failure message. Collapse HTML to its title.
    if (/^\s*<(!doctype|html)/i.test(text) || /<\/html>/i.test(text)) {
      const title = (text.match(/<title>([^<]*)<\/title>/i) || [])[1];
      return title ? `gateway error: ${sanitize(title).trim()}` : 'gateway returned an HTML error page';
    }
    return sanitize(text).slice(0, 500);
  }
}

async function timedFetch(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), EXTERNAL_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: ctrl.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new NerisUnavailableError(`timeout after ${EXTERNAL_TIMEOUT_MS / 1000}s`);
    }
    throw new NerisUnavailableError(sanitize(err && err.message ? err.message : 'network error'));
  } finally {
    clearTimeout(timer);
  }
}

/** Mint (or reuse) a client-credentials bearer token. */
async function getToken() {
  const now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiresAtMs - TOKEN_SKEW_MS) {
    return tokenCache.accessToken;
  }
  const { clientId, clientSecret, base } = config();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const resp = await timedFetch(`${base}/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  });
  const text = await resp.text();
  if (!resp.ok) {
    // A refused token mint is a config/credential problem, not an incident problem.
    if (resp.status >= 400 && resp.status < 500) {
      throw new NerisRefusedError(resp.status, extractDetail(text) || 'token mint refused — check NERIS credentials');
    }
    throw new NerisUnavailableError(extractDetail(text) || 'token endpoint error', resp.status);
  }
  let data;
  try { data = JSON.parse(text); } catch {
    throw new NerisUnavailableError('token endpoint returned non-JSON');
  }
  if (!data.access_token || !data.expires_in) {
    throw new NerisUnavailableError('token response missing access_token/expires_in');
  }
  tokenCache = {
    accessToken: data.access_token,
    expiresAtMs: Date.now() + (Number(data.expires_in) * 1000),
  };
  return tokenCache.accessToken;
}

/**
 * Authenticated NERIS request. One automatic token re-mint + retry on 401
 * (expiry mid-flight); a second 401 is a genuine refusal.
 * Returns { status, data } — data is parsed JSON or null (204).
 */
async function request(method, path, body = undefined, { _retried = false } = {}) {
  const { base } = config();
  const token = await getToken();
  const options = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': USER_AGENT },
  };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const resp = await timedFetch(`${base}${path}`, options);
  const text = await resp.text();

  if (resp.status === 401 && !_retried) {
    tokenCache = { accessToken: null, expiresAtMs: 0 };
    return request(method, path, body, { _retried: true });
  }
  if (resp.ok) {
    if (resp.status === 204 || text === '') return { status: resp.status, data: null };
    try { return { status: resp.status, data: JSON.parse(text) }; }
    catch { throw new NerisUnavailableError('NERIS returned non-JSON success body', resp.status); }
  }
  if (resp.status >= 400 && resp.status < 500) {
    throw new NerisRefusedError(resp.status, extractDetail(text));
  }
  throw new NerisUnavailableError(extractDetail(text) || 'server error', resp.status);
}

// ── API surface (paths verified against openapi-snapshot v1.4.76) ────────────

/** GET /entity/{neris_id_entity} — read the department entity (the connection
 *  probe: proves credentials + entity id; spec path verified v1.4.76). */
function getEntity(entityId) {
  return request('GET', `/entity/${encodeURIComponent(entityId)}`);
}

/** POST /incident/{entity}/validate — pure preflight; 204 on success. */
function validateIncident(entityId, payload) {
  return request('POST', `/incident/${encodeURIComponent(entityId)}/validate`, payload);
}
/** POST /incident/{entity} — create; 201 → { neris_id, incident_status }. */
function createIncident(entityId, payload) {
  return request('POST', `/incident/${encodeURIComponent(entityId)}`, payload);
}
/** PUT /incident/{entity}/{uid} — full-replacement update-by-UID; 200 → { last_modified }. */
function putIncident(entityId, nerisIncidentId, payload) {
  return request('PUT', `/incident/${encodeURIComponent(entityId)}/${encodeURIComponent(nerisIncidentId)}`, payload);
}
/** GET /incident/{entity}/{uid}. */
function getIncident(entityId, nerisIncidentId) {
  return request('GET', `/incident/${encodeURIComponent(entityId)}/${encodeURIComponent(nerisIncidentId)}`);
}
/** POST /entity/{entity}/station — 201 → { neris_id, version, valid_start }. */
function createStation(entityId, payload) {
  return request('POST', `/entity/${encodeURIComponent(entityId)}/station`, payload);
}
/** PATCH /entity/{entity}/station/{station} — field-wise update of a registered station. */
function patchStation(entityId, nerisStationId, payload) {
  return request('PATCH', `/entity/${encodeURIComponent(entityId)}/station/${encodeURIComponent(nerisStationId)}`, payload);
}
/** PATCH /entity/{entity}/station/{station}/unit/{unit} — field-wise update of a registered unit. */
function patchUnit(entityId, nerisStationId, nerisUnitId, payload) {
  return request('PATCH', `/entity/${encodeURIComponent(entityId)}/station/${encodeURIComponent(nerisStationId)}/unit/${encodeURIComponent(nerisUnitId)}`, payload);
}
/** POST /entity/{entity}/station/{station}/unit — 201 → { neris_id, version, valid_start }. */
function createUnit(entityId, nerisStationId, payload) {
  return request('POST', `/entity/${encodeURIComponent(entityId)}/station/${encodeURIComponent(nerisStationId)}/unit`, payload);
}

/** True when credentials are present (route-level "is NERIS on?" check). */
function isConfigured() {
  return Boolean(process.env.NERIS_CLIENT_ID && process.env.NERIS_CLIENT_SECRET);
}

module.exports = {
  NERIS_TEST_BASE,
  NERIS_PROD_BASE,
  NerisConfigError,
  NerisRefusedError,
  NerisUnavailableError,
  isConfigured,
  getToken,
  request,
  getEntity,
  patchStation,
  patchUnit,
  validateIncident,
  createIncident,
  putIncident,
  getIncident,
  createStation,
  createUnit,
  // test seams — not for production use
  _test: {
    setFetch(fn) { fetchImpl = fn || ((...args) => globalThis.fetch(...args)); },
    resetToken() { tokenCache = { accessToken: null, expiresAtMs: 0 }; },
    tokenCache: () => ({ ...tokenCache }),
  },
};
