'use strict';
// One-off live verification: subscribe to the per-station dispatch topic, fire a
// real dispatch at the live generic webhook, confirm the Supabase Realtime ping
// arrives (the cross-serverless-instance path SSE could not do). Exit 0 = PASS.
const { createClient } = require(require('path').join(__dirname, '../node_modules/@supabase/supabase-js'));

const URL = 'https://YOUR_PROJECT_REF.supabase.co';
const ANON = '';
const APP = process.env.APP_URL || 'https://open-firehouse.vercel.app';
// Per-DEPARTMENT topic (P6.2). Override for a different dept: DEPT_ID=NN.
const DEPT_ID = process.env.DEPT_ID || '1';
// Prod webhook is fail-closed — provide the secret in YOUR shell, never in code:
//   CAD_WEBHOOK_SECRET=… node scripts/verify-dispatch-realtime.js
const SECRET = process.env.CAD_WEBHOOK_SECRET || '';

const supabase = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
let got = null;

const ch = supabase
  .channel(`dispatch-dept-${DEPT_ID}`)
  .on('broadcast', { event: 'dispatch' }, (msg) => {
    got = msg.payload;
    console.log('RECV ping payload:', JSON.stringify(msg.payload));
  })
  .subscribe(async (status) => {
    console.log('subscribe status:', status);
    if (status === 'SUBSCRIBED') {
      const stamp = Date.now();
      const body = {
        description: 'RT-VERIFY ' + stamp,
        address: '123 Verification Way',
        units: 'E2',
        incident_number: 'RTV-' + stamp,
      };
      const r = await fetch(`${APP}/api/cad/incoming`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(SECRET ? { 'X-CAD-Webhook-Secret': SECRET } : {}),
        },
        body: JSON.stringify(body),
      });
      console.log('dispatch POST status:', r.status, '(expect 200/201)');
    }
  });

setTimeout(() => {
  console.log(got ? 'PASS — realtime dispatch ping received' : 'FAIL — no ping within 12s');
  process.exit(got ? 0 : 1);
}, 12000);
