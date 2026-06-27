'use strict';
/**
 * routes/debugAgent.js — Self-Healing Pipeline: Bug Reports & Dispatch
 *
 * This module exports TWO routers:
 *   publicRouter  — POST /callback (GitHub Actions webhook, token-authed)
 *   protectedRouter — POST /report, POST /dispatch, GET /reports
 *
 * The public router is mounted BEFORE requireAuth in index.js.
 * The protected router is mounted AFTER requireAuth.
 */

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

const publicRouter = express.Router();
const protectedRouter = express.Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

function chiefOnly(req, res, next) {
  if (req.user?.role !== 'chief') {
    return res.status(403).json({ error: 'Chief role required' });
  }
  next();
}

// Vendor/platform admins (the OpenFirehouse team) may see ALL departments' bug
// reports for support; every other chief is scoped to their OWN department.
// Allowlist is config-driven (VENDOR_ADMIN_EMAILS, comma-separated) — no emails
// committed to the repo, and FAIL-CLOSED: if it's unset, nobody is a vendor
// admin, so everyone is department-scoped.
async function isVendorAdmin(req) {
  const allow = (process.env.VENDOR_ADMIN_EMAILS || '').toLowerCase()
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!allow.length || !req.user?.id) return false;
  try {
    const r = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    const email = String(r.rows[0]?.email || '').toLowerCase();
    return !!email && allow.includes(email);
  } catch { return false; }
}
async function logActivity(userId, stationId, action, details) {
  try {
    await pool.query(
      `INSERT INTO activity_entries (user_id, station_id, action, details, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, stationId, action, details]
    );
  } catch (e) {
    console.error('[debug-agent] activity log error:', e.message);
  }
}

// ── Email forwarding for bug reports ────────────────────────────────────────
// When SUPPORT_EMAIL + RESEND_API_KEY are both set, every bug report submitted
// via /report also fires an email to the support inbox. Best-effort: failures
// log but never fail the original bug submission.
//
// Customers running their own OpenFirehouse install set their own support
// address (e.g., chief@theirdept.gov). The public demo at
// open-firehouse-client.vercel.app forwards to dale@openscaffoldlabs.com.
async function forwardBugReportToSupport(report, user, description, pageRoute, contextBundle) {
  const supportEmail = process.env.SUPPORT_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  if (!supportEmail || !resendKey) return; // silently skip when not configured

  const fromAddress = process.env.SUPPORT_FROM_EMAIL || 'OpenFirehouse <bugs@openfirehouse.com>';
  const stationLabel = user.stationId ? `station #${user.stationId}` : 'unknown station';

  const subject = `[OpenFirehouse bug #${report.id}] ${description.slice(0, 60)}${description.length > 60 ? '…' : ''}`;
  const text = [
    `New bug report from ${user.username || 'unknown user'} (${stationLabel}, role: ${user.role || 'unknown'}).`,
    '',
    `Bug ID:      ${report.id}`,
    `Submitted:   ${report.created_at}`,
    `Page route:  ${pageRoute || '(none)'}`,
    `Reporter:    ${user.username} (${user.name || ''}) — user.id ${user.id}`,
    `Station:     ${stationLabel}`,
    '',
    '─── Description ───',
    description,
    '',
    contextBundle ? '─── Browser context ───' : '',
    contextBundle ? JSON.stringify(contextBundle, null, 2) : '',
    '',
    '─── Next steps ───',
    'The AI diagnostic pass is running in the background. When it completes,',
    `the bug_reports row will be updated with status='diagnosed' and a structured`,
    'diagnosis (severity, root_cause, suspected_files, proposed_fix). The chief',
    'can review and optionally dispatch self-heal from the admin view.',
    '',
    '— OpenFirehouse self-heal pipeline',
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: supportEmail.split(',').map(s => s.trim()).filter(Boolean),
        subject,
        text,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`[debug-agent] support email send failed (${response.status}):`, body.slice(0, 200));
    } else {
      console.log(`[debug-agent] support email sent for bug #${report.id} to ${supportEmail}`);
    }
  } catch (err) {
    console.error('[debug-agent] support email error:', err.message);
  }
}

// ── PUBLIC: POST /api/debug-agent/callback ──────────────────────────────────
// GitHub Actions calls this to report self-heal progress. Authenticated via
// shared secret token, NOT via JWT (GitHub doesn't have a user session).

