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

const URL = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT_REF.supabase.co';
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
  || '';

export const supabase = createClient(URL, ANON, {
  realtime: { params: { eventsPerSecond: 10 } },
  auth: { persistSession: false, autoRefreshToken: false },
});

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
