/**
 * nerisExport.js — client-side NERIS helpers.
 *
 * 2026-07-16 (D4, docs/NERIS-BULLETPROOF-BUILD-2026-07-16.md): the client-side
 * NERIS transformer (toNerisIncident / validateNerisIncident /
 * exportNerisBundle) was REMOVED. The ONE canonical transformer lives
 * server-side in server/src/utils/nerisPayload.js and emits the live NERIS
 * API IncidentPayload shape; the client fetches
 * GET /api/nfirs-reports/:id/neris and /api/nfirs-reports/neris/export and
 * downloads the result. Do not rebuild a client-side transform — two
 * transformers is how the NJ-hardcode/fake-UTC drift happened.
 *
 * What remains here is UI-only plumbing.
 */

/**
 * Generate a NERIS-style internal ID in the format FDID:epoch_ms
 * (display/reference helper used by NFIRSForm — not a submission id).
 *
 * W4.1 (2026-06-10): an unparseable date used to land verbatim as "FDID:NaN";
 * now falls back to Date.now(), same as no date.
 */
export function generateNerisId(fdid, incidentDate) {
  let epoch = incidentDate ? new Date(incidentDate).getTime() : Date.now();
  if (!Number.isFinite(epoch)) epoch = Date.now();
  return `${fdid}:${epoch}`;
}

/**
 * Download a JSON payload as a file.
 */
export function downloadNerisJson(bundle, filename) {
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `neris_export_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
