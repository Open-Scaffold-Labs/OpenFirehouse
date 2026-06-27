/**
 * PresenterOverlay.jsx — Timed callout bubbles for the 5-minute demo
 *
 * Shows animated callout bubbles that guide the audience's attention
 * to the right part of the screen at the right moment. Perfect for
 * screen share / Zoom demos where you can't point at the screen.
 *
 * Each callout has a timestamp, a pointer direction (top/bottom/left/right),
 * the text to display, and an auto-dismiss timer.
 */

import { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowRight, Eye } from 'lucide-react';

// ─── Callout definitions for the 5-minute demo ──────────────────────────────
// Each entry fires at a specific demo timestamp and points the audience
// to what they should be watching.

const CALLOUTS = [
  { t: 0, duration: 8, position: 'top-center',
    text: '🚨 A 911 call just came in. Watch the map — apparatus are being dispatched automatically.' },
  { t: 10, duration: 6, position: 'top-left',
    text: '🗺️ Response Map — see the units converging on the scene from different stations.' },
  { t: 18, duration: 5, position: 'top-right',
    text: '📻 Listen — that\'s the radio traffic. Every transmission is logged automatically.' },
  { t: 25, duration: 5, position: 'middle-left',
    text: '🚒 Watch the unit cards change color: gray → blue (en route) → green (on scene).' },
  { t: 35, duration: 7, position: 'top-center',
    text: '📍 Engine 1 is on scene. Size-up happening now. Watch the ICS org chart appear...' },
  { t: 39, duration: 6, position: 'top-left',
    text: '🏗️ ICS Org Chart — the command structure is building itself. IC, Safety Officer, Operations...' },
  { t: 47, duration: 5, position: 'bottom-left',
    text: '👥 Personnel checking in — 13 firefighters auto-assigned to teams as they arrive.' },
  { t: 55, duration: 6, position: 'top-left',
    text: '⚡ Assignments flowing from Command to the unit board. The IC spoke once — the app captured it all.' },
  { t: 63, duration: 5, position: 'top-center',
    text: '📟 2nd alarm struck — mutual aid responding. Watch new units appear on the map.' },
  { t: 70, duration: 5, position: 'bottom-right',
    text: '🎥 Commander Cam — simulated helmet camera feeds showing the fireground in real time.' },
  { t: 78, duration: 7, position: 'middle-center',
    text: '👥 PAR CHECK — every firefighter tracked. The system flags anyone who hasn\'t reported in.' },
  { t: 90, duration: 5, position: 'bottom-left',
    text: '✅ 14 of 14 personnel accounted for. That\'s 45 minutes of manual tracking — done automatically.' },
  { t: 100, duration: 6, position: 'top-center',
    text: '🔥 Fire knocked down. Watch the milestones stamp: Dispatched → En Route → On Scene → Water On → Under Control.' },
  { t: 110, duration: 5, position: 'middle-right',
    text: '🔄 Overhaul phase. Attack crew rotating to Rehab. Fresh crew taking over. All tracked live.' },
  { t: 120, duration: 8, position: 'top-center',
    text: '📝 Incident under control. One click generates the exposure records and after-action report — the officer writes the narrative.' },
  { t: 132, duration: 10, position: 'middle-center',
    text: '✅ Full incident lifecycle — dispatch to under control — in 2 minutes. In real life this takes hours of manual entry. OpenFirehouse does it live.' },
];

// ─── Position styles ─────────────────────────────────────────────────────────

const POSITIONS = {
  'top-left':      'top-4 left-4',
  'top-center':    'top-4 left-1/2 -translate-x-1/2',
  'top-right':     'top-4 right-4',
  'middle-left':   'top-1/2 -translate-y-1/2 left-4',
  'middle-center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  'middle-right':  'top-1/2 -translate-y-1/2 right-4',
  'bottom-left':   'bottom-4 left-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  'bottom-right':  'bottom-4 right-4',
};

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

  const pos = POSITIONS[activeCallout.position] || POSITIONS['top-center'];

  return (
    <div className={`fixed ${pos} z-[60] max-w-md transition-all duration-500 pointer-events-none ${
      visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
    }`}>
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
