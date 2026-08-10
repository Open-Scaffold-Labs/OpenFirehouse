/**
 * broadcastSubscriber.test.mjs — the regression fence for a CRITICAL that reached production.
 *
 * THE BUG: `supabase.channel(topic)` is lookup-or-create, so two components asking for one
 * topic get ONE object. The 4C.4 fault panel and trouble banner both subscribed to the
 * DISPATCH topic App.jsx owns and called `removeChannel` in their cleanup — so opening the CAD
 * page, or merely toggling the panel's scope filter, unsubscribed LIVE DISPATCH PUSH app-wide
 * for the rest of the session. Silently, with every screen still working off its 20s poll.
 *
 * The fake below reproduces the ONE supabase-js behaviour that makes this possible, and
 * `bug: the old shape` proves the fake is faithful — without that, every assertion here could
 * pass against a fake that simply never shared anything.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBroadcastSubscriber } from '../broadcastSubscriber.js';

/** A fake supabase client with the real lookup-or-create semantics. */
function fakeClient() {
  const channels = new Map();
  const log = [];
  return {
    channels, log,
    channel(topic) {
      log.push(`channel(${topic})`);
      if (channels.has(topic)) return channels.get(topic);   // ← the whole hazard
      const ch = {
        topic, bindings: [], subscribeCalls: 0, removed: false,
        on(kind, opts, fn) { this.bindings.push({ kind, event: opts.event, fn }); return this; },
        subscribe(cb) { this.subscribeCalls++; if (cb) cb('SUBSCRIBED'); return this; },
        emit(event, payload) {
          for (const b of this.bindings) if (b.event === event) b.fn(payload);
        },
      };
      channels.set(topic, ch);
      return ch;
    },
    removeChannel(ch) { ch.removed = true; channels.delete(ch.topic); log.push(`removeChannel(${ch.topic})`); },
  };
}

test('THE FAKE IS FAITHFUL: two callers asking for one topic get the same object', () => {
  const c = fakeClient();
  assert.equal(c.channel('t'), c.channel('t'),
    'if this fails the fake does not reproduce supabase-js and every test below is worthless');
});

test('bug: the OLD shape — a second owner destroys the first owner\'s channel', () => {
  // This is what the shipped code did, written out. It is here so the fence has something
  // to be a fence against.
  const c = fakeClient();
  const appCh = c.channel('dispatch-dept-1').on('broadcast', { event: 'dispatch' }, () => {}).subscribe();
  const panelCh = c.channel('dispatch-dept-1').on('broadcast', { event: 'cad_ingest_fault' }, () => {}).subscribe();
  assert.equal(appCh, panelCh, 'same object — this is the hazard');
  c.removeChannel(panelCh);                       // the panel unmounts
  assert.equal(appCh.removed, true, 'App.jsx\'s dispatch channel is now dead');
  assert.equal(c.channels.size, 0, 'and untracked, with App.jsx never told');
});

test('fix: the LAST leaver tears down, not the first', () => {
  const c = fakeClient();
  const sub = makeBroadcastSubscriber(c);
  const offA = sub('cad-fault-dept-1', 'cad_ingest_fault', () => {});
  const offB = sub('cad-fault-dept-1', 'cad_ingest_fault', () => {});
  assert.equal(c.channels.size, 1, 'one channel for one topic');
  assert.equal(sub._openTopicCount(), 1);

  offA();
  assert.equal(c.channels.size, 1, 'the first leaver must NOT tear the channel down');
  assert.equal(c.channels.get('cad-fault-dept-1').removed, false);

  offB();
  assert.equal(c.channels.size, 0, 'the last leaver does');
  assert.equal(sub._openTopicCount(), 0);
});

test('a message reaches EVERY subscriber exactly once', () => {
  const c = fakeClient();
  const sub = makeBroadcastSubscriber(c);
  let a = 0, b = 0;
  sub('t', 'e', () => { a++; });
  sub('t', 'e', () => { b++; });
  const ch = c.channels.get('t');
  assert.equal(ch.bindings.length, 1,
    'ONE binding per (topic,event) — one per subscriber would deliver N copies to the first');
  assert.equal(ch.subscribeCalls, 1, '.subscribe() exactly once per channel');
  ch.emit('e', { id: 1 });
  assert.deepEqual([a, b], [1, 1]);
});

