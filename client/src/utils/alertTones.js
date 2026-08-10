// utils/alertTones.js — operational alert tones (2026-07-13).
//
// The public CAD functional standard allows "a tone and/or a visual prompt"
// on dispatch and timer events; until now OF was visual-only (the only audio
// in the app was the demo timeline's radio effects). These are SYNTHESIZED
// WebAudio tones — no audio assets, nothing to license, nothing to fail to
// load offline.
//
// MARKET-ALIGNED defaults (Matt, 2026-07-13 — "in line with our competitors,
// not different"): every major responder/station-alerting product ships
// dispatch tones ON by default, and dispatch repeats until acknowledged.
//   - Tones default ON per WORKSTATION; the speaker toggle is the OPT-OUT
//     (per-device configurability is also the market norm).
//   - The DISPATCH tone repeats until the alert is acknowledged (see App.jsx
//     repeat effect; capped so an unattended kiosk doesn't tone forever).
//     Overdue/PAR remain single-shot rising-edge — those are attention cues
//     with persistent flashing UI, not primary alerting.
//   - Browser constraint, stated honestly: web audio is BLOCKED until the
//     first user gesture on the page (autoplay policy — no web app can
//     bypass it). We unlock on the first pointer/key event; until then tones
//     skip silently and the visual alert is the load-bearing channel. Phones
//     get true always-on alerting via push notifications, not the web tones.

const KEY = 'of_alert_tones';

let ctx = null;
function ensureCtx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx || ctx.state === 'closed') ctx = new AC();
  return ctx;
}

// Unlock on the first user gesture (autoplay policy).
if (typeof window !== 'undefined') {
  const unlock = () => {
    const c = ensureCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

export function tonesEnabled() {
  // Default ON (market norm) — only an explicit opt-out silences a workstation.
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setTonesEnabled(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

/** One beep. */
function beep(c, { freq, at, dur, gain = 0.18, type = 'sine' }) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.02);
  g.gain.setValueAtTime(gain, at + dur - 0.04);
  g.gain.linearRampToValueAtTime(0, at + dur);
  osc.connect(g).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.01);
}

function play(pattern) {
  if (!tonesEnabled()) return false;
  const c = ensureCtx();
  if (!c || c.state !== 'running') return false; // locked → visual-only, silently
  const t0 = c.currentTime + 0.02;
  for (const p of pattern) beep(c, { ...p, at: t0 + p.at });
  return true;
}

/** New dispatch — classic two-tone hi→lo station alert (assertive; the web
 * can't control system volume, so the synth gain carries the urgency). */
export function toneDispatch() {
  return play([
    { freq: 950, at: 0.00, dur: 0.35, type: 'square', gain: 0.28 },
    { freq: 640, at: 0.40, dur: 0.55, type: 'square', gain: 0.28 },
  ]);
}

/** Status-timer overdue — triple mid beep (attention, not alarm). */
export function toneOverdue() {
  return play([
    { freq: 880, at: 0.00, dur: 0.12 },
    { freq: 880, at: 0.20, dur: 0.12 },
    { freq: 880, at: 0.40, dur: 0.12 },
  ]);
}

/**
 * CAD interface TROUBLE — a low, slow, two-pulse signal (4C.4).
 *
 * NFPA 1221 §3.3.85 names this artifact a "Trouble Signal": a signal indicating a FAULT in a
 * monitored component, and the fire-alarm convention it comes from is that a trouble signal
 * must be DISTINGUISHABLE from an alarm. So this is deliberately the opposite shape to
 * toneDispatch(): low instead of high, slow instead of urgent, quiet instead of assertive.
 * An operator must never confuse "your CAD link is broken" with "there is a call".
 *
 * 09 NCAC 06C .0213(a)(4) is the rule requiring the audible half at all — and it is ONE
 * STATE's rule, not a multi-state norm (the market pass in the 4C.2 spec looked and found no
 * equivalent). It is honoured because the cost is a tone; it is not generalised.
 */
export function toneTrouble() {
  return play([
    { freq: 320, at: 0.00, dur: 0.28, type: 'sine', gain: 0.16 },
    { freq: 320, at: 0.46, dur: 0.28, type: 'sine', gain: 0.16 },
  ]);
}

/** PAR overdue — urgent rising pair, repeated once (accountability check due). */
export function tonePar() {
  return play([
    { freq: 700, at: 0.00, dur: 0.16, type: 'triangle' },
    { freq: 1050, at: 0.18, dur: 0.22, type: 'triangle' },
    { freq: 700, at: 0.55, dur: 0.16, type: 'triangle' },
    { freq: 1050, at: 0.73, dur: 0.22, type: 'triangle' },
  ]);
}
