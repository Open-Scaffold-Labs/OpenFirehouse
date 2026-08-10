'use strict';
/**
 * routes/cronPermitExpiry.js — the scheduled trigger for the permit expiry ladder (3.1b).
 *
 * Mounted at /api/cron/permit-expiry in index.js (before requireAuth, like the other four
 * crons) and triggered by Vercel Cron daily at 14:30 UTC.
 *
 * ⚠ THE SCHEDULE IS A CORRECTNESS CONSTRAINT, NOT A PREFERENCE. At 14:30 UTC every US
 * timezone (UTC−4 … UTC−10) is on the same calendar date as UTC, so the UTC day the job
 * evaluates against IS each department's local day. `departments` has no timezone column
 * (verified live), and this is the honest mitigation rather than a pretence. Moving the
 * schedule earlier than ~10:00 UTC would flip permits a day early in the western zones.
 * Full reasoning: jobs/permitExpiry.js.
 *
 * Fails CLOSED: checkCronAuth returns 503 in production when CRON_SECRET is unset, so this
 * endpoint is never open. ⚠ And note what that means for observability — a refused
 * invocation never reaches our handler, raises no error, and sends no notification. That is
 * one of the three ways this job can go silent, and it is exactly why the run ledger's
 * absence-of-success is the signal that matters (0095's header, R8).
 */
const express = require('express');
const router  = express.Router();
const { checkCronAuth } = require('../utils/cronAuth');
// X-PHASE cron liveness (0128): every cron records its invocation through ONE wrapper,
// so a cron cannot be added without a ledger row. cronRunCoverage.test.js enumerates these
// files from source and asserts it. An auth REFUSAL is deliberately not a run — see
// utils/cronRun.js; a public path must not let an anonymous caller append to a permanent log.
const { withCronRun } = require('../utils/cronRun');
const { runPermitExpiry, utcToday } = require('../jobs/permitExpiry');

router.get('/', withCronRun('permit_expiry', async (req, res) => {
  const auth = checkCronAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const today = utcToday();
  console.log(JSON.stringify({
    kind: 'of_permit_expiry_heartbeat', at: new Date().toISOString(), evaluatedFor: today,
  }));

  try {
    const result = await runPermitExpiry({ today });
    // Per-department failures are already recorded in the ledger and reported in the body.
    // The HTTP status reflects whether the SWEEP ran, not whether every department succeeded
    // — reporting 500 for one bad department would tell Vercel to surface an outage that a
    // single tenant's data problem does not constitute.
    const failed = result.departments.filter((d) => d.outcome === 'failed').length;
    console.log(JSON.stringify({
      kind: 'of_permit_expiry_done', evaluatedFor: today,
      departments: result.departments.length, failed,
      transitioned: result.departments.reduce((n, d) => n + (d.transitioned || 0), 0),
      skippedNoTerms: result.departments.reduce((n, d) => n + (d.skippedNoTerms || 0), 0),
    }));
    return res.json(result);
  } catch (e) {
    // The sweep itself failed (e.g. the departments read). No ledger row exists for anyone,
    // which the staleness check will surface tomorrow.
    console.error(JSON.stringify({
      kind: 'of_permit_expiry_sweep_failed', error: String(e && e.message),
    }));
    return res.status(500).json({ error: 'Permit expiry sweep failed' });
  }
}));

module.exports = router;
