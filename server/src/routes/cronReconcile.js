'use strict';
/**
 * routes/cronReconcile.js — daily safety net for the OpenFirehouse off-store
 * sales pipeline. ADR-0001 Step 8.
 *
 * Mounted at /api/cron/reconcile in index.js. Triggered by Vercel Cron at
 * 0 13:30 UTC daily (6:30 AM Pacific — staggered from FireHazmat's 6:00).
 *
 * For each Stripe mode:
 *   1. Emit heartbeat
 *   2. List paid invoices in the last 3 days, filtered to
 *      subscriptions whose metadata.product_family === 'openfirehouse'
 *   3. Diff against public.licenses by stripe_invoice_id
 *   4. For each gap, call /api/admin/sign-license + send email
 */
const express = require('express');
const router  = express.Router();
const { stripeFor, supabase, priceToPlanMap } = require('../lib/licensing');
const { checkCronAuth } = require('../utils/cronAuth');
const { summarizeReconcile } = require('../utils/reconcileSummary');
// X-PHASE cron liveness (0128): every cron records its invocation through ONE wrapper,
// so a cron cannot be added without a ledger row. cronRunCoverage.test.js enumerates these
// files from source and asserts it. An auth REFUSAL is deliberately not a run — see
// utils/cronRun.js; a public path must not let an anonymous caller append to a permanent log.
const { withCronRun } = require('../utils/cronRun');

