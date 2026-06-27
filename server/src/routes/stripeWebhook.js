'use strict';
/**
 * routes/stripeWebhook.js — handles Stripe events for the OpenFirehouse
 * commercial licensing pipeline. ADR-0001 Step 7.
 *
 * Mounted at /api/stripe-webhook in index.js. IMPORTANT: the global
 * express.json() must be skipped for this path so the raw body survives
 * for signature verification. index.js mounts express.raw() for this
 * route specifically BEFORE app.use(express.json()).
 *
 * Filters on metadata.product_family === 'openfirehouse' so that
 * FireHazmat events (sharing the same Stripe account) are ignored.
 *
 * Events handled (same set as FireHazmat ADR-0007):
 *   invoice.paid                    → call sign-license, send email
 *   charge.refunded                 → revoke at period end
 *   charge.dispute.closed (lost)    → revoke at period end
 *   charge.dispute.created          → alert only
 *   customer.subscription.updated   → if status=unpaid revoke at period end
 *   customer.subscription.deleted   → log
 *   invoice.payment_failed          → log
 *   checkout.session.completed      → log
 */
const express = require('express');
const router  = express.Router();
const { stripeFor, supabase, priceToPlanMap } = require('../lib/licensing');

function constructEvent(rawBody, sig) {
  const liveSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const testSecret = process.env.STRIPE_WEBHOOK_SECRET_TEST;
  const errs = [];
  if (liveSecret && process.env.STRIPE_SECRET_KEY) {
    try { return stripeFor(true).webhooks.constructEvent(rawBody, sig, liveSecret); }
    catch (e) { errs.push(`live: ${e.message}`); }
  }
  if (testSecret && process.env.STRIPE_SECRET_KEY_TEST) {
    try { return stripeFor(false).webhooks.constructEvent(rawBody, sig, testSecret); }
    catch (e) { errs.push(`test: ${e.message}`); }
  }
  throw new Error(`signature verification failed (${errs.join('; ')})`);
}

