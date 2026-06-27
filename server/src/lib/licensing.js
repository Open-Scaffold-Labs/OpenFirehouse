'use strict';
/**
 * lib/licensing.js — shared helpers for the OpenFirehouse licensing flow.
 * ADR-0001 (licensing-and-commercial-tier).
 */
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const FREE_THRESHOLDS = { members: 30, stations: 2, budget_usd: 750_000 };
const TIER1_MAX       = { members: 80,  stations: 4, budget_usd: 3_000_000 };
const TIER2_MAX       = { members: 200, stations: 9, budget_usd: 10_000_000 };

// Per-tier included storage (GB) + overage. ADVISORY only (OF never hard-blocks):
// overage is billed $0.05/GB/mo with an 80% warning. Metro = 1 TB.
const STORAGE_QUOTA_GB = { independent: 5, career_small: 50, career_mid: 200, metro: 1024 };
const STORAGE_OVERAGE_USD_PER_GB = 0.05;
const STORAGE_WARN_FRACTION = 0.80;

function classifyTier({ members, stations, budget_usd }) {
  const m = Number(members) || 0;
  const s = Number(stations) || 0;
  const b = Number(budget_usd) || 0;
  if (m <= FREE_THRESHOLDS.members && s <= FREE_THRESHOLDS.stations && b <= FREE_THRESHOLDS.budget_usd) {
    return 'independent';
  }
  const exceedsTier1 = m > TIER1_MAX.members || s > TIER1_MAX.stations || b > TIER1_MAX.budget_usd;
  if (!exceedsTier1) return 'career_small';
  const exceedsTier2 = m > TIER2_MAX.members || s > TIER2_MAX.stations || b > TIER2_MAX.budget_usd;
  if (!exceedsTier2) return 'career_mid';
  return 'metro';
}

function priceIdFor(tier, mode) {
  if (tier === 'independent') return null;
  const suffix = mode === 'test' ? '_TEST' : '';
  const map = {
    career_small: `OPENFIREHOUSE_CAREER_SMALL_PRICE${suffix}`,
    career_mid:   `OPENFIREHOUSE_CAREER_MID_PRICE${suffix}`,
    metro:        `OPENFIREHOUSE_METRO_PRICE${suffix}`,
  };
  const envName = map[tier];
  const value = process.env[envName];
  if (!value) throw new Error(`Missing env var ${envName} (tier=${tier} mode=${mode})`);
  return value;
}

function stripeFor(livemode) {
  const envName = livemode ? 'STRIPE_SECRET_KEY' : 'STRIPE_SECRET_KEY_TEST';
  const key = process.env[envName];
  if (!key) throw new Error(`Missing env var ${envName}`);
  return new Stripe(key, { apiVersion: '2024-12-18.acacia' });
}

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

function priceToPlanMap() {
  const m = {};
  const add = (env, plan) => { if (process.env[env]) m[process.env[env]] = plan; };
  add('OPENFIREHOUSE_CAREER_SMALL_PRICE',      { tier: 'career_small' });
  add('OPENFIREHOUSE_CAREER_MID_PRICE',        { tier: 'career_mid'   });
  add('OPENFIREHOUSE_METRO_PRICE',             { tier: 'metro'        });
  add('OPENFIREHOUSE_CAREER_SMALL_PRICE_TEST', { tier: 'career_small' });
  add('OPENFIREHOUSE_CAREER_MID_PRICE_TEST',   { tier: 'career_mid'   });
  add('OPENFIREHOUSE_METRO_PRICE_TEST',        { tier: 'metro'        });
  return m;
}

module.exports = {
  classifyTier, priceIdFor, stripeFor, supabase, priceToPlanMap,
  FREE_THRESHOLDS, TIER1_MAX, TIER2_MAX,
  STORAGE_QUOTA_GB, STORAGE_OVERAGE_USD_PER_GB, STORAGE_WARN_FRACTION,
};
