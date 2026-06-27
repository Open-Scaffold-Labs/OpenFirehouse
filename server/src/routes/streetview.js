/**
 * routes/streetview.js — GET /api/streetview?lat=..&lng=..
 *
 * Server-side proxy for Google Street View Static, used by the Live Dispatch
 * active-call "Street View" tab (Apple's web SDK has no street imagery).
 *
 * Why a proxy instead of a client-side key:
 *  - The Google key is tied to BILLING. A client `VITE_` key is visible in the
 *    bundle and a referrer restriction can be forged, so it could be abused to
 *    run up the bill. Here the key stays server-side and Sensitive.
 *  - We hit the FREE Street View metadata endpoint first; if no pano exists we
 *    return 204 (so the UI shows a clean fallback) and never pay for a gray
 *    "no imagery" image.
 *
 * Env (open-firehouse Vercel project, set Sensitive):
 *   GOOGLE_STREETVIEW_KEY — Google Maps API key with Street View Static API enabled.
 *
 * 200: image/jpeg bytes · 204: no imagery at this address · 503: not configured.
 */
const express = require('express');

const router = express.Router();
const KEY = () => process.env.GOOGLE_STREETVIEW_KEY;

router.get('/', async (req, res) => {
  const key = KEY();
  if (!key) return res.status(503).json({ error: 'streetview_not_configured' });

  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'missing_coords' });
  const location = `${lat},${lng}`;

  // Google caps Street View Static at 640x640 (standard tier).
  const w = Math.min(parseInt(req.query.w, 10) || 640, 640);
  const h = Math.min(parseInt(req.query.h, 10) || 400, 640);
  const fov = req.query.fov || '80';
  const pitch = req.query.pitch || '5';

  try {
    // Free metadata probe — confirms a panorama exists before we pay for an image.
    const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(location)}&source=outdoor&key=${key}`;
    const meta = await fetch(metaUrl).then((r) => r.json()).catch(() => null);
    if (!meta || meta.status !== 'OK') {
      return res.status(204).end(); // ZERO_RESULTS / NOT_FOUND / over-query → clean fallback in UI
    }

    const params = new URLSearchParams({
      size: `${w}x${h}`,
      location,
      fov,
      pitch,
      source: 'outdoor',
      return_error_code: 'true',
      key,
    });
    const img = await fetch(`https://maps.googleapis.com/maps/api/streetview?${params.toString()}`);
    if (!img.ok) return res.status(img.status === 404 ? 204 : 502).end();

    res.setHeader('Content-Type', img.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h — addresses don't move
    const buf = Buffer.from(await img.arrayBuffer());
    return res.end(buf);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[streetview] fetch failed:', err && err.message);
    return res.status(502).json({ error: 'streetview_fetch_failed' });
  }
});

module.exports = router;
