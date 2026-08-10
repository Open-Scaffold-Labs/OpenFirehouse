// syncCore-parity.sketch.mjs — cross-client parity CONTRACT (Layer 1).
//
// SKETCH / HAND-OFF: belongs in the server node:test suite (next to
// server/src/tests/syncCore.test.js). Parked in e2e/ only because that's the
// collision-free surface right now. See README.md in this folder.
//
// Proves the thing the SHA check cannot: given the SAME offline field-day fixture
// and the SAME fault, the web PWA and the native Expo app land the IDENTICAL
// DB-bound end-state on reconnect. Both clients drive the same generated syncCore,
// so divergence would come only from generation drift (covered elsewhere) or a
// client feeding syncCore different inputs — which THIS pins.
//
// Runnable today against the committed web syncCore (golden-sanity + determinism).
// The web-vs-native parity assertion is skipped until E2E_SYNCCORE_NATIVE is set.

import { test } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_CORE = process.env.E2E_SYNCCORE_WEB
  ? path.resolve(process.env.E2E_SYNCCORE_WEB)
  : path.resolve(HERE, '../../client/src/lib/offline/syncCore.js');
const NATIVE_CORE = process.env.E2E_SYNCCORE_NATIVE ? path.resolve(process.env.E2E_SYNCCORE_NATIVE) : null;

const load = (p) => import(pathToFileURL(p).href);
const NOW = 1_700_000_000_000;          // fixed clock — determinism
const stableRand = () => 0.5;           // kill backoff jitter

// ── The canonical offline field-day fixture ────────────────────────────────
// A full inspection walked with the radio dead. `tag` lets us compare ops
// semantically (the random clientId idempotency keys must NOT affect parity).
function fieldDay(core) {
  const { makeEntry } = core;
  const I = 42; // inspection id
  const e = [];
  // 5 checklist states for the same inspection — collapseOutbox keeps only the last.
  for (let k = 1; k <= 5; k++) e.push({ ...makeEntry('answers.put', I, { tag: `answers`, k }, NOW + k), _tag: 'answers' });
  e.push({ ...makeEntry('inspection.patch', I, { tag: 'patch', result: 'fail' }, NOW + 10), _tag: 'patch' });
  e.push({ ...makeEntry('signature.add', I, { tag: 'sig', role: 'inspector' }, NOW + 11), _tag: 'sig' });
  e.push({ ...makeEntry('notice.upload', I, { tag: 'notice' }, NOW + 12), _tag: 'notice' });
  e.push({ ...makeEntry('service.add', I, { tag: 'service', outcome: 'refused' }, NOW + 13), _tag: 'service' });
  e.push({ ...makeEntry('photo.upload', I, { tag: 'photo' }, NOW + 14), _tag: 'photo' }); // multipart — different door
  return e;
}

const sem = (arr) => arr.map((x) => ({ op: x.op, inspectionId: x.inspectionId, tag: x.payload?.tag ?? null, status: x.status }));

// ── Compute the DB-bound end-state a fault produces, through the real syncCore ──
// Returns { committed, residualPending, residualRejected, summaryClaimsSaved } —
// clientIds normalized away, so it's comparable across clients.
function endState(core, fault) {
  const { drainBatch, applyResults, applyTransportFailure, syncSummary } = core;
  const outbox = fieldDay(core);
  const batch = drainBatch(outbox, { now: NOW + 100 });   // what goes to /batch now (photos excluded)

  let next, acked = [], rejected = [];
  if (fault === 'disconnect') {
    next = applyTransportFailure(batch, outbox, { now: NOW + 100, rand: stableRand });
  } else {
    const results = batch.map((en) => {
      if (fault === 'reject-notice' && en.op === 'notice.upload') return { clientId: en.clientId, status: 'rejected', code: 'NOTICE_HASH_MISMATCH', message: 'hash mismatch' };
      if (fault === 'duplicate') return { clientId: en.clientId, status: 'duplicate' };
      return { clientId: en.clientId, status: 'applied', id: 900 + (en.inspectionId ?? 0) };
    });
    const r = applyResults(outbox, results, { now: NOW + 100, rand: stableRand });
    next = r.entries; acked = r.acked; rejected = r.rejected;
  }
  const summary = syncSummary(next, { online: true, now: NOW + 100 });
  return {
    committed: sem(acked),
    residualPending: sem(next.filter((x) => x.status === 'pending')),
    residualRejected: sem(next.filter((x) => x.status === 'rejected')),
    // The header must NEVER claim "saved" while anything is still queued.
    summaryClaimsSaved: summary.pending === 0,
  };
}

