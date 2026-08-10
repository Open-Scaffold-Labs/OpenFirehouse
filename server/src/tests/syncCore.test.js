'use strict';
// syncCore.test.js — the offline brain. Runs in the server suite (dynamic-imports
// the client ESM module) so one `npm test` covers it.
//
// These tests exist because offline is where field apps quietly lose people's work.
// Each one pins a specific line from the risk register in docs/FI-OFFLINE-GAMEPLAN.md.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const CORE = pathToFileURL(
  path.resolve(__dirname, '../../../client/src/lib/offline/syncCore.js')).href;

const load = () => import(CORE);
const stableRand = () => 0.5; // kill jitter so backoff is assertable

test('syncCore — every entry carries a UUID idempotency key', async () => {
  const { makeEntry } = await load();
  const a = makeEntry('signature.add', 5, { role: 'inspector' });
  const b = makeEntry('signature.add', 5, { role: 'inspector' });
  assert.match(a.clientId, /^[0-9a-f-]{8,}/i);
  assert.notEqual(a.clientId, b.clientId, 'two distinct facts get distinct keys');
  assert.equal(a.status, 'pending');
  assert.equal(a.attempts, 0);
});

test('syncCore — R5: a DUPLICATE is SUCCESS, not an error', async () => {
  const { makeEntry, applyResults } = await load();
  // The request landed; the ack didn't. The device retries. The server recognizes
  // the key and says "duplicate". If we treated that as failure we would retry
  // forever; if we ignored the key we would cite the violation TWICE on a legal
  // record. This is the single most likely "conflict" in the field.
  const e = makeEntry('service.add', 5, { method: 'personal_service' });
  const { entries, acked } = applyResults([e], [{ clientId: e.clientId, status: 'duplicate' }]);
  assert.equal(entries.length, 0, 'the entry leaves the outbox');
  assert.equal(acked.length, 1, 'and is counted as delivered');
});

test('syncCore — R3: an expired token NEVER drops the work', async () => {
  const { makeEntry, applyTransportFailure, drainBatch } = await load();
  // The nightmare: an inspector works two hours in a basement, the token expires,
  // a naive outbox 401s and discards the queue.
  // A 401 fails the WHOLE HTTP call — it is not a per-item rejection. So it lands
  // here, and every entry stays queued. Structurally impossible to lose the work.
  const queued = [
    makeEntry('inspection.patch', 5, { violations: [{ code: '1001' }] }),
    makeEntry('signature.add', 5, {}),
  ];
  const t0 = 1_000_000;
  const after = applyTransportFailure(queued, queued,
    { now: t0, rand: stableRand, message: 'Signed out — will retry after refresh' });

  assert.equal(after.length, 2, 'nothing dropped');
  assert.ok(after.every((e) => e.status === 'pending'), 'all still pending');
  assert.ok(after.every((e) => e.attempts === 1), 'just a retry, not a failure');
  assert.equal(drainBatch(after, { now: t0 + 5000 }).length, 2, 'and they go again once the token refreshes');
});

