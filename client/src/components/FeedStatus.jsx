/**
 * FeedStatus — "can I trust what is on this screen right now?"
 *
 * Renders a quiet, always-present line stating which channel is carrying this
 * surface and when it last actually updated. Modeled directly on the one product
 * in the 2026-07-31 market survey that protects the READ path: a station-alerting
 * appliance whose touchscreen header permanently shows "the date and time of the
 * last handshake received from the CAD system", alongside station identity and
 * software version. Three of the four surveyed degraded-mode implementations only
 * answer "will my input survive?" — exactly one answers "can I trust this
 * display?". That is the gap this fills.
 *
 * DELIBERATELY NOT AN ALARM. No banner, no toast, no colour-flash, no sound. The
 * 20-30s poll backstops genuinely carry every live surface, and a self-host that
 * never configures Supabase Realtime is in a SUPPORTED configuration. The domains
 * that most insist on annunciating loss-of-signal (clinical monitoring, industrial
 * alarm management) are the same ones most damaged by over-annunciating it: false
 * positives are the documented leading reason staff disable alarms, and one of
 * those standards sets a KPI of fewer than five stale alarms per console per day.
 * A warning that fires on every wifi blip is ignored on the night it matters.
 *
 * It shows state in BOTH directions on purpose. "Live" is a positive assertion an
 * operator can rely on; only rendering something when things are broken means the
 * healthy case is indistinguishable from a component that failed to mount.
 */
import { useEffect, useState } from 'react';
import { realtimeStatus } from '../utils/supabase';
import { getRealtimeHealth, onHealthChange } from '../utils/realtimeHealth';

const hhmmss = (ms) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function FeedStatus({ className = '' }) {
  const [, force] = useState(0);

  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    const off = onHealthChange(rerender);
    // Re-render on a slow tick so the "as of" age stays honest without the
    // feed having to change. 5s is enough resolution for a wall display and
    // costs nothing; visibility-gated so a backgrounded tab does no work.
    const t = setInterval(() => { if (!document.hidden) rerender(); }, 5000);
    const onVis = () => { if (!document.hidden) rerender(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { off(); clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const h = getRealtimeHealth(realtimeStatus.enabled);
  const stamp = h.lastMessageAt ? hhmmss(h.lastMessageAt) : null;

  // Boot: channels have not reported yet. Say nothing rather than flash a warning.
  if (h.pending) return null;

  let text, tone, title;
  if (!h.configured) {
    text = 'Polling · 20s';
    tone = 'text-gray-500 dark:text-gray-400';
    title = `Live push is not configured on this deployment (${realtimeStatus.reason}). `
      + 'This surface refreshes on a 20-30s poll instead of instantly. Supported, but slower.';
  } else if (h.live) {
    // NOT the word "Live" — these surfaces already carry their own Live badge, and
    // saying it twice rendered as "Unit Status — LiveLive · 11:35:56 PM" on prod
    // (caught in the browser pass; the build was green and said nothing). The badge
    // asserts liveness; this component's job is FRESHNESS. "as of" also degrades
    // gracefully: if the stamp goes stale on screen, an operator reads the age
    // directly instead of being told "Live" by a component that cannot know.
    // Connected but nothing has arrived yet (normal for the first seconds after
    // mount, and for a quiet night): say NOTHING. The surface's own Live badge
    // already covers it, and "Live connected" is noise. The instant real data
    // flows this becomes a timestamp, which is the part that carries information.
    if (!stamp) return null;
    text = `as of ${stamp}`;
    tone = 'text-gray-500 dark:text-gray-400';
    title = stamp
      ? `Live push connected. Last update received at ${stamp}.`
      : 'Live push connected. No update received yet.';
  } else {
    text = stamp ? `Feed down · last ${stamp}` : 'Feed down · polling';
    tone = 'text-amber-600 dark:text-amber-400';
    title = 'Live push is not connected — reconnecting automatically. This surface is '
      + 'refreshing on its 20-30s poll, so what you see may be up to 30s old. '
      + 'Confirm anything time-critical over the radio.';
  }

  return (
    <span className={`text-[10px] font-medium tabular-nums ${tone} ${className}`} title={title}>
      {text}
    </span>
  );
}
