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
const { cadAlerts: db, runWithDepartment, pool } = require('../db');
const { buildArchiveQuery } = require('../utils/archiveQuery');
const { audit } = require('../utils/auditLog');
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
// GET /api/cad/alerts/selectable — the calls an officer may attach a report to.
//
// 4.1a-R. This is the market's documented field-user moment: a "select an
// incident" list of CAD calls, shown WHEN THE REPORT IS BORN. That is the one
// moment a human knows which call it was — by March that knowledge is gone.
//
// Unlike /alerts (the active dispatch feed) this INCLUDES cleared calls, because
// reports are normally written after the call clears. Already-linked calls come
// back too, carrying their incident number, so the picker can disable them with a
// reason instead of hiding them.
//
// Mounted BEFORE /alerts — Express matches in order and '/alerts/selectable'
// would otherwise never be reached if a param route shadowed it later.
router.get('/alerts/selectable', requireAuth, async (req, res) => {
  try {
    const days  = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 30);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    const rows = await runWithDepartment(req.user.department_id, req.user.id,
      () => db.selectable(req.user.department_id, { days, limit }));
    res.json({ data: rows, count: rows.length, days });
  } catch (e) {
    console.error('GET /cad/alerts/selectable error:', e);
    res.status(500).json({ error: 'Failed to load selectable calls' });
  }
});

router.get('/alerts', requireAuth, async (req, res) => {
  try {
    // runWithDepartment sets the dept GUC so RLS lets the read see this dept's
    // rows (max:1 pool — never nest runWithDepartment; lesson #12).
    // Call closing is CAD-close-event + manual-clear ONLY — the same two ways the
    // market handles it. No auto-expiry timer (removed 2026-07-16): a machine
    // must not decide a call is over; a non-closing feed is cleared by a human.
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const alerts = await runWithDepartment(req.user.department_id, req.user.id,
      () => db.recent(req.user.department_id, limit));
    res.json({ data: alerts, count: alerts.length });
  } catch (err) {
    console.error('GET /cad/alerts error:', err);
    res.status(500).json({ error: 'Failed to fetch CAD alerts' });
  }
});

// ─── DISPATCH ARCHIVE (migration 0041) ──────────────────────────────────────
// Every dispatched call, searchable by date and by unit — the department's
// retention system of record. (The federal system went dark in Feb 2026; USFA
// tells departments without a local RMS to "establish a system of record".)
//
// Mounted at /archive, NOT /alerts/archive — Express would otherwise match it
// against /alerts/:id and try to look up an alert whose id is "archive".
//
// `pool` is used directly here (not the db.js helpers) because the archive query
// is composed by ONE shared builder that both the list and the CSV export use.
// If the export re-ran a different query than the list, the count on screen and
// the count in the export could disagree — and a chief who catches that once will
// never trust a report from this system again.

/** Parse the shared filter set out of the query string. */
function archiveFilters(q) {
  const asArray = (v) => v == null ? [] : (Array.isArray(v) ? v : String(v).split(',')).filter(Boolean);
  return {
    // ISO instants. The CLIENT converts the user's local day boundaries; we never
    // filter on a UTC calendar date (an 8pm-Eastern call is already "tomorrow" in UTC).
    from:    q.from || null,
    to:      q.to   || null,
    unitIds: asArray(q.unitIds).map(n => parseInt(n, 10)).filter(Number.isInteger),
    unitTokens: asArray(q.unitTokens),
    type:    q.type    || null,
    address: q.address || null,
    q:       q.q       || null,
    station: q.station ? parseInt(q.station, 10) : null,
    limit:   q.limit,
    cursor:  (q.cursorTs && q.cursorId)
               ? { ts: q.cursorTs, id: parseInt(q.cursorId, 10) } : null,
  };
}

