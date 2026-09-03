/**
 * askVerbs.js — shared verb sets and invoke-result unwrapping.
 * Kept free of the fetch wrapper so Node tests can load Duty/Board
 * planning without Vite's import.meta.env.
 */

export const DUTY_BOARD_READ_VERBS = Object.freeze([
  'board_read',
  'duty_read',
  'incident_read',
  'roster_read',
  'training_hours_read',
  'apparatus_status_read',
]);

export const GATED_WRITE_VERBS = Object.freeze([
  'neris_submit',
  'notify_chief',
  'apparatus_status_update',
  'incident_update',
]);

/** Raw `result.data` from invoke (list, object, or null). */
export function invokeData(out) {
  const body = out?.result;
  if (!body) return null;
  return Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body;
}

/** Unwrap `{ data }` from an existing route body sitting on invoke.result. */
export function invokeRows(out) {
  const data = invokeData(out);
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') return [data];
  return [];
}
