'use strict';
/**
 * routes/cad.js — CAD webhook receiver + real-time dispatch stream.
 *
 * As of June 2026 the per-vendor parsing logic has moved into the adapter
 * framework at server/src/cad/. This route file is the HTTP shell:
 *
 *   POST /api/cad/:vendor       — adapter-framework webhook (active911,
 *                                 generic, iamresponding, firstdue, zuercher)
 *   POST /api/cad/active911     — legacy alias; dispatches to active911 adapter
 *   POST /api/cad/incoming      — legacy alias; dispatches to generic adapter
 *   GET  /api/cad/stream        — SSE stream for real-time dispatch (auth)
 *   GET  /api/cad/alerts        — list recent CAD alerts (auth)
 *   GET  /api/cad/alerts/:id    — get one alert (auth)
 *   GET  /api/cad/webhook-url   — return webhook URLs for setup (auth)
 *   GET  /api/cad/vendors       — list registered adapters (auth)
 *
 * See docs/CAD_INTEGRATION_STRATEGY.md for the broader plan.
 */

const express     = require('express');
const rateLimit   = require('express-rate-limit');
const router      = express.Router();
const { cadAlerts: db, runWithDepartment } = require('../db');
const requireAuth = require('../middleware/auth');
const { listAdapters, handleVendorWebhook } = require('../cad');
const { processDispatch } = require('../cad/pipeline');
const { requireDispatch } = require('../middleware/requireDispatch');
// This router is mounted BEFORE the global companion write-gate (it serves public
// webhook ingest), so the gate never sees these authed write routes. Apply it
// explicitly so a read-only companion (phone) session can't clear/simulate CAD
// even with a privileged role — phones are view-only for everyone. Same pattern
// hazmat.js uses for the same reason.
const companionGate = require('../middleware/companionGate');

// Dedicated limiter for the unauthenticated webhook POST paths. Real dispatch
// volume is low (a handful of calls/hour); 60/min/IP is generous headroom while
// capping a flood of forged dispatches. The authed GET routes use the global
// apiLimiter only.
const cadWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many CAD webhook requests' },
});

// ─── Legacy aliases (preserve existing customer webhook URLs) ────────────────
// Departments that configured their CAD against /api/cad/active911 or
// /api/cad/incoming should keep working without reconfiguring. Registered
// BEFORE the /:vendor wildcard so Express matches them first.
// /active911 happens to share its name with its adapter, so the wildcard
// would also handle it correctly; /incoming maps to the 'generic' adapter
// and must be rewritten.
function aliasTo(vendor) {
  return (req, res) => {
    req.params.vendor = vendor;
    return handleVendorWebhook(req, res);
  };
}
router.post('/active911', cadWebhookLimiter, aliasTo('active911'));
router.post('/incoming',  cadWebhookLimiter, aliasTo('generic'));

// POST /api/cad/simulate — authenticated demo/test dispatch. MUST be registered
// BEFORE the /:vendor wildcard below, or Express routes "simulate" to the vendor
// adapter lookup (no such adapter → 404). Derives tenancy from req.user (NEVER
// client-claimed) and reuses the real pipeline (persist in department context →
// auto-dispatch units → Realtime broadcast). Replaces the client's old call to
// the public /api/cad/active911 webhook, which now 401s under the CAD
// webhook-secret gate (cad/webhookAuth.js) — so the in-app "Simulate Dispatch"
// button silently failed to persist/broadcast.
router.post('/simulate', requireAuth, companionGate, requireDispatch, cadWebhookLimiter, async (req, res) => {
  try {
    const b = req.body || {};
    const { alert } = await processDispatch({
      alertId:      `demo-${Date.now()}`,
      description:  String(b.description || 'Simulated Dispatch'),
      address:      String(b.address || ''),
      units:        String(b.units || ''),
      details:      String(b.details || ''),
      latitude:     b.latitude ?? null,
      longitude:    b.longitude ?? null,
      dispatchedAt: new Date().toISOString(),
      raw:          { simulated: true, by: req.user.id },
      stationId:    req.user.stationId,
      departmentId: req.user.department_id,
      source:       'simulate',
    });
    if (!alert) return res.status(409).json({ error: 'Duplicate dispatch', code: 'DUPLICATE' });
    res.json({ data: alert, id: alert.id });
  } catch (err) {
    console.error('POST /cad/simulate error:', err);
    res.status(500).json({ error: 'Failed to simulate dispatch' });
  }
});

