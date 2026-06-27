/**
 * routes/mapkitToken.js — GET /api/mapkit-token
 *
 * Mints a short-lived ES256-signed JWT for Apple MapKit JS so the Live Dispatch
 * maps (district coverage map + active-call map) render Apple Maps tiles instead
 * of iframe embeds (Google Maps / OpenStreetMap).
 *
 * Reuses the Open Scaffold Labs Apple Maps key (same .p8 used by FireHazmat) —
 * the key is not domain-bound; the token's `origin` claim pins it to the
 * OpenFirehouse app domain so a leaked token is unusable elsewhere.
 *
 * Required Vercel env vars (open-firehouse project → Settings → Environment Variables):
 *   MAPKIT_KEY_ID       — 10-char Key ID from the Apple Developer MapKit key
 *   APPLE_TEAM_ID       — Open Scaffold Labs team id (8P96A2SK8X)
 *   MAPKIT_PRIVATE_KEY  — full PEM of the .p8 (with BEGIN/END lines)
 *   MAPKIT_ALLOWED_ORIGIN (optional) — defaults to the app domain; set to a
 *                         dev origin (e.g. http://localhost:5173) for local dev.
 *
 * Response 200: text/plain raw JWT (what mapkit.init's authorizationCallback expects)
 * Response 500: application/json { error }
 */
const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

const PROD_ORIGIN = process.env.MAPKIT_ALLOWED_ORIGIN || 'https://app.openfirehouse.openscaffoldlabs.com';
const TOKEN_TTL_SECONDS = 30 * 60; // 30 minutes

// MapKit JS validates the token's `origin` claim against the page origin and
// refuses to initialize on a mismatch. To work across production + branch
// previews + local dev with one code path, echo the request's Origin when it's
// on the allowlist (the app domains, this project's *.vercel.app previews,
// localhost); otherwise fall back to the production app domain.
const ORIGIN_ALLOWLIST = [
  PROD_ORIGIN,
  'https://openfirehouse.openscaffoldlabs.com',
];
const PREVIEW_RE = /^https:\/\/open-firehouse-[a-z0-9-]+-open-scaffold-labs\.vercel\.app$/;
const LOCALHOST_RE = /^http:\/\/localhost:\d+$/;

function resolveOrigin(req) {
  let origin = req.headers.origin;
  if (!origin && req.headers.referer) {
    try { origin = new URL(req.headers.referer).origin; } catch (_) { /* ignore */ }
  }
  if (origin && (ORIGIN_ALLOWLIST.includes(origin) || PREVIEW_RE.test(origin) || LOCALHOST_RE.test(origin))) {
    return origin;
  }
  return PROD_ORIGIN;
}

router.get('/', (req, res) => {
  const keyId = process.env.MAPKIT_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const privateKeyRaw = process.env.MAPKIT_PRIVATE_KEY;

  if (!keyId || !teamId || !privateKeyRaw) {
    return res.status(500).json({
      error: 'missing_env_vars',
      missing: {
        MAPKIT_KEY_ID: !keyId,
        APPLE_TEAM_ID: !teamId,
        MAPKIT_PRIVATE_KEY: !privateKeyRaw,
      },
    });
  }

  // Vercel usually preserves real newlines; restore escaped "\n" defensively.
  const privateKey = privateKeyRaw.includes('\\n')
    ? privateKeyRaw.replace(/\\n/g, '\n')
    : privateKeyRaw;

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: teamId,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    origin: resolveOrigin(req),
  };

  try {
    const token = jwt.sign(claims, privateKey, {
      algorithm: 'ES256',
      header: { kid: keyId, typ: 'JWT', alg: 'ES256' },
    });
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'private, max-age=1500'); // 25 min, under TTL
    return res.status(200).send(token);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mapkit-token] sign failed:', err && err.message);
    return res.status(500).json({ error: 'sign_failed' });
  }
});

module.exports = router;