const FAULTS = ['clean', 'disconnect', 'reject-notice', 'duplicate'];

// ── Golden-sanity: the contract each fault must satisfy (runs against web core) ──
test('parity contract — clean reconnect commits every batch op, photo still queued, no false "saved"', async () => {
  const core = await load(WEB_CORE);
  const s = endState(core, 'clean');
  const tags = s.committed.map((c) => c.tag);
  assert.deepEqual(tags, ['answers', 'patch', 'sig', 'notice', 'service'], 'all batch ops commit, answers collapsed to one');
  // The multipart photo leaves by a different door, so it's still queued. (Superseded
  // answers.put entries also linger — collapse is a drain-time view, not a mutation —
  // and appear identically on both clients, so they don't affect parity.)
  assert.ok(s.residualPending.some((p) => p.tag === 'photo'), 'the multipart photo is still queued');
  assert.ok(!s.residualPending.some((p) => ['patch', 'sig', 'notice', 'service'].includes(p.tag)),
    'no append-only batch op lingers after it acks');
  assert.equal(s.summaryClaimsSaved, false, 'never claims saved while the photo is queued');
});

test('parity contract — mid-save disconnect loses NOTHING and commits nothing', async () => {
  const core = await load(WEB_CORE);
  const s = endState(core, 'disconnect');
  assert.equal(s.committed.length, 0, 'a dropped connection commits nothing');
  assert.equal(s.residualRejected.length, 0, 'and rejects nothing — it all stays queued to retry');
  assert.ok(s.residualPending.length >= 5, 'every entry survives, backed off');
});

test('parity contract — a rejected notice is KEPT and flagged, never silently dropped', async () => {
  const core = await load(WEB_CORE);
  const s = endState(core, 'reject-notice');
  assert.deepEqual(s.residualRejected.map((r) => r.tag), ['notice'], 'the rejected op is retained, flagged');
  assert.ok(!s.committed.some((c) => c.tag === 'notice'), 'and is not reported as committed');
});

test('parity contract — a duplicate is SUCCESS (idempotency), not an error', async () => {
  const core = await load(WEB_CORE);
  const s = endState(core, 'duplicate');
  assert.ok(s.committed.some((c) => c.tag === 'notice'), 'duplicate acks resolve as applied');
  assert.equal(s.residualRejected.length, 0, 'no duplicate is treated as a rejection');
});

test('parity contract — end-state is deterministic (prerequisite for cross-client parity)', async () => {
  const core = await load(WEB_CORE);
  for (const f of FAULTS) {
    assert.deepEqual(endState(core, f), endState(core, f), `fault "${f}" must be deterministic`);
  }
});

// ── The parity assertion — hand-off (set E2E_SYNCCORE_NATIVE to run) ──────────
test('web and native land the IDENTICAL end-state for every fault', async (t) => {
  if (!NATIVE_CORE) {
    t.skip('set E2E_SYNCCORE_NATIVE to the native app\'s generated syncCore (or replay this golden in the mobile jest-expo suite)');
    return;
  }
  const web = await load(WEB_CORE);
  const native = await load(NATIVE_CORE);
  for (const f of FAULTS) {
    assert.deepEqual(endState(native, f), endState(web, f), `web and native diverge on fault "${f}"`);
  }
});
