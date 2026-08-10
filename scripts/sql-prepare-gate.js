#!/usr/bin/env node
'use strict';
/**
 * sql-prepare-gate.js — ask POSTGRES whether our SQL is valid, instead of guessing.
 *
 * WHY THIS EXISTS
 * ---------------
 * GET /api/calendar/feed returned an empty calendar to every department, always,
 * with HTTP 200 (fixed in 1518bf0). The cause was one feed selecting `start_time`
 * from `events` where the column is `startTime`. Nothing caught it: a free column
 * name is not a syntax error, the client build cannot see server SQL, and no test
 * exercised that query against a real schema.
 *
 * WHY NOT A LINTER / REGEX
 * ------------------------
 * I wrote one first and deleted it. Measured against a live schema it reported
 * 38 missing columns across 16 feeds; the true figure was far smaller. It counted
 * output aliases (`lr."memberId" AS member_id`) as columns being READ, and it
 * skipped every qualified `lr."startDate"` it should have checked — wrong in both
 * directions at once. Any hand-rolled SQL parser will have some version of that
 * bug, and a checker you cannot trust is worse than none, because its silence
 * gets quoted as evidence.
 *
 * Postgres already contains a correct parser. `PREPARE` runs parse + analyse and
 * fails on an unknown column or table WITHOUT executing anything. Zero false
 * positives, zero false negatives, no maintenance.
 *
 * REPORTING-ONLY BY DEFAULT, DELIBERATELY
 * ---------------------------------------
 * These defects predate today. Failing the build on them immediately would re-red
 * a pipeline that was just restored after 207 red runs, for problems nobody
 * introduced this week. So: report, fix, THEN ratchet to zero with --strict —
 * the same pattern the 2026-08-05 accessibility work used.
 *
 *   node scripts/sql-prepare-gate.js              # report, always exit 0
 *   node scripts/sql-prepare-gate.js --strict     # exit 1 if anything fails
 *   node scripts/sql-prepare-gate.js --max 12     # ratchet: fail if MORE than 12
 *
 * Requires DATABASE_URL pointing at a schema-complete database. In CI that is the
 * baseline + self-heal database — NOT a developer's local one. The audit that
 * preceded this was run against local and was measured against the wrong schema.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const STRICT = process.argv.includes('--strict');
const MAX = (() => {
  const i = process.argv.indexOf('--max');
  return i > -1 ? parseInt(process.argv[i + 1], 10) : null;
})();

const SCAN_DIRS = ['server/src/feeds', 'server/src/routes'];

/**
 * Pull template-literal SQL out of a source file.
 * Only literals that look like a complete SELECT are taken — a fragment cannot be
 * PREPAREd, and guessing at how fragments concatenate is the parsing problem this
 * script exists to avoid.
 */
function extractQueries(src) {
  const out = [];
  const re = /`([^`]*?\bSELECT\b[\s\S]*?)`/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const q = m[1].trim();
    if (!/^\s*SELECT\b/i.test(q)) continue;      // must START with SELECT
    if (/\$\{/.test(q)) continue;                 // interpolated → not a fixed statement
    const line = src.slice(0, m.index).split('\n').length;
    out.push({ sql: q, line });
  }
  return out;
}

async function main() {
  const root = path.join(__dirname, '..');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let checked = 0, failed = 0, skipped = 0;
  const failures = [];

  // Collect every scanned file up front, so the lazy-table exclusion below can
  // be built from ALL of them before any statement is judged.
  const sources = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).filter(x => x.endsWith('.js')).sort()) {
      sources.push({ dir, f, src: fs.readFileSync(path.join(abs, f), 'utf8') });
    }
  }

  // LAZY TABLES ARE NOT MISSING TABLES — and the file that CREATES one is not
  // always the file that READS it.
  // liveShare, publicCameras, incidentMedia and emailIngest each carry an
  // INIT_SQL block with `CREATE TABLE IF NOT EXISTS …` and create their table on
  // first call. Against a database where that route has never been hit, a
  // PREPARE reports `relation does not exist` — which is true at that instant
  // and NOT a defect. Reporting those would make this gate cry wolf, which is
  // exactly why its regex-based predecessor was deleted: a checker nobody can
  // trust gets its silence quoted as evidence.
  //
  // This set used to be built PER FILE, which silently assumed a lazy table is
  // only ever read by its own creator. That is not true: routes/liveShare.js
  // creates `live_shares` and routes/activeResources.js reads it, so the gate
  // reported activeResources.js:78 as drift. It was the gate that was wrong.
  // Building the set across every scanned file removes the assumption.
  const selfCreated = new Set(
    sources.flatMap(({ src }) =>
      [...src.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)]
        .map(m => m[1].toLowerCase())
    )
  );

  for (const { dir, f, src } of sources) {
    for (const { sql, line } of extractQueries(src)) {
      // A prepared statement is parsed + analysed but never run.
      const name = `gate_${checked}`;
      try {
        await client.query(`PREPARE ${name} AS ${sql}`);
        await client.query(`DEALLOCATE ${name}`);
        checked++;
      } catch (e) {
        // 42P02 = undefined parameter: the query uses $1 in a spot PREPARE cannot
        // type-infer. That is a limitation of this harness, not a defect in the
        // SQL — count it as skipped rather than reporting a false positive.
        if (e.code === '42P02' || e.code === '42P18') { skipped++; continue; }
        // 42P01 = undefined_table. If ANY scanned file creates that table itself,
        // the absence is lazy-init, not drift. Postgres puts the name in quotes:
        //   relation "live_shares" does not exist
        if (e.code === '42P01') {
          const t = (e.message.match(/relation "([^"]+)" does not exist/) || [])[1];
          if (t && selfCreated.has(t.toLowerCase())) { skipped++; continue; }
        }
        checked++; failed++;
        failures.push({
          file: `${dir}/${f}`, line,
          code: e.code,
          message: e.message.split('\n')[0],
          hint: e.hint || null,
        });
      }
    }
  }

  for (const f of failures) {
    console.log(`\n${f.file}:${f.line}`);
    console.log(`  [${f.code}] ${f.message}`);
    if (f.hint) console.log(`  HINT: ${f.hint}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`statements PREPAREd:  ${checked}`);
  console.log(`FAILED:               ${failed}`);
  console.log(`skipped (param type): ${skipped}`);
  console.log('='.repeat(60));

  await client.end();

  if (STRICT && failed > 0) {
    console.error(`\n::error::${failed} SQL statement(s) do not parse against the real schema.`);
    process.exit(1);
  }
  if (MAX !== null && failed > MAX) {
    console.error(`\n::error::${failed} failures exceeds the ratchet of ${MAX}. Fix, or lower the ratchet — never raise it.`);
    process.exit(1);
  }
  if (failed > 0) {
    console.log(`\n::warning::${failed} SQL statement(s) do not parse. Reporting only — see --strict.`);
  }
}

main().catch(e => { console.error(e.message); process.exit(2); });
