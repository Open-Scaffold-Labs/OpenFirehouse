/**
 * supabase.js — browser Supabase client, used ONLY for Realtime.
 *
 * The project runs on Supabase; Realtime is the correct live channel (SSE does
 * not work on Vercel serverless). We subscribe to per-station Broadcast topics
 * and treat each message as a "refetch now" signal — the authz'd REST API
 * stays the source of truth, so the public anon key carries no data risk.
 *
 * URL + anon key are public by design (env vars override for other deploys).
 */

import { createClient } from '@supabase/supabase-js';
import {
  jitteredReconnectAfterMs, reportChannelStatus, reportMessageReceived, forgetChannel,
} from './realtimeHealth';
import { makeBroadcastSubscriber } from './broadcastSubscriber';

const URL = import.meta.env.VITE_SUPABASE_URL || '';
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// ── NEVER WHITE-SCREEN ON A MISSING KEY ──────────────────────────────────────
// createClient() THROWS ("supabaseKey is required") when the anon key is absent
// — and this module is imported at the top of App.jsx, so that throw crashes the
// ENTIRE app at boot (blank page, no login, no dispatch surface). The anon key is
// missing whenever a build runs without VITE_SUPABASE_* (E2E/CI, a misconfigured
// or key-rotated deploy). Realtime is NOT load-bearing: every live surface has a
// 20s visibility-aware poll backstop. So when the key is absent we degrade to
// "realtime off, polls carry it" instead of taking down the whole app. `supabase`
// is then null — every call site guards on it (see the topic-null guards, which
// now also check `supabase`).
//
// ⚠ THIS COMMENT USED TO END "PROD sets the key, so this branch never runs there."
// That was FALSE FOR 34 DAYS and the sentence is why nobody looked. On 2026-06-27
// the open-core secret scrub (76c6d735) replaced the hardcoded URL/key fallbacks
// with a placeholder + '', and the Vercel var meant to take over was created
// misspelled — `VITE_SUPABASE_URl`. So prod took this exact branch from 06-27
// until it was found on 07-31. Never write "prod sets X" as a fact in a comment:
// prod is not verifiable from source, and a conditional written as an absolute
// reads as verified truth to every later reader.
let _supabase = null;
if (URL && ANON) {
  _supabase = createClient(URL, ANON, {
    realtime: {
      params: { eventsPerSecond: 10 },
      // The library already heartbeats every 25s and reconnects on
      // [1000, 2000, 5000, 10000]. We keep the shape and only add JITTER: the
      // default is unjittered, so every device that drops on the same trigger
      // (a station uplink flapping takes the wall display, the rigs and the
      // phones at once) retries in lockstep and stays phase-locked through each
      // step. Randomization is the thing that breaks the lock — "always use
      // randomized exponential backoff" is the standing guidance.
      reconnectAfterMs: jitteredReconnectAfterMs,
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
} else if (typeof console !== 'undefined') {
  console.warn(
    '[supabase] VITE_SUPABASE_URL/ANON_KEY not set — Realtime disabled; ' +
    'the 20s poll backstops carry live updates. (App boots normally.)'
  );
}
export const supabase = _supabase;

// ── THE STATE MUST BE VISIBLE, NOT MERELY LOGGED ─────────────────────────────
// A console.warn is not a signal. Realtime was off in production for 34 days and
// nothing surfaced it, precisely BECAUSE the 20s poll backstops kept every screen
// working — the failure was survivable, and survivable-without-an-alarm is
// indistinguishable from healthy. So export the state and render it somewhere a
// human already looks (Layout, beside the build version).
//
// `enabled: false` is NOT an error. For a self-host that doesn't run Supabase
// Realtime it is the correct, expected state, and the polls genuinely carry the
// product. This is information, not an alarm — which is why it renders as a quiet
// label and never as a banner or a toast.
//
// `reason` names the FIELD and the CAUSE, not just "misconfigured": a diagnostic
// that doesn't say which var is missing sends the reader back to guessing, which
// is how a one-character typo survived five weeks.
export const realtimeStatus = {
  enabled: _supabase !== null,
  reason: _supabase !== null
    ? null
    : (!URL && !ANON) ? 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set'
    : !URL ? 'VITE_SUPABASE_URL is not set'
    : 'VITE_SUPABASE_ANON_KEY is not set',
};

// Topics are keyed on DEPARTMENT (P6.2) so a multi-house department shares one
// channel. Returns null when no department is known — callers must skip the
// subscription rather than fall back to a default tenant (the 20s poll backstops).
export function unitStatusTopic(departmentId) {
  return departmentId == null ? null : `unit-status-dept-${departmentId}`;
}

export function dispatchTopic(departmentId) {
  return departmentId == null ? null : `dispatch-dept-${departmentId}`;
}

export function unitLocationsTopic(departmentId) {
  return departmentId == null ? null : `unit-locations-dept-${departmentId}`;
}

/**
 * 4C.4 — CAD interface TROUBLE. Its OWN topic, and that is a correction, not a preference.
 *
 * The first version rode `dispatchTopic`, on the reasoning that the 4C.2 spec said to reuse
 * "the dispatch-alert channel already built". That shipped a CRITICAL bug: supabase-js returns
 * the EXISTING channel for a known topic, so the fault panel and the trouble banner were
 * handed the very object App.jsx uses for live dispatch push — and their cleanup called
 * `removeChannel` on it. Opening the CAD page, or merely toggling the panel's scope filter,
 * unsubscribed live dispatch app-wide for the rest of the session. Silently, with every screen
 * still "working" off its 20s poll — the exact failure class this product lost 34 days to.
 *
 * The spec's intent was "do not build a second transport", not "must be the same topic string".
 * A second topic on the same Realtime client is the same transport. Sharing a topic across
 * components that each think they own it is not.
 */
export function cadFaultTopic(departmentId) {
  return departmentId == null ? null : `cad-fault-dept-${departmentId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// subscribeBroadcast — ONE channel per topic, ref-counted, torn down by the LAST leaver.
//
// The logic lives in ./broadcastSubscriber.js, deliberately free of `import.meta.env` and of
// the supabase import, so the contract it enforces is testable in plain Node against a fake
// that reproduces supabase-js's lookup-or-create `channel()` semantics. A helper whose entire
// job is preventing a cross-component bug has to be provable, not merely careful. The full
// account of the bug it fixes is in that file's header.
//
// ⚠ NOT retrofitted onto the four existing callers (LiveDispatch, UnitStatusBoard, TVDisplay,
// ResponseMap) — a drive-by refactor of live dispatch surfaces is against the rules here and
// needs its own verification. Worth someone's attention though: LiveDispatch and ResponseMap
// BOTH subscribe to `unitLocationsTopic` and can be mounted simultaneously, so they carry the
// same latent shape. Flagged, not silently fixed.
// ─────────────────────────────────────────────────────────────────────────────
export const subscribeBroadcast = makeBroadcastSubscriber(_supabase, {
  onStatus: reportChannelStatus,
  onMessage: reportMessageReceived,
  onTopicGone: forgetChannel,
});