async function callSignLicense(payload, baseUrl) {
  const r = await fetch(`${baseUrl}/api/admin/sign-license`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, issuer: 'stripe', password: process.env.ADMIN_PASSWORD_STRIPE }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

async function sendBackIssuedEmail({ to, dept_name, jwt, tier, license_id, invoiceId }) {
  if (!process.env.RESEND_API_KEY) return { skipped: true };
  const retrievalUrl = `https://openfirehouse.openscaffoldlabs.com/license/${invoiceId}`;
  const html = `
    <h2>Welcome to OpenFirehouse — ${escapeHtml(dept_name)}</h2>
    <p>Your <strong>${tier.replace('_', ' ')}</strong> license is active. (Issued via daily reconciliation — your original receipt may have been delayed.)</p>
    <p>Paste this activation token into <em>Settings → Activate License</em> in OpenFirehouse:</p>
    <pre style="background:#0F172A;color:#E5E7EB;padding:14px;border-radius:8px;font-size:11px;word-break:break-all">${escapeHtml(jwt)}</pre>
    <p>Retrieval URL: <a href="${retrievalUrl}">${retrievalUrl}</a></p>
    <p>Questions: <a href="mailto:support@openscaffoldlabs.com">support@openscaffoldlabs.com</a></p>
    <hr><p style="color:#6b7280;font-size:12px">Open Scaffold Labs, LLC — OpenFirehouse license ${escapeHtml(license_id)}</p>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'OpenFirehouse <licenses@openscaffoldlabs.com>',
      to, reply_to: 'support@openscaffoldlabs.com',
      subject: `Your OpenFirehouse license is active — ${dept_name}`,
      html,
    }),
  });
  return { ok: r.ok };
}

async function reconcileMode(mode, planMap, baseUrl) {
  const sk = stripeFor(mode === 'live');
  if (!sk) return { mode, error: 'no_stripe_secret', checked: 0, gaps: 0, back_issued: 0, errors: 0 };
  const since = Math.floor(Date.now() / 1000) - 3 * 86400;
  const sb = supabase();
  const summary = { mode, checked: 0, of_relevant: 0, already_in_ledger: 0, gaps: 0, back_issued: 0, errors: 0 };

  let starting_after;
  for (let page = 0; page < 5; page++) {
    const list = await sk.invoices.list({ status: 'paid', created: { gte: since }, limit: 100, starting_after });
    summary.checked += list.data.length;

    for (const inv of list.data) {
      if (!inv.subscription) continue;
      let sub;
      try { sub = await sk.subscriptions.retrieve(inv.subscription); }
      catch (e) { summary.errors++; continue; }
      if (sub.metadata?.product_family !== 'openfirehouse') continue; // not ours
      summary.of_relevant++;

      const { data: existing } = await sb
        .from('licenses').select('license_id').eq('stripe_invoice_id', inv.id).maybeSingle();
      if (existing) { summary.already_in_ledger++; continue; }

      summary.gaps++;
      try {
        const priceId = inv.lines?.data?.[0]?.price?.id;
        const plan = planMap[priceId];
        if (!plan) {
          console.log(JSON.stringify({ kind: 'of_reconciler_unknown_price', invoice: inv.id, price_id: priceId, mode }));
          summary.errors++; continue;
        }
        const customer = await sk.customers.retrieve(inv.customer);
        const dept_name  = sub.metadata?.dept_name || customer.metadata?.dept_name || customer.name || 'Unknown Department';
        const dept_email = sub.metadata?.dept_email || customer.email;
        if (!dept_email) { summary.errors++; continue; }

        const year = new Date(inv.created * 1000).getUTCFullYear();
        const license_id = `OF-DEPT-${year}-${inv.id.replace(/^in_/, '').toUpperCase()}`;
        const sign = await callSignLicense({
          dept_name, dept_email, license_id,
          term_days: 365, tier: plan.tier,
          stripe_invoice_id: inv.id,
          stripe_subscription_id: inv.subscription,
          stripe_customer_id: inv.customer,
          member_count:      sub.metadata?.member_count ? Number(sub.metadata.member_count) : null,
          station_count:     sub.metadata?.station_count ? Number(sub.metadata.station_count) : null,
          annual_budget_usd: sub.metadata?.annual_budget_usd ? Number(sub.metadata.annual_budget_usd) : null,
          livemode: mode === 'live',
        }, baseUrl);
        if (sign.status === 200) {
          await sendBackIssuedEmail({ to: dept_email, dept_name, jwt: sign.body.jwt, tier: plan.tier, license_id, invoiceId: inv.id });
          summary.back_issued++;
          console.log(JSON.stringify({ kind: 'of_reconciler_back_issued', invoice: inv.id, license_id, dept_email, mode }));
        } else if (sign.status === 409) {
          summary.already_in_ledger++;
        } else {
          summary.errors++;
          console.log(JSON.stringify({ kind: 'of_reconciler_sign_failed', invoice: inv.id, status: sign.status, mode }));
        }
      } catch (e) {
        console.log(JSON.stringify({ kind: 'of_reconciler_per_invoice_error', invoice: inv.id, error: e.message, mode }));
        summary.errors++;
      }
    }
    if (!list.has_more) break;
    starting_after = list.data[list.data.length - 1]?.id;
  }
  return summary;
}

router.get('/', withCronRun('reconcile', async (req, res) => {
  // Cron auth fails closed: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`
  // automatically. If the secret is unset in production this endpoint rejects (503)
  // rather than running the Stripe reconciliation open to anyone.
  const auth = checkCronAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  console.log(JSON.stringify({ kind: 'of_reconciler_heartbeat', at: new Date().toISOString() }));
  const baseUrl = `https://${req.headers.host || 'openfirehouse.openscaffoldlabs.com'}`;
  const planMap = priceToPlanMap();

  // 🔴 EACH MODE IS ISOLATED. Both still run — that is deliberate and is this file's own header
  // ("For each Stripe mode", ADR-0001 Step 8) — but they used to share ONE try block with test
  // second, so a revoked TEST key threw before the summary was built, DISCARDED live's
  // completed result, and reported the whole reconciler broken while naming only the test key.
  // Found live on 2026-08-06 by the cron ledger, on its first day.
  //
  // Losing a mode costs a delay, never a licence: each run re-lists the last three days of paid
  // invoices and diffs them against `licenses`, so the next successful run recovers anything a
  // failed one missed. Partial progress inside a failed mode is not reported (its counters die
  // with the throw) — deliberately not worked around, because the recovery above makes the
  // number cosmetic and threading a mutable accumulator through would be the bigger change.
  async function safeMode(mode) {
    try {
      return await reconcileMode(mode, planMap, baseUrl);
    } catch (err) {
      console.log(JSON.stringify({ kind: 'of_reconciler_mode_failed', mode, error: err.message }));
      return { mode, failed: true, error: err.message, checked: 0, gaps: 0, back_issued: 0, errors: 0 };
    }
  }

  const result = summarizeReconcile([await safeMode('live'), await safeMode('test')]);
  console.log(JSON.stringify({ kind: 'of_reconciler_summary', ...result.body }));
  return res.status(result.status).json(result.body);
}));

module.exports = router;
