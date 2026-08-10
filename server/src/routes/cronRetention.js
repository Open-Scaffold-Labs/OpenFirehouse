'use strict';
/**
 * routes/cronRetention.js — daily data-retention sweep.
 *
 * Mounted at /api/cron/retention in index.js (before requireAuth, like the
 * Stripe reconciler) and triggered by Vercel Cron daily at 13:45 UTC.
 *
 * Currently prunes radio_log per station using each station's configured
 * radio_config.retention_days (default 30). The db.radioLog.cleanup helper
 * and its (station_id, timestamp DESC) index existed but had no scheduled
 * caller — this is that caller.
 *
 * If CRON_SECRET is set, requests must carry it (Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}` to cron paths automatically).
 *
 * Retention for cad_alerts / unit_status_history / incidents is a Matt+Dale
 * policy decision (regulatory records-retention requirements apply) — add
 * sweeps here once the policy is set.
 */
const express = require('express');
const router  = express.Router();
const { pool, radioLog, runWithDepartment } = require('../db');
const { checkCronAuth } = require('../utils/cronAuth');
// X-PHASE cron liveness (0128): every cron records its invocation through ONE wrapper,
// so a cron cannot be added without a ledger row. cronRunCoverage.test.js enumerates these
// files from source and asserts it. An auth REFUSAL is deliberately not a run — see
// utils/cronRun.js; a public path must not let an anonymous caller append to a permanent log.
const { withCronRun } = require('../utils/cronRun');

router.get('/', withCronRun('retention', async (req, res) => {
  // Fail closed: if CRON_SECRET is unset in production, reject (503) instead of
  // running the retention sweep open. Vercel Cron sends the Bearer secret.
  const auth = checkCronAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  console.log(JSON.stringify({ kind: 'of_retention_heartbeat', at: new Date().toISOString() }));
  try {
    // Per-department sweep — no RLS bypass. departments has no RLS (it's the
    // tenant registry), so we enumerate it, then sweep EACH department inside its
    // own department context (runWithDepartment) so the RLS-scoped reads/deletes
    // see only that department's radio_config / radio_log. The explicit
    // `WHERE department_id = $1` is defense-in-depth so this is also correct when
    // the app still connects as the RLS-bypassing owner (P5_TXN off, pre-cutover).
    const { rows: depts } = await pool.query('SELECT id FROM departments ORDER BY id');
    const results = [];
    for (const d of depts) {
      const deptResults = await runWithDepartment(d.id, null, async () => {
        const { rows: configs } = await pool.query(
          'SELECT station_id, retention_days FROM radio_config WHERE department_id = $1', [d.id]
        );
        const out = [];
        for (const cfg of configs) {
          const days = Number(cfg.retention_days) > 0 ? Number(cfg.retention_days) : 30;
          const deleted = await radioLog.cleanup(cfg.station_id, days);
          out.push({ department_id: d.id, station_id: cfg.station_id, retention_days: days, deleted });
        }
        return out;
      });
      results.push(...deptResults);
    }
    const summary = {
      ran_at: new Date().toISOString(),
      departments_swept: depts.length,
      stations_swept: results.length,
      rows_deleted: results.reduce((n, r) => n + r.deleted, 0),
      results,
    };
    console.log(JSON.stringify({ kind: 'of_retention_summary', ...summary }));
    res.json(summary);
  } catch (err) {
    console.error('cron/retention error:', err);
    res.status(500).json({ error: err.message });
  }
}));

module.exports = router;
