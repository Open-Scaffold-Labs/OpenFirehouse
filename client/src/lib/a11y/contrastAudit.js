/**
 * contrastAudit.js — measure rendered text contrast in a live page.
 *
 * WHY THIS EXISTS, AND WHY IT LOOKS PARANOID
 * ------------------------------------------
 * On 2026-08-04 the setup wizard shipped with BLACK text on a #101828 input —
 * 1.18:1, six fields, on the first screen of onboarding — and three separate
 * checks called the screen clean before a human pointed at it. Each check failed
 * for a different reason, and every one of those reasons is encoded below:
 *
 *   1. SCREENSHOTS ARE NOT MEASUREMENTS. Looking at a JPEG in one theme at one
 *      viewport is not a contrast check. It is an opinion.
 *
 *   2. TAILWIND v4 EMITS oklch(). A naive `match(/[\d.]+/g)` on
 *      `oklch(0.808 0.114 19.571)` yields r=0.808, g=0.114, b=19.571 — garbage,
 *      and it produced 38 confident false failures. Hence a real OKLCH→sRGB
 *      conversion, and a self-test (`selfTest()`) that refuses to be trusted
 *      until it reproduces known palette values.
 *
 *   3. FORM CONTROL TEXT IS NOT A TEXT NODE. `<input>` values, `<select>`
 *      display text and `::placeholder` are invisible to any walker that only
 *      looks at Node.TEXT_NODE — which is exactly the category that was broken.
 *      A control with a dark background utility and no text-colour utility falls
 *      back to the UA default `color: fieldtext` (BLACK) and no text-node audit
 *      will ever see it.
 *
 *   4. SOME CONTRAST IS UNMEASURABLE FROM THE DOM, AND SILENCE IS NOT A PASS.
 *      An open native <select> list is painted by the OS, not by the page.
 *      Walking up the DOM finds the page's dark background and reports a
 *      comfortable 16:1 while the OS paints the list WHITE and the near-white
 *      option text lands at 1.1:1. This file does not pretend to measure that;
 *      it reports it as UNMEASURABLE and asserts the one thing that governs it
 *      (`color-scheme` must be declared). A checker that cannot see a defect
 *      must say so rather than return "0 failures".
 *
 * Pure and side-effect free apart from reading computed styles, so it can run
 * from a Playwright page.evaluate(), a devtools paste, or a unit test with jsdom
 * (jsdom will not resolve real colours — prefer a real browser).
 */

// ── colour parsing ──────────────────────────────────────────────────────────

const gamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const clamp255 = (x) => Math.max(0, Math.min(255, Math.round(gamma(Math.max(0, Math.min(1, x))) * 255)));

/** OKLab → sRGB (CSS Color 4). */
function oklabToRgb(L, a, b, alpha = 1) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return {
    r: clamp255(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: clamp255(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: clamp255(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
    a: alpha,
  };
}

const numOrPct = (t, ref) => {
  const s = String(t).trim();
  return s.endsWith('%') ? (parseFloat(s) / 100) * ref : parseFloat(s);
};

/**
 * Reject anything non-finite at the boundary.
 *
 * `oklch(0.5 none 0)` is legal CSS Color 4, and `numOrPct('none')` is NaN, which
 * propagated to `{r:NaN, g:NaN, b:NaN, a:1}`. That is strictly WORSE than returning
 * null, because `a: 1` satisfies the opaque test in resolveBackdrops — so the walk
 * TERMINATED on a garbage colour, `contrastRatio` returned NaN, `ratio >= need` was
 * false, and the element was recorded as a failure against `bg: '#NaNNaNNaN'`. A
 * confident wrong number, produced by the converter that exists to prevent confident
 * wrong numbers. One predicate closes `none` and every future NaN source.
 */
const finiteOrNull = (c) => (c && [c.r, c.g, c.b, c.a].every(Number.isFinite) ? c : null);

/** Parse any colour a browser can serialise into {r,g,b,a}. Returns null if unknown. */
export function parseColor(input) {
  if (!input) return null;
  const str = String(input).trim();
  if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  let m = str.match(/^rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
    return finiteOrNull({ r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 });
  }
  m = str.match(/^oklch\(([^)]+)\)/i);
  if (m) {
    const [body, alpha] = m[1].split('/');
    const p = body.trim().split(/\s+/);
    const L = numOrPct(p[0], 1), C = numOrPct(p[1], 0.4), H = parseFloat(p[2]) || 0;
    const rad = (H * Math.PI) / 180;
    return finiteOrNull(oklabToRgb(L, C * Math.cos(rad), C * Math.sin(rad), alpha !== undefined ? numOrPct(alpha, 1) : 1));
  }
  m = str.match(/^oklab\(([^)]+)\)/i);
  if (m) {
    const [body, alpha] = m[1].split('/');
    const p = body.trim().split(/\s+/);
    return finiteOrNull(oklabToRgb(numOrPct(p[0], 1), parseFloat(p[1]), parseFloat(p[2]), alpha !== undefined ? numOrPct(alpha, 1) : 1));
  }
  m = str.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const v = parseInt(h.slice(0, 6), 16);
    return finiteOrNull({ r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255, a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 });
  }
  return null;
}