test('syncCore — a per-item rejection is TERMINAL BY DEFAULT (no infinite retry loop)', async () => {
  const { makeEntry, classifyResult, applyResults, drainBatch } = await load();
  // The bug this kills: the first cut allow-listed "terminal" codes and RETRIED
  // everything else. A NOTICE_HASH_MISMATCH — which retrying can never fix — would
  // have looped forever, burning an inspector's battery and never telling them.
  // A per-item rejection is the server APPLYING A RULE. It is a decision, not an
  // accident. Terminal.
  for (const code of ['NOTICE_HASH_MISMATCH', 'SIGNATURE_TOO_LARGE', 'BAD_PHOTO',
                      'UNSUPPORTED_OP', 'SOMETHING_WE_HAVE_NOT_INVENTED_YET']) {
    assert.equal(classifyResult({ status: 'rejected', code }), 'rejected',
      `${code} must not be retried forever`);
  }
  // The only escape hatch: the server explicitly says "that was me, try again".
  assert.equal(classifyResult({ status: 'rejected', code: 'DB_UNAVAILABLE' }), 'retry');

  // ── 🔴 THE OTHER HALF OF THE ESCAPE HATCH, ADDED 2026-07-14 ─────────────────────────
  // These two ARE the server saying "that was me" — and they were MISSING from the set, so
  // the client called them terminal and told the inspector their work had been REFUSED.
  //   SYNC_UNAVAILABLE — the idempotency claim failed (a DB blip). Nothing was applied.
  //   SERVER_ERROR     — a non-business-rule exception, i.e. WE crashed.
  // Both are emitted by fiSync with a message that literally promises "it is still saved on
  // your device" — a promise the client was breaking. A transient database hiccup in a
  // basement must never be presented to a fire officer as a rejection of their inspection.
  //
  // The distinction, which is the whole point of this classifier:
  //   "the server REFUSED this"  ≠  "the server FAILED to do this."
  for (const code of ['SYNC_UNAVAILABLE', 'SERVER_ERROR']) {
    assert.equal(classifyResult({ status: 'rejected', code }), 'retry',
      `${code} is the SERVER's failure, not a finding about the record — it must be retried, not blamed on the inspector`);
  }
  // …and the business rules on the other side of the line stay TERMINAL. A building does not
  // pass on the 400th attempt.
  for (const code of ['PASS_WITH_OPEN_VIOLATIONS', 'RECORD_FINALIZED', 'COMPLETION_VIA_ENGINE', 'INVALID_RESULT']) {
    assert.equal(classifyResult({ status: 'rejected', code }), 'rejected',
      `${code} is a DECISION about the record — retrying it forever is how the app starts lying`);
  }

  const e = makeEntry('notice.upload', 5, {});
  const { entries } = applyResults([e], [{ clientId: e.clientId, status: 'rejected', code: 'NOTICE_HASH_MISMATCH' }]);
  assert.equal(entries[0].status, 'rejected');
  assert.equal(drainBatch(entries).length, 0, 'and it stops being sent');

  // A SERVER_ERROR keeps the entry IN FLIGHT (retryable) rather than flagging it rejected.
  const e2 = makeEntry('inspection.complete', 6, {});
  const r2 = applyResults([e2], [{ clientId: e2.clientId, status: 'rejected', code: 'SERVER_ERROR' }]);
  assert.notEqual(r2.entries[0].status, 'rejected',
    'a server crash must not be recorded against the inspector as a refusal');
});

// ── THE PER-INSPECTION ORDERING BARRIER (2026-07-14) ─────────────────────────────────
// The trap: the server applies a batch in order but does NOT stop on a failure. So a
// dependent op can be rejected for a reason caused by its own predecessor not landing.
test('syncCore — a dependent op is NOT rejected when its predecessor stalled', async (t) => {
  const { makeEntry, applyResults, drainBatch } = await load();

  // Same inspection. op1 corrects the violation; op2 completes with a Pass.
  const patch    = makeEntry('inspection.patch', 42, { violations: [{ status: 'Corrected' }] });
  const complete = makeEntry('inspection.complete', 42, { result: 'Pass', completedDate: '2026-07-14' });

  // op1 hits a transient 5xx. op2 therefore reaches a server that still sees the violation
  // OPEN, and is refused 422 — an artifact, not a finding.
  const out = applyResults([patch, complete], [
    { clientId: patch.clientId,    status: 'rejected', code: 'SERVER_ERROR' },
    { clientId: complete.clientId, status: 'rejected', code: 'PASS_WITH_OPEN_VIOLATIONS' },
  ]);

  assert.equal(out.rejected.length, 0,
    'neither op may be flagged rejected: op1 is transient, and op2 was only refused BECAUSE op1 had not landed');
  const done = out.entries.find((e) => e.clientId === complete.clientId);
  assert.equal(done.status, 'pending',
    'the completion must stay in flight — killing it would tell the inspector they tried to pass an unsafe building, which they did not');
  assert.match(done.lastError, /Waiting on an earlier change/);

  await t.test('…and once the predecessor lands, a REAL rejection is believed', () => {
    // Next drain: op1 applies. op2 is re-sent and STILL refused — now with no predecessor
    // failure to explain it. This time the refusal is real and must stick.
    const out2 = applyResults([done], [
      { clientId: done.clientId, status: 'rejected', code: 'PASS_WITH_OPEN_VIOLATIONS',
        message: 'Cannot record a passing result with 1 unabated violation' },
    ]);
    assert.equal(out2.rejected.length, 1, 'a genuine refusal is delayed by one drain, never suppressed');
    assert.equal(out2.entries[0].status, 'rejected');
    assert.equal(out2.entries[0].code, 'PASS_WITH_OPEN_VIOLATIONS');
    assert.equal(drainBatch(out2.entries).length, 0, 'and it stops being sent');
  });

  await t.test('a rejection also stalls its OWN successors — they are equally suspect', () => {
    const a = makeEntry('inspection.patch', 7, { notes: 'x' });
    const b = makeEntry('inspection.complete', 7, { result: 'Pass', completedDate: '2026-07-14' });
    const out3 = applyResults([a, b], [
      { clientId: a.clientId, status: 'rejected', code: 'RECORD_FINALIZED' },
      { clientId: b.clientId, status: 'rejected', code: 'PASS_WITH_OPEN_VIOLATIONS' },
    ]);
    assert.equal(out3.rejected.length, 1, 'only the FIRST failure is reported as a refusal');
    assert.equal(out3.rejected[0].clientId, a.clientId);
    assert.equal(out3.entries.find((e) => e.clientId === b.clientId).status, 'pending');
  });

  await t.test('an UNRELATED inspection in the same batch is unaffected', () => {
    const mine   = makeEntry('inspection.patch', 1, { notes: 'a' });
    const theirs = makeEntry('inspection.complete', 2, { result: 'Pass', completedDate: '2026-07-14' });
    const out4 = applyResults([mine, theirs], [
      { clientId: mine.clientId,   status: 'rejected', code: 'SERVER_ERROR' },
      { clientId: theirs.clientId, status: 'rejected', code: 'PASS_WITH_OPEN_VIOLATIONS' },
    ]);
    assert.equal(out4.rejected.length, 1, 'inspection 2 has no stalled predecessor — its refusal is real');
    assert.equal(out4.rejected[0].clientId, theirs.clientId);
  });
});

