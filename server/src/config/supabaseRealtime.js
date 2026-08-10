'use strict';
/**
 * config/supabaseRealtime.js — server-side Supabase Realtime broadcast.
 *
 * The project already runs on Supabase, which has Realtime built in. SSE does
 * NOT work on Vercel serverless (each request is a separate instance, so an
 * in-memory client registry can't reach a held-open stream). Supabase Realtime
 * is the correct realtime channel.
 *
 * We use Broadcast (server -> clients pub/sub), NOT postgres_changes:
 *   - Broadcast exposes NO table data and needs no RLS loosening.
 *   - The message is just a "something changed" SIGNAL on a per-station topic;
 *     clients re-fetch the authz'd /api/units/status (the source of truth). A
 *     spoofed broadcast can at worst trigger a harmless refetch.
 *
 * The URL + anon key are PUBLIC by design (same posture as the publishable key
 * shipped to the browser). Env vars override for non-default deployments.
 */

// .trim() is deliberate: a trailing newline pasted into a hosting dashboard's env
// field is invisible in the UI and silently corrupts both the URL and the key.
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim() || 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();

// ── SAY SO AT BOOT, ONCE, IF THE PUBLISH HALF CANNOT WORK ────────────────────
// Without this, a deployment missing either value fires a doomed HTTPS request on
// every unit-status change forever and reports nothing. Live push has two halves —
// the server PUBLISHES (these vars) and the browser SUBSCRIBES (VITE_SUPABASE_*) —
// and configuring only one is a silent no-op. That is not hypothetical: it is what
// happened on production for 34 days from 2026-06-27.
let _warned = false;
function _configOk() {
  const problems = [];
  if (SUPABASE_URL.includes('YOUR_PROJECT_REF')) problems.push('SUPABASE_URL is not set (still the placeholder)');
  if (!SUPABASE_ANON_KEY) problems.push('SUPABASE_ANON_KEY is not set');
  if (!problems.length) return true;
  if (!_warned) {
    _warned = true;
    console.error(
      '[realtime] PUBLISH HALF DISABLED — ' + problems.join('; ') + '. ' +
      'Unit-status and dispatch changes will NOT push to clients; every live surface ' +
      'falls back to its poll interval. Set these on the deployment and redeploy. ' +
      'NOTE: these are the SERVER vars; the browser separately needs VITE_SUPABASE_URL ' +
      'and VITE_SUPABASE_ANON_KEY, which are inlined at BUILD time.'
    );
  }
  return false;
}

// Topics are keyed on DEPARTMENT (0020 / P6.2), not station — so a department
// with multiple houses gets one shared dispatch + unit-status channel. (Under the
// 1-dept=1-station data today, the keyed value is unchanged; only the channel name
// moves from `-station-` to `-dept-`.)
function unitStatusTopic(departmentId) {
  return `unit-status-dept-${departmentId}`;
}
function dispatchTopic(departmentId) {
  return `dispatch-dept-${departmentId}`;
}

// Fire-and-forget broadcast. Never throws — realtime is an enhancement; the DB
// write is authoritative. Keep payloads MINIMAL (ids/flags only): the channel is
// public, so call details/PII must never travel on it — clients refetch the
// authz'd API for the real data.
// ── A NON-2xx IS A FAILURE. CHECK IT. ────────────────────────────────────────
// This function used to await fetch() inside a try/catch and check NOTHING else.
// A thrown fetch (DNS failure, socket error) was caught and logged — but an HTTP
// ERROR RESPONSE resolves normally, so a 401 from an empty/wrong anon key or a 404
// from a bad URL logged ABSOLUTELY NOTHING and the publish half failed in total
// silence. That is exactly how live push was dead on production for 34 days
// (2026-06-27 → 07-31) while every screen kept working off its poll backstop:
// the client half was misconfigured AND this half could not report itself.
// Proven on prod 2026-07-31: both an awaited call path and a floating one produced
// no broadcast, with no error logged — because of this missing check.
//
// Still NEVER THROWS: realtime is an enhancement and the DB write is authoritative,
// so a broadcast failure must never fail the caller's request. It just has to be
// LOUD IN THE LOG instead of invisible.
async function _broadcast(topic, event, payload = {}) {
  if (topic == null) return;
  if (!_configOk()) return;                  // already warned at boot; don't spam per call
  try {
    const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ messages: [{ topic, event, payload }] }),
    });
    if (!res.ok) {
      // Log the topic and status, never the payload or the key. The channel is
      // public and payloads are ids/flags only, but there is no reason to echo them.
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch { /* body optional */ }
      console.error(
        `supabase realtime broadcast REJECTED (non-fatal): HTTP ${res.status} on topic "${topic}"` +
        (detail ? ` — ${detail}` : '') +
        ' | live push is NOT reaching clients; they are on poll backstops only.' +
        ' Check SUPABASE_URL and SUPABASE_ANON_KEY on this deployment.'
      );
    }
  } catch (e) {
    console.error(`supabase realtime broadcast failed (non-fatal): ${e.message} | topic "${topic}"`);
  }
}

