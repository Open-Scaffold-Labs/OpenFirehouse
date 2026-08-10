'use strict';
// fiCodeLibraryImport.test.js — bulk CSV import/export of the violation-code library.
// Pure validation (analyzeImport) always runs; the live endpoint tests need TENANCY_TEST_DB.

// Point the DB pool at the test database BEFORE requiring anything that pulls in ../db
// (requiring the route below transitively creates the pool at load time — set the URL first,
// or it binds to the default role and every live query fails "role postgres does not exist").
if (process.env.TENANCY_TEST_DB) process.env.DATABASE_URL = process.env.TENANCY_TEST_DB;

const { test } = require('node:test');
const assert = require('node:assert');
const { analyzeImport } = require('../routes/fiCodeLibrary');

// ── PURE: analyzeImport (no DB) ──────────────────────────────────────────────
test('analyzeImport accepts a clean file and returns records', () => {
  const a = analyzeImport('code,title,category\n1001,Blocked exit,Egress\n2001,Missing extinguisher,Fire\n');
  assert.equal(a.fatal, undefined);
  assert.equal(a.records.length, 2);
  assert.equal(a.errors.length, 0);
  assert.equal(a.records[0].code, '1001');
  assert.equal(a.records[0].active, true, 'active defaults true');
  assert.equal(a.records[0].sort_order, 0, 'sort_order defaults 0');
});

test('analyzeImport refuses a file with no "code" column', () => {
  const a = analyzeImport('title,category\nBlocked exit,Egress\n');
  assert.equal(a.code, 'MISSING_CODE_COLUMN');
});

test('analyzeImport refuses an empty file', () => {
  assert.equal(analyzeImport('code,title\n').code, 'EMPTY_IMPORT');
});

test('analyzeImport enforces the row cap', () => {
  const big = 'code,title\n' + Array.from({ length: 2001 }, (_, i) => `C${i},t`).join('\n') + '\n';
  assert.equal(analyzeImport(big).code, 'TOO_MANY_ROWS');
});

test('analyzeImport reports per-row errors and keeps the valid rows', () => {
  const a = analyzeImport(
    'code,title,active\n'
    + '1001,ok,true\n'          // valid
    + ',no code,true\n'         // error: missing code
    + '2001,ok,maybe\n'         // error: bad active
    + `3001,${'x'.repeat(301)},true\n`, // error: title too long
  );
  assert.equal(a.records.length, 1, 'only the one valid row survives');
  assert.equal(a.errors.length, 3);
  assert.ok(a.errors.some((e) => /missing code/.test(e.reason)));
  assert.ok(a.errors.some((e) => /active/.test(e.reason)));
  assert.ok(a.errors.some((e) => /title too long/.test(e.reason)));
  assert.equal(a.errors[0].line, 3, 'line numbers account for the header row');
});

test('analyzeImport de-duplicates within the file (last wins) and counts it', () => {
  const a = analyzeImport('code,title\n1001,first\n1001,second\n');
  assert.equal(a.records.length, 1);
  assert.equal(a.records[0].title, 'second');
  assert.equal(a.duplicates, 1);
});

