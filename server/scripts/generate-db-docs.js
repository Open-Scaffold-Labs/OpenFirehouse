#!/usr/bin/env node
'use strict';
/**
 * scripts/generate-db-docs.js
 *
 * Parses server/src/db.js and emits docs/DATABASE.md — a per-table
 * data dictionary derived from the actual schema. Rerun whenever the
 * schema changes:
 *
 *   node server/scripts/generate-db-docs.js
 *
 * The generator handles:
 *   - CREATE TABLE IF NOT EXISTS <name> (...) blocks
 *   - ALTER TABLE <name> ADD COLUMN IF NOT EXISTS <col> <type> ...
 *   - `// comment` lines immediately preceding a CREATE TABLE
 *     (treated as the table's purpose description)
 *
 * It does NOT capture indexes, foreign-key relationships beyond what
 * is declarable inline, or triggers — those live in db.js too and
 * can be added to this generator if the data dictionary's audience
 * needs them.
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'src', 'db.js');
const OUT_FILE = path.join(__dirname, '..', '..', 'docs', 'DATABASE.md');

const src = fs.readFileSync(DB_FILE, 'utf8');
const lines = src.split('\n');

// ── Find every CREATE TABLE block ─────────────────────────────────────────
// Match: `CREATE TABLE IF NOT EXISTS <name> (` ... `);` (multiline).
const tables = new Map(); // name → { description, columns: [{name, type, notes}] }

const createRe = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\);/g;
let match;
while ((match = createRe.exec(src)) !== null) {
  const name = match[1];
  const body = match[2];

  // Description: look backward from the match start for the nearest
  // adjacent `// ...` comment line(s) before the `await pool.query(`
  // wrapper.
  const before = src.slice(Math.max(0, match.index - 600), match.index);
  const beforeLines = before.split('\n').reverse();
  const descLines = [];
  let inComment = false;
  for (const ln of beforeLines) {
    const trimmed = ln.trim();
    // Skip the await pool.query opener
    if (trimmed.startsWith('await pool.query') || trimmed === '`' || trimmed === '') {
      if (descLines.length) break; // already collected
      continue;
    }
    if (trimmed.startsWith('//')) {
      descLines.unshift(trimmed.replace(/^\/\/\s?/, ''));
      inComment = true;
      continue;
    }
    if (inComment) break;
    // first non-comment, non-empty line that isn't `await pool.query`
    // means we're past the description block
    break;
  }
  const description = descLines.join(' ').trim();

  // Column extraction: split body by lines, parse each non-empty line.
  const cols = [];
  for (const rawLine of body.split('\n')) {
    const ln = rawLine.trim().replace(/,$/, '');
    if (!ln) continue;
    if (/^(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|CONSTRAINT)/i.test(ln)) {
      // table-level constraint, not a column
      cols.push({ name: '_constraint', type: ln, notes: '' });
      continue;
    }
    // First whitespace-or-tab-delimited token is the column name (may
    // be quoted with "double quotes" to preserve camelCase).
    const parsed = parseColumn(ln);
    if (parsed) cols.push(parsed);
  }

  tables.set(name, { description, columns: cols });
}

// ── Apply ALTER TABLE ADD COLUMN IF NOT EXISTS migrations ────────────────
const alterRe = /ALTER TABLE\s+(\w+)\s+ADD COLUMN IF NOT EXISTS\s+("?[\w]+"?)\s+([^`]+?)(?:`|$)/g;
while ((match = alterRe.exec(src)) !== null) {
  const tableName = match[1];
  const colName = match[2].replace(/"/g, '');
  const typeRest = match[3].trim().replace(/[`,;]$/, '').trim();
  if (!tables.has(tableName)) continue; // dynamic alters; rare
  const existing = tables.get(tableName).columns.find(c => c.name === colName);
  if (existing) continue; // already declared inline
  tables.get(tableName).columns.push({
    name: colName,
    type: typeRest.split(/\s+/)[0],
    notes: '_(added via ALTER TABLE)_ ' + typeRest.split(/\s+/).slice(1).join(' '),
  });
}

// ── Render markdown ───────────────────────────────────────────────────────
const tableNames = [...tables.keys()].sort();

let out = '';
out += '# OpenFirehouse data dictionary\n\n';
out += '_Auto-generated from `server/src/db.js`. Regenerate with `node server/scripts/generate-db-docs.js`._\n\n';
out += tableNames.length + ' tables. This document is the single source of truth for the database schema; if it disagrees with `db.js`, `db.js` wins. The generator runs in seconds — regenerate after any schema change.\n\n';

// Domain grouping (best-effort by prefix/keyword)
const DOMAINS = [
  { name: 'Identity & access', match: n => /^(users|members|cadets|recruitment|sessions|push_subscriptions)$/.test(n) },
  { name: 'Operations & dispatch', match: n => /^(incidents|incident_|cad_|nfirs_|dispatches?|run_lists|recall_|station_log|mutual_aid)/.test(n) },
  { name: 'Apparatus & equipment', match: n => /^(apparatus|cylinders|fill_stations|equipment_|maintenance|assets)/.test(n) },
  { name: 'Pre-plans & inspections', match: n => /^(pre_plans|hydrants|fi_|investigations|crr_|coverage_outreach)/.test(n) },
  { name: 'Personnel records', match: n => /^(member_|personnel_|leave_|ot_records|pay_|timesheets|shift|daily_staffing|volunteer_hours|exposure_)/.test(n) },
  { name: 'Training & certification', match: n => /^(training|courses|drills|exams?|exam_|scenario_|module_|checklist_)/.test(n) },
  { name: 'Policies & compliance', match: n => /^(sogs|policy_|dept_documents|grievances|after_action_|wellness)/.test(n) },
  { name: 'Finance & administration', match: n => /^(budget_|grants|fundraising_|donations|incident_costs|correspondence|messages|bulletins|meeting_minutes|events|community_events)/.test(n) },
  { name: 'Radio & assistant', match: n => /^(radio_|assistant_|active_boards|queries|workflow_)/.test(n) },
  { name: 'Reference & system', match: n => /^(stations|cad_connections|attachments|calendar_subscriptions|member_availability|member_qualifications)/.test(n) },
];

// Assign each table to the first domain that matches, so tables don't
// appear in multiple sections.
const assigned = new Set();
const groups = DOMAINS.map(d => {
  const matched = tableNames.filter(t => !assigned.has(t) && d.match(t));
  matched.forEach(t => assigned.add(t));
  return { name: d.name, tables: matched };
});
const other = tableNames.filter(t => !assigned.has(t));
if (other.length) groups.push({ name: 'Other', tables: other });

// TOC
out += '## Tables by domain\n\n';
for (const g of groups) {
  if (!g.tables.length) continue;
  out += `**${g.name}** — `;
  out += g.tables.map(t => `[\`${t}\`](#${t.replace(/_/g, '_')})`).join(', ');
  out += '\n\n';
}

out += '---\n\n';

// Table sections
for (const tableName of tableNames) {
  const t = tables.get(tableName);
  out += `## \`${tableName}\`\n\n`;
  if (t.description) {
    out += `${t.description}\n\n`;
  }

  // Column table
  const realCols = t.columns.filter(c => c.name !== '_constraint');
  if (realCols.length) {
    out += '| Column | Type | Default / notes |\n';
    out += '| ------ | ---- | --------------- |\n';
    for (const c of realCols) {
      const safeNotes = (c.notes || '').replace(/\|/g, '\\|');
      out += `| \`${c.name}\` | \`${c.type}\` | ${safeNotes} |\n`;
    }
    out += '\n';
  }

  const constraints = t.columns.filter(c => c.name === '_constraint');
  if (constraints.length) {
    out += '**Table constraints:**\n\n';
    for (const c of constraints) {
      out += `- \`${c.type}\`\n`;
    }
    out += '\n';
  }
}

out += '\n---\n\n';
out += '_Last generated: ' + new Date().toISOString().slice(0, 10) + '_\n';

fs.writeFileSync(OUT_FILE, out);
console.log(`Wrote ${OUT_FILE}`);
console.log(`Documented ${tableNames.length} tables, ${[...tables.values()].reduce((n, t) => n + t.columns.filter(c => c.name !== '_constraint').length, 0)} columns total.`);

// ── helpers ──────────────────────────────────────────────────────────────
function parseColumn(ln) {
  // Column name may be quoted: "camelName" or unquoted: snake_name
  const m = ln.match(/^("?\w+"?)\s+(.*)$/);
  if (!m) return null;
  const rawName = m[1];
  const rest = m[2];
  const name = rawName.replace(/"/g, '');
  // First word of `rest` is the type; remainder is notes
  const restMatch = rest.match(/^(\w+(?:\([^)]+\))?)\s*(.*)$/);
  if (!restMatch) return { name, type: rest, notes: '' };
  const type = restMatch[1];
  const notesRaw = restMatch[2].trim();
  // Clean up the notes: turn DEFAULT NOW() into "default NOW()", etc.
  const notes = notesRaw
    .replace(/\bNOT NULL\b/g, '**not null**')
    .replace(/\bUNIQUE\b/g, '**unique**')
    .replace(/\bPRIMARY KEY\b/g, '**primary key**')
    .replace(/\bDEFAULT\b/g, 'default');
  return { name, type, notes };
}