publicRouter.post('/callback', async (req, res) => {
  const { token, phase, run_id, pr_url, pr_number, branch, message } = req.body;

  if (!token || token !== process.env.SELF_HEAL_CALLBACK_TOKEN) {
    return res.status(401).json({ error: 'Invalid callback token' });
  }

  try {
    // Find the bug report associated with this run
    const update = {};
    if (phase === 'started') {
      await pool.query(
        `UPDATE bug_reports SET self_heal_status = 'running', self_heal_run_id = $1, updated_at = NOW()
         WHERE self_heal_status = 'queued' ORDER BY updated_at DESC LIMIT 1`,        [run_id]
      );
    } else if (phase === 'pr-opened') {
      await pool.query(
        `UPDATE bug_reports SET self_heal_status = 'completed', self_heal_pr_url = $1,
         self_heal_pr_number = $2, self_heal_branch = $3, updated_at = NOW()
         WHERE self_heal_run_id = $4`,
        [pr_url, pr_number, branch, run_id || '']
      );
    } else if (phase === 'failed') {
      await pool.query(
        `UPDATE bug_reports SET self_heal_status = 'failed',
         resolution_notes = $1, updated_at = NOW()
         WHERE self_heal_status IN ('queued', 'running') ORDER BY updated_at DESC LIMIT 1`,
        [message || 'Workflow failed']
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[debug-agent] callback error:', err.message);
    res.status(500).json({ error: 'Callback processing failed' });
  }
});

// ── PROTECTED: POST /api/debug-agent/report ─────────────────────────────────
// Any authenticated user can submit a bug report. The server runs a diagnostic
// pass using Claude with the repo's CLAUDE.md as system prompt.

protectedRouter.post('/report', async (req, res) => {
  const { description, page_route, context_bundle } = req.body;
  if (!description || description.trim().length < 10) {
    return res.status(400).json({ error: 'Description must be at least 10 characters' });
  }

  try {
    // 1. Insert the bug report
    const insert = await pool.query(
      `INSERT INTO bug_reports (user_id, description, page_route, context_bundle, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, created_at`,
      [req.user.id, description.trim(), page_route || null, context_bundle ? JSON.stringify(context_bundle) : null]
    );
    const report = insert.rows[0];

    // 2. Run diagnostic pass (async — don't block the response)
    runDiagnostic(report.id, description, page_route).catch(err => {
      console.error(`[debug-agent] diagnostic failed for ${report.id}:`, err.message);
    });

    // 3. Forward to support email if SUPPORT_EMAIL + RESEND_API_KEY are configured
    //    (async, best-effort — failures never break the bug submission flow)
    forwardBugReportToSupport(report, req.user, description, page_route, context_bundle).catch(err => {
      console.error(`[debug-agent] support email failed for ${report.id}:`, err.message);
    });

    await logActivity(req.user.id, req.user.department_id, 'bug_report_submitted',
      `Bug report #${report.id} submitted: ${description.slice(0, 80)}`);

    res.status(201).json({ id: report.id, status: 'pending', message: 'Report submitted, diagnosis running' });
  } catch (err) {
    console.error('[debug-agent] report error:', err.message);
    res.status(500).json({ error: 'Failed to submit bug report' });
  }
});
// ── Diagnostic pass — calls Claude API with CLAUDE.md as system prompt ──────

async function runDiagnostic(bugId, description, pageRoute) {
  const startMs = Date.now();

  // Read CLAUDE.md — on Vercel it's bundled via includeFiles; locally it's at repo root
  let claudeMd;
  try {
    const candidates = [
      path.join(process.cwd(), 'CLAUDE.md'),
      path.join(__dirname, '..', '..', '..', 'CLAUDE.md'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) { claudeMd = fs.readFileSync(p, 'utf-8'); break; }
    }
    if (!claudeMd) throw new Error('CLAUDE.md not found');
  } catch (e) {
    await pool.query(
      `UPDATE bug_reports SET status = 'failed', resolution_notes = $1, updated_at = NOW() WHERE id = $2`,
      [`Diagnostic failed: ${e.message}`, bugId]
    );
    return;
  }

  const client = new Anthropic();
  const diagnosticPrompt = `You are the diagnostic agent for OpenFirehouse. A user reported a bug. Analyze it and return a JSON object with these fields:
- severity: "low" | "medium" | "high" | "critical"
- confidence: "low" | "medium" | "high"
- root_cause: one-sentence explanation
- suspected_files: array of file paths most likely involved
- proposed_fix: one-sentence description of the fix- narrative: 2-3 sentence explanation for the operator
- description: the original bug description (pass through)
- page_route: "${pageRoute || 'unknown'}"

Respond with ONLY the JSON object, no markdown fencing.`;

  try {
    const response = await client.messages.create({
      model: require('../config/aiModel').AI_MODEL_HEAVY,
      max_tokens: 1000,
      system: claudeMd,
      messages: [{ role: 'user', content: `Bug report: ${description}` }],
      tools: [],
    });

    const text = response.content.find(b => b.type === 'text')?.text || '';
    let diagnosis;
    try {
      diagnosis = JSON.parse(text);
    } catch {
      diagnosis = { severity: 'unknown', confidence: 'low', root_cause: text.slice(0, 500), narrative: text.slice(0, 500) };
    }

    const durationMs = Date.now() - startMs;
    const tokens = { input: response.usage?.input_tokens, output: response.usage?.output_tokens };

    await pool.query(
      `UPDATE bug_reports SET status = 'diagnosed', diagnosis = $1,
       diagnosis_tokens = $2, diagnosis_duration_ms = $3, updated_at = NOW()       WHERE id = $4`,
      [JSON.stringify(diagnosis), JSON.stringify(tokens), durationMs, bugId]
    );
  } catch (err) {
    await pool.query(
      `UPDATE bug_reports SET status = 'failed', resolution_notes = $1, updated_at = NOW() WHERE id = $2`,
      [`Diagnostic API error: ${err.message}`, bugId]
    );
  }
}

// ── PROTECTED: POST /api/debug-agent/dispatch — chief only ──────────────────
// Triggers the self-heal GitHub Actions workflow via repository_dispatch.

protectedRouter.post('/dispatch', chiefOnly, async (req, res) => {
  const { bug_id } = req.body;
  if (!bug_id) return res.status(400).json({ error: 'bug_id required' });

  const enabled = process.env.SELF_HEAL_ENABLED === 'true';
  if (!enabled) return res.status(403).json({ error: 'Self-heal is not enabled on this instance' });

  try {
    // Get the diagnosed report
    const result = await pool.query('SELECT * FROM bug_reports WHERE id = $1', [bug_id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Bug report not found' });
    const report = result.rows[0];

    // Privacy: a non-vendor chief may only act on their OWN department's reports.
    // 404 (not 403) so another department's report ids aren't enumerable.
    if (!(await isVendorAdmin(req))) {
      const owner = await pool.query(
        'SELECT 1 FROM of_user_departments WHERE user_id = $1 AND department_id = $2 LIMIT 1',
        [report.user_id, req.user?.department_id]);
      if (!owner.rows.length) {
        return res.status(404).json({ error: 'Bug report not found' });
      }
    }

    if (report.status !== 'diagnosed') {
      return res.status(400).json({ error: `Report status is "${report.status}", must be "diagnosed"` });
    }
    // Build the callback URL
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT || 3005}`;
    const callbackUrl = `${baseUrl}/api/debug-agent/callback`;

    // Trigger GitHub Actions via repository_dispatch
    const ghRepo = process.env.GITHUB_REPO || 'Open-Scaffold-Labs/OpenFirehouse';
    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

    const ghResponse = await fetch(`https://api.github.com/repos/${ghRepo}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ghToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'self-heal-bug',
        client_payload: {
          bug_id: report.id,
          description: report.description,
          diagnosis: report.diagnosis,
          callback_url: callbackUrl,
        },
      }),
    });
    if (!ghResponse.ok) {
      const errText = await ghResponse.text();
      console.error('[debug-agent] GitHub dispatch failed:', errText);
      return res.status(502).json({ error: 'GitHub dispatch failed' });
    }

    // Mark as queued
    await pool.query(
      `UPDATE bug_reports SET self_heal_status = 'queued', updated_at = NOW() WHERE id = $1`,
      [bug_id]
    );

    await logActivity(req.user.id, req.user.department_id, 'self_heal_dispatched',
      `Self-heal dispatched for bug #${bug_id}`);

    res.json({ ok: true, message: 'Self-heal workflow dispatched' });
  } catch (err) {
    console.error('[debug-agent] dispatch error:', err.message);
    res.status(500).json({ error: 'Dispatch failed' });
  }
});

