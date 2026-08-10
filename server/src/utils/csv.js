'use strict';
/**
 * utils/csv.js — dependency-free, RFC-4180-ish CSV: quote-aware PARSE + injection-safe
 * GENERATE. Written for the violation-code-library import/export (2026-07-15), but pure and
 * general. Unit-tested in tests/csv.test.js.
 *
 * Why hand-rolled: the two things that actually bite here are (1) fields containing commas,
 * quotes, or newlines (a naive split() corrupts them), and (2) CSV FORMULA INJECTION on
 * export — a cell beginning with = + - @ (or tab/CR) is executed as a formula when the file
 * is opened in Excel/Sheets (OWASP: "CSV Injection"). We neutralize (2) by prefixing such a
 * cell with a single quote so the spreadsheet treats it as text.
 */

const NEEDS_QUOTE = /[",\r\n]/;
// A leading formula character makes a spreadsheet EXECUTE the cell. Neutralize by prefixing '.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** Escape one cell for output: neutralize formulas, then RFC-4180 quote if needed. */
function escapeCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (FORMULA_LEAD.test(s)) s = `'${s}`;            // injection-safe (OWASP)
  if (NEEDS_QUOTE.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Generate CSV text from rows.
 * @param {object[]} rows
 * @param {{key:string, header:string}[]} columns
 * @returns {string} CRLF-terminated CSV with a header row (always present).
 */
function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const lines = (rows || []).map((row) => columns.map((c) => escapeCell(row[c.key])).join(','));
  return [header, ...lines].join('\r\n') + '\r\n';
}

/**
 * Parse CSV text into { header, rows }. Quote-aware: handles commas, CRLF/LF, and escaped
 * quotes ("") inside quoted fields. Strips a leading BOM. The first non-empty record is the
 * header; each data row becomes an object keyed by the (trimmed, lower-cased) header names.
 * Never throws — malformed input yields best-effort rows the caller then validates.
 * @returns {{ header: string[], rows: Array<Record<string,string>> }}
 */
function parseCsv(text) {
  const src = String(text === null || text === undefined ? '' : text).replace(/^﻿/, '');
  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  let sawAny = false;
  const endField = () => { record.push(field); field = ''; };
  const endRecord = () => { endField(); records.push(record); record = []; };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }   // escaped quote
        else inQuotes = false;
      } else field += ch;
      sawAny = true;
      continue;
    }
    if (ch === '"') { inQuotes = true; sawAny = true; continue; }
    if (ch === ',') { endField(); sawAny = true; continue; }
    if (ch === '\r') { if (src[i + 1] === '\n') i++; endRecord(); sawAny = false; continue; }
    if (ch === '\n') { endRecord(); sawAny = false; continue; }
    field += ch; sawAny = true;
  }
  if (sawAny || field.length || record.length) endRecord();

  // Drop wholly-empty records (e.g. a trailing newline).
  const nonEmpty = records.filter((r) => r.some((c) => String(c).trim() !== ''));
  if (!nonEmpty.length) return { header: [], rows: [] };

  const header = nonEmpty[0].map((h) => String(h).trim().toLowerCase());
  const rows = nonEmpty.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = String(r[idx] === undefined ? '' : r[idx]).trim(); });
    return obj;
  });
  return { header, rows };
}

module.exports = { toCsv, parseCsv, escapeCell };
