// ─── Import Utilities ────────────────────────────────────────────────────────
// CSV parser, field mapping engine, and import log utilities.

// ── Delimited Parser (CSV / TSV / pasted) ────────────────────────────────────
// Quote-aware state machine: auto-detects the delimiter (tab vs comma), handles
// the delimiter AND newlines inside quoted fields, and escaped quotes ("").
// This replaced an older line-split parser that broke on multi-line quoted
// cells (e.g. an incident narrative with line breaks).

// Detect the delimiter from the first non-empty line: tab if present, else comma.
function detectDelimiter(text) {
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line.trim() === '') continue;
    return line.includes('\t') ? '\t' : ',';
  }
  return ',';
}

// CSV/TSV/pasted text → array-of-arrays of trimmed cells. Newline-safe inside quotes.
function parseDelimitedToAoA(text) {
  if (typeof text !== 'string' || text === '') return [];
  const delim = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  const pushField = () => { row.push(field.trim()); field = ''; };
  const pushRow = () => { pushField(); if (row.some(c => c !== '')) rows.push(row); row = []; };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === delim) { pushField(); i++; continue; }
    if (ch === '\r') { pushRow(); i += (text[i + 1] === '\n' ? 2 : 1); continue; }
    if (ch === '\n') { pushRow(); i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length > 0) pushRow();
  return rows;
}

