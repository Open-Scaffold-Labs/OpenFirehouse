'use strict';
/**
 * radioIngestBody.test.js — a mislabelled radio post must never be accepted and
 * discarded.
 *
 * THE DEFECT (reproduced against the real parser before the fix, 2026-07-27):
 * the global express.json() parses only `application/json`. The station gateway
 * posting the identical body as text/plain, form-urlencoded, or with no
 * content-type left `req.body === {}`, so `entries` became `[{}]`, the
 * transcript check skipped it, and the station was answered
 * `200 {ok:true, count:0}` — transcript gone, sender told it succeeded.
 *
 * Found while fixing the same class in CAD ingest (4C.2). `routes/avl.js` was
 * ALREADY immune because it mounts a catch-all text parser behind json; this
 * route is now fixed the same way. That is the transferable point: the pattern
 * was understood in this codebase and simply not applied uniformly.
 *
 * These tests exercise the PARSER + normalizer, which is where the bug lived —
 * no DB, so they run everywhere.
 */
const test    = require('node:test');
const assert  = require('node:assert');
const express = require('express');

const { normalizeEntries, parsers } = require('../routes/radioIngest');

/** Mount the real parsers + normalizer exactly as the route does. */
function makeApp() {
  const app = express();
  app.use(express.json()); // the global parser, mounted first, as in index.js
  app.post('/api/radio-ingest', ...parsers, (req, res) => {
    const norm = normalizeEntries(req.body);
    if (norm.error) return res.status(400).json({ error: norm.error, code: 'RADIO_UNPARSEABLE' });
    let skipped = 0;
    const kept = [];
    for (const e of norm.entries) {
      if (!e || typeof e !== 'object' || !e.transcript || String(e.transcript).trim() === '') { skipped++; continue; }
      kept.push(e);
    }
    res.json({ ok: true, count: kept.length, received: norm.entries.length, skipped });
  });
  return app;
}

async function post(ct, body) {
  const app = makeApp();
  const srv = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try {
    const headers = ct ? { 'content-type': ct } : {};
    const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/radio-ingest`, { method: 'POST', headers, body });
    return { status: res.status, json: await res.json().catch(() => null) };
  } finally { srv.close(); }
}

const TRANSCRIPT = JSON.stringify({ transcript: 'Engine 1 on scene, working fire' });

// ── the regression ──────────────────────────────────────────────────────────
for (const ct of ['text/plain', 'application/x-www-form-urlencoded', '']) {
  test(`a real transcript sent as "${ct || '(no content-type)'}" is STORED, not silently dropped`, async () => {
    const r = await post(ct, TRANSCRIPT);
    assert.equal(r.status, 200);
    assert.equal(r.json.count, 1,
      'this returned count:0 with a 200 before the fix — transcript discarded, sender told it succeeded');
    assert.equal(r.json.skipped, 0);
  });
}

test('the correct content-type still works exactly as before', async () => {
  const r = await post('application/json', TRANSCRIPT);
  assert.equal(r.status, 200);
  assert.equal(r.json.count, 1);
});

test('a batch is still accepted', async () => {
  const r = await post('application/json', JSON.stringify([
    { transcript: 'Command to Engine 2' },
    { transcript: 'Engine 2 copy' },
  ]));
  assert.equal(r.json.count, 2);
  assert.equal(r.json.received, 2);
});

// ── unreadable is REFUSED, never acknowledged as zero ───────────────────────
test('malformed JSON -> 400, not a cheerful zero (refused UPSTREAM by the global parser)', async () => {
  const r = await post('application/json', '{"transcript": TRUNCATED');
  // Two different refusals, and the difference is worth stating because it is
  // exactly what made the CAD case hard:
  //   - content-type application/json + bad bytes -> the GLOBAL express.json()
  //     throws inside the middleware chain and express answers 400 with an HTML
  //     page. This route is never entered, so there is no RADIO_UNPARSEABLE code
  //     and `r.json` is null.
  //   - any other content-type -> our text parser accepts it, normalizeEntries
  //     runs, and refuses with a 400 + RADIO_UNPARSEABLE.
  // Both are a REFUSAL, which is all that matters here: the gateway learns it
  // failed and nothing is silently discarded. CAD could not accept the upstream
  // refusal because NENA-STA-024 gives the sender no retry, so those bytes had to
  // be captured ahead of the parser; radio has a retryable client and no
  // archival duty, so a plain 400 is correct and proportionate.
  assert.equal(r.status, 400, 'must refuse, so the gateway learns it failed');
  if (r.json) assert.equal(r.json.code, 'RADIO_UNPARSEABLE');
});

test('malformed body under a WRONG content-type is also refused', async () => {
  const r = await post('text/plain', '{"transcript": TRUNCATED');
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'RADIO_UNPARSEABLE');
});

test('an empty body is refused rather than counted as zero', async () => {
  const r = await post('text/plain', '');
  assert.equal(r.status, 400);
});

test('a bare scalar is refused (valid JSON, not an entry)', async () => {
  const r = await post('application/json', '42');
  assert.equal(r.status, 400);
});

// ── skips are reported, never swallowed ────────────────────────────────────
test('an entry with no transcript is COUNTED as skipped, not invisible', async () => {
  const r = await post('application/json', JSON.stringify([
    { transcript: 'Engine 1 responding' },
    { note: 'no transcript field' },
    { transcript: '   ' },
  ]));
  assert.equal(r.json.count, 1);
  assert.equal(r.json.received, 3);
  assert.equal(r.json.skipped, 2,
    'a sender must be able to tell that 2 of its 3 entries were dropped');
});

// ── the normalizer, directly ────────────────────────────────────────────────
test('normalizeEntries reports errors instead of returning an empty batch', () => {
  assert.ok(normalizeEntries('not json').error);
  assert.ok(normalizeEntries('').error);
  assert.ok(normalizeEntries(null).error);
  assert.ok(normalizeEntries(42).error);
  assert.ok(normalizeEntries([]).error, 'an empty array is not a silent success');
  assert.equal(normalizeEntries({ transcript: 'x' }).entries.length, 1);
  assert.equal(normalizeEntries('{"transcript":"x"}').entries.length, 1, 'a JSON string body is parsed');
  assert.equal(normalizeEntries([{ transcript: 'a' }, { transcript: 'b' }]).entries.length, 2);
});