// THE LOST-ACK CASE — the bug that made the rejection banner lie in the OTHER direction.
test('syncCore — a replayed completion is SUCCESS, not a refusal', async () => {
  const { makeEntry, applyResults, classifyResult } = await load();
  // The POST landed; the ack died with the cell. The device retries the SAME clientId.
  // The server recognizes the idempotency key and answers `duplicate`. That is the whole
  // point of the key: it is success. Marking it rejected would tell a fire officer their
  // completed inspection had been REFUSED while it sat in the database.
  assert.equal(classifyResult({ status: 'duplicate' }), 'applied');

  const e = makeEntry('inspection.complete', 9, { result: 'Pass', completedDate: '2026-07-14' });
  const out = applyResults([e], [{ clientId: e.clientId, status: 'duplicate', id: 9 }]);
  assert.equal(out.acked.length, 1, 'a duplicate is acknowledged, not rejected');
  assert.equal(out.rejected.length, 0);
  assert.equal(out.entries.length, 0, 'and it leaves the outbox');
});

test('syncCore — photos ride the multipart door, never the JSON batch', async () => {
  const { makeEntry, drainBatch, drainPhotos } = await load();
  // A photo queued into /batch would be rejected UNSUPPORTED_OP on every drain,
  // forever. Same outbox (so the unsynced count stays honest) — different door.
  const photo = makeEntry('photo.upload', 5, { violationId: 'abc' });
  const sig = makeEntry('signature.add', 5, {});

  const batch = drainBatch([photo, sig]);
  assert.deepEqual(batch.map((e) => e.op), ['signature.add'], 'the photo is NOT in the JSON batch');
  const photos = drainPhotos([photo, sig]);
  assert.deepEqual(photos.map((e) => e.op), ['photo.upload'], 'it goes out the multipart door');
});

test('syncCore — R8: a business rejection is KEPT and flagged, never discarded', async () => {
  const { makeEntry, applyResults } = await load();
  // The record was finalized while we were offline. Retrying can never fix that —
  // but the inspector's work must not evaporate. Keep it, flag it, show the reason.
  const e = makeEntry('inspection.patch', 5, { violations: [] });
  const { entries, rejected } = applyResults(
    [e], [{ clientId: e.clientId, status: 'rejected', code: 'RECORD_FINALIZED',
            message: 'This inspection is completed — its findings are a finalized legal record.' }]);
  assert.equal(entries.length, 1, 'still in the outbox — recoverable');
  assert.equal(entries[0].status, 'rejected');
  assert.match(entries[0].lastError, /finalized legal record/);
  assert.equal(rejected.length, 1, 'and surfaced to the human');
});

