/**
 * PresenterOverlay.jsx — Timed callout bubbles for the 5-minute demo
 *
 * Shows animated callout bubbles that guide the audience's attention
 * to the right part of the screen at the right moment. Perfect for
 * screen share / Zoom demos where you can't point at the screen.
 *
 * Each callout has a timestamp, the text to display, and an auto-dismiss timer.
 * All callouts share ONE screen anchor (see CALLOUT_ANCHOR) — per-callout
 * positioning was removed because it occluded live controls mid-demo.
 */

import { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowRight, Eye } from 'lucide-react';

// ─── Callout definitions for the 5-minute demo ──────────────────────────────
// Each entry fires at a specific demo timestamp and tells the audience what to
// watch. Anchoring is not per-callout — see CALLOUT_ANCHOR below.

const CALLOUTS = [
  { t: 0, duration: 8,
    text: '🚨 A 911 call just came in. Watch the map — apparatus are being dispatched automatically.' },
  { t: 10, duration: 6,
    text: '🗺️ Response Map — see the units converging on the scene from different stations.' },
  { t: 18, duration: 5,
    text: '📻 Listen — that\'s the radio traffic. Every transmission is logged automatically.' },
  { t: 25, duration: 5,
    text: '🚒 Watch the unit cards change color: gray → blue (en route) → green (on scene).' },
  { t: 35, duration: 7,
    text: '📍 Engine 1 is on scene. Size-up happening now. Watch the ICS org chart appear...' },
  { t: 39, duration: 6,
    text: '🏗️ ICS Org Chart — the command structure is building itself. IC, Safety Officer, Operations...' },
  { t: 47, duration: 5,
    text: '👥 Personnel checking in — 13 firefighters auto-assigned to teams as they arrive.' },
  { t: 55, duration: 6,
    text: '⚡ Assignments flowing from Command to the unit board. The IC spoke once — the app captured it all.' },
  { t: 63, duration: 5,
    text: '📟 2nd alarm struck — mutual aid responding. Watch new units appear on the map.' },
  { t: 70, duration: 5,
    text: '🎥 Commander Cam — simulated helmet camera feeds showing the fireground in real time.' },
  { t: 78, duration: 7,
    text: '👥 PAR CHECK — every firefighter tracked. The system flags anyone who hasn\'t reported in.' },
  { t: 90, duration: 5,
    text: '✅ 14 of 14 personnel accounted for. That\'s 45 minutes of manual tracking — done automatically.' },
  { t: 100, duration: 6,
    text: '🔥 Fire knocked down. Watch the milestones stamp: Dispatched → En Route → On Scene → Water On → Under Control.' },
  { t: 110, duration: 5,
    text: '🔄 Overhaul phase. Attack crew rotating to Rehab. Fresh crew taking over. All tracked live.' },
  { t: 120, duration: 8,
    text: '📝 Incident under control. One click generates the exposure records and after-action report — the officer writes the narrative.' },
  { t: 132, duration: 10,
    text: '✅ Full incident lifecycle — dispatch to under control — in 2 minutes. In real life this takes hours of manual entry. OpenFirehouse does it live.' },
];

// ─── Position ────────────────────────────────────────────────────────────────
// ONE anchor for every callout, deliberately. These used to move between nine
// anchors per callout, which put narration over the top-nav actions (Messages /
// My Portal / Assistant) and mid-screen over the Personnel header and the Add
// Resource / Request Aid row — during a sales demo, on the surface being sold.
// A narrator caption belongs in one predictable place the audience learns once:
// bottom-center, clear of the sidebar (left), the top nav, and the floating
// action row (bottom-right). It is also pointer-events-none, so it can never
// swallow a click even while visible.
const CALLOUT_ANCHOR = 'bottom-6 left-1/2 -translate-x-1/2';

// ─── Component ───────────────────────────────────────────────────────────────

export default function PresenterOverlay({ elapsedSecs, enabled }) {
  const [activeCallout, setActiveCallout] = useState(null);
  const [visible, setVisible] = useState(false);
  const firedRef = useRef(new Set());

  useEffect(() => {
    if (!enabled) return;

    CALLOUTS.forEach((c, idx) => {
      if (!firedRef.current.has(idx) && elapsedSecs >= c.t && elapsedSecs < c.t + c.duration) {
        firedRef.current.add(idx);
        setActiveCallout(c);
        setVisible(true);

        // Auto-dismiss
        setTimeout(() => {
          setVisible(false);
          setTimeout(() => setActiveCallout(null), 500); // fade out
        }, c.duration * 1000);
      }
    });
  }, [elapsedSecs, enabled]);

  // Reset when demo restarts
  useEffect(() => {
    if (elapsedSecs === 0) {
      firedRef.current = new Set();
      setActiveCallout(null);
      setVisible(false);
    }
  }, [elapsedSecs]);

  if (!activeCallout || !enabled) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed ${CALLOUT_ANCHOR} z-[60] w-[min(36rem,calc(100vw-2rem))] transition-all duration-500 pointer-events-none ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <div className="bg-gray-900/95 backdrop-blur-sm border border-amber-500/50 rounded-2xl px-5 py-3 shadow-2xl shadow-amber-900/20">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <Eye size={16} className="text-amber-400" />
          </div>
          <p className="text-sm text-white font-medium leading-relaxed">
            {activeCallout.text}
          </p>
        </div>
      </div>
    </div>
  );
}
