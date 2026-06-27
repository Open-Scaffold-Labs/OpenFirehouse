/**
 * nfirsFlatFile.js — NFIRS 5.0 flat-file (transaction) export
 * (W4.1, roadmap 2.5, 2026-06-10).
 *
 * For states still transitioning to NERIS: most state programs and the
 * legacy eNFIRS bulk-import path accept the NFIRS 5.0 "flat file" — a plain
 * text file, one caret(^)-delimited record per line, each record carrying its
 * module type in the first fields.
 *
 * This generates the Basic Module (1) records plus the file header/trailer,
 * which is the minimum a state import client needs to ingest incidents.
 * Field layout follows the NFIRS 5.0 Design Documentation Basic Module
 * transaction order (key fields; trailing optionals padded empty). Stations
 * should verify the first import with their state program — state clients
 * vary in how strictly they validate optional positions.
 *
 * Dates are MMDDYYYY and times HHMM per NFIRS 5.0 convention.
 */

function nfirsDate(iso) {
  // 'YYYY-MM-DD' → 'MMDDYYYY'
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}${m[3]}${m[1]}` : '';
}

function nfirsTime(hhmm) {
  const m = String(hhmm || '').match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}${m[2]}` : '';
}

function clean(v) {
  // Carets are the delimiter — they may never appear inside a field.
  return String(v ?? '').replace(/\^/g, ' ').trim();
}

/**
 * Build the Basic Module (record type 1) caret-delimited record for one
 * NFIRS report.
 * @param {Object} r — nfirs_reports row (camelCase fields as stored)
 * @param {Object} opts — { fdid, state }
 */
export function toBasicModuleRecord(r = {}, opts = {}) {
  const fdid = clean(opts.fdid || r.fdid || '');
  const state = clean(opts.state || r.state || '');
  const incDate = nfirsDate(r.incidentDate || r.date);
  const fields = [
    '1',                                   // 1  record/module type — Basic
    fdid,                                  // 2  FDID
    state,                                 // 3  state
    incDate,                               // 4  incident date MMDDYYYY
    clean(r.station || ''),                // 5  station
    clean(r.incidentNumber || r.incident_number || ''), // 6 incident number
    clean(r.exposure ?? '0'),              // 7  exposure number
    clean(r.incidentTypeCode || r.incidentType || ''),  // 8 incident type code
    nfirsTime(r.alarmTime),                // 9  alarm time HHMM
    nfirsTime(r.arrivalTime),              // 10 arrival time HHMM
    nfirsTime(r.controlledTime),           // 11 controlled time HHMM
    nfirsTime(r.clearedTime),              // 12 last unit cleared HHMM
    clean(r.actionTakenCode || ''),        // 13 action taken 1
    clean(r.propertyUseCode || ''),        // 14 property use
    clean(r.aidDirection === 'RECEIVED' ? '1' : r.aidDirection === 'GIVEN' ? '3' : 'N'), // 15 aid given/received
    clean(r.propertyLoss ?? ''),           // 16 property loss $
    clean(r.contentsLoss ?? ''),           // 17 contents loss $
    clean(r.firefighterInjuries ?? '0'),   // 18 fire service injuries
    clean(r.firefighterDeaths ?? '0'),     // 19 fire service deaths
    clean(r.civilianInjuries ?? '0'),      // 20 civilian injuries
    clean(r.civilianDeaths ?? '0'),        // 21 civilian deaths
    clean((r.address || '').split(',')[0]),// 22 street address line
    clean(r.city || ''),                   // 23 city
    clean(r.zip || ''),                    // 24 zip
  ];
  return fields.join('^');
}

/**
 * Export a full NFIRS 5.0 flat file for a set of reports.
 * @returns {string} the file contents
 */
export function exportNfirsFlatFile(reports = [], opts = {}) {
  const fdid = clean(opts.fdid || '');
  const state = clean(opts.state || '');
  const today = nfirsDate(new Date().toISOString().slice(0, 10));
  const lines = [];
  // Header record: type 0 — file metadata
  lines.push(['0', fdid, state, today, 'OpenFirehouse', String(reports.length)].join('^'));
  for (const r of reports) {
    lines.push(toBasicModuleRecord(r, opts));
  }
  // Trailer record: type 9 — record count (basic modules only)
  lines.push(['9', String(reports.length)].join('^'));
  return lines.join('\r\n') + '\r\n';
}

/** Browser download helper (mirrors downloadNerisJson). */
export function downloadNfirsFlatFile(reports, opts = {}, filename) {
  const text = exportNfirsFlatFile(reports, opts);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `NFIRS_flatfile_${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
