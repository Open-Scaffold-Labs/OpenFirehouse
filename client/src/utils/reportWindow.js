// reportWindow.js — opening the incident report as a SEPARATE BROWSER WINDOW.
//
// ── THE RULING (Matt, 2026-08-07, spec R1) ──────────────────────────────────
// "can we make it a pop up that is just a seperate full page window that opens
// up?" — yes, and it beats the in-app route I had recommended. A real second OS
// window can be dragged to a second monitor while the call list stays LIVE and
// usable on the first, instead of dimmed behind a scrim. The watch desk is a
// multi-monitor environment; the old modal ignored that.
//
// Measured, on production, before this existed: the modal was 672px wide and
// hard-capped — 47% of a 1440 screen, 35% of a 1920 one — showing 17 of 110
// fields, over 4.5 screens of scrolling.
//
// ── THE THREE THINGS THAT MAKE window.open FAIL, ALL HANDLED HERE ────────────
// 1. IT MUST BE CALLED SYNCHRONOUSLY FROM THE USER GESTURE. Browsers allow a
//    popup only while a click is being handled. Put an `await` before it and the
//    gesture is severed and the popup is blocked. openReportWindow() therefore
//    does no async work and MUST be called directly in the click handler.
// 2. IT CAN STILL RETURN null — a blocker, an embedded webview, a locked-down
//    kiosk browser. A blocked popup must NEVER mean "the button did nothing", so
//    the caller falls back to navigating in place. That fallback is the reason
//    this returns a value at all.
// 3. THE OPENED WINDOW IS A SEPARATE JS CONTEXT. It shares same-origin
//    localStorage (so the auth token and the local draft both work) but NOT
//    React state. Anything the list window needs to know — "I saved" — has to be
//    messaged across; see notifySaved/onReportSaved below.

/** Hash route the report window loads. Kept here so both windows agree on it. */
export function reportRoute(incidentId) {
  return incidentId ? `#/incident-report?id=${encodeURIComponent(incidentId)}` : '#/incident-report?new=1';
}

/**
 * Open the report in its own window. CALL THIS SYNCHRONOUSLY FROM A CLICK.
 * @returns {Window|null} null when the browser blocked it — caller must fall back.
 */
export function openReportWindow(incidentId) {
  const url = `${window.location.pathname}${window.location.search}${reportRoute(incidentId)}`;
  // Size to the available screen rather than a fixed guess: a 13" laptop and a
  // 27" desk monitor should both get a usable report, and the whole point of
  // this change was that a hard-coded width does not scale.
  const w = Math.min(1600, Math.max(1100, (window.screen?.availWidth || 1440) - 120));
  const h = Math.max(700, (window.screen?.availHeight || 900) - 100);
  const left = Math.max(0, Math.round(((window.screen?.availWidth || w) - w) / 2));
  const top = Math.max(0, Math.round(((window.screen?.availHeight || h) - h) / 2));
  // A NAMED window means a second click re-focuses the existing report instead of
  // opening a duplicate — two windows editing one legal record is the merge
  // problem the Prevention doctrine already refuses to have.
  const name = `of-incident-report-${incidentId || 'new'}`;
  const features = `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;
  let win = null;
  try { win = window.open(url, name, features); } catch { win = null; }
  if (win) { try { win.focus(); } catch { /* focus is best-effort */ } }
  return win;
}

// ── Cross-window notification ────────────────────────────────────────────────
// The report window saves; the list window is showing a now-stale table. Without
// this the chief closes the report and sees the old row until they refresh.

const CHANNEL = 'of-incident-report';

/** Called by the REPORT window after a successful save. */
export function notifySaved(payload = {}) {
  const msg = { kind: 'incident-saved', at: Date.now(), ...payload };
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage(msg);
    bc.close();
  } catch {
    // BroadcastChannel is absent in older Safari — postMessage to the opener is
    // the fallback, and it is why the opener reference is worth keeping.
    try { window.opener?.postMessage(msg, window.location.origin); } catch { /* opener gone */ }
  }
}

/**
 * Called by the LIST window. Returns an unsubscribe fn.
 * Listens on BOTH transports: BroadcastChannel is the primary, but a browser
 * that lacks it silently delivers nothing, and a list that never refreshes is
 * exactly the failure this exists to prevent.
 */
export function onReportSaved(handler) {
  let bc = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (e) => { if (e?.data?.kind === 'incident-saved') handler(e.data); };
  } catch { bc = null; }
  const onMsg = (e) => {
    if (e.origin !== window.location.origin) return;   // never trust a cross-origin message
    if (e?.data?.kind === 'incident-saved') handler(e.data);
  };
  window.addEventListener('message', onMsg);
  return () => {
    window.removeEventListener('message', onMsg);
    try { bc?.close(); } catch { /* already closed */ }
  };
}

/** True when this document is running as the popped-out report window. */
export function isReportWindow() {
  try { return /#\/incident-report\b/.test(window.location.hash); } catch { return false; }
}
