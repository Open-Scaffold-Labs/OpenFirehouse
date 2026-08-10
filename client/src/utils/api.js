/**
 * api.js — Thin fetch wrapper for the Open Firehouse REST API
 *
 * Handles:
 *  - Bearer token attachment on every request
 *  - Automatic token refresh on 401 (one retry)
 *  - credentials: 'include' so the httpOnly refresh cookie is sent
 *  - localStorage persistence so page reloads don't require re-login
 */

// In dev the Vite proxy (vite.config.js server.proxy) forwards /api → localhost:3005,
// so we use relative paths (BASE = '') to stay same-origin and avoid CORS.
// In production VITE_API_URL is set to the deployed API URL via the hosting env.
const BASE = import.meta.env.VITE_API_URL ?? '';

// ── Token storage ─────────────────────────────────────────────────────────────
// Access token stored in memory + localStorage for cross-reload persistence.
// localStorage lets us restore the session on page reload even when the
// httpOnly refresh cookie is blocked by third-party cookie restrictions.
let _accessToken = localStorage.getItem('fs_token') || null;
let _storedUser  = null;
try { _storedUser = JSON.parse(localStorage.getItem('fs_user') || 'null'); } catch { _storedUser = null; }

let _onAuthFailure = null;

/**
 * setToken(token, user?)
 * Stores the access token (and optionally the user object) in memory + localStorage.
 */
export function setToken(token, user) {
  _accessToken = token || null;
  if (token) {
    localStorage.setItem('fs_token', token);
    if (user) {
      _storedUser = user;
      localStorage.setItem('fs_user', JSON.stringify(user));
    }
  } else {
    _accessToken = null;
    _storedUser  = null;
    localStorage.removeItem('fs_token');
    localStorage.removeItem('fs_user');
  }
}

export function getToken()      { return _accessToken; }
export function getStoredUser() { return _storedUser;  }
export function clearToken()    { setToken(null);      }

/** Called by App.jsx to register a logout handler for 401 failures */
export function onAuthFailure(cb) { _onAuthFailure = cb; }

async function request(method, path, body, isRetry = false) {
  // Capture whether we had a token BEFORE making the request.
  // This lets us distinguish "session expired" (had a token, got 401)
  // from "not logged in yet" (no token, got 401) so we don't trigger
  // a full-page reload when unauthenticated hooks fire on the login screen.
  const hadToken = !!_accessToken;

  const opts = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  };
  if (_accessToken) {
    opts.headers['Authorization'] = `Bearer ${_accessToken}`;
  }
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, opts);

  // On 503 (server starting up), wait 3s and retry once automatically
  if (res.status === 503 && !isRetry) {
    await new Promise(r => setTimeout(r, 3000));
    return request(method, path, body, true);
  }

  // On 401, try to refresh the access token once, then retry.
  // Only trigger the full reload flow if the request actually had a token —
  // if there was no token we were never authenticated, so no reload needed.
  if (res.status === 401 && !isRetry && path !== '/api/auth/refresh') {
    if (hadToken) {
      try {
        const refreshRes = await fetch(`${BASE}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setToken(data.token, data.user);
          return request(method, path, body, true);
        }
      } catch { /* ignore */ }
      clearToken();
      if (_onAuthFailure) _onAuthFailure();
      throw new Error('Session expired. Please log in again.');
    }
    // No token was sent — request was unauthenticated. Just throw normally
    // without clearing state or reloading the page.
    let errData;
    try { errData = await res.json(); } catch { errData = {}; }
    const authErr = new Error(errData.error || 'Authentication required.');
    authErr.status = res.status; // W4.4: lets the offline queue tell 4xx from network failures
    throw authErr;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    const parseErr = new Error(`Non-JSON response from ${method} ${path} (${res.status})`);
    parseErr.status = res.status;
    throw parseErr;
  }

  if (!res.ok) {
    const reqErr = new Error(data.error || `Request failed: ${res.status}`);
    reqErr.status = res.status; // W4.4
    // The server's unified error schema is { error, code?, details? } — carry the
    // machine token and the field list through, not just the prose. Without them a
    // caller that needs to tell DUPLICATE_PERMIT_NUMBER from a generic 409 has to
    // pattern-match the message, which is how a UI silently mishandles a refusal
    // the day someone rewords the string. (Phase 3, module 3.0.)
    if (data.code) reqErr.code = data.code;
    if (Array.isArray(data.details)) reqErr.details = data.details;
    throw reqErr;
  }

  return data;
}

async function requestForm(path, formData) {
  // POST multipart/form-data — let the browser set Content-Type + boundary
  const opts = {
    method: 'POST',
    credentials: 'include',
    headers: {},
    body: formData,
  };
  if (_accessToken) opts.headers['Authorization'] = `Bearer ${_accessToken}`;
  const res = await fetch(`${BASE}${path}`, opts);
  let data;
  try { data = await res.json(); } catch { throw new Error(`Non-JSON response from POST ${path} (${res.status})`); }
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

/**
 * Download a server-generated file (CSV, PDF) with authentication.
 *
 * A plain <a href="/api/..."> CANNOT be used: the access token lives in an
 * Authorization header, not a cookie, so the browser's own navigation sends no
 * credentials and the download 401s. This fetches with the header and hands the
 * browser a blob instead.
 *
 * Throws on a non-2xx so a caller can surface the failure — a silently missing
 * download is worse than an error, because the user assumes it worked.
 */
async function download(path, filename) {
  const opts = { method: 'GET', headers: {}, credentials: 'include' };
  if (_accessToken) opts.headers['Authorization'] = `Bearer ${_accessToken}`;
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* not json */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get:      (path)          => request('GET',    path),
  download,
  post:     (path, body)    => request('POST',   path, body),
  put:      (path, body)    => request('PUT',    path, body),
  patch:    (path, body)    => request('PATCH',  path, body),
  delete:   (path, body)    => request('DELETE', path, body),
  postForm: (path, formData) => requestForm(path, formData),
};
