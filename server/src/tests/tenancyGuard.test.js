'use strict';
// Tenancy-isolation guard (Phase 1.3) — static analysis that FAILS the build
// if a hardcoded tenant id or client-supplied tenant id sneaks back into the
// server. This is the regression fence behind the 2026-06-10 sweep that
// removed `station_id = 1` from 14 route files + 22 feed modules.
//
// Run: npm test (from server/) or `node --test src` .
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SCAN_DIRS = [
  path.join(__dirname, '..', 'routes'),
  path.join(__dirname, '..', 'feeds'),
  path.join(__dirname, '..', 'middleware'),
];
const SCAN_FILES = [path.join(__dirname, '..', 'index.js')];

// Forbidden patterns. NOTE: `station_id = $1` (parameterized) does NOT match —
// the regexes require a literal numeric 1.
const FORBIDDEN = [
  { re: /station_id\s*=\s*1\b/g, why: 'hardcoded station_id = 1 in SQL' },
  { re: /station_id\s*=\s*'1'/g, why: "hardcoded station_id = '1' in SQL" },
  { re: /\.station_id\s*=\s*1\b/g, why: 'hardcoded aliased station_id = 1' },
  { re: /VALUES\s*\(\s*1\s*,/gi, why: 'hardcoded station_id 1 in INSERT VALUES' },
  { re: /station_id\s*=\s*['"]?1['"]?\s*\}\s*=\s*req\.(query|body)/g, why: 'client-supplied station_id default' },
  { re: /\{[^}]*\bstation_id\b[^}]*\}\s*=\s*req\.(query|body)/g, why: 'station_id destructured from client input (req.query/req.body)' },
  { re: /req\.(query|body)\.station_id/g, why: 'station_id read from client input' },
  { re: /station_id\s*\|\|\s*1\b/g, why: 'station_id || 1 fallback (req.user has stationId, not station_id — this always picks 1)' },
  { re: /\bstationId\s*=\s*1\b/g, why: 'hardcoded stationId = 1 in JS' },
  // W2.5 audit additions (2026-06-10) — patterns the original fence missed:
  { re: /\bstationId\s*(\|\||\?\?)\s*1\b/g, why: 'stationId || 1 / ?? 1 fallback — dead behind requireAuth, but silently lands everything in station 1 if a route is ever mounted pre-auth (the push.js bug class)' },
  { re: /req\.session\b/g, why: 'req.session is never populated (no session middleware — auth is JWT via req.user); reading it silently yields undefined (the push.js bug class)' },
];

// Known-acceptable exceptions, reviewed by hand. Keep this list SHORT and
// justify every entry.
const ALLOWLIST = [
  // (none currently)
];

// Line-shape exceptions. (The historical `stationId: user.station_id || 1`
// auth fallback was removed 2026-06-10 — prod verified 0 NULL-station users;
// NULL-station logins now fail closed with 403 NO_STATION.)
const ALLOWED_LINE_SHAPES = [
  // P4.3 multi-house: the ONE deliberate client station_id read, inside
  // apparatus.js resolveHouseTag(). It is a HOUSE TAG within the caller's own
  // department (NOT the tenant key — department_id from the JWT is), and it is
  // validated against the caller's department before use. Reviewed exception.
  /const clientHouseTag = req\.body\.station_id;/,
  // 2.1a (0072) per-station rosters: a multi-house department must be able to say
  // WHICH station's roster to publish/read. The client station_id is ALWAYS passed
  // through resolveRosterStation(), which validates it belongs to the caller's
  // department (WHERE id=$1 AND department_id=$2) and returns null for a foreign/
  // absent station — so it is not a tenant-spoof vector (department_id from the JWT
  // remains the tenant key). Reviewed exception, scoped to the validated resolver.
  /resolveRosterStation\([^)]*req\.(query|body)/,
  // 2.3 (0074) station-display pairing: the chief names WHICH of their own stations a
  // display pairs to. station_id here is a HOUSE reference validated against the caller's
  // department (SELECT ... WHERE id=$1 AND department_id=$2) before use — NOT the tenant
  // key (department_id from the JWT is). Reviewed exception, same class as clientHouseTag.
  /const \{ station_id, label \} = req\.body/,
  // 4.1g response compliance report: NFPA §4.1.2.5.2 requires performance to be
  // evaluated "in each geographic area within the jurisdiction", so a chief must
  // be able to filter to one of their OWN houses. station_id here is a HOUSE
  // reference resolved through resolveOwnStation(), which is scoped by the JWT's
  // department (SELECT ... WHERE id=$1 AND department_id=$2) and REFUSES a
  // foreign or absent station with 404 rather than returning an empty report.
  // department_id from the JWT remains the tenant key. Reviewed exception, same
  // class as resolveRosterStation and the 0074 display pairing.
  /resolveOwnStation\([^)]*req\.query/,
];

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map((f) => path.join(dir, f));
}

