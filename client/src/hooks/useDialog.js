import { useEffect, useRef, useId } from 'react';

/**
 * useDialog — the missing half of every modal in this app.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 * Measured live on production 2026-08-06 against the Incident Form, the most
 * complex authoring surface we ship. Almost everything passed: 110 form controls
 * and 32 buttons all carried an accessible name, no click handlers on
 * non-interactive elements, no input border under 3:1, a visible focus ring on
 * every tab stop. Two things failed, and they are one defect wearing two hats:
 *
 *   1. The modal never said it was a modal. No `role="dialog"`, no `aria-modal`,
 *      no accessible name. A screen reader announced no boundary at all — the
 *      form's 110 controls were simply spliced into the page.
 *   2. Focus was never moved into it. Pressing Tab after the form opened walked
 *      the INCIDENT LIST BEHIND IT; the first eight stops were the table's sort
 *      buttons and a row-expand toggle. A keyboard-only officer had to traverse
 *      the whole underlying page to reach a form filling their screen.
 *
 * 88 components in this app mount a `fixed inset-0` modal root. Exactly ONE
 * declared `role="dialog"`. So this was never an incident-form bug, and patching
 * one instance would have left 87 inconsistent siblings — hence one primitive.
 *
 * ── WHY THERE IS NO ESCAPE-TO-CLOSE, DELIBERATELY ───────────────────────────
 * It is the first thing everyone reaches for, and on this app it is a data-loss
 * bug wearing an accessibility costume. The Incident Form is where an officer
 * types the narrative of a subpoenable legal record; a stray Escape mid-sentence
 * would discard it with no confirmation and no undo. Products with long
 * authoring forms routinely and correctly decline to do this.
 *
 * And WCAG does not ask for it. 2.1.2 (No Keyboard Trap) requires that a
 * keyboard user can LEAVE — which they can: Tab cycles to a Cancel/Close button
 * inside the dialog and activates it. The violation was never "Escape does
 * nothing"; it was "aria-modal is claimed while focus roams outside", which is
 * why `aria-modal` and the Tab containment below ship together and must never be
 * separated. Declaring aria-modal WITHOUT containment is worse than declaring
 * neither: it hides the rest of the page from assistive tech while still letting
 * a sighted keyboard user tab into it.
 *
 * If Escape-to-close is ever wanted, it needs a dirty-state confirm first. That
 * is a product decision (Matt's), not something this hook should assume.
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────
 *   const dlg = useDialog({ labelledBy: titleId });
 *   <div className="fixed inset-0 …" {...dlg.overlayProps}>
 *     <div className="…" {...dlg.dialogProps}>
 *       <h2 id={dlg.titleId}>Log New Incident</h2>
 *       …
 *
 * `dlg.titleId` is generated for you; put it on the heading. If the dialog has
 * no visible heading, pass `label: 'Something'` instead and it becomes aria-label.
 */

/** Focusable descendants, in DOM order, excluding anything the browser will skip. */
export function focusableWithin(root) {
  if (!root) return [];
  const sel = [
    'a[href]', 'button', 'input', 'select', 'textarea',
    '[tabindex]', '[contenteditable="true"]',
  ].join(',');
  return [...root.querySelectorAll(sel)].filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
    if (el.tabIndex < 0) return false;
    // `disabled` on a <fieldset> disables its descendants without setting the
    // attribute on them — the NERIS approved-lock uses exactly this, so a dialog
    // opened on an approved report would otherwise "contain" focus on elements
    // the browser refuses to focus, and Tab would escape anyway.
    if (el.closest('fieldset[disabled]')) return false;
    return el.checkVisibility
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  });
}

/**
 * @param {object}  opts
 * @param {string}  [opts.label]        aria-label, when there is no visible heading.
 * @param {string}  [opts.labelledBy]   id of an existing heading; else one is generated.
 * @param {object}  [opts.initialFocusRef] explicit focus target.
 * @param {any}     [opts.contentKey]   CHANGE THIS when the dialog swaps its body.
 *
 *   ⚠️ contentKey is not decoration. IncidentForm renders a LOADING panel first
 *   (it fetches members + apparatus before its fields exist) and the real form
 *   second. Both are the same component, so the focus effect ran once — against
 *   the loading panel, which contains no focusable controls at all — and fell
 *   back to the dialog root. Then 143 controls appeared and nothing re-focused.
 *   Measured: `focusableWithin` returns 0 during load and 143 after. Passing
 *   `contentKey={loading ? 'loading' : 'ready'}` re-runs the effect when the body
 *   is actually there. Tab containment was never affected — the key handler reads
 *   the ref live — which is exactly why this was invisible without measuring.
 */
export default function useDialog({ label = null, labelledBy = null, initialFocusRef = null, contentKey = null } = {}) {
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);
  const generatedId = useId();
  const titleId = labelledBy || `dlg-title-${generatedId}`;

  // Remember who opened us, so we can hand focus back on close. Without this a
  // keyboard user is dumped at the top of the document every time they cancel.
  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    return () => {
      const el = returnFocusRef.current;
      // The trigger can legitimately be gone (a row deleted by the dialog itself).
      if (el && document.contains(el) && typeof el.focus === 'function') {
        try { el.focus({ preventScroll: true }); } catch { /* non-focusable now */ }
      }
    };
  }, []);

  // Move focus INTO the dialog on open. Prefer an explicit target, else the first
  // focusable, else the dialog itself (tabIndex -1) so at minimum the screen
  // reader's cursor is inside the boundary we just declared.
  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return undefined;
    // TWO frames, not one. These dialogs routinely mount their fields a tick late
    // (IncidentForm fetches members + apparatus first), and on a single frame
    // `focusableWithin` returned an empty list — so focus fell back to the dialog
    // root. That fallback is conformant (WAI-ARIA APG permits focusing the dialog
    // element itself) and it is the safe landing spot, which is why it stays; but
    // landing on the first real control is better, and one more frame gets it.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const explicit = initialFocusRef?.current;
        const target = explicit || focusableWithin(root)[0] || root;
        try { target.focus({ preventScroll: true }); } catch { /* ignore */ }
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [initialFocusRef, contentKey]);

  // Contain Tab. This is the half that makes `aria-modal` honest.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Tab') return;                    // NOT Escape — see the header.
      const root = dialogRef.current;
      if (!root) return;
      const items = focusableWithin(root);
      if (!items.length) { e.preventDefault(); root.focus?.(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // Focus outside the dialog (it started there, or content re-rendered under
      // it) — pull it back rather than letting Tab walk the page behind.
      if (!root.contains(active)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return {
    titleId,
    dialogRef,
    /** Spread on the modal PANEL (the thing with the heading inside it). */
    dialogProps: {
      ref: dialogRef,
      role: 'dialog',
      'aria-modal': 'true',
      ...(label ? { 'aria-label': label } : { 'aria-labelledby': titleId }),
      tabIndex: -1,
    },
    /** Spread on the full-screen backdrop, so AT does not read it as content. */
    overlayProps: { 'aria-hidden': undefined },
  };
}