test('syncCore — R4: a PARTIAL batch never loses the items the server said nothing about', async () => {
  const { makeEntry, applyResults } = await load();
  const a = makeEntry('signature.add', 5, {});
  const b = makeEntry('service.add', 5, {});
  const c = makeEntry('photo.upload', 5, {});
  const { entries, acked } = applyResults([a, b, c], [{ clientId: a.clientId, status: 'applied' }]);
  assert.equal(acked.length, 1);
  assert.deepEqual(entries.map((e) => e.clientId), [b.clientId, c.clientId],
    'b and c are untouched, not dropped');
});

test('syncCore — full-replace ops collapse; append-only facts NEVER do', async () => {
  const { makeEntry, collapseOutbox, drainBatch } = await load();
  // 40 checklist taps = 40 answers.put for one inspection. Only the last is the
  // truth (single author). But three cited violations are three DISTINCT FACTS and
  // every one must reach the server.
  const answers = [1, 2, 3, 4].map((i) => makeEntry('answers.put', 5, { answers: [i] }));
  const sigs = [1, 2].map(() => makeEntry('signature.add', 5, {}));
  const other = makeEntry('answers.put', 9, { answers: ['other inspection'] });

  const collapsed = collapseOutbox([...answers, ...sigs, other]);
  const kept = collapsed.filter((e) => e.op === 'answers.put' && e.inspectionId === 5);
  assert.equal(kept.length, 1, 'only ONE answers.put survives for inspection 5');
  assert.deepEqual(kept[0].payload.answers, [4], 'and it is the LAST one — the truth');
  assert.equal(collapsed.filter((e) => e.op === 'signature.add').length, 2,
    'both signatures survive — append-only facts are never collapsed');
  assert.ok(collapsed.includes(other), 'a different inspection is unaffected');

  assert.equal(drainBatch([...answers, ...sigs, other]).length, 4);
});

test('syncCore — preplan.patch collapses PER PLAN (payload key), rides the batch, never crosses plans', async () => {
  const { makeEntry, collapseOutbox, isBatchOp, drainBatch } = await load();
  // The pre-plan id lives in the PAYLOAD (inspectionId is null for this op) — the
  // collapse key must come from there, or sixty basement autosaves of plan A would
  // collapse away plan B's sketch. Last write per PLAN is the truth (single author,
  // LWW — the settled call, 2026-07-21).
  const planA = [1, 2, 3].map((i) => makeEntry('preplan.patch', null, { prePlanId: 7, tacticalSketch: [i] }));
  const planB = makeEntry('preplan.patch', null, { prePlanId: 8, tacticalSketch: ['B'] });
  const sig = makeEntry('signature.add', 5, {});

  const collapsed = collapseOutbox([...planA, planB, sig]);
  const keptA = collapsed.filter((e) => e.op === 'preplan.patch' && e.payload.prePlanId === 7);
  assert.equal(keptA.length, 1, 'only ONE preplan.patch survives for plan 7');
  assert.deepEqual(keptA[0].payload.tacticalSketch, [3], 'and it is the LAST one — the truth');
  assert.ok(collapsed.includes(planB), 'a different plan is unaffected');
  assert.ok(collapsed.includes(sig), 'append-only facts are unaffected');

  assert.equal(isBatchOp('preplan.patch'), true, 'preplan.patch rides the JSON batch, not multipart');
  assert.equal(drainBatch([...planA, planB, sig]).length, 3, 'collapsed drain: last-of-A + B + the signature');
});

test('syncCore — R6: backoff grows, is capped, and a rejected entry never auto-retries', async () => {
  const { backoffMs, makeEntry, drainBatch, applyResults } = await load();
  assert.equal(backoffMs(1, stableRand), 1000);
  assert.equal(backoffMs(2, stableRand), 2000);
  assert.equal(backoffMs(3, stableRand), 4000);
  assert.equal(backoffMs(99, stableRand), 60000, 'capped — never an hour-long stall');

  const e = makeEntry('service.add', 5, {});
  const { entries } = applyResults([e], [{ clientId: e.clientId, status: 'rejected', code: 'RECORD_FINALIZED' }]);
  assert.equal(drainBatch(entries).length, 0, 'a rejected entry is never sent again automatically');
});