test('unsubscribe is IDEMPOTENT — StrictMode runs cleanups twice', () => {
  const c = fakeClient();
  const sub = makeBroadcastSubscriber(c);
  const offA = sub('t', 'e', () => {});
  const offB = sub('t', 'e', () => {});
  offA(); offA(); offA();          // a double-invoked cleanup must not consume B's claim
  assert.equal(c.channels.size, 1, 'B still holds the topic open');
  offB();
  assert.equal(c.channels.size, 0);
});

test('TWO SUBSCRIBERS SHARING ONE HANDLER REFERENCE ARE STILL TWO CLAIMS', () => {
  // 🔴 This is the case a `Set<fn>` collapses, and it is the original bug reappearing inside
  // the fix: two components that happen to pass the same function (a module-level callback, a
  // stable useCallback, `() => load()` hoisted) would share ONE Set entry, so the first to
  // unmount tore the channel down while the second was still listening.
  //
  // It was found because the mutation that removed the idempotence guard left the suite GREEN
  // — the assertion above could not fail, so chasing WHY exposed a hazard nothing covered.
  const c = fakeClient();
  const sub = makeBroadcastSubscriber(c);
  const shared = () => {};
  const offA = sub('t', 'e', shared);
  const offB = sub('t', 'e', shared);
  offA();
  assert.equal(c.channels.size, 1,
    'B is still subscribed with the same function — the channel must survive A leaving');
  offB();
  assert.equal(c.channels.size, 0, 'and go when the second one leaves');
});

test('a shared handler reference is invoked once PER SUBSCRIPTION', () => {
  const c = fakeClient();
  const sub = makeBroadcastSubscriber(c);
  let n = 0;
  const shared = () => { n++; };
  sub('t', 'e', shared);
  sub('t', 'e', shared);
  c.channels.get('t').emit('e', {});
  assert.equal(n, 2, 'two components asked to be told; both must be told');
});

test('different events on one topic each keep the channel alive', () => {
  const c = fakeClient();
  const sub = makeBroadcastSubscriber(c);
  const off1 = sub('t', 'one', () => {});
  const off2 = sub('t', 'two', () => {});
  assert.equal(c.channels.get('t').bindings.length, 2);
  off1();
  assert.equal(c.channels.size, 1, 'the other event still needs the channel');
  off2();
  assert.equal(c.channels.size, 0);
});

test('a throwing handler does not stop the others and does not kill the channel', () => {
  const c = fakeClient();
  const sub = makeBroadcastSubscriber(c);
  const errs = [];
  const origErr = console.error; console.error = (...a) => errs.push(a);
  let reached = 0;
  sub('t', 'e', () => { throw new Error('boom'); });
  sub('t', 'e', () => { reached++; });
  try { c.channels.get('t').emit('e', {}); } finally { console.error = origErr; }
  assert.equal(reached, 1, 'the second handler must still run');
  assert.equal(errs.length, 1, 'and the throw is reported, not swallowed');
  assert.equal(c.channels.size, 1);
});

test('a handler may unsubscribe from inside a message without corrupting the iteration', () => {
  const c = fakeClient();
  const sub = makeBroadcastSubscriber(c);
  let b = 0;
  const offA = sub('t', 'e', () => offA());
  sub('t', 'e', () => { b++; });
  c.channels.get('t').emit('e', {});
  assert.equal(b, 1, 'the surviving handler still receives the message it was mid-delivery for');
});

test('a null topic is a no-op — never default a tenant', () => {
  const c = fakeClient();
  const sub = makeBroadcastSubscriber(c);
  const off = sub(null, 'e', () => {});
  assert.equal(c.channels.size, 0);
  assert.doesNotThrow(off);
});

test('no client (realtime disabled) is a no-op, not a crash', () => {
  const sub = makeBroadcastSubscriber(null);
  const off = sub('t', 'e', () => {});
  assert.doesNotThrow(off);
});

test('the health hooks fire on status, message and teardown', () => {
  const c = fakeClient();
  const seen = { status: [], msgs: 0, gone: [] };
  const sub = makeBroadcastSubscriber(c, {
    onStatus: (t, s) => seen.status.push(`${t}:${s}`),
    onMessage: () => { seen.msgs++; },
    onTopicGone: (t) => seen.gone.push(t),
  });
  const off = sub('t', 'e', () => {});
  c.channels.get('t').emit('e', {});
  off();
  assert.deepEqual(seen.status, ['t:SUBSCRIBED'], 'the realtime health indicator must be told');
  assert.equal(seen.msgs, 1);
  assert.deepEqual(seen.gone, ['t'], 'forgetChannel must run or a dead topic stays "live"');
});
