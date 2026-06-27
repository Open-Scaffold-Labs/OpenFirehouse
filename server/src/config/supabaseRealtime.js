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

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  || '';

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
async function _broadcast(topic, event, payload = {}) {
  if (topic == null) return;
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ messages: [{ topic, event, payload }] }),
    });
  } catch (e) {
    console.error('supabase realtime broadcast failed (non-fatal):', e.message);
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
  unitLocationsTopic, broadcastUnitLocationsUpdate,
  recallTopic, broadcastRecallPing,
};
