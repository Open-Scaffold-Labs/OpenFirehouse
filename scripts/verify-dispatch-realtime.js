'use strict';
/**
 * verify-dispatch-realtime.js — does live push ACTUALLY reach clients?
 *
 * WHY THIS EXISTS, AND WHY IT WAS REBUILT (2026-08-04)
 * ---------------------------------------------------
 * Supabase Realtime was dead on production for 34 days (2026-06-27 → 07-31) and
 * nobody knew, because every live surface kept working off its 20s poll backstop.
 * This file is the tool that would have caught it on day one — and it could not,
 * because the open-core secret scrub (76c6d735) that CAUSED the outage also
 * replaced this script's URL with `YOUR_PROJECT_REF` and its key with `''`, in
 * the same commit. The detector and the defect shipped together.
 *
 * The old version then failed by printing "FAIL — no ping within 12s", which is
 * INDISTINGUISHABLE from the outage it exists to detect.
 *
 *   ► "CANNOT VERIFY" MUST NEVER BE REPORTABLE AS "VERIFIED" — OR AS "BROKEN".
 *
 * Three outcomes, three exit codes, never conflated:
 *   0  PASS          — the ping arrived. Live push works on the path exercised.
 *   1  FAIL          — correctly configured, real dispatch fired, no ping. A
 *                      genuine outage signal.
 *   2  CANNOT VERIFY — missing credentials, login failed, subscribe failed, no
 *                      safe unit to test. The harness could not run. Says
 *                      NOTHING about the system.
 *
 * ── THE CLEANUP CONTRACT ─────────────────────────────────────────────────────
 * This script writes to a REAL dispatch board. Telling a human "go clear it by
 * hand" is not a cleanup strategy, it is an apology. So cleanup is designed to be
 * structurally unskippable:
 *
 *   1. EVERY artifact is MARKED. Alerts carry `RT-VERIFY` in the description, so
 *      cleanup finds them by SWEEPING THE BOARD FOR THE MARKER — it never depends
 *      on having captured an id. The id-capture race (below) therefore cannot
 *      strand a call even if BOTH sources of the id fail.
 *   2. EVERY mutation registers its own UNDO before it is performed. If the
 *      process dies between registering and mutating, the undo is a no-op.
 *   3. Cleanup runs from ONE place — a finally block — plus SIGINT / SIGTERM /
 *      uncaughtException / unhandledRejection. There is no exit path that skips
 *      it. `fail()` throws; it does not call process.exit().
 *   4. Cleanup VERIFIES ITSELF by re-reading the board, and RETRIES. It does not
 *      trust a 200.
 *   5. A leftover from a previous interrupted run is swept at STARTUP, so the
 *      board self-heals even if a prior process was SIGKILLed (the one signal
 *      that cannot be trapped).
 *
 * ── THE ID-CAPTURE RACE (cost us a fake call on a prod board, 2026-08-01) ─────
 * The broadcast can arrive BEFORE the simulate POST resolves — CONFIRMED live on
 * 2026-08-04, it happened on the very first run of this rebuild. Reading the id
 * only from the POST response means an early ping leaves cleanup with no id. We
 * take the id from whichever source produces it first, AND the marker sweep makes
 * the id non-load-bearing anyway. Belt and braces, on purpose.
 *
 * ── SCOPE OF A GREEN RESULT ──────────────────────────────────────────────────
 * Live push has two halves:
 *   - the SERVER publishes with SUPABASE_URL / SUPABASE_ANON_KEY
 *   - the BROWSER subscribes with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 *     (inlined at BUILD time — an env edit alone does nothing without a redeploy)
 * A PASS proves the server publishes and a subscriber receives. It does NOT prove
 * the deployed browser bundle is configured. The success output says so.
 *
 * USAGE
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… node scripts/verify-dispatch-realtime.js
 *   (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY accepted as fallbacks.)
 *
 *   APP_URL=https://…    target deployment (default: the custom domain)
 *   OF_USER= / OF_PASS=  override the seeded dispatch credentials
 *   WAIT_MS=12000        how long to wait for a ping
 *   --floating           ALSO exercise the UN-AWAITED broadcast path
 *                        (PATCH /api/units/:id/status → units.js:166). Writes a
 *                        unit status; see the safety notes at runFloating().
 */

const path = require('path');
const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'));

const URL  = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const ANON = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const APP  = (process.env.APP_URL || 'https://app.openfirehouse.openscaffoldlabs.com').replace(/\/$/, '');
const USER = process.env.OF_USER || 'dispatch';
const PASS = process.env.OF_PASS || '1234';
const WAIT_MS = Number(process.env.WAIT_MS || 12000);
const TEST_FLOATING = process.argv.includes('--floating');