// GET /api/cad/archive — the searchable call history.
router.get('/archive', requireAuth, async (req, res) => {
  try {
    const f = archiveFilters(req.query);
    const { sql, countSql, params, limit } = buildArchiveQuery(f, req.user.department_id);

    const { rows, total } = await runWithDepartment(req.user.department_id, req.user.id, async () => {
      const r = await pool.query(sql, params);
      const c = await pool.query(countSql, params);
      return { rows: r.rows, total: c.rows[0].total };
    });

    // The builder asks for limit+1 so we can say "there's more" without a second
    // COUNT over an unbounded table. Trim the probe row back off.
    const hasMore = rows.length > limit;
    const page    = hasMore ? rows.slice(0, limit) : rows;
    const last    = page[page.length - 1];

    res.json({
      data: page,
      total,                       // total matching the filter, not the page
      hasMore,
      nextCursor: hasMore && last
        ? { ts: last.dispatched_at, id: last.id }   // keyset, never OFFSET
        : null,
    });
  } catch (err) {
    console.error('GET /cad/archive error:', err);
    res.status(500).json({ error: 'Failed to search the dispatch archive' });
  }
});

// GET /api/cad/archive/units — the fleet, for the unit filter picker.
// The filter is a PICKER, not a free-text box: the user chooses a rig and we match
// on apparatus_id. Typing "Engine 1" into a text box is how you get Engine 10.
router.get('/archive/units', requireAuth, async (req, res) => {
  try {
    const rows = await runWithDepartment(req.user.department_id, req.user.id, async () => {
      const fleet = await pool.query(
        `SELECT a.id, a.designation, a.type,
                (SELECT count(*) FROM cad_alert_units u
                  WHERE u.apparatus_id = a.id AND u.department_id = a.department_id) AS run_count
           FROM apparatus a
          WHERE a.department_id = $1
          ORDER BY a.designation`, [req.user.department_id]);
      // Units CAD sent that we could NOT resolve — mutual aid, or a rig missing
      // from the fleet, or an ambiguous abbreviation awaiting a human mapping.
      // Surfaced so they're searchable too, and so the gaps are visible rather
      // than quietly dropped.
      const unresolved = await pool.query(
        `SELECT unit_norm, unit_raw, bool_or(ambiguous) AS ambiguous, count(*)::int AS run_count
           FROM cad_alert_units
          WHERE department_id = $1 AND apparatus_id IS NULL
          GROUP BY unit_norm, unit_raw ORDER BY unit_raw`, [req.user.department_id]);
      return { fleet: fleet.rows, unresolved: unresolved.rows };
    });
    res.json({ data: rows });
  } catch (err) {
    console.error('GET /cad/archive/units error:', err);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

// GET /api/cad/archive/export.csv — the filtered history as CSV.
// Uses the SAME builder as the list (see above). Every export is written to
// audit_log: in a records request, "who pulled what, when" is the thing that makes
// the export defensible.
router.get('/archive/export.csv', requireAuth, async (req, res) => {
  try {
    const f = archiveFilters(req.query);
    f.limit = 5000;   // export ceiling — a page limit would silently truncate a report
    const { sql, params } = buildArchiveQuery(f, req.user.department_id);

    const rows = await runWithDepartment(req.user.department_id, req.user.id,
      async () => (await pool.query(sql, params)).rows);

    await audit(req.user.department_id, req.user, 'export', 'cad_alerts', null,
      { export: 'dispatch_archive_csv', filters: f, row_count: rows.length });

    const esc = (v) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // pg hands back Date objects; String(date) yields
    // "Sun Jul 12 2026 14:27:10 GMT-0400 (Eastern Daylight Time)" — which Excel
    // cannot parse and cannot sort. A run report with an unsortable date column is
    // useless to the chief who has to file it. Emit ISO 8601.
    const iso = (v) => (v instanceof Date ? v.toISOString() : (v || ''));

    const header = ['incident_id','cad_id','dispatched_at','nature','address_as_dispatched',
                    'units','cleared_at','details'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.id, r.alert_id, iso(r.dispatched_at), r.description,
        r.address,                                   // AS DISPATCHED — never the geocode
        (r.units || []).map(u => u.unit).join(' | '),
        iso(r.cleared_at), r.details,
      ].map(esc).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dispatch-archive-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('GET /cad/archive/export.csv error:', err);
    res.status(500).json({ error: 'Failed to export the dispatch archive' });
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

// RADIO DOCTRINE (Matt, 2026-06-10; release prompt added 2026-07-12): unit
// statuses change ONLY when a human flips them after verbal radio traffic.
// Clearing a call NEVER auto-touches unit statuses. What clear MAY carry is an
// EXPLICIT, dispatcher-confirmed release list (`releaseUnits` below — the
// clear-time prompt in Live Dispatch): each listed unit, validated as actually
// committed on THIS call, is set to 'returning' AS the dispatcher's own action,
// recorded in unit_status_history under their user id. That is the documented
// mature CAD pattern (warn at closure, human-confirmed release) — automation is
// still zero. Units NOT released stay flagged `orphaned` by GET /api/units/status.

const { broadcastUnitStatusChanged, broadcastDispatchPing } = require('../config/supabaseRealtime');
const { committedUnitsForAlert } = require('../cad/unitCommitment');
const dbRoot = require('../db');

// Disposition vocabulary (0044, app-validated — UNIT_STATUS_VALUES convention).
// MANUAL codes the dispatcher may pick at clear time; the SYSTEM code
// 'cad_closed' (set only by the CAD close-event path) is NOT accepted from clients.
// The clear-time disposition IS the NERIS `type_noaction` reason — verified verbatim
// against USFA NERIS Release 1.0.1
// (https://www.responserack.com/neris/spec/values/noaction/).
//
// NERIS models an incident as EITHER actions OR a no-action reason (XOR): a call
// that became a working incident has its "what was done" captured as actions/type on
// the INCIDENT RECORD (the NERIS way, and how command-board products defer it) — its
// disposition stays blank. A call that did NOT become an incident gets one of these
// three no-action reasons. Stored as the exact NERIS enum so reporting needs no
// re-mapping. (Realigned 2026-07-16 from an 8-code list that mixed actions / incident
// types / aid into 'disposition' and had no clean NERIS home for half of it.)
const DISPOSITIONS = [
  'CANCELLED', 'STAGED_STANDBY', 'NO_INCIDENT_FOUND',
];
function validDisposition(d) {
  return DISPOSITIONS.includes(String(d));
}

// GET /api/cad/alerts/:id/committed-units — which units the clear-time prompt
// should list (any authed read; the status board is readable by everyone).
router.get('/alerts/:id/committed-units', requireAuth, async (req, res) => {
  try {
    // ONE runWithDepartment around read + compute: under P5_TXN + RLS an
    // unwrapped cad_alerts read returns EMPTY (dept GUC unset) — caught live
    // 2026-07-12 when this route 404'd a dept's own alert. Never nest
    // runWithDepartment (max:1 pool — lesson #12).
    const { alert, data } = await runWithDepartment(req.user.department_id, req.user.id, async () => {
      const a = await db.findById(Number(req.params.id), req.user.department_id);
      if (!a) return { alert: null, data: null };
      return { alert: a, data: await committedUnitsForAlert(req.user.department_id, a) };
    });
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    res.set('Cache-Control', 'no-store');
    res.json({ data });
  } catch (err) {
    console.error('GET /cad/alerts/:id/committed-units error:', err);
    res.status(500).json({ error: 'Failed to load committed units' });
  }
});

// POST /api/cad/alerts/clear-all — dispatch clears every active call
router.post('/alerts/clear-all', requireAuth, companionGate, requireDispatch, async (req, res) => {
  try {
    const cleared = await runWithDepartment(req.user.department_id, req.user.id, async () => {
      const n = await db.clearAll(req.user.department_id, req.user.id);
      if (n > 0) await audit(req.user.department_id, req.user, 'clear', 'cad_alerts', null, { clearAll: n });
      return n;
    });
    if (cleared > 0) await broadcastDispatchPing(req.user.department_id, 0); // id-only ping → clients refetch
    res.json({ data: { cleared } });
  } catch (err) {
    console.error('POST /cad/alerts/clear-all error:', err);
    res.status(500).json({ error: 'Failed to clear calls' });
  }
});

// POST /api/cad/alerts/:id/clear — dispatch clears (resolves) one call.
// Optional body { releaseUnits: [apparatusId, ...] }: the dispatcher-confirmed
// release list from the clear-time prompt. Each id is validated as actually
// committed on THIS call (never trusted raw) and set to 'returning' — a
// dispatchable status, matching the radio ladder ("back in service"). Ids that
// aren't committed on this call are skipped, not errored (the board may have
// moved between prompt and confirm).
router.post('/alerts/:id/clear', requireAuth, companionGate, requireDispatch, async (req, res) => {
  try {
    const id   = Number(req.params.id);
    const dept = req.user.department_id;
    const requested = Array.isArray(req.body?.releaseUnits)
      ? [...new Set(req.body.releaseUnits.map(Number).filter(Number.isInteger))]
      : [];

    // Disposition (0044): optional — never blocks a clear (EULA philosophy);
    // validated against the MANUAL vocabulary when present.
    let disposition = null;
    if (req.body?.disposition != null && req.body.disposition !== '') {
      if (!validDisposition(req.body.disposition)) {
        return res.status(400).json({ error: `Invalid disposition. Allowed: ${DISPOSITIONS.join(', ')}` });
      }
      disposition = req.body.disposition;
    }

    // ONE runWithDepartment for the whole read-clear-release-audit sequence —
    // every cad_alerts/unit_statuses/audit_log touch needs the dept GUC under
    // P5_TXN + RLS (an unwrapped read returns EMPTY; an unwrapped write fails
    // its WITH CHECK). Broadcasts fire AFTER commit so refetches find the rows.
    const { cleared, released } = await runWithDepartment(dept, req.user.id, async () => {
      // Resolve the alert first (release validation needs its units string;
      // the row survives clear — cleared_at is set, nothing is deleted).
      const alert = requested.length ? await db.findById(id, dept) : null;

      const clearedRow = await db.clear(id, dept, { disposition, clearedBy: req.user.id });

      const rel = [];
      if (requested.length && alert) {
        const eligible = new Map(
          (await committedUnitsForAlert(dept, alert)).map((c) => [c.apparatusId, c])
        );
        for (const apparatusId of requested) {
          const c = eligible.get(apparatusId);
          if (!c) continue; // not committed on this call anymore — skip
          const row = await dbRoot.unitStatus.set(dept, {
            apparatusId,
            designation: c.designation,
            status: 'returning',
            incidentId: null,
            userId: req.user.id, // the dispatcher's own action, in unit_status_history
          });
          rel.push({ apparatusId: row.apparatus_id ?? apparatusId, designation: c.designation, status: 'returning' });
        }
      }

      if (clearedRow) {
        // Append-only audit trail for the closure itself (unit releases are
        // already in unit_status_history under the dispatcher's id).
        await audit(dept, req.user, 'clear', 'cad_alerts', id,
          { disposition, released: rel.map((r) => r.designation) });
      }
      return { cleared: !!clearedRow, released: rel };
    });

    // Post-commit broadcasts. ONE bulk unit-status ping (not per-unit — three
    // simultaneous pings made every client reload at once and stampede the
    // max:1 pool; observed live 2026-07-12) + the dispatch ping. Id-only, no PII.
    if (released.length) {
      broadcastUnitStatusChanged(dept, { released: released.length });
    }
    if (cleared) await broadcastDispatchPing(dept, id);

    res.json({ data: { id, cleared, released, disposition } });
  } catch (err) {
    console.error('POST /cad/alerts/:id/clear error:', err);
    res.status(500).json({ error: 'Failed to clear call' });
  }
});

// POST /api/cad/alerts/:id/reopen — dispatch reopens a mis-closed call (the
// recovery path every mature platform ships beside manual close). Traced in
// the audit log; unit statuses untouched, like every call-lifecycle action.
router.post('/alerts/:id/reopen', requireAuth, companionGate, requireDispatch, async (req, res) => {
  try {
    const id   = Number(req.params.id);
    const dept = req.user.department_id;
    const reopened = await runWithDepartment(dept, req.user.id, async () => {
      const row = await db.reopen(id, dept);
      if (row) await audit(dept, req.user, 'reopen', 'cad_alerts', id, {}); // GUC needed for the RLS WITH CHECK
      return row;
    });
    if (reopened) await broadcastDispatchPing(dept, id); // post-commit
    res.json({ data: { id, reopened: !!reopened } });
  } catch (err) {
    console.error('POST /cad/alerts/:id/reopen error:', err);
    res.status(500).json({ error: 'Failed to reopen call' });
  }
});

module.exports = router;
// Exported for tests (cadClearRelease.test.js, cadLifecycle.test.js).
module.exports.committedUnitsForAlert = committedUnitsForAlert;
module.exports.DISPOSITIONS = DISPOSITIONS;
module.exports.validDisposition = validDisposition;
