// syncCore.js — the PURE brain of offline sync. No I/O, no IndexedDB, no fetch.
// Storage adapters and the network live elsewhere; everything decidable lives here,
// so it can be unit-tested to death and reused verbatim by the Phase-4 iPad client.
//
// ── THE CONCURRENCY MODEL (settled 2026-07-13, Matt's call) ──────────────────
// ONE INSPECTOR. ONE DEVICE. ONE RECORD.
//   · Inspections are a command (iPad) / web surface. The iPhone companion NEVER
//     authors them, so not even one person on two devices.
//   · Two inspectors filling out the same inspection at the same address at the
//     same time does not happen. Ever.
// Therefore: NO merge engine, NO keep-both, NO resolve card, NO pessimistic lock.
// (The regulated-records literature agrees keep-both is wrong: 21 CFR 11.10(e) —
// one live value + an audit trail. A record holding two competing values for one
// finding is a value no human will swear to.)
//
// What can ACTUALLY go wrong is small, and this module handles all of it:
//   1. A retried write lands twice → CLIENT UUID idempotency key; the server says
//      `duplicate` and we treat that as SUCCESS.
//   2. The record was completed/reassigned server-side while we were offline →
//      the server REJECTS. We surface it loudly and PRESERVE the work. Never a
//      silent drop, never a merge.
//
// ── OFFLINE CANNOT CREATE AN INSPECTION ─────────────────────────────────────
// Every offline write targets an inspection that already exists (the day was
// pre-downloaded). That removes the hardest problem in offline sync — client-minted
// parent ids. It also matches the incumbents, whose offline-created inspections
// aren't workable until they round-trip the server anyway. Ad-hoc field creation is
// a deliberate follow-up, not a silent gap.

/** Ops the outbox knows how to replay, and how each behaves. */
export const OPS = {
  // FULL-REPLACE ops: the payload is the complete new state for that inspection.
  // Only the LAST one queued per inspection needs sending — replaying 60
  // intermediate checklist states is pure waste, and (single author) the last one
  // is the truth. See collapseOutbox().
  'answers.put':       { replace: true,  key: (o) => `answers:${o.inspectionId}` },
  'inspection.patch':  { replace: true,  key: (o) => `inspection:${o.inspectionId}` },
  // PRE-PLAN field edits (2026-07-21). NOT a legal record — tactical building
  // intel — but it rides the SAME brain, because the last silent-failure surface
  // in the field was a sketch whose only sync path was "save again when you have
  // signal." Full-replace per PLAN: the pre-plan id lives in the PAYLOAD
  // (prePlanId) — inspectionId stays null for this op, and only the last queued
  // state per plan needs sending (single author; last write wins, which is also
  // the documented market-wide behavior for field-authored pre-plans).
  'preplan.patch':     { replace: true,  key: (o) => `preplan:${o.payload?.prePlanId}` },
  // APPEND-ONLY ops: inserts, idempotent via clientId. These are the evidentiary
  // spine — a violation cited, a signature, a service record, a served notice.
  // They must NEVER be collapsed or reordered.
  'signature.add':     { replace: false },
  'service.add':       { replace: false },
  'service.mailEvent': { replace: false },
  'notice.upload':     { replace: false },
  // Completion MINTS legal records (the reinspection carrying the open violations, the
  // next cycle). The device does NOT mint them — it queues the INTENT and the SERVER
  // mints on drain, through the same engine the online route uses. Append-only: a
  // completion is a distinct, once-only act, and the idempotency key means a replay is
  // answered `duplicate` rather than completing the inspection twice.
  'inspection.complete': { replace: false },
  // FIELD LOGISTICS (Phase 2.6) — the crew vocabulary. Both APPEND-ONLY:
  // a check completion is a distinct once-only compliance record (result_code
  // is derived by the SERVER on drain — the device never decides pass/fail);
  // a defect flag is an insert the server dedupes against the live defect for
  // the same rig+item (`deduped` on the result — never a copy, never a merge).
  // inspectionId stays null for both. defect.create may carry check_client_id
  // (the clientId of the queued check.complete) — the server resolves it to the
  // real check id through the idempotency ledger; queue the check FIRST.
  'check.complete':    { replace: false },
  'defect.create':     { replace: false },
  // Photos do NOT ride the JSON batch — they go to the multipart photo endpoint.
  // Queueing them into /batch would earn an UNSUPPORTED_OP rejection on every
  // drain, forever. They still live in the SAME outbox (so the unsynced count is
  // honest and nothing is lost); they just leave by a different door.
  'photo.upload':      { replace: false, transport: 'multipart' },
};