// The marker is the cleanup contract's anchor. Anything this script creates on a
// board carries it, so a sweep can always find our artifacts without an id.
const MARKER = 'RT-VERIFY';

const log = (...a) => console.log(...a);

// fail() THROWS — it must never process.exit(), or it would jump over the finally
// block that owns cleanup. Rule 3 of the cleanup contract.
class Abort extends Error {
  constructor(code, msg, hint) { super(msg); this.code = code; this.hint = hint; }
}
const fail = (code, msg, hint) => { throw new Abort(code, msg, hint); };

const supabase = createClient(URL || 'https://placeholder.supabase.co', ANON || 'placeholder', {
  auth: { persistSession: false, autoRefreshToken: false },
});

let token = null;
const undos = [];            // registered UNDO fns — see cleanup()
let cleanupDone = false;

async function api(method, p, body) {
  const res = await fetch(APP + p, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body is fine */ }
  return { status: res.status, data };
}

// ── Sweep: clear EVERY marked alert on the board, verify, retry ───────────────
// Finds artifacts by MARKER, never by a captured id, so it works even when the
// id-capture race loses both sources. Returns the number still present after
// the last verification pass — 0 means the board is provably clean.
async function sweepMarkedAlerts({ label, attempts = 3 }) {
  let remaining = -1;
  for (let i = 1; i <= attempts; i++) {
    const list = await api('GET', '/api/cad/alerts?limit=100');
    if (list.status !== 200) {
      if (i === attempts) return -1;                 // cannot see the board
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    const mine = (list.data?.data || []).filter((a) => String(a.description || '').includes(MARKER));
    if (!mine.length) { remaining = 0; break; }
    if (i === 1 && label) log(`  ${label}: ${mine.length} marked alert(s) to clear`);
    for (const a of mine) {
      const c = await api('POST', `/api/cad/alerts/${a.id}/clear`, {});
      log(`    cleared alert ${a.id} → HTTP ${c.status}`);
    }
    remaining = mine.length;                          // re-verified next iteration
    await new Promise((r) => setTimeout(r, 500));
  }
  return remaining;
}

// ── Cleanup: one owner, self-verifying, idempotent ───────────────────────────
async function cleanup(reason) {
  if (cleanupDone) return;
  cleanupDone = true;
  if (!token) return;                                  // nothing was ever created
  log('');
  log(`— cleanup (${reason}) —`);
  // Registered undos first (unit status restores): a stray alert is cosmetic, a
  // stray unit status is an operational lie about apparatus availability.
  for (const undo of undos.reverse()) {
    try { await undo(); } catch (e) { log('  undo threw:', e.message); }
  }
  const left = await sweepMarkedAlerts({ label: 'board sweep' });
  if (left === 0)      log('  ✓ board verified clean — 0 marked alerts remain');
  else if (left > 0)   log(`  ✗ ${left} marked alert(s) STILL on the board after ${3} attempts`);
  else                 log('  ✗ could not read the board to verify cleanup');
}

// Rule 3: no exit path skips cleanup. SIGKILL cannot be trapped — that case is
// covered by the STARTUP sweep instead.
let exiting = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (exiting) return; exiting = true;
    log(`\n(${sig} received — cleaning up before exit)`);
    await cleanup(sig);
    process.exit(2);
  });
}
process.on('uncaughtException', async (e) => {
  if (exiting) return; exiting = true;
  console.error('uncaught:', e);
  await cleanup('uncaughtException');
  process.exit(2);
});
process.on('unhandledRejection', async (e) => {
  if (exiting) return; exiting = true;
  console.error('unhandled rejection:', e);
  await cleanup('unhandledRejection');
  process.exit(2);
});

// ── Subscribe helper ─────────────────────────────────────────────────────────
function listen(topic, event) {
  let resolvePing;
  const received = new Promise((r) => { resolvePing = r; });
  const seen = [];
  const ch = supabase.channel(topic).on('broadcast', { event }, (msg) => {
    seen.push(msg.payload);
    log(`  ↳ RECV ${event} on ${topic} · ${JSON.stringify(msg.payload)}`);
    resolvePing(msg.payload);
  });
  const ready = new Promise((resolve) => {
    const t = setTimeout(() => resolve('SUBSCRIBE_TIMEOUT'), 15000);
    ch.subscribe((status) => {
      log(`  subscribe ${topic}:`, status);
      if (status === 'SUBSCRIBED') { clearTimeout(t); resolve('SUBSCRIBED'); }
      if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) { clearTimeout(t); resolve(status); }
    });
  });
  return { ch, ready, received, seen, wait: (ms) => Promise.race([received, new Promise((r) => setTimeout(() => r(null), ms))]) };
}

