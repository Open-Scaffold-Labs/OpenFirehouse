/**
 * askVerbs.js — shared verb sets and invoke-result unwrapping.
 * Kept free of the fetch wrapper so Node tests can load Duty/Board
 * planning without Vite's import.meta.env.
 */

export const DUTY_BOARD_READ_VERBS = Object.freeze([
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

/** Unwrap `{ data }` from an existing route body sitting on invoke.result. */
export function invokeRows(out) {
  const body = out?.result;
  if (!body) return [];
  if (Array.isArray(body.data)) return body.data;
  if (body.data && typeof body.data === 'object') return [body.data];
  if (Array.isArray(body)) return body;
  return [];
}
