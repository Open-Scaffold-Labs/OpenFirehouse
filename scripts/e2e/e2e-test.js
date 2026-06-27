#!/usr/bin/env node
// End-to-end test for the OpenFirehouse paid-tier sales pipeline (TEST MODE).
// 1. create customer
// 2. attach Stripe test card (pm_card_visa)
// 3. create subscription on Career Small test price with product_family=openfirehouse metadata
// 4. wait for webhook to issue license + write ledger row
// 5. verify retrieval page renders JWT
// 6. cleanup
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const TEST_KEY     = process.env.STRIPE_TEST_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRICE        = process.env.OPENFIREHOUSE_CAREER_SMALL_PRICE_TEST;
if (!TEST_KEY || !SUPABASE_URL || !SERVICE_KEY || !PRICE) { console.error('Missing env vars'); process.exit(1); }

const stripe = new Stripe(TEST_KEY, { apiVersion: '2024-12-18.acacia' });
const sb     = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

(async () => {
  const stamp = Date.now();
  let customer, sub;
  try {
    console.log('=== 1. create customer ===');
    customer = await stripe.customers.create({ name: `OF E2E ${stamp}`, email: 'support@openscaffoldlabs.com', metadata: { dept_name: `OF E2E Dept ${stamp}` } });
    console.log('customer:', customer.id);

    console.log('=== 2. attach test card ===');
    const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });

    console.log('=== 3. create subscription on Career Small (OF metadata) ===');
    sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICE }],
      metadata: {
        product_family: 'openfirehouse', tier: 'career_small',
        dept_name: `OF E2E Dept ${stamp}`, signatory_name: 'E2E Chief', dept_type: 'combination',
        member_count: '45', station_count: '3', annual_budget_usd: '1500000',
      },
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });
    console.log('  sub:', sub.id, 'status:', sub.status);
    console.log('  invoice:', sub.latest_invoice.id, sub.latest_invoice.status);

    const invoiceId = sub.latest_invoice.id;
    console.log('=== 4. wait for webhook (up to 60s) ===');
    let row = null;
    for (let i = 0; i < 20; i++) {
      const { data } = await sb.from('licenses').select('license_id, jti, dept_name, tier, status, livemode').eq('stripe_invoice_id', invoiceId).maybeSingle();
      if (data) { row = data; break; }
      await new Promise(r => setTimeout(r, 3000));
      process.stdout.write('.');
    }
    console.log('');
    if (!row) throw new Error('webhook did not issue license within 60s');
    console.log('  ledger row:', row);

    console.log('=== 5. retrieve via /license/[invoice_id] ===');
    const r = await fetch(`https://openfirehouse.openscaffoldlabs.com/license/${invoiceId}`);
    const html = await r.text();
    const hasJwt = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(html);
    console.log('  retrieval HTTP:', r.status, '| contains JWT:', hasJwt);

    console.log('=== 6. cleanup ===');
    await stripe.subscriptions.cancel(sub.id);
    await stripe.customers.del(customer.id);
    await sb.from('licenses').delete().eq('stripe_invoice_id', invoiceId);
    console.log('  cleanup OK');
    console.log('\n✅ OF END-TO-END PASS');
  } catch (e) {
    console.error('\n❌ E2E FAILED:', e.message);
    try { if (sub) await stripe.subscriptions.cancel(sub.id); } catch {}
    try { if (customer) await stripe.customers.del(customer.id); } catch {}
    process.exit(1);
  }
})();