// ── The AWAITED path: POST /api/cad/simulate → pipeline.js:204 ───────────────
async function runAwaited(dept) {
  const topic = `dispatch-dept-${dept}`;
  const sub = listen(topic, 'dispatch');
  const ready = await sub.ready;
  if (ready !== 'SUBSCRIBED') {
    fail(2, `could not subscribe to ${topic} (${ready})`,
      'The subscriber never connected, so a missing ping proves nothing about the publish half.');
  }

  const stamp = Date.now();
  // units:'' is DELIBERATE. autoDispatchUnits returns at `if (!tokens.length)`
  // (pipeline.js:34) before any write, so NO unit status is touched. Naming units
  // would leave them 'dispatched' after the clear — clearing a call must not reset
  // statuses (radio doctrine) — i.e. the harness would manufacture exactly the
  // orphaned-unit state dispatch has to resolve over the radio.
  const sim = await api('POST', '/api/cad/simulate', {
    description: `${MARKER} ${stamp}`,
    address: '123 Verification Way',
    units: '',
    details: 'Automated realtime verification. Cleared automatically.',
  });
  log(`  simulate POST → HTTP ${sim.status}`);
  if (sim.status !== 200) {
    fail(2, `simulate did not succeed (HTTP ${sim.status})`,
      sim.status === 403 ? 'The user needs the dispatch role (requireDispatch).' : '');
  }

  const got = await sub.wait(WAIT_MS);
  supabase.removeChannel(sub.ch);
  return { ok: !!got, topic, payload: got };
}

