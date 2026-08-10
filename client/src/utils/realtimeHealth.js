/**
 * realtimeHealth.js — is live push actually delivering, and how old is what I see?
 *
 * WHY THIS EXISTS
 * --------------
 * @supabase/realtime-js already ships the MECHANISM: a 25s heartbeat
 * (CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL) and a reconnect schedule
 * ([1000, 2000, 5000, 10000]). None of that was ever the missing piece. What was
 * missing is that NOTHING WATCHED IT. Five of our six subscribe sites discarded
 * the status callback entirely; only the kiosk read `SUBSCRIBED`, and
 * CHANNEL_ERROR / TIMED_OUT / CLOSED were read nowhere at all.
 *
 * That is the same shape as the outage this came from: live push was dead on
 * production for 34 days (2026-06-27 → 07-31) and every screen kept working off
 * its poll backstop, so nobody knew. A mechanism nobody observes is not a
 * mechanism, it is a hope.
 *
 * WHAT THE MARKET ACTUALLY SHIPS (surveyed 2026-07-31, ~28 products, 11 with
 * non-marketing docs) — this module deliberately matches it:
 *   - a persistent connection indicator on the operational surface: 3 of 11
 *   - a data-freshness / last-update display: 2 of 11, and the best example is a
 *     station-alerting appliance that shows, always, in its header, "the date and
 *     time of the last handshake received from the CAD system" — the closest
 *     product class to a firehouse wall display, and the ONLY one in the sample
 *     that protects the READ path (can I trust this screen?) rather than only the
 *     WRITE path (will my input survive?).
 *   - accelerated polling while push is down: 0 of 22. NOT AN OVERSIGHT. The
 *     mission-critical pattern is the inverse — a 9-1-1 equipment standard, on
 *     detecting trouble, drops to a 10s HEARTBEAT while mandating "stop sending
 *     new requests on that link". Probe cheaply, quiesce the expensive stream,
 *     and carry real work on a second path. So we do NOT change poll cadence
 *     here: on Vercel serverless against a bounded Supabase pooler, an 8x
 *     request-rate spike from every client at once turns "one card is stale" into
 *     "the whole app is down", which is a strictly worse life-safety outcome than
 *     staleness an operator can SEE.
 *
 * THE PRINCIPLE
 * -------------
 * A life-safety surface does not need maximum freshness. It needs BOUNDED,
 * HONESTLY-DISCLOSED staleness. An operator reading "feed down, data 22s old"
 * has correct situational awareness and picks up the radio — degraded but safe.
 * An operator reading a screen that looks live and isn't has FALSE situational
 * awareness. The second one is the one that hurts somebody.
 *
 * Deliberately NOT an alarm. No banner, no toast, no sound. The poll backstops
 * genuinely carry these surfaces, and a self-hosted deployment that never
 * configures Supabase Realtime is in a supported configuration, not a broken one.
 * The domains that most insist on annunciating signal loss (clinical monitoring,
 * industrial alarm management) are also the ones most damaged by over-annunciating
 * it — false positives are the leading documented reason staff switch alarms off.
 * A warning that cries wolf on every wifi blip is ignored on the night it matters.
 */

// Terminal/unhealthy channel states reported by realtime-js.
const BAD = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

const _topics = new Map();   // topic → { status, since }
let _lastMessageAt = null;   // ms epoch of the last broadcast actually received
const _subs = new Set();

function _emit() { for (const fn of _subs) { try { fn(); } catch { /* a bad listener must not break the feed */ } } }

/**
 * Report a channel status transition. Wire this into .subscribe((status) => ...)
 * at EVERY subscribe site — the callback that was previously thrown away.
 */
export function reportChannelStatus(topic, status) {
  if (!topic) return;
  const prev = _topics.get(topic);
  if (prev?.status === status) return;            // no churn on repeats
  _topics.set(topic, { status, since: Date.now() });
  _emit();
}

/** Report that a broadcast actually arrived — the only proof push is really working. */
export function reportMessageReceived() {
  _lastMessageAt = Date.now();
  _emit();
}

/** Drop a topic's state when its channel is torn down (component unmount). */
export function forgetChannel(topic) {
  if (topic && _topics.delete(topic)) _emit();
}

/** Subscribe to health changes. Returns an unsubscribe fn. */
export function onHealthChange(fn) { _subs.add(fn); return () => _subs.delete(fn); }

/**
 * Current health snapshot.
 *   configured — was a realtime client built at all (build-time VITE_SUPABASE_*)
 *   live       — at least one channel SUBSCRIBED and none in a bad state
 *   lastMessageAt — ms epoch of the last received broadcast, or null
 */
export function getRealtimeHealth(configured) {
  const states = [...(_topics.values() || [])].map((v) => v.status);
  const anyBad = states.some((s) => BAD.has(s));
  const anyGood = states.some((s) => s === 'SUBSCRIBED');
  return {
    configured: !!configured,
    live: !!configured && anyGood && !anyBad,
    // No channels yet (initial mount) is NOT "down" — don't flash a warning during boot.
    pending: !!configured && states.length === 0,
    lastMessageAt: _lastMessageAt,
    topics: Object.fromEntries(_topics),
  };
}

/**
 * Jittered reconnect schedule, passed to the realtime client as reconnectAfterMs.
 *
 * realtime-js defaults to [1000, 2000, 5000, 10000] — capped exponential-ish, but
 * UNJITTERED. Unjittered backoff spreads load in time without decorrelating
 * clients: every client that fails on the same trigger retries in lockstep, and
 * the herd stays phase-locked through every step. Randomization is what breaks
 * the lock. Cloud-provider guidance and the SRE literature both call jittered
 * backoff the standard approach ("always use randomized exponential backoff").
 *
 * Full jitter: random(0, min(cap, base * 2^n)). Cheap insurance; matters more as
 * a department's device count grows (wall displays + rigs + phones all reconnect
 * together when a station's uplink flaps).
 */
export function jitteredReconnectAfterMs(tries) {
  const base = 1000, cap = 10000;
  const ceiling = Math.min(cap, base * 2 ** Math.max(0, (tries || 1) - 1));
  return Math.floor(Math.random() * ceiling) + 250; // 250ms floor: never a busy-loop
}
