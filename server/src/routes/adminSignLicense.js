'use strict';
/**
 * routes/adminSignLicense.js — signs OpenFirehouse department licenses,
 * persists them in public.licenses. Express analog of FireHazmat's
 * api/admin/sign-license.js. ADR-0001 Step 4.
 *
 * Mounted at /api/admin/sign-license in index.js (NOT under requireAuth —
 * authentication is via per-issuer password instead, matching the FireHazmat
 * pattern).
 *
 * Issuers + required env vars:
 *   stripe → ADMIN_PASSWORD_STRIPE   (called by /api/stripe-webhook)
 *   dale   → ADMIN_PASSWORD_DALE     (manual issuance / overrides)
 *   comp   → ADMIN_PASSWORD_COMP     (NFR / sponsorship licenses)
 *   free   → ADMIN_PASSWORD_FREE     (called by /api/checkout for free tier)
 */
const express = require('express');
const router  = express.Router();
const crypto  = require('node:crypto');
const jwt     = require('jsonwebtoken');
const { supabase } = require('../lib/licensing');

const ISSUER   = 'openscaffoldlabs.com';
const SUBJECT  = 'openfirehouse-dept-license';
const AUDIENCE = 'com.openscaffoldlabs.openfirehouse';
const PLAN_TIER = 'department';

const ALLOWED_ISSUERS = ['stripe', 'dale', 'comp', 'free'];
const ALLOWED_TIERS   = ['independent', 'career_small', 'career_mid', 'metro'];

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  const ab = Buffer.alloc(len); const bb = Buffer.alloc(len);
  ab.write(a); bb.write(b);
  return crypto.timingSafeEqual(ab, bb) && a.length === b.length;
}

function loadPrivateKey() {
  const kid = process.env.OPENFIREHOUSE_LICENSE_ACTIVE_KID || 'of-k1';
  const envName = `OPENFIREHOUSE_LICENSE_PRIVATE_KEY_B64_${kid.replace(/^of-/, '').toUpperCase()}`;
  const b64 = process.env[envName];
  if (!b64) throw new Error(`${envName} not set (active kid=${kid})`);
  const pem = Buffer.from(b64, 'base64').toString('utf8');
  if (!pem.includes('PRIVATE KEY')) throw new Error(`${envName} does not decode to PEM`);
  return { pem, kid };
}

function expectedPasswordFor(issuer) {
  return {
    stripe: process.env.ADMIN_PASSWORD_STRIPE,
    dale:   process.env.ADMIN_PASSWORD_DALE,
    comp:   process.env.ADMIN_PASSWORD_COMP,
    free:   process.env.ADMIN_PASSWORD_FREE,
  }[issuer] || null;
}

function validateBody(b) {
  if (!b || typeof b !== 'object') throw new Error('JSON body required');
  for (const k of ['issuer', 'password', 'dept_name', 'dept_email', 'license_id']) {
    if (typeof b[k] !== 'string' || !b[k].trim()) throw new Error(`Missing/invalid: ${k}`);
  }
  if (!ALLOWED_ISSUERS.includes(b.issuer)) throw new Error(`issuer must be one of: ${ALLOWED_ISSUERS.join(', ')}`);
  if (b.tier != null && !ALLOWED_TIERS.includes(b.tier)) throw new Error(`tier must be one of: ${ALLOWED_TIERS.join(', ')}`);
  if (!/^[A-Z0-9\-_]+$/.test(b.license_id)) throw new Error('license_id: A-Z, 0-9, -, _ only');
  if (b.term_days != null) {
    const n = Number(b.term_days);
    if (!Number.isInteger(n) || n < 1 || n > 3650) throw new Error('term_days 1..3650');
  }
  if (b.member_count != null && (!Number.isInteger(Number(b.member_count)) || Number(b.member_count) < 0)) {
    throw new Error('member_count must be a non-negative integer');
  }
  if (b.station_count != null && (!Number.isInteger(Number(b.station_count)) || Number(b.station_count) < 0)) {
    throw new Error('station_count must be a non-negative integer');
  }
  if (b.annual_budget_usd != null && (!Number.isInteger(Number(b.annual_budget_usd)) || Number(b.annual_budget_usd) < 0)) {
    throw new Error('annual_budget_usd must be a non-negative integer');
  }
}

