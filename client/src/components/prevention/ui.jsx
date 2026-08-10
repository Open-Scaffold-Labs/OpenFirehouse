// prevention/ui.jsx — the module's small shared atoms, matching the app's
// established design language (Tailwind, red brand, rounded-2xl cards,
// class-based dark mode). Touch targets ≥44px on all interactive elements.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, MoreVertical } from 'lucide-react';

export function Section({ title, subtitle, actions, children }) {
  return (
    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100">{title}</h3>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// `error` is separate from `hint` on purpose (added 3.0 design critique, 2026-07-26).
// Passing an error THROUGH `hint` renders a refusal — "that permit number is already
// used" — as muted gray helper text, visually identical to "Recorded on the permit."
// A refusal that whispers is the same failure class as a refusal that paints: the
// operator carries on believing the write landed. An error gets red, bold, role="alert"
// so it is ANNOUNCED, and aria-invalid so the field itself is marked.
export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</span>
      {error ? <div aria-invalid="true">{children}</div> : children}
      {error && (
        <span role="alert" className="block text-sm font-semibold text-red-700 dark:text-red-400 mt-1">
          {error}
        </span>
      )}
      {hint && !error && <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ' +
  // (M7) The focus ring REPLACES the UA outline, so it has to carry 1.4.11 on its own.
  // red-300 on white was 1.90:1 — a keyboard user could not see where they were.
  // red-600 is 4.5:1 against white and stays visible in sunlight.
  'px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-600 dark:focus:ring-red-400';

export function Input(props) { return <input {...props} className={`${inputCls} ${props.className || ''}`} />; }
export function TextArea(props) { return <textarea {...props} className={`${inputCls} ${props.className || ''}`} />; }
export function Select(props) { return <select {...props} className={`${inputCls} ${props.className || ''}`} />; }

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 min-h-[56px] px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left disabled:opacity-50"
    >
      <span>
        <span className="block font-semibold text-gray-900 dark:text-gray-100">{label}</span>
        {description && <span className="block text-sm text-gray-500 dark:text-gray-400">{description}</span>}
      </span>
      <span className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 transition-colors ${checked ? 'bg-red-600 border-red-700' : 'bg-gray-400 border-gray-600 dark:bg-gray-500 dark:border-gray-300'}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white border border-gray-600 shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}

export function Btn({ variant = 'secondary', className = '', ...props }) {
  const styles = {
    primary:   'bg-red-600 hover:bg-red-700 text-white',
    secondary: 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200',
    danger:    'bg-white dark:bg-gray-900 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950',
    ghost:     'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    />
  );
}

/**
 * RowActions — the overflow menu for a table row's secondary verbs.
 *
 * WHY THIS EXISTS
 * ───────────────
 * A register row's verb count is a function of the RECORD'S STATE, not of the
 * column: a permit that is about to expire AND revocable AND transferable offers
 * Renew + Revoke + Transfer + Retire. Rendering every verb inline means the
 * widest state dictates the column, and on 2026-08-04 that produced two measured
 * defects on production at once — the Actions column held 207px (21% of the pane)
 * while the Type column starved at 89px and was ellipsised on 6 of 6 rows, and
 * the one pending row still clipped its Issue button by 3px because 207 < 205+pad.
 * Percentage-shaving cannot solve it: the content wants 1202px in a 986px pane.
 *
 * Collapsing the secondary verbs behind one 44px trigger makes the column's cost
 * CONSTANT and independent of state. The primary verb (Issue / Renew) stays a
 * labelled button beside it, because burying the act the operator came to perform
 * behind a menu trades one usability defect for another.
 *
 * IT IS PORTALED, AND THAT IS NOT INCIDENTAL. The register scroller is
 * `overflow-x-auto`; a popover rendered in the cell is clipped by it — the menu
 * would open and be invisible. So the panel goes to document.body at a fixed
 * position measured from the trigger, and closes on scroll/resize rather than
 * drifting away from the row it belongs to.
 *
 * z-index sits ABOVE the app's floating widget stack (z-40/z-50). An open menu
 * that a floating button covers is the same defect this replaces.
 */
export function RowActions({ items, label = 'More actions', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const live = (items || []).filter(Boolean);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) btnRef.current?.focus();
  }, []);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const W = 248;
    // Estimate height so the flip decision is made BEFORE paint; a menu that
    // renders below the fold and then jumps is worse than one placed correctly.
    const H = Math.min(live.length * 44 + 16, 320);
    const below = window.innerHeight - r.bottom;
    const flip = below < H + 8 && r.top > below;
    setPos({
      top: flip ? Math.max(8, r.top - H - 4) : r.bottom + 4,
      left: align === 'right'
        ? Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8))
        : Math.max(8, r.left),
      width: W,
    });
  }, [align, live.length]);

  useEffect(() => {
    if (!open) return;
    place();
    // capture:true so a scroll inside the register's own scroller closes it too,
    // not just a scroll of the document.
    const onMove = () => close(false);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      close(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open, place, close]);

  // Focus the first item on open so the menu is operable from the keyboard the
  // way a menu is expected to be, not merely reachable by Tab.
  useEffect(() => {
    if (open && pos) panelRef.current?.querySelector('[role="menuitem"]')?.focus();
  }, [open, pos]);

  const onPanelKey = (e) => {
    const nodes = Array.from(panelRef.current?.querySelectorAll('[role="menuitem"]') || []);
    const i = nodes.indexOf(document.activeElement);
    if (e.key === 'Escape')    { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); nodes[(i + 1) % nodes.length]?.focus(); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); nodes[(i - 1 + nodes.length) % nodes.length]?.focus(); }
    else if (e.key === 'Home')      { e.preventDefault(); nodes[0]?.focus(); }
    else if (e.key === 'End')       { e.preventDefault(); nodes[nodes.length - 1]?.focus(); }
    else if (e.key === 'Tab')       { close(false); }
  };

  if (live.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        aria-label={label}
        className="inline-flex items-center justify-center h-11 w-11 rounded-xl text-gray-600 dark:text-gray-300
                   hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <MoreVertical size={18} aria-hidden="true" />
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          onKeyDown={onPanelKey}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="z-[10050] py-2 rounded-xl bg-white dark:bg-gray-900 shadow-2xl
                     border border-gray-200 dark:border-gray-700 max-h-80 overflow-y-auto"
        >
          {live.map((it, n) => (
            <button
              key={it.key || n}
              role="menuitem"
              type="button"
              onClick={() => { close(false); it.onSelect?.(); }}
              title={it.hint}
              className={`w-full text-left px-4 min-h-[44px] flex items-center gap-3 text-sm font-medium
                          hover:bg-gray-100 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800
                          focus:outline-none ${it.danger
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-gray-800 dark:text-gray-200'}`}
            >
              {it.icon ? <it.icon size={15} aria-hidden="true" /> : <span className="w-[15px]" />}
              <span className="flex-1">{it.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, wide }) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);

  useEffect(() => {
    restoreRef.current = document.activeElement;
    const panel = panelRef.current;
    const first = panel?.querySelector(FOCUSABLE);
    (first || panel)?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== 'Tab' || !panel) return;
      const nodes = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === panel);
      if (nodes.length === 0) { e.preventDefault(); panel.focus(); return; }
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === firstNode || document.activeElement === panel)) {
        e.preventDefault(); lastNode.focus();
      } else if (!e.shiftKey && document.activeElement === lastNode) {
        e.preventDefault(); firstNode.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const el = restoreRef.current;
      if (el && typeof el.focus === 'function') el.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div ref={panelRef} tabIndex={-1} className={`bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between bg-red-700 text-white rounded-t-3xl px-5 py-4">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-red-600">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="text-center py-12 px-6">
      {Icon && <Icon size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" aria-hidden="true" />}
      <p className="font-bold text-gray-700 dark:text-gray-200">{title}</p>
      {body && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Badge({ tone = 'gray', children }) {
  const tones = {
    gray:   'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    red:    'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    amber:  'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    green:  'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-gray-500 dark:text-gray-400" role="status">
      <span className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-red-600 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}
