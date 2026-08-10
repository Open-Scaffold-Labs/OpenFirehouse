'use strict';
/**
 * routes/cronReportDelivery.js — daily sweep that delivers due scheduled reports.
 *
 * Mounted at /api/cron/report-delivery (before requireAuth, like the other
 * crons) and triggered by Vercel Cron daily at 14:15 UTC.
 *
 * Pattern copied from cronRetention.js: fail closed on a missing CRON_SECRET,
 * enumerate departments, then do each department's work inside its own
 * runWithDepartment context so RLS scopes every read and write.
 *
 * ─── WHAT THIS SWEEP REFUSES TO DO ──────────────────────────────────────────
 *
 * 1. IT WILL NOT REPORT A SEND THAT DID NOT HAPPEN. RESEND_API_KEY is unset on
 *    this deployment. Every other email path in OF no-ops quietly on that, which
 *    is correct for a signup nudge and wrong here: a chief who set up a monthly
 *    report and hears nothing will assume it went out. So "email is not
 *    configured" is a recorded status the UI displays, not a silent skip. The
 *    same applies to a 4xx from the mail provider — send_failed with the reason.
 *
 * 2. IT WILL NOT SEND THE SAME PERIOD TWICE. The period is claimed by a
 *    CONDITIONAL UPDATE (`WHERE last_period_key IS DISTINCT FROM $key`) that
 *    both selects the work and marks it taken in one statement. Two concurrent
 *    runs cannot both win it, because the second one's UPDATE matches no rows.
 *    Vercel Cron retries are therefore free.
 *
 * 3. IT WILL NOT OPEN A SECOND CONNECTION MID-REQUEST. The prod pool is max:1
 *    (lesson #12), so everything here goes through pool.query — no manual client
 *    checkout, no nested runWithDepartment inside a held client.
 *
 * The report itself is produced by buildComplianceReport() and rendered by
 * renderComplianceCsv() — the exact functions behind the interactive page and
 * its download button. There is no scheduled-report query and no scheduled-report
 * renderer, deliberately: that is how an emailed number starts disagreeing with
 * the screen it claims to come from.
 */
const express = require('express');
const router = express.Router();
const { pool, runWithDepartment } = require('../db');
const { checkCronAuth } = require('../utils/cronAuth');
// X-PHASE cron liveness (0128): every cron records its invocation through ONE wrapper,
// so a cron cannot be added without a ledger row. cronRunCoverage.test.js enumerates these
// files from source and asserts it. An auth REFUSAL is deliberately not a run — see
// utils/cronRun.js; a public path must not let an anonymous caller append to a permanent log.
const { withCronRun } = require('../utils/cronRun');
const { isDeliveryDue } = require('../utils/reportPeriod');
const {
  buildComplianceReport, renderComplianceCsv,
} = require('./responseReports');

/**
 * Which report keys this sweep can actually PRODUCE.
 *
 * Migration 0105's CHECK constraint allows three keys; only this one has a
 * builder and a renderer today. That gap is the dangerous kind — a chief who
 * scheduled "incident activity" and received a compliance CSV would have no way
 * to tell it was the wrong report, because it would look like a perfectly valid
 * report. So the dispatch is EXPLICIT and unknown keys are REFUSED with a
 * recorded error rather than falling through to whatever is first.
 *
 * The API's zod schema (routes/reportSchedules.js) only offers the keys in here,
 * so this branch should be unreachable — it exists because "should be
 * unreachable" is exactly the assumption that stops being true after somebody
 * widens the enum in one place and not the other.
 */
const RENDERERS = Object.freeze({
  response_compliance: async ({ departmentId, period, house }) => {
    const rep = await buildComplianceReport(departmentId, period.from, period.to, house);
    return {
      csv: renderComplianceCsv(rep, period.from, period.to),
      filename: `response-compliance-${period.from}_to_${period.to}.csv`,
      subject: `OpenFirehouse response report — ${period.label}`,
    };
  },
});

const DELIVERY_STATUS = Object.freeze({
  SENT: 'sent',
  NO_EMAIL: 'no_email_configured',
  FAILED: 'send_failed',
  NO_DATA: 'no_data',
});

/**
 * Send one report as a CSV attachment.
 *
 * Returns a STATUS, never a boolean — "we didn't send it" has more than one
 * cause and the causes need different fixes (an ops step vs a bad address).
 */