test('no hardcoded or client-supplied station_id in server code', () => {
  const files = [...SCAN_DIRS.flatMap(listJsFiles), ...SCAN_FILES];
  assert.ok(files.length > 50, `expected to scan many files, found ${files.length} — scan dirs misconfigured?`);

  const violations = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const lines = src.split('\n');
    for (const { re, why } of FORBIDDEN) {
      re.lastIndex = 0;
      lines.forEach((line, i) => {
        re.lastIndex = 0;
        if (re.test(line)) {
          const key = `${path.basename(file)}:${i + 1}`;
          const lineAllowed = ALLOWED_LINE_SHAPES.some((a) => a.test(line));
          if (!ALLOWLIST.includes(key) && !lineAllowed) {
            violations.push(`${key} — ${why}\n    ${line.trim()}`);
          }
        }
      });
    }
  }

  assert.strictEqual(
    violations.length,
    0,
    `Tenancy guard tripped — fix these before merging:\n${violations.join('\n')}`
  );
});

test('every routes/ SQL DELETE on a station-scoped table carries station_id', () => {
  // Heuristic fence: a DELETE FROM <table> WHERE that mentions id but not
  // station_id is a likely cross-tenant write hole (the dailyStaffing PATCH
  // bug class). Tables genuinely global (licenses, push_subscriptions, etc.)
  // are excluded.
  const GLOBAL_TABLES = new Set([
    'licenses', 'push_subscriptions', 'schema_migrations', 'sessions',
    'users', 'personal_tasks', 'personal_roles', 'bug_reports',
    'calendar_subscriptions', 'workflow_tasks', 'radio_log',
  ]);
  const files = listJsFiles(path.join(__dirname, '..', 'routes'));
  const offenders = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const deleteRe = /DELETE\s+FROM\s+([a-z_]+)\s+WHERE\s+([^;`'"]*)/gi;
    let m;
    while ((m = deleteRe.exec(src)) !== null) {
      const [, table, where] = m;
      if (GLOBAL_TABLES.has(table)) continue;
      // Post-Phase-3, department_id is the access key; station_id survives as a
      // house tag. Either present in the WHERE = tenant-scoped. Flag only writes
      // scoped by NEITHER. (Before this, every correct department_id write
      // warn-noised here, eroding the fence's signal.)
      if (!/station_id/i.test(where) && !/department_id/i.test(where)) {
        offenders.push(`${path.basename(file)} — DELETE FROM ${table} WHERE ${where.slice(0, 60)}...`);
      }
    }
  }
  // Report-only threshold: fail if the count GROWS beyond the audited baseline.
  // Baseline measured 2026-06-10; drive to zero over time.
  const BASELINE = Number(process.env.TENANCY_DELETE_BASELINE || 999);
  assert.ok(
    offenders.length <= BASELINE,
    `Unscoped DELETEs (${offenders.length}) exceed baseline (${BASELINE}):\n${offenders.join('\n')}`
  );
  if (offenders.length) {
    console.warn(`[tenancy] ${offenders.length} unscoped DELETE statements remain (baseline fence active):\n  ${offenders.join('\n  ')}`);
  }
});

test('every routes/ SQL UPDATE on a station-scoped table carries station_id', () => {
  // W2.5 audit (2026-06-10): the DELETE fence above missed soft-delete and
  // mutate routes implemented as UPDATE ... WHERE id = $n (the vacancyFill /
  // activeResources / knoxKeys bug class). Same heuristic, same baseline
  // mechanism: a routes/ UPDATE whose WHERE clause never mentions station_id
  // (or token+station, or the stations table itself) is a likely cross-tenant
  // write hole.
  const GLOBAL_TABLES = new Set([
    'licenses', 'push_subscriptions', 'schema_migrations', 'sessions',
    'users', 'personal_tasks', 'personal_roles', 'bug_reports',
    'calendar_subscriptions', 'workflow_tasks', 'radio_log',
    // `stations` is the tenant table itself — updating it WHERE id = <own id>
    // (e.g. tvData's PIN-hash upgrade, stationConfig) is scoping by the
    // tenant key.
    'stations',
    // Shared public-camera registry — no tenant column by design (W2.5 audit
    // verdict: INTENTIONALLY-GLOBAL; writes limited to last_accessed).
    'camera_feeds', 'camera_systems',
  ]);
  const files = listJsFiles(path.join(__dirname, '..', 'routes'));
  const offenders = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    // Match UPDATE <table> SET ... WHERE <clause>, non-greedy across the SET
    // list (which is often a ${sets} template), stopping the WHERE capture at
    // a quote/backtick/semicolon like the DELETE fence does.
    const updateRe = /UPDATE\s+([a-z_]+)\s+SET\s+[\s\S]*?WHERE\s+([^;`'"]*)/gi;
    let m;
    while ((m = updateRe.exec(src)) !== null) {
      const [, table, where] = m;
      if (GLOBAL_TABLES.has(table)) continue;
      // department_id OR station_id in the WHERE = tenant-scoped (see DELETE fence note).
      if (!/station_id/i.test(where) && !/department_id/i.test(where)) {
        offenders.push(`${path.basename(file)} — UPDATE ${table} WHERE ${where.trim().slice(0, 60)}...`);
      }
    }
  }
  const BASELINE = Number(process.env.TENANCY_UPDATE_BASELINE || 999);
  assert.ok(
    offenders.length <= BASELINE,
    `Unscoped UPDATEs (${offenders.length}) exceed baseline (${BASELINE}):\n${offenders.join('\n')}`
  );
  if (offenders.length) {
    console.warn(`[tenancy] ${offenders.length} unscoped UPDATE statements remain (baseline fence active):\n  ${offenders.join('\n  ')}`);
  }
});

test('no INSERT with a literal station_id 1 in its parameter array', () => {
  // W2.5 audit (2026-06-10): ng911.js passed station_id as a literal `1` in
  // the parameter ARRAY (`[1, b.call_id, ...]`), which none of the SQL-text
  // regexes can see. Heuristic: an INSERT whose column list starts with
  // station_id, followed within ~250 chars by a parameter array whose first
  // element is the literal 1.
  const files = [...SCAN_DIRS.flatMap(listJsFiles), ...SCAN_FILES];
  const offenders = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /INSERT\s+INTO\s+[a-z_]+\s*\(\s*station_id\b[\s\S]{0,250}?\[\s*\n?\s*1\s*,/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
      const line = src.slice(0, m.index).split('\n').length;
      offenders.push(`${path.basename(file)}:${line} — INSERT (station_id, ...) with literal 1 as first param`);
    }
  }
  assert.strictEqual(
    offenders.length,
    0,
    `Literal station_id 1 in INSERT parameter arrays:\n${offenders.join('\n')}`
  );
});

test('no bare department_id filter against a table that has no department_id column', () => {
  // Regression fence for the Phase-3 bug class (db.js examAssignments.assign,
  // fixed 2026-06-13): the bulk station_id -> department_id flip swept a query
  // on the shared `users` table, which has NO department_id column, so it threw
  // 42703 ("column does not exist") at RUNTIME. CI was green because no test
  // exercised the exam-assignment route. The tenancyIsolation suite now has an
  // exam family that catches it dynamically; this catches the whole class
  // STATICALLY (no DB needed), so it can never regress silently again.
  //
  // Tables verified to LACK a department_id column on a freshly-migrated DB
  // (2026-06-13, via information_schema on a fresh-install + 0004/0005 expand):
  //   - users / departments: shared identity + the tenant table itself
  //   - fs_hazmat_* reference tables: no tenant scoping (public ERG data)
  //   - recall_responses: child table, scoped via its parent recall_events
  //   - live_shares / incident_media(_tokens) / exposure_queue: station-scoped,
  //     not yet department-modeled (Phase 4 follow-up)
  // IMPORTANT: if a future migration ADDS department_id to one of these, remove
  // it from this list (otherwise the fence produces a false negative).
  const NO_DEPT_ID_TABLES = [
    'users', 'departments', 'recall_responses', 'live_shares',
    'incident_media', 'incident_media_tokens', 'exposure_queue',
    'fs_hazmat_materials', 'fs_hazmat_guides',
    'fs_hazmat_isolation_distances', 'fs_hazmat_table3_distances',
  ];
  const files = [
    ...SCAN_DIRS.flatMap(listJsFiles),
    ...SCAN_FILES,
    path.join(__dirname, '..', 'db.js'), // the data-access chokepoint
  ];
  const offenders = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    for (const t of NO_DEPT_ID_TABLES) {
      // <FROM|UPDATE> <table> [alias] ... <bare> department_id = ...  within the
      // same SQL string literal (stop at a quote/backtick/semicolon). The
      // (?<!\.) lookbehind skips alias-qualified `r.department_id` (a correctly
      // scoped JOIN to a dept-bearing parent); requiring a following `=` skips
      // column-list uses like ON CONFLICT (user_id, department_id).
      const re = new RegExp(
        `\\b(?:FROM|UPDATE)\\s+${t}\\b(?:\\s+\\w+)?[^;'"\`]*?(?<!\\.)\\bdepartment_id\\s*=`,
        'gi'
      );
      let m;
      while ((m = re.exec(src)) !== null) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${path.basename(file)}:${line} — bare department_id filter on '${t}', which has no department_id column (42703 at runtime). Use station_id (value-equal during EXPAND) or scope via a parent.`);
      }
    }
  }
  assert.strictEqual(
    offenders.length,
    0,
    `department_id used against a no-department_id table (the exam-assignment 42703 bug class):\n${offenders.join('\n')}`
  );
});