test('syncCore — a backing-off entry is not re-sent until its time comes', async () => {
  const { makeEntry, applyResults, drainBatch } = await load();
  const e = makeEntry('service.add', 5, {});
  const t0 = 1_000_000;
  // TIMEOUT is one of the few codes where the server says "that was me, try again".
  const { entries } = applyResults([e], [{ clientId: e.clientId, status: 'rejected', code: 'TIMEOUT' }],
    { now: t0, rand: stableRand });
  assert.equal(drainBatch(entries, { now: t0 + 100 }).length, 0, 'still cooling down');
  assert.equal(drainBatch(entries, { now: t0 + 5000 }).length, 1, 'ready again');
});

test('syncCore — R9: the status label NEVER lies', async () => {
  const { makeEntry, syncSummary, applyResults } = await load();
  // We shipped "⚠ Save failed — retrying on next change" once, and nothing retried.
  // The label must never claim saved-ness we do not have.
  assert.match(syncSummary([], { online: true }).label, /All changes saved/);

  const queued = [makeEntry('answers.put', 5, {}), makeEntry('photo.upload', 5, {})];
  const offline = syncSummary(queued, { online: false });
  assert.match(offline.label, /2 changes saved on this device/);
  assert.doesNotMatch(offline.label, /All changes saved/, 'never claims saved while work is queued');
  assert.equal(offline.pending, 2);

  const { entries } = applyResults(queued, [{ clientId: queued[0].clientId, status: 'rejected', code: 'RECORD_FINALIZED' }]);
  const s = syncSummary(entries, { online: true });
  assert.match(s.label, /needs your attention/);
  assert.equal(s.blocking, true, 'a rejection demands a human');
});

test('syncCore — B6: a DEAD local store must never read as "All changes saved"', async () => {
  const { syncSummary } = await load();
  // The nastiest lie available to us. If IndexedDB is unavailable the outbox is empty
  // — for the worst possible reason: nothing CAN be written to it. The old code fell
  // through to "All changes saved", and the inspector glances at the header, reads
  // "saved", and keeps working into a void.
  const dead = syncSummary([], { online: true, storageError: 'IndexedDB unavailable' });
  assert.notEqual(dead.label, 'All changes saved');
  assert.match(dead.label, /NOT SAVED/);
  assert.equal(dead.blocking, true, 'a device that cannot save work must demand attention');
});

test('syncCore — offline with an empty queue is honest, not alarming', async () => {
  const { syncSummary } = await load();
  const s = syncSummary([], { online: false });
  assert.match(s.label, /Offline — everything saved on this device/);
  assert.equal(s.blocking, false);
});

test('syncCore — an unknown op is refused at the door', async () => {
  const { makeEntry } = await load();
  assert.throws(() => makeEntry('inspection.delete', 5, {}), /unknown op/,
    'the outbox will not replay something it does not understand');
});

// ── Phase 2.6 — field-logistics vocabulary ───────────────────────────────────

test('syncCore 2.6 — check.complete + defect.create are known, batchable, APPEND-ONLY', async () => {
  const { makeEntry, collapseOutbox, drainBatch, isBatchOp } = await load();
  assert.ok(isBatchOp('check.complete'), 'check.complete rides the JSON batch');
  assert.ok(isBatchOp('defect.create'), 'defect.create rides the JSON batch');

  // Two checks queued back-to-back are DISTINCT records — the outbox must never
  // collapse them the way it collapses full-replace ops (a collapsed morning check
  // would silently erase a compliance record).
  const c1 = makeEntry('check.complete', null, { template_id: 1, check_date: '2026-07-26' });
  const c2 = makeEntry('check.complete', null, { template_id: 1, check_date: '2026-07-26' });
  const d1 = makeEntry('defect.create', null, { apparatus_id: 9, title: 'Slow air build', check_client_id: c1.clientId });
  const collapsed = collapseOutbox([c1, c2, d1]);
  assert.equal(collapsed.length, 3, 'append-only ops are never collapsed');

  // FIFO drain preserves check-before-defect, so the server ledger can resolve
  // check_client_id linkage in the same batch.
  const batch = drainBatch([c1, d1], { now: Date.now() + 1 });
  assert.equal(batch[0].clientId, c1.clientId, 'the check drains FIRST');
  assert.equal(batch[1].clientId, d1.clientId);
  assert.equal(c1.inspectionId, null, 'null inspectionId keeps them clear of the per-inspection barrier');
});