// ── PROTECTED: GET /api/debug-agent/reports — chief only ────────────────────

protectedRouter.get('/reports', chiefOnly, async (req, res) => {
  try {
    const vendor = await isVendorAdmin(req);
    const cols = `id, created_at, description, page_route, status, diagnosis,
                  self_heal_status, self_heal_pr_url, self_heal_pr_number, updated_at`;
    let result;
    if (vendor) {
      // Vendor/platform admin: every department's reports, for support triage.
      result = await pool.query(
        `SELECT ${cols} FROM bug_reports ORDER BY created_at DESC LIMIT 50`);
    } else {
      // Regular chief: ONLY their own department's reports (privacy isolation).
      // A bug_report's department is resolved through of_user_departments — the
      // canonical user->department mapping (bug_reports has no dept column).
      const dept = req.user?.department_id;
      if (!dept) return res.status(403).json({ error: 'No department', code: 'NO_DEPT' });
      result = await pool.query(
        `SELECT DISTINCT ${cols.replace(/(\w+)/g, 'br.$1')} FROM bug_reports br
           JOIN of_user_departments oud ON oud.user_id = br.user_id
          WHERE oud.department_id = $1 ORDER BY br.created_at DESC LIMIT 50`, [dept]);
    }
    res.json({ data: result.rows, count: result.rows.length, scope: vendor ? 'all' : 'department' });
  } catch (err) {
    console.error('[debug-agent] list error:', err.message);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

module.exports = { publicRouter, protectedRouter };