async function callSignLicense(payload, baseUrl) {
  const r = await fetch(`${baseUrl}/api/admin/sign-license`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, issuer: 'stripe', password: process.env.ADMIN_PASSWORD_STRIPE }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function sendLicenseEmail({ to, dept_name, jwt, tier, license_id, invoiceId }) {
  if (!process.env.RESEND_API_KEY) return { skipped: true };
  const retrievalUrl = `https://openfirehouse.openscaffoldlabs.com/license/${invoiceId}`;
  const html = `
    <h2>Welcome to OpenFirehouse — ${escapeHtml(dept_name)}</h2>
    <p>Your <strong>${tier.replace('_', ' ')}</strong> license is active. Paste the activation token below into <em>Settings → Activate License</em>:</p>
    <pre style="background:#0F172A;color:#E5E7EB;padding:14px;border-radius:8px;font-size:11px;word-break:break-all">${escapeHtml(jwt)}</pre>
    <p>You can also retrieve this token any time at <a href="${retrievalUrl}">${retrievalUrl}</a>.</p>
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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

async function revokeAtPeriodEnd(subId, reason, livemode) {
  if (!subId) return;
  const sb = supabase();
  const sub = await stripeFor(livemode).subscriptions.retrieve(subId);
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
  const newStatus = reason === 'refunded' ? 'refunded' : 'revoked';
  const { error } = await sb
    .from('licenses')
    .update({ status: newStatus, revoked_at: periodEnd, revoked_reason: reason })
    .eq('stripe_subscription_id', subId);
  console.log(JSON.stringify({ kind: 'of_license_revoked', reason, subscription: subId, period_end: periodEnd, err: error?.message }));
}

router.post('/', async (req, res) => {
  let event;
  try {
    const sig = req.headers['stripe-signature'];
    if (!sig) throw new Error('missing stripe-signature header');
    event = constructEvent(req.body, sig);
  } catch (err) {
    console.log(JSON.stringify({ kind: 'of_webhook_bad_signature', error: err.message }));
    return res.status(400).json({ ok: false, error: err.message });
  }

  // Filter on product_family — both FireHazmat + OpenFirehouse subscriptions
  // come through the same Stripe account; this endpoint only handles OF.
  const obj = event.data.object;
  const subMeta = obj?.subscription_details?.metadata
    || obj?.metadata
    || {};
  let productFamily = subMeta.product_family;

  // For invoice.* events we may need to retrieve the subscription to see metadata
  if (!productFamily && obj.subscription) {
    try {
      const sub = await stripeFor(!!event.livemode).subscriptions.retrieve(obj.subscription);
      productFamily = sub.metadata?.product_family;
    } catch { /* fall through */ }
  }

  if (productFamily && productFamily !== 'openfirehouse') {
    // Not ours — ignore politely
    return res.json({ received: true, skipped: 'not_openfirehouse' });
  }

  const livemode = !!event.livemode;
  const baseUrl = `https://${req.headers.host || 'openfirehouse.openscaffoldlabs.com'}`;

  try {
    switch (event.type) {
      case 'invoice.paid': {
        const invoice = obj;
        const priceId = invoice.lines?.data?.[0]?.price?.id;
        const plan = priceToPlanMap()[priceId];
        if (!plan) {
          console.log(JSON.stringify({ kind: 'of_webhook_unknown_price', invoice: invoice.id, price_id: priceId, livemode }));
          return res.status(500).json({ ok: false, error: 'unknown price' });
        }
        const sk = stripeFor(livemode);
        const customer = await sk.customers.retrieve(invoice.customer);
        const sub = invoice.subscription ? await sk.subscriptions.retrieve(invoice.subscription) : null;
        const dept_name  = sub?.metadata?.dept_name || customer.metadata?.dept_name || customer.name || 'Unknown Department';
        const dept_email = sub?.metadata?.dept_email || customer.email;
        if (!dept_email) return res.status(500).json({ ok: false, error: 'invoice has no customer email' });

        const year = new Date().getUTCFullYear();
        const license_id = `OF-DEPT-${year}-${invoice.id.replace(/^in_/, '').toUpperCase()}`;
        const signResp = await callSignLicense({
          dept_name, dept_email, license_id,
          term_days: 365,
          tier: plan.tier,
          stripe_invoice_id: invoice.id,
          stripe_subscription_id: invoice.subscription,
          stripe_customer_id: invoice.customer,
          member_count: sub?.metadata?.member_count ? Number(sub.metadata.member_count) : null,
          station_count: sub?.metadata?.station_count ? Number(sub.metadata.station_count) : null,
          annual_budget_usd: sub?.metadata?.annual_budget_usd ? Number(sub.metadata.annual_budget_usd) : null,
          livemode,
        }, baseUrl);

        if (signResp.status === 200) {
          await sendLicenseEmail({ to: dept_email, dept_name, jwt: signResp.body.jwt, tier: plan.tier, license_id, invoiceId: invoice.id });
          console.log(JSON.stringify({ kind: 'of_invoice_paid_issued', invoice: invoice.id, license_id, dept_email, livemode }));
        } else if (signResp.status === 409 && signResp.body?.idempotent_skip) {
          console.log(JSON.stringify({ kind: 'of_invoice_paid_idempotent', invoice: invoice.id, license_id, livemode }));
        } else {
          console.log(JSON.stringify({ kind: 'of_invoice_paid_sign_failed', invoice: invoice.id, status: signResp.status, body: signResp.body }));
          return res.status(500).json({ ok: false, error: 'sign-license failed' });
        }
        break;
      }
      case 'charge.refunded': {
        const charge = obj;
        const sk = stripeFor(livemode);
        let subId = null;
        if (charge.invoice) {
          const inv = await sk.invoices.retrieve(charge.invoice);
          subId = inv.subscription;
        }
        await revokeAtPeriodEnd(subId, 'refunded', livemode);
        break;
      }
      case 'charge.dispute.closed': {
        if (obj.status === 'lost') {
          const sk = stripeFor(livemode);
          let subId = null;
          if (obj.charge) {
            const ch = await sk.charges.retrieve(obj.charge);
            if (ch.invoice) {
              const inv = await sk.invoices.retrieve(ch.invoice);
              subId = inv.subscription;
            }
          }
          await revokeAtPeriodEnd(subId, 'dispute_lost', livemode);
        }
        break;
      }
      case 'charge.dispute.created':
        console.log(JSON.stringify({ kind: 'of_dispute_opened', dispute: obj.id, amount: obj.amount, reason: obj.reason }));
        break;
      case 'customer.subscription.updated':
        if (obj.status === 'unpaid') await revokeAtPeriodEnd(obj.id, 'unpaid_after_dunning', livemode);
        break;
      case 'customer.subscription.deleted':
      case 'invoice.payment_failed':
      case 'checkout.session.completed':
        console.log(JSON.stringify({ kind: 'of_webhook_log_only', type: event.type, id: obj.id, livemode }));
        break;
      default:
        console.log(JSON.stringify({ kind: 'of_webhook_unhandled', type: event.type, livemode }));
    }
    res.json({ ok: true, received: event.type });
  } catch (err) {
    console.log(JSON.stringify({ kind: 'of_webhook_handler_error', type: event.type, error: err.message, livemode }));
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
