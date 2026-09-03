/**
 * askInvoke.js — thin client for the department fire-verb HTTP surface.
 *
 * Ask Open Firehouse talks to the same routes the department agent process
 * uses: POST /api/agent/invoke with the signed-in user's session token
 * (api.js attaches the JWT). This is not a second login and not a parallel
 * database.
 *
 * Duty/Board only calls read verbs. Gated writes stay on the approval
 * queue; Accept is a different officer on the Dashboard.
 */

import { api } from './api';

export {
  DUTY_BOARD_READ_VERBS,
  GATED_WRITE_VERBS,
  invokeData,
  invokeRows,
} from './askVerbs';

/**
 * Run one fire verb as the signed-in user.
 * @param {string} verb
 * @param {object} [args]
 * @returns {Promise<{queued?: boolean, approval?: object, result?: object, droppedKeys?: string[]}>}
 */
export function invokeAgent(verb, args = {}) {
  return api.post('/api/agent/invoke', { verb, args });
}

/** Pending items the current officer may review (403 if not officer+). */
export async function listPendingApprovals() {
  const r = await api.get('/api/agent/approvals?status=pending');
  return Array.isArray(r?.data) ? r.data : [];
}

export function acceptApproval(id, note) {
  return api.post(`/api/agent/approvals/${id}/accept`, note ? { note } : {});
}

export function rejectApproval(id, note) {
  return api.post(`/api/agent/approvals/${id}/reject`, note ? { note } : {});
}

/** Latest weekday morning brief for this department (same session JWT). */
export function fetchMorningBrief() {
  return api.get('/api/agent/routines/morning-brief');
}

/** Run the morning brief now as the signed-in badge — demo / preview path. */
export function runMorningBriefNow() {
  return api.post('/api/agent/routines/morning-brief/run', {});
}