// ── The FLOATING path: PATCH /api/units/:id/status → units.js:166 ────────────
// units.js:166 calls broadcastUnitStatusChanged WITHOUT awaiting it. That is a
// genuinely different risk from the awaited path: a serverless function can
// return before a floating promise flushes. Both paths failed independently on
// 2026-07-31, so proving one does not prove the other.
//
// SAFETY, because this writes to a live dispatch board:
//   - Only a unit currently `in_service` is eligible. A committed unit
//     (dispatched/enroute/on_scene) is working a call and is never touched.
//   - The flip is in_service → on_the_air. BOTH are dispatchable (migration
//     0022), so the apparatus is never made unavailable for even a moment. This
//     is the smallest real state change that still produces a broadcast.
//   - The restore is REGISTERED BEFORE the write, restores the EXACT original
//     value, and is verified by re-reading the board.
//   - No eligible unit ⇒ exit 2 (cannot verify). Never a fake pass.
async function runFloating(dept) {
  const topic = `unit-status-dept-${dept}`;
  const list = await api('GET', '/api/units/status');
  if (list.status !== 200) fail(2, `could not read unit statuses (HTTP ${list.status})`);

  const units = list.data?.data || [];
  const target = units.find((u) => u.status === 'in_service' && u.apparatus_id != null);
  if (!target) {
    fail(2, 'no unit is currently in_service, so there is no safe unit to flip',
      'Refusing to touch a committed unit. Re-run when a rig is in quarters.');
  }
  const original = target.status;
  log(`  floating target: ${target.designation} (apparatus ${target.apparatus_id}) · currently ${original}`);

  const sub = listen(topic, 'changed');
  const ready = await sub.ready;
  if (ready !== 'SUBSCRIBED') fail(2, `could not subscribe to ${topic} (${ready})`);

  // Register the undo BEFORE mutating (rule 2). If we die in between, this is a
  // no-op write of the value the row already holds.
  undos.push(async () => {
    const r = await api('PATCH', `/api/units/${target.apparatus_id}/status`, { status: original });
    log(`  restore ${target.designation} → ${original} · HTTP ${r.status}`);
    const check = await api('GET', '/api/units/status');
    const now = (check.data?.data || []).find((u) => u.apparatus_id === target.apparatus_id);
    log(now?.status === original
      ? `  ✓ ${target.designation} verified back at ${original}`
      : `  ✗ ${target.designation} is ${now?.status ?? 'unknown'}, expected ${original}`);
  });

  const set = await api('PATCH', `/api/units/${target.apparatus_id}/status`, { status: 'on_the_air' });
  log(`  status PATCH → HTTP ${set.status}`);
  if (set.status !== 200) fail(2, `could not set unit status (HTTP ${set.status})`);

  const got = await sub.wait(WAIT_MS);
  supabase.removeChannel(sub.ch);
  return { ok: !!got, topic, payload: got };
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  // Gate 1: credentials. Exit 2 — never 1.
  const missing = [];
  if (!URL)  missing.push('SUPABASE_URL (or VITE_SUPABASE_URL)');
  if (!ANON) missing.push('SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)');
  if (URL.includes('YOUR_PROJECT_REF')) missing.push('SUPABASE_URL is still the placeholder');
  if (missing.length) {
    fail(2, 'realtime credentials are not set: ' + missing.join('; '),
      'Set them in YOUR SHELL, never in this file — hardcoding is what got them scrubbed in 76c6d735.');
  }

  log('target        :', APP);
  log('realtime host :', URL);
  log('wait          :', WAIT_MS + 'ms');
  log('floating test :', TEST_FLOATING ? 'ON (flips one in_service unit to on_the_air, then restores)' : 'off');
  log('');

  // Gate 2: authenticate.
  const login = await api('POST', '/api/auth/login', { username: USER, password: PASS });
  if (login.status !== 200 || !login.data?.token) {
    fail(2, `login failed (HTTP ${login.status}) for user "${USER}"`,
      'Seeded demo credentials are dispatch/1234; override with OF_USER / OF_PASS.');
  }
  token = login.data.token;
  const dept = login.data.user?.department_id;
  if (dept == null) {
    fail(2, 'the logged-in user has no department_id',
      'Topics are per-department (P6.2). Without one there is no topic, and we must NEVER default a tenant.');
  }
  log(`✓ authed as ${USER} · department ${dept} · role ${login.data.user?.role}`);

  // Startup sweep (rule 5): heal anything a SIGKILLed prior run left behind.
  const stale = await sweepMarkedAlerts({ label: 'startup sweep' });
  if (stale > 0) log(`  ⚠ ${stale} marked alert(s) from a previous run survived the startup sweep`);
  else if (stale === 0) log('  ✓ startup sweep: board carries no leftovers from a previous run');

  const results = [];
  results.push({ name: 'awaited (cad/simulate → pipeline.js)', ...(await runAwaited(dept)) });
  if (TEST_FLOATING) {
    results.push({ name: 'floating (units PATCH → units.js)', ...(await runFloating(dept)) });
  }

  await cleanup('normal completion');

  log('');
  for (const r of results) log(`${r.ok ? '✅' : '❌'} ${r.ok ? 'PASS' : 'FAIL'} — ${r.name} · ${r.topic}`);

  const bad = results.filter((r) => !r.ok);
  if (bad.length) {
    log('');
    log('   Credentials present, login OK, subscribe OK, the write returned 200.');
    log('   So the change WAS made and the server SHOULD have broadcast.');
    log('   Most likely: SUPABASE_URL / SUPABASE_ANON_KEY are missing or wrong ON THE');
    log('   DEPLOYMENT — config/supabaseRealtime.js logs "PUBLISH HALF DISABLED" at boot,');
    log('   and a rejected broadcast logs "broadcast REJECTED". Check the deploy logs.');
    log('');
    log(`❌ FAIL — ${bad.length} path(s) produced no ping within ${WAIT_MS}ms.`);
    log('   This IS an outage signal: correctly configured, real change made, no ping.');
    process.exit(1);
  }

  log('');
  log('   SCOPE OF THIS RESULT — read it before quoting it:');
  log('   ✓ the server PUBLISHES (SUPABASE_URL / SUPABASE_ANON_KEY good on that deployment)');
  log('   ✓ a subscriber on these topics RECEIVES');
  log('   ✗ NOT proven: the deployed BROWSER bundle is configured. Separate build-time');
  log('     vars (VITE_SUPABASE_*). Verify from the served bundle:');
  log(`       curl -s ${APP}/ | grep -oE '/assets/index-[^"]+\\.js'`);
  log('     then confirm it contains createClient + the project ref, and does NOT');
  log('     contain "Realtime disabled".');
  if (!TEST_FLOATING) {
    log('   ✗ NOT proven: the UN-AWAITED broadcast path (units.js:166). Shares');
    log('     _broadcast(), so the CONFIG is proven — but not that a floating promise');
    log('     flushes before the function returns. Both paths failed independently on');
    log('     2026-07-31. Re-run with --floating to cover it.');
  }
  process.exit(0);
})().catch(async (e) => {
  const code = e instanceof Abort ? e.code : 2;
  await cleanup(e instanceof Abort ? 'abort' : 'unexpected error');
  log('');
  if (e instanceof Abort) {
    log(code === 2 ? '⛔ CANNOT VERIFY — ' + e.message : '❌ FAIL — ' + e.message);
    if (e.hint) log('   ' + e.hint);
  } else {
    console.error('unexpected error:', e);
  }
  log('');
  log(code === 2
    ? '   This says NOTHING about whether live push works. The harness could not run.'
    : '   This IS an outage signal.');
  process.exit(code);
});