// Array-of-arrays → { headers, rows } where rows are objects keyed by header
// (the shape the rest of the import wizard expects).
function aoaToResult(aoa) {
  if (!aoa.length) return { headers: [], rows: [] };
  const headers = aoa[0].map(h => String(h ?? '').trim());
  const rows = [];
  for (let i = 1; i < aoa.length; i++) {
    const values = aoa[i] || [];
    if (!values.some(c => String(c ?? '').trim() !== '')) continue; // drop blank rows
    const row = {};
    headers.forEach((h, j) => { row[h] = String(values[j] ?? '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

// CSV / TSV / pasted text → { headers, rows }. Quote-aware, tab/comma auto-detect.
export function parseCSV(text) {
  return aoaToResult(parseDelimitedToAoA(text));
}

// Excel (.xlsx/.xls) ArrayBuffer → { headers, rows }. xlsx is lazy-loaded so it
// only ships to users who actually import a workbook. Hardened against the
// xlsx@0.18.5 prototype-pollution / ReDoS advisories: every cell is
// String()-coerced and the result is deep-cloned via a JSON round-trip before
// it touches app state, defeating any poisoned prototype the decoder attaches.
export async function parseWorkbook(arrayBuffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return { headers: [], rows: [] };
  const aoaRaw = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { header: 1, defval: '', blankrows: false });
  const aoa = JSON.parse(JSON.stringify(
    aoaRaw.map(r => (Array.isArray(r) ? r.map(c => String(c ?? '').trim()) : [])),
  ));
  return aoaToResult(aoa);
}

// ── PDF Parser ───────────────────────────────────────────────────────────────
// pdfjs is lazy-loaded (only ships when a PDF is imported). The worker is
// imported by URL so its version always matches the API (avoids the classic
// "API version does not match the Worker version" error).
let _pdfjs = null;
async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  _pdfjs = pdfjs;
  return pdfjs;
}

// PDF ArrayBuffer → array of "lines", each line an array of cell strings
// (text runs grouped by Y, sorted left→right, pages top→bottom).
export async function parsePDFLines(arrayBuffer) {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map();
    for (const it of content.items) {
      const str = (it.str || '').trim();
      if (!str) continue;
      const x = it.transform[4];
      const y = Math.round(it.transform[5]); // group items on the same baseline
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push({ str, x });
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) { // PDF y is bottom-up
      lines.push(byY.get(y).sort((a, b) => a.x - b.x).map(c => c.str));
    }
  }
  return lines;
}

// Generic PDF → { headers, rows }: treat the first line as headers.
export async function parsePDF(arrayBuffer) {
  return aoaToResult(await parsePDFLines(arrayBuffer));
}

// Run-list PDF → { headers:['Unit','Position','Name','Rank'], rows }.
// Section-aware: a unit-header line (e.g. "ENGINE 1") sets the current unit; a
// member line (a position keyword + a name) emits a row for that unit. Works on
// the structured run-list layout and tolerates UPPERCASE unit headers.
const RUNLIST_UNIT_RE = /^(battalion|truck|ladder|tower|quint|engine|squad|rescue|tanker|medic|car|brush|division)\s*\d/i;
const RUNLIST_POS_RE = /(battalion chief|bc aide|captain|lieutenant|firefighter|chief|aide|driver|engineer|operator|paramedic|emt|officer|probationary)/i;
const titleCase = (str) => str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function runListFromPdfLines(lines) {
  const rows = [];
  let currentUnit = '';
  for (const cells of lines) {
    if (!cells.length) continue;
    const first = cells[0].replace(/\s+/g, ' ').trim();
    if (RUNLIST_UNIT_RE.test(first)) {
      currentUnit = titleCase(first); // "ENGINE 1" -> "Engine 1"
      continue;
    }
    if (currentUnit && cells.length >= 2 && RUNLIST_POS_RE.test(first)) {
      const name = cells[1].trim();
      if (name && !RUNLIST_UNIT_RE.test(name)) {
        rows.push({ Unit: currentUnit, Position: first, Name: name, Rank: (cells[2] || '').trim() });
      }
    }
  }
  return { headers: ['Unit', 'Position', 'Name', 'Rank'], rows };
}

export async function parseRunListPDF(arrayBuffer) {
  return runListFromPdfLines(await parsePDFLines(arrayBuffer));
}

// ── Apply Field Mapping ───────────────────────────────────────────────────────
// Takes raw parsed rows (with original CSV column names) and a mapping object
// { 'csvHeader': 'freestationFieldId' | '' }
// Returns rows with OpenFirehouse field names. Unmapped columns are dropped.

export function applyMapping(rows, mapping) {
  return rows.map(row => {
    const mapped = {};
    Object.entries(mapping).forEach(([csvHeader, freestationField]) => {
      if (freestationField && freestationField !== '__skip__') {
        mapped[freestationField] = row[csvHeader] ?? '';
      }
    });
    return mapped;
  });
}

// ── Dedup Check ───────────────────────────────────────────────────────────────
// For each record type, check if a row might be a duplicate of existing data.
// Returns { isDuplicate: bool, reason: string }

export function checkDuplicate(row, recordType, existingData) {
  if (!existingData || !existingData.length) return { isDuplicate: false };

  switch (recordType) {
    case 'incidents': {
      const dup = existingData.find(e => e.incidentNumber === row.incidentNumber);
      return dup
        ? { isDuplicate: true, reason: `Incident number ${row.incidentNumber} already exists` }
        : { isDuplicate: false };
    }
    case 'members': {
      const dup = existingData.find(e =>
        e.firstName?.toLowerCase() === row.firstName?.toLowerCase() &&
        e.lastName?.toLowerCase()  === row.lastName?.toLowerCase()
      );
      return dup
        ? { isDuplicate: true, reason: `${row.firstName} ${row.lastName} already in roster` }
        : { isDuplicate: false };
    }
    case 'apparatus': {
      const dup = existingData.find(e => e.unitId === row.unitId);
      return dup
        ? { isDuplicate: true, reason: `Unit "${row.unitId}" already exists` }
        : { isDuplicate: false };
    }
    default:
      return { isDuplicate: false };
  }
}

// ── Import Log ────────────────────────────────────────────────────────────────

export function createImportLogEntry({ recordType, sourceSystem, fileName, summary }) {
  return {
    id:           Date.now(),
    timestamp:    new Date().toISOString(),
    recordType,
    sourceSystem,
    fileName:     fileName ?? 'unknown',
    total:        summary.total,
    imported:     summary.valid,
    skipped:      summary.errors,
    warnings:     summary.warnings,
    status:       summary.errors === summary.total ? 'error'
                : summary.errors > 0               ? 'partial'
                : 'success',
  };
}

// ── Format helpers ────────────────────────────────────────────────────────────

export function fmtTimestamp(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// ── Sample CSV helper ─────────────────────────────────────────────────────────
// Returns the sample CSV text for a given record type

export function getSampleCSV(recordType, RECORD_TYPES) {
  return RECORD_TYPES.find(rt => rt.id === recordType)?.sampleCsv ?? '';
}