// ─── Vendor-agnostic webhook endpoint ────────────────────────────────────────
// POST /api/cad/:vendor — looks up an adapter by name and runs it. The
// adapter performs authentication and parsing, the shared pipeline persists
// and broadcasts. See server/src/cad/index.js.
// W3.3: vendor name shape-checked; body must be a JSON object (adapters do
// their own auth + field parsing on top of this).
const { z } = require('zod');
const validate = require('../middleware/validate');
router.post(
  '/:vendor',
  cadWebhookLimiter,
  validate({
    params: z.object({ vendor: z.string().regex(/^[a-z0-9_-]{1,40}$/i, 'vendor slug') }),
    // body optional: some CAD vendors post non-JSON content-types (only
    // express.json is mounted, so req.body can be undefined) — the adapter
    // authenticates and parses; we only fence the shape when JSON arrived.
    body: z.record(z.string(), z.unknown()).optional(),
  }),
  handleVendorWebhook
);

// ─── SSE Stream — RETIRED 2026-06-11 ─────────────────────────────────────────
// GET /api/cad/stream is gone. SSE cannot deliver across Vercel serverless
// instances (each request lands on its own instance, so an in-memory client
// registry never sees the broadcast). Every consumer — main app, kiosk/Watch
// Desk — now uses Supabase Realtime ("ping + authed refetch", see
// config/supabaseRealtime.js and client/src/App.jsx KioskApp).

// ─── Authenticated routes ─────────────────────────────────────────────────────

// GET /api/cad/vendors — list registered adapters (for the settings UI)
router.get('/vendors', requireAuth, (_req, res) => {
  res.json({ data: listAdapters() });
});

// GET /api/cad/webhook-url — back-compat: original two URLs, plus a generic
// pointer at the new per-vendor route shape.
router.get('/webhook-url', requireAuth, (_req, res) => {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.API_URL || 'https://your-api.vercel.app');
  res.json({
    active911: `${base}/api/cad/active911`,
    generic:   `${base}/api/cad/incoming`,
    perVendor: `${base}/api/cad/{vendor}`,
    vendors:   listAdapters().map(a => a.name),
  });
});

// GET /api/cad/alerts
// NOTE: /api/cad is mounted BEFORE the global dbTransaction RLS-GUC middleware
// (it has unauthenticated webhook siblings), so authed reads here must set the
// department GUC themselves via runWithDepartment — otherwise, under RLS
// (P5_TXN=on, of_app role), dept_isolation sees no app.department_id and returns
// zero rows. Same pattern tv-data and the dispatch pipeline already use.
router.get('/alerts', requireAuth, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const alerts = await runWithDepartment(req.user.department_id, req.user.id,
      () => db.recent(req.user.department_id, limit));
    res.json({ data: alerts, count: alerts.length });
  } catch (err) {
    console.error('GET /cad/alerts error:', err);
    res.status(500).json({ error: 'Failed to fetch CAD alerts' });
  }
});

// GET /api/cad/alerts/:id
router.get('/alerts/:id', requireAuth, async (req, res) => {
  try {
    const alert = await runWithDepartment(req.user.department_id, req.user.id,
      () => db.findById(Number(req.params.id), req.user.department_id));
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    res.json({ data: alert });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alert' });
  }
});

// Roles allowed to clear/resolve a call — dispatch + top command. Line members
// (firefighters) and company officers cannot: clearing calls is a dispatch
// function. requireDispatch is imported at the top of this file.

// RADIO DOCTRINE (Matt, 2026-06-10): unit statuses change ONLY when dispatch
// flips them after verbal radio traffic ("TL1 responding/on scene/back in
// service/in quarters"). Clearing a call NEVER touches unit statuses — units
// still committed to a cleared call are flagged `orphaned` by
// GET /api/units/status so the board reminds dispatch instead of guessing.

// POST /api/cad/alerts/clear-all — dispatch clears every active call
router.post('/alerts/clear-all', requireAuth, companionGate, requireDispatch, async (req, res) => {
  try {
    const cleared = await runWithDepartment(req.user.department_id, req.user.id,
      () => db.clearAll(req.user.department_id));
    res.json({ data: { cleared } });
  } catch (err) {
    console.error('POST /cad/alerts/clear-all error:', err);
    res.status(500).json({ error: 'Failed to clear calls' });
  }
});

// POST /api/cad/alerts/:id/clear — dispatch clears (resolves) one call
router.post('/alerts/:id/clear', requireAuth, companionGate, requireDispatch, async (req, res) => {
  try {
    const cleared = await runWithDepartment(req.user.department_id, req.user.id,
      () => db.clear(Number(req.params.id), req.user.department_id));
    res.json({ data: { id: Number(req.params.id), cleared: !!cleared } });
  } catch (err) {
    console.error('POST /cad/alerts/:id/clear error:', err);
    res.status(500).json({ error: 'Failed to clear call' });
  }
});

module.exports = router;
