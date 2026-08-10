// focusableWithin — the ordering + filtering rule behind the dialog focus trap.
//
// The trap is only as good as this list. Two filters here are not obvious and
// both come from this codebase:
//
//   · `fieldset[disabled]` disables every descendant WITHOUT setting the
//     `disabled` attribute on them. The NERIS approved-lock (P2-D6/F22) uses
//     exactly that pattern, so on an APPROVED incident report a naive list would
//     "contain" focus on elements the browser refuses to focus — and Tab would
//     sail straight out of the dialog into the page behind, which is the precise
//     bug the trap exists to stop, reappearing only on approved records.
//   · tabIndex < 0 is reachable programmatically but not by Tab. Including it
//     puts a stop in the cycle that Tab can never actually land on, so
//     shift-Tab from the first element wraps to an element that then bounces.
//
// A DOM is stubbed rather than imported (this runner has no jsdom), so what is
// under test is the RULE, not the browser. The browser half is covered by the
// e2e dialog test, which drives real Tab presses on production.

import test from 'node:test';
import assert from 'node:assert';

/** Mirror of the shipped predicate in hooks/useDialog.js. Keep in step. */
function keep(el) {
  if (el.disabled || el.ariaHidden === 'true') return false;
  if (el.tabIndex < 0) return false;
  if (el.inDisabledFieldset) return false;
  return el.visible !== false;
}
const focusable = (els) => els.filter(keep);

const el = (o) => ({ tabIndex: 0, visible: true, ...o });

test('keeps ordinary focusable controls, in DOM order', () => {
  const list = [el({ name: 'a' }), el({ name: 'b' }), el({ name: 'c' })];
  assert.deepEqual(focusable(list).map((e) => e.name), ['a', 'b', 'c']);
});

test('drops disabled controls', () => {
  const list = [el({ name: 'a' }), el({ name: 'b', disabled: true }), el({ name: 'c' })];
  assert.deepEqual(focusable(list).map((e) => e.name), ['a', 'c']);
});

test('drops descendants of a DISABLED FIELDSET — the NERIS approved-lock case', () => {
  // The lock sets `disabled` on the <fieldset>, never on the inputs. A list that
  // only checks el.disabled would keep all three and the trap would leak.
  const list = [
    el({ name: 'close' }),
    el({ name: 'neris-1', inDisabledFieldset: true }),
    el({ name: 'neris-2', inDisabledFieldset: true }),
    el({ name: 'cancel' }),
  ];
  assert.deepEqual(focusable(list).map((e) => e.name), ['close', 'cancel']);
});

test('drops tabIndex -1 — programmatically focusable is not Tab-reachable', () => {
  const list = [el({ name: 'a' }), el({ name: 'panel', tabIndex: -1 }), el({ name: 'b' })];
  assert.deepEqual(focusable(list).map((e) => e.name), ['a', 'b']);
});

test('drops aria-hidden and invisible controls', () => {
  const list = [
    el({ name: 'a' }),
    el({ name: 'hidden', ariaHidden: 'true' }),
    el({ name: 'collapsed', visible: false }),
    el({ name: 'b' }),
  ];
  assert.deepEqual(focusable(list).map((e) => e.name), ['a', 'b']);
});

test('an empty result is possible and must not be papered over', () => {
  // Every control inside a fully-locked dialog. The hook focuses the dialog root
  // itself in this case rather than letting Tab escape — assert the list is
  // genuinely empty so that branch is reachable and tested.
  const list = [el({ name: 'x', inDisabledFieldset: true }), el({ name: 'y', disabled: true })];
  assert.equal(focusable(list).length, 0);
});

test('the first and last elements are what wrap-around depends on', () => {
  const list = [
    el({ name: 'skip', disabled: true }),
    el({ name: 'first' }),
    el({ name: 'mid' }),
    el({ name: 'last' }),
    el({ name: 'skip2', tabIndex: -1 }),
  ];
  const f = focusable(list);
  assert.equal(f[0].name, 'first', 'shift-Tab from here must wrap to last');
  assert.equal(f[f.length - 1].name, 'last', 'Tab from here must wrap to first');
});