/** Signal that a department's unit statuses changed (clients refetch /api/units/status). */
async function broadcastUnitStatusChanged(departmentId, payload = {}) {
  if (departmentId == null) return;
  await _broadcast(unitStatusTopic(departmentId), 'changed', payload);
}

/** Signal a new dispatch (clients refetch the authz'd /api/cad/alerts). Id only — no call details. */
async function broadcastDispatchPing(departmentId, alertId) {
  if (departmentId == null) return;
  await _broadcast(dispatchTopic(departmentId), 'dispatch', { id: alertId });
}

/**
 * 4C.4 — a CAD INTERFACE TROUBLE signal, on its OWN topic.
 *
 * 🔴 CORRECTED. The first version rode `dispatchTopic` as a distinct event, reasoning that the
 * client already listens there so no new subscription was needed. That was exactly backwards
 * and it shipped a CRITICAL bug: on the browser side `supabase.channel(topic)` returns the
 * EXISTING channel, so the two new components were handed the object App.jsx uses for live
 * dispatch push — and their React cleanup called `removeChannel` on it. Opening the CAD page
 * killed live dispatch app-wide for the session, silently, with every screen still "working"
 * off its 20s poll.
 *
 * The 4C.2 spec's "reuse the dispatch-alert channel already built" meant do not build a second
 * TRANSPORT. A second topic on the same Realtime client is the same transport; a shared topic
 * with three owners is not a channel, it is a race.
 *
 * ID ONLY ON THE WIRE, unchanged and still the point. This channel is public (the anon key
 * ships in the browser) and the thing that just failed to parse is a raw dispatch payload
 * carrying caller address and sometimes medical detail. The id tells a client to refetch the
 * authorized route; nothing about the message itself leaves the server here.
 *
 * NOT a substitute for the panel's own read. This is an accelerator: realtime was silently
 * dead on production for 34 days in 2026-06/07 and every screen kept working off its poll
 * backstop, which is exactly why nobody noticed. The panel polls; this makes it prompt.
 */
function cadFaultTopic(departmentId) {
  return `cad-fault-dept-${departmentId}`;
}
async function broadcastIngestFaultPing(departmentId, outcomeId) {
  if (departmentId == null) return;
  await _broadcast(cadFaultTopic(departmentId), 'cad_ingest_fault', { id: outcomeId ?? null });
}

/** Per-department topic carrying live apparatus GPS positions. */
function unitLocationsTopic(departmentId) {
  return `unit-locations-dept-${departmentId}`;
}
/** Broadcast one apparatus's new position to the department channel. */
async function broadcastUnitLocationsUpdate(departmentId, payload) {
  if (departmentId == null) return;
  await _broadcast(unitLocationsTopic(departmentId), 'update', payload);
}

/** Per-department recall/all-call topic. Clients refetch /api/recall/active. */
function recallTopic(departmentId) {
  return `recall-dept-${departmentId}`;
}
/** Signal a recall was issued or closed (clients refetch the authz'd /api/recall/active). Id only — no PII. */
async function broadcastRecallPing(departmentId, recallId) {
  if (departmentId == null) return;
  await _broadcast(recallTopic(departmentId), 'recall', { id: recallId ?? null });
}

module.exports = {
  SUPABASE_URL, SUPABASE_ANON_KEY,
  unitStatusTopic, broadcastUnitStatusChanged,
  dispatchTopic, broadcastDispatchPing,
  cadFaultTopic, broadcastIngestFaultPing,
  unitLocationsTopic, broadcastUnitLocationsUpdate,
  recallTopic, broadcastRecallPing,
};
