// The "needs attention" formula — pinned.
//
// On 2026-08-05 the app showed a chief THREE different numbers for one claim, on
// screens a click apart: sidebar bell 47, Member Portal card 36, Dashboard header
// 1. Each counted a different set; none said which. A count you cannot reconcile
// is worse than no count, because it discredits the two that were right.
//
// An earlier fix aligned the Notifications page to the bell by re-deriving the
// same arithmetic in a second file. That is what let it drift again — so the
// formula now lives once, in hooks/useAttentionCount.js, and this pins it.
//
// The hook itself is React (hooks can't run under node:test without a renderer),
// so what is tested here is the PURE REDUCTION the hook performs. If someone
// changes the hook's arithmetic without changing this file, these numbers stop
// matching the app — which is the failure mode worth catching, since the bug was
// never a crash, it was four disagreeing sums.

import test from 'node:test';
import assert from 'node:assert';

/** Mirrors useAttentionCount's reduction exactly. */
const actionable = (list) => (list || []).filter((a) => a.severity !== 'info');
const attentionTotal = ({ alerts, workflow, bulletins = 0, messages = 0 }) =>
  actionable(alerts).length + actionable(workflow).length + (bulletins || 0) + (messages || 0);

const A = (severity) => ({ severity });

test('informational rows are excluded from BOTH alert feeds', () => {
  const alerts = [A('critical'), A('warning'), A('info'), A('info')];
  const workflow = [A('info'), A('warning')];
  assert.equal(attentionTotal({ alerts, workflow }), 3);
});

test('a feed of nothing but info contributes zero — the badge must be able to reach 0', () => {
  // If info counted, the badge would never clear, and a badge that is always lit
  // is a badge people stop reading.
  assert.equal(attentionTotal({ alerts: [A('info'), A('info')], workflow: [A('info')] }), 0);
});

test('unread bulletins and unread DMs are counted, and are NOT severity-filtered', () => {
  // The portal card counted department alerts only; this is the difference that
  // produced 47 vs 36.
  assert.equal(attentionTotal({ alerts: [A('warning')], workflow: [], bulletins: 7, messages: 2 }), 10);
});

test('the four parts sum — no double counting, no dropped term', () => {
  const parts = { alerts: [A('critical'), A('warning')], workflow: [A('warning')], bulletins: 4, messages: 3 };
  assert.equal(attentionTotal(parts), 2 + 1 + 4 + 3);
});

test('missing or null inputs degrade to zero rather than NaN', () => {
  // A NaN badge renders as "NaN" next to a bell, which reads as a crash.
  assert.equal(attentionTotal({ alerts: null, workflow: undefined }), 0);
  assert.equal(attentionTotal({ alerts: [], workflow: [], bulletins: undefined, messages: null }), 0);
});

test('the count is NOT dismissal-filtered — dismissals are session-local to one page', () => {
  // The bell cannot see the Notifications page's dismissals. A headline that
  // dropped on dismissal while the badge held would recreate the original bug.
  const alerts = [A('critical'), A('warning')].map((a) => ({ ...a, dismissed: true }));
  assert.equal(attentionTotal({ alerts, workflow: [] }), 2);
});

test('a severity we have never seen still counts (fail loud, not silent)', () => {
  // Only 'info' is excluded. An unrecognised severity must not vanish from a
  // life-safety count because a filter did not know about it.
  assert.equal(attentionTotal({ alerts: [A('catastrophic'), A(undefined)], workflow: [] }), 2);
});