// ── LIVE: the endpoints ──────────────────────────────────────────────────────
const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('fi code-library import/export (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  delete process.env.PORT;

  test('CSV import/export end to end', async (t) => {
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => { const x = realSetInterval(...args); if (x && x.unref) x.unref(); return x; };
    let app;
    try { app = require('../index'); } finally { global.setInterval = realSetInterval; }
    const { pool } = require('../db');
    const jwt = require('jsonwebtoken');
    const { ACCESS_SECRET } = require('../config/jwtSecret');

    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const api = async (method, path, token, body) => {
      const res = await fetch(base + path, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null; try { json = await res.json(); } catch { /* */ }
      return { status: res.status, json };
    };

    const u = (await pool.query(
      `SELECT id, username, role, station_id FROM users WHERE station_id IS NOT NULL AND role='chief' ORDER BY id LIMIT 1`)).rows[0];
    assert.ok(u, 'need a chief with a station');
    const dept = u.station_id;
    const admin = jwt.sign({ sub: u.id, username: u.username, role: u.role, stationId: dept, name: 'CSV Test' }, ACCESS_SECRET, { expiresIn: '10m' });

    const cleanup = () => pool.query(`DELETE FROM fi_code_library WHERE code LIKE 'ZZ%' AND department_id = $1`, [dept]);
    await cleanup();
    t.after(async () => { await cleanup(); await new Promise((r) => server.close(r)); await pool.end().catch(() => {}); });

    // 1) DRY RUN writes nothing.
    const dry = await api('POST', '/api/fi-code-library/import', admin,
      { csv: 'code,title\nZZ1,Blocked exit\nZZ2,Missing extinguisher\n', dryRun: true });
    assert.equal(dry.status, 200, JSON.stringify(dry.json));
    assert.equal(dry.json.data.dryRun, true);
    assert.equal(dry.json.data.willAdd, 2);
    const afterDry = await api('GET', '/api/fi-code-library/export', admin);
    assert.ok(!/ZZ1/.test(afterDry.json.data.csv), 'dry run must not have written anything');

    // 2) REAL import adds them.
    const real = await api('POST', '/api/fi-code-library/import', admin,
      { csv: 'code,title,remediation_text\nZZ1,Blocked exit,Clear it\nZZ2,Missing extinguisher,Provide one\n' });
    assert.equal(real.json.data.added, 2, JSON.stringify(real.json));
    assert.equal(real.json.data.updated, 0);

    // 3) RE-IMPORT: change ZZ1's title, leave remediation BLANK → title updates, remediation is NOT wiped.
    const reimport = await api('POST', '/api/fi-code-library/import', admin,
      { csv: 'code,title,remediation_text\nZZ1,Blocked exit UPDATED,\nZZ3,New code,\n' });
    assert.equal(reimport.json.data.added, 1, 'ZZ3 is new');
    assert.equal(reimport.json.data.updated, 1, 'ZZ1 updates');
    const row = (await pool.query(`SELECT title, remediation_text FROM fi_code_library WHERE code='ZZ1' AND department_id=$1`, [dept])).rows[0];
    assert.equal(row.title, 'Blocked exit UPDATED');
    assert.equal(row.remediation_text, 'Clear it', 'a blank cell must NOT wipe the bureau-authored remediation');

    // 4) EXPORT is formula-injection safe.
    await api('POST', '/api/fi-code-library/import', admin, { csv: 'code,title\nZZ9,=SUM(1+1)\n' });
    const exp = await api('GET', '/api/fi-code-library/export', admin);
    // Neutralized = a leading single quote so Excel treats it as text. (No RFC-4180 double-quote
    // wrapping here because the value has no comma/quote/newline — the ' prefix is the defense.)
    assert.match(exp.json.data.csv, /,'=SUM\(1\+1\)/, 'a formula-leading title must be neutralized on export');
    assert.ok(!/,=SUM\(1\+1\)/.test(exp.json.data.csv), 'the raw, un-neutralized formula must NOT appear');

    // 5) The template downloads.
    const tpl = await api('GET', '/api/fi-code-library/template', admin);
    assert.match(tpl.json.data.csv, /^code,title,category/);

    // 6) Import is GATED, never open. Prefer a REAL non-chief user in the dept (→ 403 from the
    // prevention-admin gate); if the dept has none, a token for an unknown user still proves the
    // endpoint is not open (401 from the auth layer). Either way a non-admin cannot import.
    const nonAdmin = (await pool.query(
      `SELECT id, username, role FROM users WHERE station_id = $1 AND role <> 'chief' ORDER BY id LIMIT 1`, [dept])).rows[0];
    const denyTok = jwt.sign(nonAdmin
      ? { sub: nonAdmin.id, username: nonAdmin.username, role: nonAdmin.role, stationId: dept, name: 'NonAdmin' }
      : { sub: 999999, username: 'zz_ghost', role: 'firefighter', stationId: dept, name: 'Ghost' },
      ACCESS_SECRET, { expiresIn: '10m' });
    const denied = await api('POST', '/api/fi-code-library/import', denyTok, { csv: 'code,title\nZZ8,x\n' });
    assert.ok([401, 403].includes(denied.status), `import must be gated, not open (got ${denied.status}: ${JSON.stringify(denied.json)})`);
    assert.notEqual(denied.status, 200, 'a non-admin must never import');
    const wrote = (await pool.query(`SELECT 1 FROM fi_code_library WHERE code='ZZ8' AND department_id=$1`, [dept])).rowCount;
    assert.equal(wrote, 0, 'a refused import must not have written anything');
  });
}