/** Ops that ride the JSON batch endpoint. Photos take the multipart path. */
export const isBatchOp = (op) => isKnownOp(op) && OPS[op].transport !== 'multipart';

export const isKnownOp = (op) => Object.prototype.hasOwnProperty.call(OPS, op);

/** RFC4122 v4, crypto-backed where available. This IS the idempotency key. */
export function newClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return `f-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Build an outbox entry. `clientId` is the idempotency key — NEVER regenerate it. */
export function makeEntry(op, inspectionId, payload, now = Date.now()) {
  if (!isKnownOp(op)) throw new Error(`unknown op: ${op}`);
  return {
    clientId: newClientId(),
    op,
    inspectionId,
    payload,
    queuedAt: now,
    clientRecordedAt: new Date(now).toISOString(), // METADATA ONLY — the server owns record timestamps
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    status: 'pending', // pending | rejected
  };
}

/**
 * Collapse redundant full-replace ops. A 40-item checklist answered offline queues
 * 40 `answers.put` entries describing the same inspection; only the last is the
 * truth. Append-only entries are NEVER collapsed — each is a distinct fact.
 * FIFO is otherwise preserved.
 */
export function collapseOutbox(entries) {
  const lastReplaceIndex = new Map();
  entries.forEach((e, i) => {
    const spec = OPS[e.op];
    if (spec?.replace && e.status !== 'rejected') lastReplaceIndex.set(spec.key(e), i);
  });
  return entries.filter((e, i) => {
    const spec = OPS[e.op];
    if (!spec?.replace || e.status === 'rejected') return true;
    return lastReplaceIndex.get(spec.key(e)) === i;
  });
}

/** Exponential backoff with jitter, capped — keeps a flapping connection from melting the API. */
export function backoffMs(attempts, rand = Math.random) {
  const base = Math.min(1000 * 2 ** Math.max(0, attempts - 1), 60000);
  return Math.round(base * (0.7 + rand() * 0.6)); // ±30% jitter
}

/**
 * What the drain loop should send RIGHT NOW: pending, not backing off, FIFO, bounded.
 * Rejected entries are never retried automatically — a human decides.
 */
export function drainBatch(entries, { now = Date.now(), limit = 25 } = {}) {
  return collapseOutbox(entries)
    .filter((e) => e.status === 'pending' && (e.nextAttemptAt || 0) <= now && isBatchOp(e.op))
    .slice(0, limit);
}

/** The photo queue — same outbox, different door (multipart, one at a time). */
export function drainPhotos(entries, { now = Date.now(), limit = 3 } = {}) {
  return entries
    .filter((e) => e.status === 'pending' && (e.nextAttemptAt || 0) <= now
      && OPS[e.op]?.transport === 'multipart')
    .slice(0, limit);
}

// ── WHY A PER-ITEM REJECTION IS *ALWAYS* TERMINAL ───────────────────────────
// The first cut of this had an allow-list of "terminal" codes and RETRIED anything
// else. That is backwards, and it is a live bug: the server can reject for reasons
// retrying will NEVER fix (NOTICE_HASH_MISMATCH, SIGNATURE_TOO_LARGE, BAD_PHOTO,
// UNSUPPORTED_OP…). Anything not on the list would loop forever with backoff —
// burning an inspector's battery in a basement and never once telling them.
//
// Invert it. A per-item `rejected` from the batch endpoint is, by construction, the
// SERVER APPLYING A RULE — the record is finalized, the posting has no photo, the
// hash doesn't match. Those are decisions, not accidents. They are TERMINAL: stop,
// keep the work, and show the human what happened.
//
// Transport and auth failures never arrive as a per-item rejection at all: a 401 or
// a 500 or a dead network fails the whole HTTP call, which lands in
// applyTransportFailure() and keeps every entry queued. So the ONE bug we refuse to
// ship — dropping an inspector's work because a token expired mid-basement — is
// structurally impossible here, not merely guarded against.
//
// The small escape hatch below is for a server that explicitly says "this was me,
// try again" — the only case where a per-item rejection is worth retrying.
//
// ── 🔴 SYNC_UNAVAILABLE + SERVER_ERROR ADDED 2026-07-14 ──────────────────────────────
// These two were MISSING, and the omission inverted the doctrine above for exactly the
// failures it was written to protect. Both are emitted by fiSync as per-item rejections,
// and BOTH ARE THE SERVER'S OWN FAULT, not a rule about the record:
//
//   SYNC_UNAVAILABLE (fiSync.js:651) — the idempotency claim itself failed (a DB blip).
//                    Its own message: "it is still saved on your device."
//   SERVER_ERROR     (fiSync.js:693) — a non-business-rule exception, i.e. we crashed.
//                    Its own message: "it is still saved on your device."
//
// Neither was in this set, so classifyResult() called them `rejected` = TERMINAL. The
// client stopped retrying and told the inspector their work had been REFUSED — while the
// server's own message promised it would be retried. A transient database hiccup in a
// basement presented to a fire officer as a permanent rejection of their inspection.
//
// This is the precise mirror of the bug we fixed on mobile the same day (which treated
// terminal refusals as retryable, and so retried a 422 forever while showing the officer
// "Pass"). Both are the same root error: CONFLATING "THE SERVER REFUSED THIS" WITH "THE
// SERVER FAILED TO DO THIS." They are opposite facts and they need opposite handling.
//
//   Retryable = the record is fine, the infrastructure isn't. Keep trying. Say nothing alarming.
//   Rejected  = the SERVER APPLIED A RULE. Stop. Keep the work. Tell the human, loudly.
//
// The outbox backs these off exponentially (backoffMs) and keeps the work either way, so a
// genuinely dead server degrades into quiet retries rather than a false accusation.
const RETRYABLE_CODES = new Set([
  'DB_UNAVAILABLE', 'TIMEOUT', 'TRY_AGAIN', 'RATE_LIMITED',
  'SYNC_UNAVAILABLE',   // the claim failed — nothing was applied, nothing was decided
  'SERVER_ERROR',       // we threw. That is not a finding about the inspection.
]);

export function classifyResult(result) {
  if (!result) return 'retry';
  if (result.status === 'applied') return 'applied';
  // The server recognized our idempotency key: this write ALREADY landed. That is
  // success, not an error — it is precisely the case idempotency keys exist for.
  if (result.status === 'duplicate') return 'applied';
  if (result.status === 'rejected') {
    return RETRYABLE_CODES.has(result.code) ? 'retry' : 'rejected';
  }
  return 'retry';
}

/**
 * Fold the server's per-item results back into the outbox.
 *   applied/duplicate → drop (it is safely on the server)
 *   rejected          → KEEP, flagged, with the reason. Never silently discarded —
 *                       the inspector must be able to see and recover the work.
 *   retry             → KEEP, attempts++, backoff
 * Entries the server said nothing about are untouched, so a PARTIAL batch never
 * loses anything.
 */
export function applyResults(entries, results, { now = Date.now(), rand = Math.random } = {}) {
  const byId = new Map((results || []).map((r) => [r.clientId, r]));
  const next = [];
  const acked = [];
  const rejected = [];

  // ── 🔴 THE PER-INSPECTION ORDERING BARRIER (added 2026-07-14) ─────────────────
  // The server applies a batch IN ORDER, but ONE OP FAILING NEVER STOPS THE OTHERS
  // (deliberately — an all-or-nothing batch would throw away a day of good work).
  // That opens a trap on a DEPENDENT op:
  //
  //   op1  inspection.patch   → violation marked Corrected   → transient 5xx (retry)
  //   op2  inspection.complete → result: Pass                 → the server still sees
  //                                                             the violation OPEN
  //                                                          → 422 PASS_WITH_OPEN_VIOLATIONS
  //   …op1 then succeeds on the next drain.
  //
  // op2's rejection was an ARTIFACT of op1 not having landed. Flagging it `rejected`
  // (terminal, never retried) would permanently kill a completion for a reason that no
  // longer exists — and tell the inspector they tried to pass a building with an open
  // violation, which on their device they did not. That is the queue lying again, just
  // in a subtler dialect.
  //
  // So: if an EARLIER op for the same inspection did not land in this batch, a LATER
  // op's rejection is NOT trusted — it is downgraded to a retry. It self-resolves: on
  // the next drain the predecessor lands, the dependent is re-sent, and if the server
  // STILL rejects it, no predecessor failed that time and the rejection is believed.
  //
  // A genuine rejection is therefore delayed by one drain, never suppressed. That trade
  // is correct: a false "you tried to pass an unsafe building" is far more costly than a
  // true one arriving seconds later.
  const stalled = new Set();

  for (const e of entries) {
    const r = byId.get(e.clientId);
    if (!r) { next.push(e); continue; }

    const verdict = classifyResult(r);
    if (verdict === 'applied') { acked.push({ ...e, serverId: r.id ?? null }); continue; }

    // Did something earlier for THIS inspection fail to land in this same batch?
    const blocked = e.inspectionId != null && stalled.has(e.inspectionId);

    if (verdict === 'rejected' && !blocked) {
      const flagged = {
        ...e, status: 'rejected',
        lastError: r.message || r.code || 'Rejected by the server',
        code: r.code || null,
      };
      next.push(flagged); rejected.push(flagged);
      if (e.inspectionId != null) stalled.add(e.inspectionId);  // its successors are suspect too
      continue;
    }

    // retry — either a genuinely transient failure, or a rejection we do not trust
    // because a predecessor for this inspection is still in flight.
    if (e.inspectionId != null) stalled.add(e.inspectionId);
    const attempts = e.attempts + 1;
    next.push({
      ...e, attempts,
      nextAttemptAt: now + backoffMs(attempts, rand),
      lastError: blocked
        ? 'Waiting on an earlier change to this inspection — will retry'
        : (r.message || 'Could not sync — will retry'),
    });
  }
  return { entries: next, acked, rejected };
}

/** The whole batch failed (offline, 5xx, DNS). Nothing is lost; everything backs off. */
export function applyTransportFailure(sent, entries, { now = Date.now(), rand = Math.random, message = 'No connection' } = {}) {
  const sentIds = new Set(sent.map((e) => e.clientId));
  return entries.map((e) => {
    if (!sentIds.has(e.clientId) || e.status === 'rejected') return e;
    const attempts = e.attempts + 1;
    return { ...e, attempts, nextAttemptAt: now + backoffMs(attempts, rand), lastError: message };
  });
}

/**
 * The status the header shows. It must be TRUE. We shipped a lie once ("⚠ Save
 * failed — retrying on next change" when nothing retried) and it is not happening
 * again: this never says "saved" while work is queued.
 */
export function syncSummary(entries, { online = true, lastSyncedAt = null, now = Date.now(), storageError = null } = {}) {
  const live = entries.filter((e) => e.status !== 'rejected');
  const rejected = entries.filter((e) => e.status === 'rejected');
  const waiting = live.filter((e) => (e.nextAttemptAt || 0) > now).length;
  const n = (c) => `${c} change${c === 1 ? '' : 's'}`;

  // (B6) If the local store is DEAD, the outbox is empty for the worst possible
  // reason — nothing can be written to it. An empty outbox would otherwise render
  // "All changes saved", which is the exact lie this whole module exists to prevent:
  // the inspector glances at the header, reads "saved", and keeps working into a void.
  if (storageError) {
    return {
      pending: 0, rejected: 0, retrying: 0, online, lastSyncedAt, blocking: true,
      storageError,
      label: 'NOT SAVED — this device cannot store work offline. Stay on signal.',
    };
  }

  return {
    pending: live.length,
    rejected: rejected.length,
    retrying: waiting,
    online,
    lastSyncedAt,
    label: !live.length && !rejected.length
      ? (online ? 'All changes saved' : 'Offline — everything saved on this device')
      : rejected.length
        ? `${n(rejected.length)} need${rejected.length === 1 ? 's' : ''} your attention`
        : online
          ? `Syncing ${n(live.length)}…`
          : `${n(live.length)} saved on this device — will sync when you have signal`,
    blocking: rejected.length > 0,
  };
}