async function deliver({ recipients, subject, filename, csv }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ kind: 'of_report_delivery_skipped_no_resend', recipients: recipients.length }));
    return { status: DELIVERY_STATUS.NO_EMAIL, error: 'RESEND_API_KEY is not configured on this deployment' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'OpenFirehouse <reports@openscaffoldlabs.com>',
        to: recipients,
        subject,
        html: `<p>${escapeHtml(subject)}</p>
               <p>The report is attached as a CSV. It carries its own standard
               edition, percentile method and the list of measures that could
               not be computed, so it stays readable on its own.</p>`,
        attachments: [{ filename, content: Buffer.from(csv, 'utf8').toString('base64') }],
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { status: DELIVERY_STATUS.FAILED, error: `mail provider responded ${r.status}${body ? `: ${body.slice(0, 200)}` : ''}` };
    }
    return { status: DELIVERY_STATUS.SENT, error: null };
  } catch (e) {
    return { status: DELIVERY_STATUS.FAILED, error: e.message?.slice(0, 200) || 'send threw' };
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

router.get('/', withCronRun('report_delivery', async (req, res) => {
  const auth = checkCronAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const now = new Date();
  console.log(JSON.stringify({ kind: 'of_report_delivery_heartbeat', at: now.toISOString() }));

  try {
    const { rows: depts } = await pool.query('SELECT id FROM departments ORDER BY id');
    const summary = [];

    for (const d of depts) {
      const deptResult = await runWithDepartment(d.id, null, async () => {
        const { rows: schedules } = await pool.query(
          `SELECT id, department_id, station_id, report_key, cadence, recipients,
                  enabled, last_period_key
             FROM report_schedules
            WHERE department_id = $1 AND enabled
            ORDER BY id`,
          [d.id]
        );

        const done = [];
        for (const s of schedules) {
          const period = isDeliveryDue(s, now);
          if (!period) continue;

          // CLAIM the period and select the work in ONE statement. A concurrent
          // or retried run matches no rows here and does nothing — this is the
          // whole double-send guard, and it lives in the database rather than in
          // an if-statement that two invocations could both pass.
          const claim = await pool.query(
            `UPDATE report_schedules
                SET last_period_key = $1, last_run_at = NOW(), updated_at = NOW()
              WHERE id = $2 AND department_id = $3
                AND last_period_key IS DISTINCT FROM $1
              RETURNING id`,
            [period.key, s.id, d.id]
          );
          if (claim.rowCount === 0) continue;        // somebody else took it

          let status = DELIVERY_STATUS.NO_DATA;
          let error = null;
          try {
            const render = RENDERERS[s.report_key];
            if (!render) {
              // Refuse loudly. Sending SOME report is worse than sending none:
              // a wrong report that looks right is not detectable by its reader.
              throw new Error(`no renderer for report_key '${s.report_key}' — nothing was sent`);
            }
            const house = { requested: false, stationId: s.station_id ?? null };
            const built = await render({ departmentId: d.id, period, house });

            const out = await deliver({
              recipients: s.recipients,
              subject: built.subject,
              filename: built.filename,
              csv: built.csv,
            });
            status = out.status;
            error = out.error;
          } catch (e) {
            status = DELIVERY_STATUS.FAILED;
            error = e.message?.slice(0, 300) || 'report build threw';
          }

          // Record the OUTCOME. The period stays claimed either way: a schedule
          // that failed to send must not silently retry the same period every
          // day forever — it shows its error so somebody fixes the cause.
          await pool.query(
            `UPDATE report_schedules SET last_status = $1, last_error = $2, updated_at = NOW()
              WHERE id = $3 AND department_id = $4`,
            [status, error, s.id, d.id]
          );
          done.push({ schedule: s.id, period: period.key, status });
        }
        return done;
      });

      if (deptResult.length) summary.push({ department: d.id, delivered: deptResult });
    }

    console.log(JSON.stringify({ kind: 'of_report_delivery_done', departments: summary.length }));
    res.json({ ok: true, at: now.toISOString(), summary });
  } catch (err) {
    console.error(JSON.stringify({ kind: 'of_report_delivery_error', message: err.message }));
    res.status(500).json({ error: 'Report delivery sweep failed' });
  }
}));

module.exports = router;
module.exports.DELIVERY_STATUS = DELIVERY_STATUS;
module.exports.DELIVERABLE_REPORT_KEYS = Object.freeze(Object.keys(RENDERERS));
