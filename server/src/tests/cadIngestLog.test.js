'use strict';
/**
 * cadIngestLog.test.js — 4C.2 persist-before-parse, end to end.
 *
 * DB-backed. Runs only when TENANCY_TEST_DB is set (house pattern); skips clean
 * otherwise so CI without a database stays green.
 *
 *   TENANCY_TEST_DB='postgresql://matthewlavin@localhost:5432/freestation' \
 *     node --test server/src/tests/cadIngestLog.test.js
 *
 * Every assertion here is one that COULD fail, and several of them DID fail
 * against the pre-4C.2 code:
 *   - malformed JSON never reached the handler at all (express.json answered
 *     400 from the middleware chain), so no receipt could have been written;
 *   - a payload sent with the wrong content-type arrived as {} with the bytes
 *     discarded;
 *   - an unauthenticated caller was answered before any tenant was known.
 */

const test   = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const express = require('express');

const DSN = process.env.TENANCY_TEST_DB;
if (!DSN) {
  test('cad ingest log (skipped: set TENANCY_TEST_DB)', () => assert.ok(true));
  return;
}
process.env.DATABASE_URL = DSN;

const { Pool } = require('pg');
const pool = new Pool({ connectionString: DSN });

const rawCapture = require('../cad/rawCapture');
const { persistReceipt, recordOutcome, safeHeaders } = require('../cad/ingestLog');
const { handleVendorWebhook } = require('../cad');

const SECRET = `test-secret-${crypto.randomUUID()}`;
const HASH   = crypto.createHash('sha256').update(SECRET).digest('hex');

let deptId, connId;

test('setup: a department with its own CAD connection secret', async () => {
  const d = await pool.query(
    `INSERT INTO departments (name) VALUES ($1) RETURNING id`,
    [`4C2 Ingest Test ${Date.now()}`]
  );
  deptId = d.rows[0].id;
  const c = await pool.query(
    `INSERT INTO cad_connections ("vendorId", name, status, department_id, webhook_secret_hash)
     VALUES ('generic', '4C2 test', 'active', $1, $2) RETURNING id`,
    [deptId, HASH]
  );
  connId = c.rows[0].id;
  assert.ok(deptId && connId);
});

/** A minimal app mounted EXACTLY as server/src/index.js mounts the real one. */
function makeApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use('/api/cad', rawCapture.captureBuffer, rawCapture.normalizeBody);
  app.use(express.json());
  app.post('/api/cad/:vendor', handleVendorWebhook);
  return app;
}

async function post(app, path, ct, body, secret = SECRET) {
  const srv = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try {
    const headers = { 'x-cad-webhook-secret': secret };
    if (ct) headers['content-type'] = ct;
    const res = await fetch(`http://127.0.0.1:${srv.address().port}${path}`, { method: 'POST', headers, body });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
    return { status: res.status, json };
  } finally { srv.close(); }
}

const receipts = () => pool.query(
  `SELECT * FROM cad_ingest_log WHERE department_id = $1 ORDER BY id`, [deptId]);
const outcomes = () => pool.query(
  `SELECT o.* FROM cad_ingest_outcome o
    JOIN cad_ingest_log l ON l.log_event_id = o.log_event_id
   WHERE l.department_id = $1 ORDER BY o.id`, [deptId]);

// ── THE CENTRAL CLAIM ───────────────────────────────────────────────────────
test('MALFORMED payload: stored verbatim, acked 200, recorded unparseable', async () => {
  const bytes = '{"nature": "STRUCTURE FIRE", "units": TRUNCATED';
  const r = await post(makeApp(), '/api/cad/generic', 'application/json', bytes);

  assert.equal(r.status, 200, 'a message we HAVE must not be answered with an error');
  assert.equal(r.json.stored, true);
  assert.equal(r.json.parsed, false);

  const rows = (await receipts()).rows;
  const hit = rows.find(x => x.raw_body === bytes);
  assert.ok(hit, 'the exact bytes must be on disk — this is the NENA i3 4.12.3.7 case');
  assert.equal(hit.vendor, 'generic');
  assert.ok(hit.source_ip, 'i3 requires the sender IP alongside the raw bytes');

  const oc = (await outcomes()).rows.find(o => o.log_event_id === hit.log_event_id);
  assert.equal(oc.parse_status, 'unparseable');
  assert.equal(oc.responded_status, 200);
  assert.match(oc.parse_error, /JSON/i);
});

test('WRONG content-type: the bytes are still kept (they used to vanish)', async () => {
  const bytes = '{"nature":"MVA","units":"E1"}';
  const r = await post(makeApp(), '/api/cad/generic', 'text/plain', bytes);
  assert.equal(r.status, 200);
  const hit = (await receipts()).rows.find(x => x.raw_body === bytes);
  assert.ok(hit, 'text/plain JSON must be stored, not silently dropped as {}');
});

