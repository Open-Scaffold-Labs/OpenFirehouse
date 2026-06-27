'use strict';
/**
 * routes/checkout.js — OpenFirehouse signup flow. ADR-0001 Step 6.
 *
 * Mounted at /api/checkout. Two endpoints:
 *
 *   POST /api/checkout            — accept attestation; classify tier
 *                                    Free → email a confirmation link
 *                                    Paid → return a Stripe Checkout URL
 *   GET  /api/checkout/activate   — finalize a free-tier signup once the
 *                                    confirmation link is clicked. Calls
 *                                    sign-license, returns the JWT page.
 */
const express = require('express');
const router  = express.Router();
const crypto  = require('node:crypto');
const jwt     = require('jsonwebtoken');
const { classifyTier, priceIdFor, stripeFor } = require('../lib/licensing');

const SUCCESS_REDIRECT = 'https://openfirehouse.openscaffoldlabs.com/license-issued?session_id={CHECKOUT_SESSION_ID}';
const CANCEL_REDIRECT  = 'https://openfirehouse.openscaffoldlabs.com/buy';

function validateAttestation(b) {
  if (!b || typeof b !== 'object') throw new Error('JSON body required');
  if (typeof b.dept_name !== 'string' || !b.dept_name.trim()) throw new Error('dept_name required');
  if (typeof b.signatory_name !== 'string' || !b.signatory_name.trim()) throw new Error('signatory_name required');
  if (typeof b.dept_email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.dept_email)) throw new Error('valid dept_email required');
  if (b.dept_type && !['volunteer', 'combination', 'career'].includes(b.dept_type)) throw new Error('dept_type must be volunteer | combination | career');
  for (const k of ['member_count', 'station_count', 'annual_budget_usd']) {
    const n = Number(b[k]);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${k} must be a non-negative number`);
  }
  if (!b.attest_accurate) throw new Error('attest_accurate must be checked');
  if (b.mode && !['live', 'test'].includes(b.mode)) throw new Error('mode must be live | test');
}

async function callSignLicense(payload, baseUrl, issuer) {
  const password = issuer === 'free'
    ? process.env.ADMIN_PASSWORD_FREE
    : process.env.ADMIN_PASSWORD_STRIPE;
  const r = await fetch(`${baseUrl}/api/admin/sign-license`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, issuer, password }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function sendConfirmationEmail({ to, dept_name, link }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ kind: 'of_confirm_skipped_no_resend', to }));
    return { skipped: true };
  }
  const html = `
    <h2>Confirm your free OpenFirehouse license — ${escapeHtml(dept_name)}</h2>
    <p>You attested that <strong>${escapeHtml(dept_name)}</strong> qualifies for the OpenFirehouse <em>Independent</em> (free) tier under our Rule C size thresholds.</p>
    <p>Click below to activate your department's license. The link expires in 24 hours.</p>
    <p style="margin: 32px 0;"><a href="${link}" style="background:#EF4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Activate license</a></p>
    <p style="color:#6b7280;font-size:12px">If you did not request this, you can ignore this email — no account exists yet.</p>
    <hr><p style="color:#6b7280;font-size:12px">Open Scaffold Labs, LLC — OpenFirehouse Independent tier</p>
  `;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'OpenFirehouse <licenses@openscaffoldlabs.com>',
      to,
      reply_to: 'support@openscaffoldlabs.com',
      subject: `Activate your OpenFirehouse free license — ${dept_name}`,
      html,
    }),
  });
  return { ok: r.ok, status: r.status };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

router.post('/', express.json({ limit: '20kb' }), async (req, res) => {
  try {
    validateAttestation(req.body);
    const b = req.body;
    const tier = classifyTier({
      members: b.member_count,
      stations: b.station_count,
      budget_usd: b.annual_budget_usd,
    });
    const mode = b.mode || 'live';
    const baseUrl = `https://${req.headers.host || 'openfirehouse.openscaffoldlabs.com'}`;

    if (tier === 'independent') {
      // Free path — sign a short-lived confirmation token, email it
      const confSecret = process.env.OF_CONFIRMATION_SECRET;
      if (!confSecret) {
        console.log(JSON.stringify({ kind: 'of_checkout_missing_confirm_secret' }));
        return res.status(500).json({ ok: false, error: 'server misconfigured' });
      }
      const confirmationToken = jwt.sign({
        kind:               'of-free-confirmation',
        dept_name:          b.dept_name,
        dept_email:         b.dept_email,
        signatory_name:     b.signatory_name,
        dept_type:          b.dept_type || null,
        member_count:       Number(b.member_count),
        station_count:      Number(b.station_count),
        annual_budget_usd:  Number(b.annual_budget_usd),
        livemode:           mode === 'live',
        nonce:              crypto.randomUUID(),
      }, confSecret, { expiresIn: '24h' });

      const activateLink = `${baseUrl}/api/checkout/activate?token=${encodeURIComponent(confirmationToken)}`;
      await sendConfirmationEmail({ to: b.dept_email, dept_name: b.dept_name, link: activateLink });

      console.log(JSON.stringify({ kind: 'of_checkout_free_confirm_sent', dept_name: b.dept_name, dept_email: b.dept_email }));
      return res.json({
        ok: true,
        tier: 'independent',
        next: 'check_email',
        message: 'Confirmation email sent. Click the activate link to receive your free license.',
      });
    }

    // Paid path — Stripe Checkout
    const stripe = stripeFor(mode === 'live');
    const priceId = priceIdFor(tier, mode);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: b.dept_email,
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          product_family:    'openfirehouse',
          tier,
          dept_name:         b.dept_name,
          signatory_name:    b.signatory_name,
          dept_type:         b.dept_type || '',
          member_count:      String(b.member_count),
          station_count:     String(b.station_count),
          annual_budget_usd: String(b.annual_budget_usd),
        },
      },
      success_url: SUCCESS_REDIRECT,
      cancel_url:  CANCEL_REDIRECT,
    });

    console.log(JSON.stringify({
      kind: 'of_checkout_paid_session_created',
      session_id: session.id, tier, dept_name: b.dept_name, dept_email: b.dept_email, mode,
    }));
    res.json({ ok: true, tier, next: 'stripe_checkout', url: session.url, session_id: session.id });
  } catch (err) {
    console.log(JSON.stringify({ kind: 'of_checkout_error', message: err.message }));
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/activate', async (req, res) => {
  try {
    const token = req.query?.token;
    const confSecret = process.env.OF_CONFIRMATION_SECRET;
    if (!token || !confSecret) return res.status(400).type('text/html').send('<h1>Invalid or missing token.</h1>');
    let claims;
    try { claims = jwt.verify(token, confSecret); }
    catch (e) { return res.status(400).type('text/html').send(`<h1>Confirmation link expired or invalid</h1><p>${escapeHtml(e.message)}</p><p><a href="https://openfirehouse.openscaffoldlabs.com/signup">Start over</a></p>`); }
    if (claims.kind !== 'of-free-confirmation') return res.status(400).type('text/html').send('<h1>Wrong token kind.</h1>');

    const license_id = `OF-FREE-${new Date().getUTCFullYear()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const baseUrl = `https://${req.headers.host || 'openfirehouse.openscaffoldlabs.com'}`;
    const sign = await callSignLicense({
      dept_name:         claims.dept_name,
      dept_email:        claims.dept_email,
      license_id,
      term_days:         365,
      tier:              'independent',
      member_count:      claims.member_count,
      station_count:     claims.station_count,
      annual_budget_usd: claims.annual_budget_usd,
      stripe_invoice_id: `free-${license_id}`,
      livemode:          !!claims.livemode,
    }, baseUrl, 'free');

    if (sign.status === 200) {
      res.type('text/html').send(`
        <!DOCTYPE html><html><head><meta charset="utf-8"><title>License activated</title></head>
        <body style="font-family:-apple-system,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#0F172A">
          <h1>Your free OpenFirehouse license is active</h1>
          <p><strong>${escapeHtml(claims.dept_name)}</strong> — Independent tier · 365 days · license <code>${escapeHtml(license_id)}</code></p>
          <h3>Activation token</h3>
          <pre style="background:#0F172A;color:#E5E7EB;padding:14px;border-radius:8px;font-size:11px;word-break:break-all">${escapeHtml(sign.body.jwt)}</pre>
          <p>Paste this into <em>Settings → Activate License</em> in OpenFirehouse.</p>
          <p>You can also retrieve it any time at <a href="${baseUrl}/license/${encodeURIComponent('free-' + license_id)}">${baseUrl}/license/free-${license_id}</a>.</p>
          <hr><p style="color:#6b7280;font-size:12px">Open Scaffold Labs, LLC</p>
        </body></html>`);
      return;
    }
    if (sign.status === 409) {
      return res.type('text/html').send(`<h1>Already activated</h1><p>This department appears to already have a license. Please check your email or contact support.</p>`);
    }
    console.log(JSON.stringify({ kind: 'of_checkout_activate_sign_failed', status: sign.status, body: sign.body }));
    res.status(500).type('text/html').send('<h1>Activation failed</h1><p>Please email support@openscaffoldlabs.com.</p>');
  } catch (err) {
    console.log(JSON.stringify({ kind: 'of_checkout_activate_error', message: err.message }));
    res.status(500).type('text/html').send('<h1>Activation error</h1><pre>' + escapeHtml(err.message) + '</pre>');
  }
});

module.exports = router;