const relLum = ({ r, g, b }) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/** Composite a (possibly translucent) colour over an opaque one. */
export const flatten = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
});

/** WCAG 2.1 contrast ratio between two opaque colours. */
export function contrastRatio(a, b) {
  const [x, y] = [relLum(a), relLum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** WCAG AA threshold: 3.0 for large text (>=24px, or >=18.66px bold), else 4.5. */
export const requiredRatio = (px, bold) => (px >= 24 || (bold && px >= 18.66) ? 3 : 4.5);

// ── backdrop resolution ─────────────────────────────────────────────────────

/**
 * The colours actually behind an element. Walks ancestors compositing translucent
 * layers and STOPS at the first opaque background — the nearest opaque layer wins,
 * because that is what paints. A gradient terminates the walk and contributes ALL
 * of its stops: a text run genuinely sits over a range, so we score the worst.
 */
export function resolveBackdrops(el, view = window) {
  const translucent = [];
  let node = el;
  while (node && node.nodeType === 1) {
    const cs = view.getComputedStyle(node);
    const image = cs.backgroundImage;
    if (image && image !== 'none') {
      const stops = (image.match(/(?:oklch|oklab|rgba?|#[0-9a-f]{3,8})\([^)]*\)|#[0-9a-f]{3,8}/gi) || [])
        .map(parseColor).filter((c) => c && c.a > 0);
      if (stops.length) return { translucent, terminal: stops, terminalEl: node };
    }
    const bc = parseColor(cs.backgroundColor);
    if (bc && bc.a >= 0.999) return { translucent, terminal: [bc], terminalEl: node };
    if (bc && bc.a > 0) translucent.push(bc);
    // FAIL CLOSED. A background we cannot READ is not a background that is not THERE.
    // This used to fall through and keep walking, so an opaque unknown-syntax layer was
    // treated as transparent and the text got scored against a grandparent — a
    // confident wrong number, which is this file's whole thesis. Measured: Tailwind v4's
    // /opacity modifier is safe (Chromium serialises color-mix() as oklab(), which is
    // parsed), but `color(display-p3 …)` and `lab()` serialise verbatim and are not. One
    // arbitrary value or one hand-written rule in index.css arms this silently.
    if (!bc && cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      return { translucent, terminal: null, unreadable: cs.backgroundColor, terminalEl: node };
    }
    node = node.parentElement;
  }
  return { translucent, terminal: [{ r: 255, g: 255, b: 255, a: 1 }], terminalEl: null };
}

/**
 * A short, greppable identity for an element: tag plus the utility classes that
 * are plausibly responsible for its colour. Without this a sweep produces 62
 * colour pairs and no way to find them — which is a report you cannot act on.
 * Colour-ish utilities are listed first because those are what gets edited.
 */
export function describeEl(el) {
  if (!el) return '(page root)';
  const cls = String(el.className || '');
  const tokens = cls.split(/\s+/).filter(Boolean);
  const colorish = tokens.filter((t) => /(^|:)(text|bg|border|from|to|via)-/.test(t));
  const shown = (colorish.length ? colorish : tokens).slice(0, 6).join(' ');
  const id = el.id ? `#${el.id}` : '';
  const testid = el.getAttribute?.('data-testid');
  return `${el.tagName.toLowerCase()}${id}${testid ? `[data-testid=${testid}]` : ''}${shown ? ` .${shown}` : ''}`;
}

function worstAgainst(fg, { translucent, terminal }) {
  let worst = Infinity, worstBg = null;
  for (const t of terminal) {
    let bg = t;
    for (let i = translucent.length - 1; i >= 0; i--) bg = flatten(translucent[i], bg);
    const r = contrastRatio(flatten(fg, bg), bg);
    if (r < worst) { worst = r; worstBg = bg; }
  }
  return { ratio: worst, bg: worstBg };
}

const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const isRendered = (el) => !!(el.offsetParent || el.getClientRects().length);

// ── the audit ───────────────────────────────────────────────────────────────

/**
 * Audit every rendered text-bearing thing on the page.
 *
 * Returns { failures, exempt, uncertain, unmeasurable, checked }:
 *   failures     — in normal flow, so the DOM backdrop IS the painted backdrop.
 *                  Trustworthy. Fix these.
 *   exempt       — below threshold but on a disabled control, which WCAG 1.4.3
 *                  excludes. Not build-failing; still worth reading.
 *   uncertain    — fixed/sticky/absolute, so what is painted behind it is not
 *                  necessarily its DOM ancestor's background. GO LOOK. Do not
 *                  report these as defects and do not report them as clean.
 *   unmeasurable — native control chrome (the <select> popup) whose painted
 *                  colours the DOM cannot report at all.
 *
 * The three non-`failures` buckets exist because every one of them was, at some
 * point in one afternoon, confidently reported as a defect or as a pass when it
 * was neither. Categories of not-knowing are worth more than a single number.
 */
export function auditContrast(doc = document, view = window) {
  const failures = [];
  const exempt = [];
  const uncertain = [];
  const unmeasurable = [];
  let checked = 0;

  /**
   * WCAG 1.4.3 exempts "inactive user interface components" from the contrast
   * minimum, so a disabled control is reported under `exempt`, not `failures`.
   * This is not a loophole — it keeps the check from crying wolf on every
   * legitimately-greyed button forever, which is how a test gets ignored. Read
   * `exempt` anyway: a disabled button whose label has vanished still looks
   * broken, and five of ours did (white on gray-300, 1.47:1).
   */
  const isInactive = (el) => !!(el.closest('[disabled],[aria-disabled="true"]'));

  /**
   * Is this element taken OUT of normal flow, so that what is painted behind it
   * is not necessarily its DOM ancestor's background?
   *
   * This is the same trap as the native <option> popup, one level less obvious.
   * A `position: fixed` panel (the feedback widget, a modal, a toast, a portaled
   * dropdown) floats over whatever happens to be scrolled beneath it, while
   * `resolveBackdrops()` faithfully reports the background of its DOM PARENT —
   * which may be a transparent wrapper whose own ancestor is the opposite theme.
   * That produced confident nonsense on a first sweep: "#f3f4f6 on #ffffff, 1.1:1"
   * for a button that is plainly legible on screen.
   *
   * So these are reported as `uncertain`, not `failures`. Uncertain means GO LOOK;
   * it does not mean broken, and it does not mean fine.
   */
  const isFloating = (el, terminalEl) => {
    let node = el;
    while (node && node.nodeType === 1) {
      // STOP AT THE OPAQUE BACKDROP. If the positioned ancestor is at or below the
      // element that actually supplies the opaque background, then the DOM backdrop
      // IS the painted backdrop and the finding is trustworthy — being positioned is
      // irrelevant. Walking past it to the root was over-broad, and it did real harm:
      // the setup wizard is `fixed inset-0 bg-white dark:bg-gray-900`, i.e. opaque and
      // full-viewport with nothing able to show through, yet EVERY node inside it was
      // classified `uncertain`. The spec asserts on `failures`, so the regression test
      // for the 1.18:1 defect that started all of this could never fail. A fourth
      // blind spot, created by the fix for the third.
      if (node === terminalEl) return null;
      const pos = view.getComputedStyle(node).position;
      if (pos === 'fixed' || pos === 'sticky' || pos === 'absolute') return pos;
      node = node.parentElement;
    }
    return null;
  };

  const record = (label, kind, fg, box, px, bold, el, extra = {}) => {
    checked++;
    // An unreadable backdrop is reported, never guessed at — and reported as an ERROR
    // so the spec's `unmeasurable.severity === 'error'` assertion fails the build. It
    // carries describeEl() because the fourth blind spot in this file was a defect
    // hiding in a bucket nobody named; a bucket without an element reference is a
    // bucket nobody can act on either.
    if (!box.terminal) {
      unmeasurable.push({
        what: 'unreadable background colour',
        why: `getComputedStyle reported ${JSON.stringify(box.unreadable)}, which this parser `
           + 'cannot convert. The walk STOPPED rather than treating it as transparent and '
           + 'scoring against an ancestor, which would be a confident wrong number.',
        governedBy: 'parseColor() — add the missing colour syntax',
        el: describeEl(el), bgFrom: describeEl(box.terminalEl), label: String(label).slice(0, 60),
        ok: false, severity: 'error',
      });
      return;
    }
    const { ratio, bg } = worstAgainst(fg, box);
    const need = requiredRatio(px, bold);
    if (ratio >= need) return;
    const floating = el ? isFloating(el, box.terminalEl) : null;
    const entry = { kind, label: String(label).slice(0, 60), ratio: +ratio.toFixed(2), need,
      px: +px.toFixed(1), bold, fg: hex(fg), bg: hex(bg),
      el: describeEl(el), bgFrom: describeEl(box.terminalEl),
      ...(floating ? { position: floating } : {}), ...extra };
    if (el && isInactive(el)) exempt.push(entry);
    else if (floating) uncertain.push(entry);
    else failures.push(entry);
  };

  // 1. Text nodes.
  doc.querySelectorAll('*').forEach((el) => {
    if (!isRendered(el)) return;
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
      .map((n) => n.textContent.trim()).join(' ');
    if (!own) return;
    const cs = view.getComputedStyle(el);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
    const fg = parseColor(cs.color);
    if (!fg) return;
    record(own, 'text', fg, resolveBackdrops(el, view), parseFloat(cs.fontSize), parseInt(cs.fontWeight, 10) >= 700, el);
  });

  // 2. Form controls — the category a text-node walker cannot see at all.
  doc.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!isRendered(el)) return;
    const cs = view.getComputedStyle(el);
    const fg = parseColor(cs.color);
    const box = resolveBackdrops(el, view);
    const px = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const tag = el.tagName.toLowerCase();

    const shown = tag === 'select'
      ? (el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].textContent : el.value)
      : el.value;
    if (fg && shown) record(shown, `${tag}-value`, fg, box, px, bold, el);

    if (el.placeholder) {
      const ph = parseColor(view.getComputedStyle(el, '::placeholder').color);
      if (ph) record(el.placeholder, `${tag}-placeholder`, ph, box, px, bold, el);
    }
  });

  // 3. What cannot be measured here — reported, never silently passed.
  const selects = [...doc.querySelectorAll('select')].filter(isRendered);
  if (selects.length) {
    const scheme = view.getComputedStyle(doc.documentElement).colorScheme;
    const declared = scheme && scheme !== 'normal';
    unmeasurable.push({
      what: 'native <select> option list',
      count: selects.length,
      why: 'The open list is painted by the OS, not the page. DOM traversal finds the '
         + "page background and reports a passing ratio while the OS may paint the list "
         + 'light — near-white option text then lands around 1.1:1.',
      governedBy: 'color-scheme on the root element',
      colorScheme: scheme || '(none)',
      ok: !!declared,
      severity: declared ? 'info' : 'error',
    });
  }

  return { failures, exempt, uncertain, unmeasurable, checked };
}

/**
 * Prove the colour maths before trusting a single number it produces.
 * Values are the Tailwind v4 palette (v4 re-authored the ramp in OKLCH — v3
 * hexes will NOT match, which cost a debugging cycle when I compared against
 * v3 and concluded, wrongly, that the converter was broken).
 */
export function selfTest() {
  const cases = [
    ['gray-400',  'oklch(0.707 0.022 261.325)', '#99a1af'],
    ['gray-900',  'oklch(0.21 0.034 264.665)',  '#101828'],
    ['red-700',   'oklch(0.505 0.213 27.518)',  '#c10007'],
    ['sky-700',   'oklch(0.5 0.134 242.749)',   '#0069a8'],
    ['amber-200', 'oklch(0.924 0.12 95.746)',   '#fee685'],
  ];
  const results = cases.map(([name, css, expected]) => {
    const got = hex(parseColor(css));
    return { name, got, expected, pass: got === expected };
  });
  // A known ratio: black on white is exactly 21:1.
  const anchor = contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255, a: 1 });
  results.push({ name: 'black-on-white', got: anchor.toFixed(2), expected: '21.00', pass: Math.abs(anchor - 21) < 0.01 });

  // NaN must become null, not a colour. `oklch(0.5 none 0)` is legal CSS Color 4 and
  // used to yield {r:NaN,g:NaN,b:NaN,a:1} — whose a:1 satisfied the opaque test and
  // TERMINATED the backdrop walk on garbage, producing a failure against #NaNNaNNaN.
  results.push({ name: 'oklch none → null', got: String(parseColor('oklch(0.5 none 0)')), expected: 'null',
    pass: parseColor('oklch(0.5 none 0)') === null });
  // A syntax we genuinely cannot read must be null so the walk fails closed.
  results.push({ name: 'color(display-p3) → null', got: String(parseColor('color(display-p3 0.1 0.2 0.3)')), expected: 'null',
    pass: parseColor('color(display-p3 0.1 0.2 0.3)') === null });
  return { pass: results.every((r) => r.pass), results };
}

export default auditContrast;