test('UNKNOWN vendor, authenticated: bytes kept, 404, recoverable by hand', async () => {
  const bytes = '{"nature":"ALARM"}';
  const r = await post(makeApp(), '/api/cad/not-a-vendor', 'application/json', bytes);
  assert.equal(r.status, 404);
  const hit = (await receipts()).rows.find(x => x.raw_body === bytes);
  assert.ok(hit, 'a misrouted but AUTHENTICATED dispatch must not be thrown away');
  const oc = (await outcomes()).rows.find(o => o.log_event_id === hit.log_event_id);
  assert.equal(oc.parse_status, 'unparseable');
  assert.equal(oc.responded_status, 404);
});

// ── The negative: an unauthenticated caller must not be able to write ───────
test('BAD credential: 401 and NOT ONE byte stored', async () => {
  const before = (await receipts()).rowCount;
  const r = await post(makeApp(), '/api/cad/generic', 'application/json',
    '{"nature":"FORGED"}', 'wrong-secret');
  assert.equal(r.status, 401);
  assert.equal(r.json.code, 'CAD_BAD_CREDENTIAL');
  const after = (await receipts()).rowCount;
  assert.equal(after, before,
    'an unauthenticated caller must not append to a department\'s permanent, never-pruned log');
});

test('NO credential: 401, nothing stored', async () => {
  const before = (await receipts()).rowCount;
  const r = await post(makeApp(), '/api/cad/generic', 'application/json', '{"a":1}', '');
  assert.equal(r.status, 401);
  assert.equal((await receipts()).rowCount, before);
});

// ── Append-only, enforced by the database ──────────────────────────────────
test('the receipt is append-only in POSTGRES, not merely in policy', async () => {
  const row = (await receipts()).rows[0];
  assert.ok(row, 'need at least one receipt');

  // The test DSN usually connects as the schema OWNER, who legitimately bypasses
  // the REVOKE — so running the UPDATE as-is would SUCCEED, tamper with a real
  // receipt, and still let the test pass down a fallback branch. Assume the app
  // role explicitly and roll back, so this is a statement that genuinely fails
  // if migration 0115's REVOKE is missing, and mutates nothing either way.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE of_app');
    await client.query("SELECT set_config('app.department_id', $1, true)", [String(deptId)]);

    await assert.rejects(
      () => client.query(`UPDATE cad_ingest_log SET raw_body='TAMPERED' WHERE id=$1`, [row.id]),
      /permission denied/i,
      'of_app must not be able to rewrite a receipt'
    );
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }

  // And the bytes are untouched.
  const after = await pool.query(`SELECT raw_body FROM cad_ingest_log WHERE id=$1`, [row.id]);
  assert.equal(after.rows[0].raw_body, row.raw_body, 'the stored bytes must be unchanged');
});

test('DELETE is refused too — these rows are retained forever', async () => {
  const row = (await receipts()).rows[0];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE of_app');
    await client.query("SELECT set_config('app.department_id', $1, true)", [String(deptId)]);
    await assert.rejects(
      () => client.query(`DELETE FROM cad_ingest_log WHERE id=$1`, [row.id]),
      /permission denied/i,
      'of_app must not be able to prune the ingest log'
    );
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
});

// ── Credential redaction: these rows live forever ──────────────────────────
test('credential headers are redacted before storage', () => {
  const out = safeHeaders({
    'authorization': 'Bearer super-secret-value',
    'x-cad-webhook-secret': 'another-secret',
    'content-type': 'application/json',
    'cookie': 'session=should-not-be-kept',
  });
  assert.match(out['authorization'], /^\[redacted sha256:[0-9a-f]{12}\]$/);
  assert.match(out['x-cad-webhook-secret'], /^\[redacted sha256:[0-9a-f]{12}\]$/);
  assert.ok(!JSON.stringify(out).includes('super-secret-value'), 'the secret must never be stored');
  assert.ok(!JSON.stringify(out).includes('another-secret'));
  assert.equal(out['content-type'], 'application/json', 'useful headers are kept');
  assert.equal(out['cookie'], undefined, 'non-allowlisted headers are dropped');
});

test('a receipt failure is surfaced, not swallowed (the 503 path)', async () => {
  // department_id has no matching tenant context / violates the FK-free NOT NULL
  // contract when null — persistReceipt must THROW so the caller can answer 503.
  await assert.rejects(
    () => persistReceipt({
      departmentId: null, vendor: 'generic', rawBody: 'x', headers: {},
    }),
    /null value|not-null|violates/i,
    'persistReceipt must throw rather than quietly returning'
  );
});

test('recordOutcome is best-effort and never throws', async () => {
  const ok = await recordOutcome({
    logEventId: '00000000-0000-0000-0000-000000000000',
    departmentId: deptId, parseStatus: 'parsed', respondedStatus: 200,
  });
  assert.equal(ok, false, 'a bad FK returns false rather than throwing');
});

test('teardown', async () => {
  await pool.query(`DELETE FROM cad_ingest_outcome WHERE department_id=$1`, [deptId]);
  await pool.query(`DELETE FROM cad_ingest_log     WHERE department_id=$1`, [deptId]);
  await pool.query(`DELETE FROM cad_connections    WHERE id=$1`, [connId]);
  await pool.query(`DELETE FROM cad_alerts         WHERE department_id=$1`, [deptId]).catch(() => {});
  await pool.query(`DELETE FROM departments        WHERE id=$1`, [deptId]);
  await pool.end();
  assert.ok(true);
});