router.post('/', express.json({ limit: '20kb' }), async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = req.body;
    validateBody(body);

    const expected = expectedPasswordFor(body.issuer);
    if (!expected) {
      console.log(JSON.stringify({ kind: 'license_sign_denied', reason: 'missing_admin_password_env_var', issuer: body.issuer }));
      return res.status(500).json({ ok: false, error: 'Server missing admin password for this issuer' });
    }
    if (!timingSafeEqual(body.password, expected)) {
      console.log(JSON.stringify({ kind: 'license_sign_denied', reason: 'bad_password', issuer: body.issuer, ip: req.ip }));
      await new Promise(r => setTimeout(r, 750));
      return res.status(401).json({ ok: false, error: 'Bad password' });
    }

    const now      = Math.floor(Date.now() / 1000);
    const termDays = body.term_days || 365;
    const expSec   = now + termDays * 86400;
    const jti      = crypto.randomUUID();
    const dept_id  = body.dept_id || body.stripe_customer_id || body.license_id;

    const claims = {
      iss: ISSUER, sub: SUBJECT, aud: AUDIENCE,
      iat: now, exp: expSec, jti,
      license_id: body.license_id,
      dept_id,
      dept_name:  body.dept_name,
      dept_email: body.dept_email,
      plan_tier:  PLAN_TIER,
      tier:       body.tier || 'independent',
      product:    'openfirehouse',
      issued_by:  body.issuer,
    };

    const { pem, kid } = loadPrivateKey();
    const token = jwt.sign(claims, pem, { algorithm: 'RS256', header: { kid } });

    const stripeInvoiceId = body.stripe_invoice_id || `${body.issuer}-${body.license_id}`;
    const sb = supabase();
    const { error } = await sb.from('licenses').insert({
      license_id:             body.license_id,
      jti,
      jwt:                    token,
      product_family:         'openfirehouse',
      stripe_invoice_id:      stripeInvoiceId,
      stripe_subscription_id: body.stripe_subscription_id || null,
      stripe_customer_id:     body.stripe_customer_id || null,
      dept_name:              body.dept_name,
      dept_email:             body.dept_email,
      tier:                   body.tier || 'independent',
      member_count:           body.member_count != null ? Number(body.member_count) : null,
      station_count:          body.station_count != null ? Number(body.station_count) : null,
      annual_budget_usd:      body.annual_budget_usd != null ? Number(body.annual_budget_usd) : null,
      livemode:               body.livemode !== false,
      expires_at:             new Date(expSec * 1000).toISOString(),
      issuer:                 body.issuer,
      status:                 'active',
    });

    if (error) {
      if (error.code === '23505') {
        console.log(JSON.stringify({ kind: 'license_sign_idempotent_skip', issuer: body.issuer, license_id: body.license_id, stripe_invoice_id: stripeInvoiceId }));
        return res.status(409).json({ ok: false, error: 'License already issued', idempotent_skip: true, license_id: body.license_id });
      }
      console.log(JSON.stringify({ kind: 'license_sign_ledger_error', issuer: body.issuer, license_id: body.license_id, error: error.message, code: error.code }));
      return res.status(500).json({ ok: false, error: 'Ledger write failed; safe to retry' });
    }

    console.log(JSON.stringify({
      kind: 'license_signed',
      issued_by: body.issuer,
      license_id: body.license_id,
      jti,
      stripe_invoice_id: stripeInvoiceId,
      tier: body.tier || 'independent',
      dept_name: body.dept_name,
      dept_email: body.dept_email,
      expires_at: new Date(expSec * 1000).toISOString(),
      ip: req.ip,
    }));

    res.status(200).json({
      ok: true,
      license_id: body.license_id,
      jwt: token,
      jti,
      expires_at: new Date(expSec * 1000).toISOString(),
      issued_by: body.issuer,
      claims,
    });
  } catch (err) {
    console.log(JSON.stringify({ kind: 'license_sign_error', message: err.message }));
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
