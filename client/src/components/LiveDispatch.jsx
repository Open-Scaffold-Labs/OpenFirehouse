import { useState, useEffect, useRef, useCallback } from 'react';
import { Siren, Radio, MapPin, Clock, Truck, Bell, BellOff, ArrowRight, Zap, Settings, ChevronDown, ChevronUp, Satellite, Maximize2, Moon, Sun, X, CheckCircle2, Loader2, Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import { canClearCalls } from '../data/auth';
import { tonesEnabled, setTonesEnabled, toneDispatch } from '../utils/alertTones';
import { toggleTheme } from '../utils/theme';
import { loadMapKit, resolveCoordinate, routeBetween, regionForPoints, getDevicePosition,
         resolveRouteOrigin, MAX_GPS_ORIGIN_MI } from '../utils/mapkit';
import { supabase, unitLocationsTopic } from '../utils/supabase';
import { reportChannelStatus, reportMessageReceived, forgetChannel } from '../utils/realtimeHealth';
import FeedStatus from './FeedStatus';
import ScreenErrorBoundary from './ScreenErrorBoundary';

// Canonical 7-status colors (migration 0022) for live apparatus dots on the map.
const UNIT_STATUS_HEX = {
  in_service: '#10b981', on_the_air: '#14b8a6', returning: '#34d399',
  dispatched: '#f59e0b', enroute: '#fb923c', on_scene: '#ef4444', out_of_service: '#6b7280',
  transporting: '#c084fc', at_hospital: '#60a5fa', // EMS extension 2026-07-13
};
const unitStatusHex = (s) => UNIT_STATUS_HEX[s] || '#6b7280';
// "Tower Ladder 1" -> "TL1", "Engine 1" -> "E1".
function unitAbbrev(designation) {
  const letters = String(designation).split(/\s+/).filter((w) => /[a-z]/i.test(w)).map((w) => w[0]).join('');
  const num = (String(designation).match(/\d+/) || [''])[0];
  return (letters + num).toUpperCase().slice(0, 4) || String(designation).slice(0, 3).toUpperCase();
}

// ─── Live Dispatch Feed ────────────────────────────────────────────────────────
// Shows the real-time CAD dispatch stream inside the "Dispatch & Command" tab.
// Props:
//   dispatches  — array of dispatch objects from the SSE stream
//   onClearBadge — clears the notification badge
//   onNavigate   — switches to the Command Board tab

const PRIORITY_COLORS = {
  high:   { bg: 'bg-red-50 dark:bg-red-950/50',    border: 'border-red-300 dark:border-red-900',   badge: 'bg-red-600',    text: 'text-red-700 dark:text-red-300'    },
  medium: { bg: 'bg-amber-50 dark:bg-amber-950/50',  border: 'border-amber-300 dark:border-amber-900', badge: 'bg-amber-500',  text: 'text-amber-700 dark:text-amber-300'  },
  low:    { bg: 'bg-blue-50 dark:bg-blue-950/50',   border: 'border-blue-200 dark:border-blue-900',  badge: 'bg-blue-500',   text: 'text-blue-700 dark:text-blue-300'   },
};

const STATUS_STYLES = {
  dispatched: { label: 'Dispatched', color: 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'       },
  en_route:   { label: 'En Route',   color: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'   },
  on_scene:   { label: 'On Scene',   color: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' },
  available:  { label: 'Available',  color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'     },
  closed:     { label: 'Closed',     color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'     },
};

// ─── Demo Scenarios ──────────────────────────────────────────────────────────
const DEMO_SCENARIOS = [
  {
    description: 'Structure Fire - 2nd Alarm',
    address: '775 Route 22',
    city: 'Maplewood',
    state: 'NJ',
    units: 'Engine 1, Ladder 1, Rescue 1',
    details: 'Two-story commercial building, smoke showing from rear. Hannigan\'s Fuel & Auto.',
  },
  {
    description: 'MVA with Entrapment',
    address: 'Route 15 & Bridge St',
    city: 'Maplewood',
    state: 'NJ',
    units: 'Engine 1, Rescue 1',
    details: 'Two-vehicle head-on, one occupant pinned. PD on scene.',
  },
  {
    description: 'Medical - Cardiac Arrest',
    address: '540 Elm St, Apt 2B',
    city: 'Maplewood',
    state: 'NJ',
    units: 'Engine 1, Rescue 1',
    details: '72 y/o male, unresponsive, CPR in progress by bystander.',
  },
  {
    description: 'Residential Fire Alarm',
    address: '200 Oak Lane',
    city: 'Maplewood',
    state: 'NJ',
    units: 'Engine 1',
    details: 'Automatic alarm activation, smoke detector 2nd floor. Keyholder notified.',
  },
  {
    description: 'Hazmat - Gas Leak',
    address: '1200 Industrial Pkwy',
    city: 'Maplewood',
    state: 'NJ',
    units: 'Engine 1, Hazmat 1, Rescue 1',
    details: 'Natural gas odor, employees evacuating. Gas company en route.',
  },
  {
    description: 'Water Rescue',
    address: 'Riverside Park, River Rd',
    city: 'Maplewood',
    state: 'NJ',
    units: 'Rescue 1, Engine 1, Marine 1',
    details: 'Kayaker overturned, clinging to bridge pylon. Swift water conditions.',
  },
];

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function formatTime(ts) {
  if (!ts) return '--:--';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── MiniMap ─────────────────────────────────────────────────────────────────
// Small Apple Maps (hybrid) map with the incident pin. Used by the dispatch
// card thumbnails and the right-panel "latest active call" view so every map on
// Live Dispatch is Apple — no Google/OSM iframes.
function MiniMap({ address, height = 240, label = 'Apple Maps' }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  useEffect(() => {
    if (!address) return undefined;
    let cancelled = false;
    loadMapKit()
      .then(async (mk) => {
        if (cancelled || !elRef.current) return;
        const map = new mk.Map(elRef.current, {
          showsCompass: mk.FeatureVisibility.Hidden,
          showsZoomControl: false,
          showsMapTypeControl: false,
          isRotationEnabled: false,
        });
        map.mapType = mk.Map.MapTypes.Hybrid;
        mapRef.current = map;
        const result = await resolveCoordinate(mk, address);
        if (cancelled || !mapRef.current) return;
        if (!result) return; // map stays on screen at default region — never blank
        const { coordinate, precise } = result;
        map.addAnnotation(new mk.MarkerAnnotation(coordinate, { color: '#dc2626', glyphText: '!' }));
        const span = precise ? 0.005 : 0.05;
        map.region = new mk.CoordinateRegion(coordinate, new mk.CoordinateSpan(span, span));
      })
      .catch(() => { /* map stays on screen; nothing to surface */ });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        try { mapRef.current.destroy(); } catch (_) { /* noop */ }
        mapRef.current = null;
      }
    };
  }, [address]);
  return (
    <div className="relative">
      <div ref={elRef} style={{ height: `${height}px`, width: '100%', display: 'block' }} />
      <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 text-white text-[10px] font-semibold px-2 py-1 rounded-lg backdrop-blur-sm">
        <Satellite size={10} /> {label}
      </div>
    </div>
  );
}

// ─── Clear-time release prompt (2026-07-12) ──────────────────────────────────
// The documented mature CAD pattern: closing a call with units still committed
// WARNS the dispatcher, LISTS the blocking units, and takes a human-confirmed
// release. Nothing is automatic — "Release & Clear" is the dispatcher's own
// action (each release lands in unit_status_history under their id, and the
// units go to Returning, the radio ladder's "back in service" state). "Clear
// call only" leaves them committed — the orphan amber on the status board
// still covers that path.
// Clear-time disposition = the NERIS `type_noaction` reason (verified vs USFA NERIS
// Release 1.0.1). Only set when the call did NOT become a working incident; when it
// did, leave it blank — the actions/type are captured on the incident record (the
// NERIS way, and how the market's command boards handle it). Mirrors routes/cad.js.
const DISPOSITION_OPTIONS = [
  ['', 'No disposition (call became an incident)'],
  ['CANCELLED',         'Cancelled'],
  ['STAGED_STANDBY',    'Staged / standby'],
  ['NO_INCIDENT_FOUND', 'No incident found'],
];

function ClearCallModal({ d, onClose, onCleared }) {
  const [units, setUnits]     = useState(null); // null = loading
  const [checked, setChecked] = useState(new Set());
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);
  const [disposition, setDisposition] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get(`/api/cad/alerts/${d.id}/committed-units`);
        if (!alive) return;
        const list = res?.data || [];
        setUnits(list);
        setChecked(new Set(list.map((u) => u.apparatusId))); // default: release all
      } catch {
        // loadFailed — NOT the same as "no units committed": never claim a
        // status we couldn't read (accuracy doctrine). The dispatcher can
        // still clear; any committed units stay covered by the orphan flag.
        if (alive) { setUnits([]); setLoadFailed(true); setError('Could not check unit statuses — clearing is still available; committed units will show on the status board.'); }
      }
    })();
    return () => { alive = false; };
  }, [d.id]);

  const toggle = (id) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  async function doClear(releaseUnits) {
    setBusy(true);
    setError(null);
    try {
      const body = {};
      if (releaseUnits) body.releaseUnits = releaseUnits;
      if (disposition)  body.disposition  = disposition;
      const res = await api.post(`/api/cad/alerts/${d.id}/clear`, body);
      onCleared(d.id, res?.data?.released || []);
    } catch {
      setError('Failed to clear the call. Try again.');
      setBusy(false);
    }
  }

  const statusLabel = { dispatched: 'Dispatched', enroute: 'En Route', on_scene: 'On Scene' };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-base font-black text-gray-900 dark:text-gray-100">Clear this call?</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Cancel">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-3">
          {d.description || d.type || 'Call'}{d.address ? ` — ${d.address}` : ''}
        </p>

        {units === null ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-3">
            <Loader2 size={16} className="animate-spin" /> Checking unit statuses…
          </div>
        ) : units.length === 0 ? (
          !loadFailed && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2 mb-3">
              <CheckCircle2 size={15} /> No units are still committed to this call.
            </div>
          )
        ) : (
          <div className="mb-3">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mb-2">
              {units.length} unit{units.length === 1 ? ' is' : 's are'} still committed. Release to Returning?
            </p>
            <div className="space-y-1.5">
              {units.map((u) => (
                <label key={u.apparatusId} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="unit-release"
                    data-unit={u.apparatusId}
                    checked={checked.has(u.apparatusId)}
                    onChange={() => toggle(u.apparatusId)}
                    className="h-4 w-4 accent-red-600"
                  />
                  <Truck size={14} className="text-gray-400" />
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1">{u.designation}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
                    {statusLabel[u.status] || u.status}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Release is your action as dispatch — confirm status over the radio as usual. Unreleased units stay flagged on the status board.
            </p>
          </div>
        )}

        {/* Disposition — how the call resolved (optional, never blocks the clear) */}
        <div className="mb-3">
          <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Disposition
          </label>
          <select
            data-testid="call-disposition"
            value={disposition}
            onChange={(e) => setDisposition(e.target.value)}
            className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-2.5 py-2"
          >
            {DISPOSITION_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>

        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

        <div className="flex flex-col gap-2">
          {units && units.length > 0 && (
            <button
              disabled={busy || checked.size === 0}
              onClick={() => doClear([...checked])}
              className="w-full py-2.5 text-sm font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors"
            >
              {busy ? 'Clearing…' : `Release ${checked.size} to Returning & Clear Call`}
            </button>
          )}
          <button
            data-testid="call-clear"
            disabled={busy || units === null}
            onClick={() => doClear(null)}
            className="w-full py-2.5 text-sm font-bold rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 disabled:opacity-50 transition-colors"
          >
            {units && units.length > 0 ? 'Clear call only (leave statuses)' : busy ? 'Clearing…' : 'Clear Call'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Per-WORKSTATION alert-tone toggle. Tones are ON by default (market norm —
// every major responder/station product ships audible alerting on); this is
// the OPT-OUT for a workstation that shouldn't sound (chief's laptop in a
// meeting). Re-enabling plays the dispatch tone once — audible confirmation
// AND the user gesture that unlocks the browser's audio context in one tap.
function ToneToggle() {
  const [on, setOn] = useState(tonesEnabled());
  return (
    <button
      onClick={() => {
        const next = !on;
        setTonesEnabled(next);
        setOn(next);
        if (next) toneDispatch(); // confirm + unlock in the same gesture
      }}
      title={on ? 'Alert tones ON (this workstation)' : 'Alert tones OFF (this workstation)'}
      aria-label={on ? 'Disable alert tones' : 'Enable alert tones'}
      className={`p-2 rounded-lg border transition-colors ${
        on
          ? 'border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40'
          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      {on ? <Volume2 size={14} /> : <VolumeX size={14} />}
    </button>
  );
}

function DispatchCard({ d, onActivate, onClear }) {
  const priority = d.priority || 'high';
  const colors = PRIORITY_COLORS[priority] || PRIORITY_COLORS.high;
  const status = STATUS_STYLES[d.status] || STATUS_STYLES.dispatched;
  const units = Array.isArray(d.units) ? d.units : (d.units || '').split(',').map(u => u.trim()).filter(Boolean);
  const [expanded, setExpanded] = useState(false);

  const address = d.address || d.location || '';
  const fullAddress = [address, d.city, d.state].filter(Boolean).join(', ');

  return (
    <div data-testid="dispatch-card" data-status={d.status} data-dispatched-at={d.dispatched_at || d.timestamp} className={`rounded-xl border-2 ${colors.border} ${colors.bg} transition-all hover:shadow-md overflow-hidden`}>
      {/* Clickable summary row — a real disclosure control (W4.3 follow-up:
          this was a bare clickable div, invisible to keyboards and screen
          readers; now Enter/Space toggle it and AT announces the state) */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${d.description || d.type || 'Dispatch call'} — ${expanded ? 'collapse' : 'expand'} details`}
        className="p-4 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:-outline-offset-2"
        onClick={() => setExpanded(v => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(v => !v);
          }
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Siren size={18} className={colors.text} />
            <div className="min-w-0">
              <p className={`text-sm font-black ${colors.text} truncate`}>
                {d.description || d.type || 'Unknown Call'}
              </p>
              {d.id && (
                <p className="text-[10px] text-gray-600 dark:text-gray-400 font-mono">{d.id}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${status.color}`}>
              {status.label}
            </span>
            {expanded
              ? <ChevronUp size={14} className="text-gray-400" />
              : <ChevronDown size={14} className="text-gray-400" />
            }
          </div>
        </div>

        {/* Details */}
        <div className="mt-3 space-y-1.5">
          {address && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <MapPin size={13} className="flex-shrink-0 text-gray-400" />
              <span className="truncate">{address}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <Clock size={13} className="flex-shrink-0 text-gray-400" />
            <span>{formatTime(d.dispatched_at || d.timestamp)} · {timeAgo(d.dispatched_at || d.timestamp)}</span>
          </div>
        </div>

        {/* Units */}
        {units.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {units.map((unit, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-0.5">
                <Truck size={11} className="text-gray-400" />
                {unit}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Expanded panel — map + action button ── */}
      {expanded && (
        <div className="border-t-2 border-dashed border-current border-opacity-20 bg-white/60 dark:bg-gray-900/60">

          {/* Map — Apple Maps (hybrid) with incident pin */}
          {(() => {
            return (
              <MiniMap address={fullAddress} height={240} />
            );
          })()}

          {/* Incident details if present */}
          {d.details && (
            <div className="mx-4 mb-3 mt-2 text-xs text-amber-700 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
              <span className="font-semibold text-amber-700 dark:text-amber-300">Details: </span>{d.details}
            </div>
          )}

          {/* Action buttons */}
          {(onActivate || onClear) && d.status !== 'closed' && (
            <div className="px-4 pb-4 space-y-2">
              {onActivate && (
                <button
                  onClick={(e) => { e.stopPropagation(); onActivate(d); }}
                  className={`w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg ${colors.text} bg-white dark:bg-gray-900 border-2 ${colors.border} hover:shadow-sm transition-all`}
                >
                  Open on Command Board <ArrowRight size={12} />
                </button>
              )}
              {onClear && (
                <button
                  onClick={(e) => { e.stopPropagation(); onClear(d); }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all"
                >
                  <CheckCircle2 size={12} /> Clear Call
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Simulate Dispatch Button ────────────────────────────────────────────────
function SimulateDispatchButton({ onAddDispatch }) {
  const [sending, setSending] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  async function fireDispatch(scenario) {
    setSending(true);
    setShowPicker(false);
    try {
      const now = new Date();
      const localId = `demo-${Date.now()}`;

      // Authenticated, tenancy-scoped simulate endpoint. The old path POSTed to
      // the public /api/cad/active911 webhook, which now 401s under the CAD
      // webhook-secret gate — so the dispatch never persisted or broadcast.
      // /api/cad/simulate runs behind the user's session and reuses the real
      // pipeline (persist + auto-dispatch units + Realtime ping).
      let result = {};
      try {
        result = await api.post('/api/cad/simulate', {
          description: scenario.description,
          address: [scenario.address, scenario.city, scenario.state].filter(Boolean).join(', '),
          units: scenario.units,
          details: scenario.details,
        });
      } catch (_) { /* server may be unavailable — still show locally */ }

      // Immediately inject into the dispatch list so it shows up instantly
      if (onAddDispatch) {
        onAddDispatch({
          id:           result.id || localId,
          alert_id:     localId,
          description:  scenario.description,
          address:      [scenario.address, scenario.city, scenario.state].filter(Boolean).join(', '),
          units:        scenario.units,
          details:      scenario.details,
          dispatched_at: now.toISOString(),
          status:       'dispatched',
          priority:     'high',
        });
      }
    } catch (err) {
      console.error('Simulate dispatch failed:', err);
    } finally {
      setTimeout(() => setSending(false), 500);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowPicker(v => !v)}
        disabled={sending}
        className="flex items-center gap-2 px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white text-xs font-black rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
      >
        <Zap size={14} className={sending ? 'animate-spin' : ''} />
        {sending ? 'Dispatching...' : 'Simulate Dispatch'}
      </button>

      {showPicker && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} />

          {/* Scenario picker */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700">
              <p className="text-xs font-black text-gray-700 dark:text-gray-300">Choose a scenario</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Fires a simulated CAD dispatch into the live feed</p>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {DEMO_SCENARIOS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => fireDispatch(s)}
                  className="w-full text-left px-4 py-3 hover:bg-red-50 dark:hover:bg-red-950/50 border-b border-gray-50 dark:border-gray-700 last:border-0 transition-colors"
                >
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{s.description}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.address}, {s.city}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{s.units}</p>
                </button>
              ))}
            </div>
            {/* Quick fire — random */}
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => fireDispatch(DEMO_SCENARIOS[Math.floor(Math.random() * DEMO_SCENARIOS.length)])}
                className="w-full flex items-center justify-center gap-2 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-lg transition-colors"
              >
                <Zap size={12} /> Random Dispatch
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── District Map (idle state) ───────────────────────────────────────────────
// Shown when no calls are active. Renders the department's coverage area on
// Apple Maps (hybrid/satellite). Center overridable via VITE_DISTRICT_LAT /
// VITE_DISTRICT_LNG / VITE_DISTRICT_ZOOM.
function DistrictMap({ departmentId = null }) {
  const lat  = parseFloat(import.meta.env.VITE_DISTRICT_LAT  || '40.7282');
  const lng  = parseFloat(import.meta.env.VITE_DISTRICT_LNG  || '-74.2090');
  const zoom = parseFloat(import.meta.env.VITE_DISTRICT_ZOOM || '13');
  const elRef  = useRef(null);
  const mapRef = useRef(null);
  const mkRef  = useRef(null);
  const annRef = useRef({});
  const [failed, setFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    let cancelled = false;
    loadMapKit()
      .then((mk) => {
        if (cancelled || !elRef.current) return;
        const map = new mk.Map(elRef.current, {
          showsCompass: mk.FeatureVisibility.Hidden,
          showsZoomControl: true,
          showsMapTypeControl: false,
          isRotationEnabled: false,
        });
        map.mapType = mk.Map.MapTypes.Hybrid;
        const delta = 360 / Math.pow(2, zoom); // approximate span from zoom level
        map.region = new mk.CoordinateRegion(
          new mk.Coordinate(lat, lng),
          new mk.CoordinateSpan(delta, delta),
        );
        mapRef.current = map;
        mkRef.current = mk;
        setMapReady(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      annRef.current = {};
      mkRef.current = null;
      if (mapRef.current) {
        try { mapRef.current.destroy(); } catch (_) { /* noop */ }
        mapRef.current = null;
      }
    };
  }, [lat, lng, zoom]);

  // Live apparatus positions: GET /api/units/locations + the per-department
  // Supabase Realtime channel, backed by a visibility-aware 30s poll.
  const loadLocations = useCallback(async () => {
    try {
      const { data } = await api.get('/api/units/locations');
      setLocations(Array.isArray(data) ? data : []);
    } catch (_) { /* keep last good data */ }
  }, []);

  useEffect(() => {
    const topic = unitLocationsTopic(departmentId);
    if (!topic || !supabase) return undefined; // no dept or no realtime client → poll backstops
    const channel = supabase
      .channel(topic)
      .on('broadcast', { event: 'update' }, () => { reportMessageReceived(); loadLocations(); })
      .subscribe((status) => reportChannelStatus(topic, status));
    return () => { forgetChannel(topic); supabase.removeChannel(channel); };
  }, [departmentId, loadLocations]);

  useEffect(() => {
    loadLocations();
    const t = setInterval(() => { if (!document.hidden) loadLocations(); }, 30000);
    const onVis = () => { if (!document.hidden) loadLocations(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [loadLocations]);

  // Sync status-colored apparatus pins onto the map (add / move / remove).
  useEffect(() => {
    const map = mapRef.current, mk = mkRef.current;
    if (!mapReady || !map || !mk) return;
    const seen = new Set();
    locations.forEach((u) => {
      if (u.apparatusId == null || typeof u.lat !== 'number' || typeof u.lng !== 'number') return;
      seen.add(u.apparatusId);
      const color = unitStatusHex(u.status);
      const existing = annRef.current[u.apparatusId];
      if (existing) {
        existing.coordinate = new mk.Coordinate(u.lat, u.lng);
        existing.color = color;
      } else {
        const a = new mk.MarkerAnnotation(new mk.Coordinate(u.lat, u.lng), {
          color, glyphText: unitAbbrev(u.designation),
          title: u.designation, subtitle: (u.status || '').replace(/_/g, ' '),
        });
        try { map.addAnnotation(a); annRef.current[u.apparatusId] = a; } catch (_) { /* noop */ }
      }
    });
    Object.keys(annRef.current).forEach((id) => {
      if (!seen.has(Number(id))) {
        try { map.removeAnnotation(annRef.current[id]); } catch (_) { /* noop */ }
        delete annRef.current[id];
      }
    });
  }, [locations, mapReady]);

  // A DEAD MAP IS NEVER BLANK, AND IT NEVER PRETENDS.
  //
  // Two things were wrong here. (1) The fallback was a grey box reading "Map
  // unavailable" — a dead end on a life-safety surface. (2) The status badge —
  // green, pulsing, "Coverage Area · N units live" — rendered ON TOP of it
  // regardless, claiming a live status over a map that was showing nothing. That is
  // the board asserting something it is not reading.
  //
  // Now: if the tiles cannot load, we fall back to the data we ALREADY HAVE — the
  // live unit positions from GET /api/units/locations. The IC loses the picture but
  // keeps the facts, and the UI says plainly that the map is down.
  if (failed) {
    return (
      <div className="relative rounded-xl overflow-hidden border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/40 shadow-sm" style={{ minHeight: 600 }}>
        <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-black text-amber-900 dark:text-amber-200">MAP UNAVAILABLE</p>
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              Apple Maps could not load. Unit positions below are still live.
            </p>
          </div>
        </div>
        <div className="p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-amber-800 dark:text-amber-300 mb-2">
            {locations.length
              ? `${locations.length} unit${locations.length === 1 ? '' : 's'} reporting`
              : 'No unit positions reporting'}
          </p>
          <div className="space-y-1.5">
            {locations.map((u) => (
              <div key={u.apparatusId ?? u.designation}
                className="flex items-center justify-between gap-3 bg-white dark:bg-gray-900 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-900">
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{u.designation}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">{u.status || '—'}</span>
                {/* `lat` / `lng` — NOT latitude/longitude. Ground truth is the
                    annotation code above, which gates on `typeof u.lat === 'number'`.
                    Getting this wrong would render "no fix" for every unit, which on
                    a dead map is the second lie in a row. */}
                <span className="text-[11px] text-gray-400 font-mono shrink-0">
                  {typeof u.lat === 'number' && typeof u.lng === 'number'
                    ? `${u.lat.toFixed(4)}, ${u.lng.toFixed(4)}`
                    : 'no fix'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm">
      <div ref={elRef} style={{ height: '600px', width: '100%', display: 'block' }} />
      <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 text-white text-[10px] font-semibold px-2.5 py-1 rounded-lg backdrop-blur-sm">
        <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
        {locations.length ? `Coverage Area · ${locations.length} unit${locations.length === 1 ? '' : 's'} live` : 'Coverage Area — Standby'}
      </div>
    </div>
  );
}

// ─── Active Call Map (auto-shown on new dispatch) ─────────────────────────────
function ActiveCallMap({ dispatch, onDismiss }) {
  const address = dispatch?.address || dispatch?.location || '';
  const fullAddress = [address, dispatch?.city, dispatch?.state].filter(Boolean).join(', ');
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const coordRef = useRef(null);  // resolved incident coordinate
  const pointsRef = useRef(null); // all map points (unit origins + scene) for region fit
  const routeRef = useRef(null);  // array of route PolylineOverlays (toggled on/off), one per unit
  const [view, setView] = useState('route');        // 'route' | 'overhead' | 'street'
  const [precision, setPrecision] = useState('locating'); // locating | exact | approx | area
  const [routeInfo, setRouteInfo] = useState(null); // { distance(m), time(s) }
  const [coord, setCoord] = useState(null);         // resolved incident coordinate (Street View)
  const [streetFailed, setStreetFailed] = useState(false);
  // Response origin — where the units roll from. Station coords (configurable),
  // default to the district center.
  const stationLat = parseFloat(import.meta.env.VITE_STATION_LAT || import.meta.env.VITE_DISTRICT_LAT || '40.7282');
  const stationLng = parseFloat(import.meta.env.VITE_STATION_LNG || import.meta.env.VITE_DISTRICT_LNG || '-74.2090');

  // Build the live map: district view instantly, then incident pin + station + route.
  useEffect(() => {
    let cancelled = false;
    setView('route'); setPrecision('locating'); setRouteInfo(null); setCoord(null); setStreetFailed(false);
    coordRef.current = null; routeRef.current = null; pointsRef.current = null;
    loadMapKit()
      .then(async (mk) => {
        if (cancelled || !elRef.current) return;
        const map = new mk.Map(elRef.current, {
          showsCompass: mk.FeatureVisibility.Hidden,
          showsZoomControl: true,
          showsMapTypeControl: false,
          isRotationEnabled: false,
        });
        map.mapType = mk.Map.MapTypes.Standard;
        map.region = new mk.CoordinateRegion(
          new mk.Coordinate(stationLat, stationLng),
          new mk.CoordinateSpan(0.12, 0.12),
        );
        mapRef.current = map;
        if (!fullAddress) return;

        const result = await resolveCoordinate(mk, fullAddress);
        if (cancelled || !mapRef.current) return;
        if (!result) { setPrecision('area'); return; } // map stays up on district
        const { coordinate, precise } = result;
        coordRef.current = coordinate;
        setCoord(coordinate);
        setPrecision(precise ? 'exact' : 'approx');

        // Origin = THIS unit's own live GPS. Each responder sees only THEIR OWN
        // route to the scene — we never clutter the screen with every rig's route.
        // The other dispatched units appear as live location dots for context.
        //
        // But only if the fix is plausible. A rig is never hundreds of miles from
        // its own station; a VPN or Wi-Fi geolocation miss will happily claim it is,
        // and we'd draw a 2,900-mile route to a structure fire. resolveRouteOrigin
        // falls back to the station in that case.
        const dev = await getDevicePosition();
        if (cancelled || !mapRef.current) return;
        const o = resolveRouteOrigin(dev, stationLat, stationLng);
        const fromGps = o.source === 'gps';
        const origin = new mk.Coordinate(o.lat, o.lng);
        if (fromGps) {
          map.showsUserLocation = true; // live dot that tracks this apparatus
        } else {
          const rejected = o.deviceMiles != null; // had a fix, but it was implausible
          if (rejected) {
            console.warn(
              `[dispatch] device GPS is ${Math.round(o.deviceMiles)} mi from the station `
              + `(limit ${MAX_GPS_ORIGIN_MI} mi) — routing from the station instead. `
              + 'Check for a VPN, or raise VITE_MAX_GPS_ORIGIN_MI.',
            );
          }
          map.addAnnotation(new mk.MarkerAnnotation(origin, {
            color: '#1d4ed8',
            glyphText: 'S',
            title: 'Station',
            subtitle: rejected ? 'Device GPS looked wrong — routing from station' : undefined,
          }));
        }
        const pts = [origin, coordinate];

        // Other dispatched units' LIVE locations (dots only — no extra routes), so
        // this unit can see who else is rolling without the map filling with routes.
        try {
          const { data: locs } = await api.get('/api/units/locations');
          if (cancelled || !mapRef.current) return;
          const norm = s => String(s || '').trim().toLowerCase();
          const hasGps = u => typeof u.lat === 'number' && typeof u.lng === 'number';
          const wanted = (Array.isArray(dispatch.units) ? dispatch.units : String(dispatch.units || '').split(','))
            .map(u => norm(u)).filter(Boolean);
          (locs || []).forEach((u) => {
            if (!hasGps(u)) return;
            const d = norm(u.designation);
            if (!wanted.some(w => d === w || d.includes(w) || w.includes(d))) return;
            const o = new mk.Coordinate(u.lat, u.lng);
            pts.push(o);
            map.addAnnotation(new mk.MarkerAnnotation(o, {
              color: unitStatusHex(u.status), glyphText: unitAbbrev(u.designation),
              title: u.designation, subtitle: 'Responding',
            }));
          });
        } catch (_) { /* dots are best-effort context */ }

        map.addAnnotation(new mk.MarkerAnnotation(coordinate, { color: '#dc2626', glyphText: '!', title: address }));
        pointsRef.current = pts;
        map.region = regionForPoints(mk, pts) || map.region;

        // Single response route — THIS unit's own (current position -> scene).
        const r = await routeBetween(mk, origin, coordinate);
        if (cancelled || !mapRef.current) return;
        if (r && r.polyline) {
          try { r.polyline.style = new mk.Style({ lineColor: '#dc2626', lineWidth: 5, lineJoin: 'round' }); } catch (_) { /* noop */ }
          map.addOverlay(r.polyline);
          routeRef.current = [r.polyline];
          setRouteInfo({ distance: r.distance, time: r.time });
          map.region = regionForPoints(mk, pts) || map.region;
        }
      })
      .catch(() => { /* nothing more to surface; map stays on screen */ });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        try { mapRef.current.destroy(); } catch (_) { /* noop */ }
        mapRef.current = null;
      }
    };
  }, [fullAddress, stationLat, stationLng, address]);

  // Toggle Route <-> Overhead on the same map instance (Street is an overlay image).
  useEffect(() => {
    const map = mapRef.current;
    const mk = typeof window !== 'undefined' ? window.mapkit : null;
    if (!map || !mk || view === 'street') return;
    const coord = coordRef.current;
    if (view === 'overhead') {
      (routeRef.current || []).forEach(pl => { try { map.removeOverlay(pl); } catch (_) { /* noop */ } });
      map.mapType = mk.Map.MapTypes.Hybrid;
      if (coord) map.region = new mk.CoordinateRegion(coord, new mk.CoordinateSpan(0.0035, 0.0035));
    } else {
      map.mapType = mk.Map.MapTypes.Standard;
      (routeRef.current || []).forEach(pl => { try { map.addOverlay(pl); } catch (_) { /* noop */ } });
      const pts = pointsRef.current;
      if (pts && pts.length) map.region = regionForPoints(mk, pts) || map.region;
      else if (coord) map.region = new mk.CoordinateRegion(coord, new mk.CoordinateSpan(0.02, 0.02));
    }
  }, [view]);

  if (!address) return null;

  // Street View via the server proxy (key stays server-side + Sensitive; the
  // proxy does a free metadata probe so a missing pano returns 204 -> onError).
  const streetUrl = coord
    ? `/api/streetview?lat=${coord.latitude}&lng=${coord.longitude}&w=640&h=400`
    : '';

  const tab = (id, label) => (
    <button
      data-testid={`map-view-${id}`}
      data-active={view === id}
      onClick={() => setView(id)}
      className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-colors ${
        view === id ? 'bg-white dark:bg-gray-900 text-red-700 dark:text-red-300 shadow' : 'text-red-100 hover:text-white'
      }`}
    >{label}</button>
  );

  const mapBadge = view === 'street'
    ? 'Street View'
    : view === 'overhead'
      ? 'Apple Maps · Overhead'
      : precision === 'exact'
        ? 'Apple Maps · Route'
        : precision === 'locating'
          ? 'Apple Maps · Locating…'
          : 'Apple Maps · Route (approx)';

  return (
    <div data-testid="active-call-map" className="rounded-xl overflow-hidden border-2 border-red-400 shadow-lg animate-pulse-once">
      {/* Banner + view toggle */}
      <div className="bg-red-700 text-white">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Siren size={15} className="flex-shrink-0 animate-pulse" />
            <div className="min-w-0">
              <p className="text-xs font-black truncate">{dispatch.description || dispatch.type || 'Incoming Call'}</p>
              <p className="text-[10px] text-red-100 truncate">{fullAddress || address}</p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Close"
            className="text-red-100 hover:text-white transition-colors flex-shrink-0 text-lg leading-none"
          >×</button>
        </div>
        <div className="flex items-center gap-1 px-3 pb-2">
          {tab('route', 'Route')}
          {tab('overhead', 'Overhead')}
          {tab('street', 'Street View')}
          {view === 'route' && routeInfo && (
            <span className="ml-auto text-[10px] font-semibold text-red-100">
              {(routeInfo.distance / 1609.34).toFixed(1)} mi · {Math.max(1, Math.round(routeInfo.time / 60))} min
            </span>
          )}
        </div>
      </div>

      {/* View area — the MapKit map is always mounted; Street View overlays it. */}
      <div className="relative" style={{ height: '600px' }}>
        <div ref={elRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
        {view === 'street' && (
          (streetUrl && !streetFailed) ? (
            <img
              src={streetUrl}
              alt={`Street view of ${address}`}
              onError={() => setStreetFailed(true)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 px-6 text-center">
              <MapPin size={26} className="text-red-400 mb-2" />
              <p className="text-sm font-semibold text-white">No street view for this address</p>
              <p className="mt-1 max-w-sm text-[11px] text-gray-400">
                Street-level imagery isn’t available here — use the Overhead tab for a
                satellite size-up of the scene.
              </p>
            </div>
          )
        )}
        <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 text-white text-[10px] font-semibold px-2 py-1 rounded-lg backdrop-blur-sm">
          <Satellite size={10} /> {mapBadge}
        </div>
      </div>

      {/* Units */}
      {dispatch.units && (
        <div className="px-4 py-2.5 bg-white dark:bg-gray-900 border-t border-red-100 dark:border-red-900 flex flex-wrap gap-1.5">
          {(Array.isArray(dispatch.units)
            ? dispatch.units
            : dispatch.units.split(',').map(u => u.trim()).filter(Boolean)
          ).map((u, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-2 py-0.5 text-red-700 dark:text-red-300">
              <Truck size={10} /> {u}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function LiveDispatch({ dispatches = [], onClearBadge, onNavigate, onAddDispatch, onSetupCAD, departmentId = null, currentUser = null, onCallCleared = null, onCallReopened = null }) {
  const [filter, setFilter] = useState('all'); // all | active | closed
  const [clearingCall, setClearingCall] = useState(null); // dispatch object → ClearCallModal
  const canClear = canClearCalls(currentUser); // UI affordance only — the server enforces regardless

  // Undo toast (mis-close recovery — the mature platforms ship reopen beside
  // manual close). 10s window; Undo reopens the CALL only — released unit
  // statuses stay as set (they were a separate, deliberate dispatcher action).
  const [undo, setUndo] = useState(null); // { d, released }
  const undoTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(undoTimerRef.current), []);
  const showUndo = (d, released) => {
    clearTimeout(undoTimerRef.current);
    setUndo({ d, released });
    undoTimerRef.current = setTimeout(() => setUndo(null), 10000);
  };
  const doUndo = async () => {
    const u = undo;
    setUndo(null);
    clearTimeout(undoTimerRef.current);
    if (!u) return;
    try {
      await api.post(`/api/cad/alerts/${u.d.id}/reopen`, {});
      if (onCallReopened) onCallReopened(u.d);
    } catch { /* the next poll reconciles either way */ }
  };

  // Auto-pop map: show incoming call location automatically
  const [activeCallMap, setActiveCallMap] = useState(null);
  const prevLengthRef = useRef(dispatches.length);

  // Watch for new dispatches — auto-show the map the moment one arrives
  useEffect(() => {
    if (dispatches.length > prevLengthRef.current) {
      prevLengthRef.current = dispatches.length;
      const latest = dispatches[0];
      if (latest && latest.status !== 'closed' && latest.status !== 'available') {
        setActiveCallMap(latest);
      }
    }
  }, [dispatches]);

  const filtered = dispatches.filter(d => {
    if (filter === 'active') return d.status !== 'closed' && d.status !== 'available';
    if (filter === 'closed') return d.status === 'closed' || d.status === 'available';
    return true;
  });

  const activeCount = dispatches.filter(d => d.status !== 'closed' && d.status !== 'available').length;

  // The command map (ActiveCallMap, with the Route/Overhead/Street toggle) must show for
  // ANY active incident — not only one that arrived live this session — and must persist
  // across reloads. Prefer a user-selected call, else the latest active incident.
  const callToShow = activeCallMap || dispatches.find(d => d.status !== 'closed' && d.status !== 'available') || null;

  return (
    <div className="glove-friendly space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
            <Radio size={20} className="text-red-700 dark:text-red-300" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">
              Live Dispatch
              <FeedStatus className="ml-2 align-middle" />
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {dispatches.length === 0
                ? 'Waiting for dispatch feed…'
                : `${activeCount} active · ${dispatches.length} total`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ToneToggle />
          <button onClick={() => toggleTheme()} title="Toggle dark mode" aria-label="Toggle dark mode" className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><Moon size={14} className="dark:hidden" /><Sun size={14} className="hidden dark:block" /></button>
          <button
            onClick={() => window.open('?kiosk=true', '_blank')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all"
            title="Open full-screen watch desk display"
          >
            <Maximize2 size={13} /> Watch Desk
          </button>
          <SimulateDispatchButton onAddDispatch={onAddDispatch} />
          {onClearBadge && dispatches.length > 0 && (
            <button
              onClick={onClearBadge}
              className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium transition-colors"
              title="Clear notification badge"
            >
              <BellOff size={14} /> Clear badge
            </button>
          )}
        </div>
      </div>

      {/* ── Two-column layout: Map (left, dominant) + Cards (right, compact) ── */}
      <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 200px)' }}>

        {/* ── LEFT: Map panel (65%) ── */}
        <div className="flex-[4] min-w-0">
          <ScreenErrorBoundary label="Dispatch Map">
          {callToShow ? (
            <ActiveCallMap
              dispatch={callToShow}
              onDismiss={() => setActiveCallMap(null)}
            />
          ) : (
            <div className="h-full flex flex-col">
              <DistrictMap departmentId={departmentId} />
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center py-4">
                  <p className="text-xs text-gray-400">
                    Monitoring for incoming calls
                  </p>
                  {onSetupCAD && (
                    <button
                      onClick={onSetupCAD}
                      className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all"
                    >
                      <Settings size={13} /> Configure CAD Integration
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          </ScreenErrorBoundary>
        </div>

        {/* ── RIGHT: Dispatch feed (40%) ── */}
        <div className="flex-[2] min-w-0 flex flex-col">
          <ScreenErrorBoundary label="Dispatch Feed">
          {/* Filter tabs */}
          {dispatches.length > 0 && (
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 mb-3 flex-shrink-0">
              {[
                { key: 'all', label: 'All' },
                { key: 'active', label: `Active (${activeCount})` },
                { key: 'closed', label: 'Closed' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    filter === tab.key ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Dispatch cards — scrollable */}
          <div className="flex-1 overflow-y-auto space-y-2 overscroll-contain">
            {filtered.length > 0 ? (
              filtered.map((d, i) => (
                <div key={d.id || i} onClick={() => setActiveCallMap(d)} className="cursor-pointer">
                  <DispatchCard
                    d={d}
                    onActivate={onNavigate ? () => onNavigate(d) : null}
                    onClear={canClear && d.id ? () => setClearingCall(d) : null}
                  />
                </div>
              ))
            ) : dispatches.length > 0 ? (
              <div className="text-center py-8 bg-gray-50 dark:bg-gray-950 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                <Bell size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm font-semibold text-gray-400">No matching dispatches</p>
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 dark:bg-gray-950 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                <Radio size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm font-semibold text-gray-400">Waiting for calls</p>
                <p className="text-xs text-gray-400 mt-1">Dispatch feed will appear here</p>
              </div>
            )}

            {/* Recent call history */}
            {filter === 'all' && dispatches.filter(d => d.status === 'closed' || d.status === 'available').length > 0 && (
              <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Recent</p>
                <div className="space-y-1">
                  {dispatches
                    .filter(d => d.status === 'closed' || d.status === 'available')
                    .slice(0, 6)
                    .map((d, i) => {
                      const units = Array.isArray(d.units)
                        ? d.units
                        : (d.units || '').split(',').map(u => u.trim()).filter(Boolean);
                      const ts = d.dispatched_at || d.timestamp;
                      return (
                        <div key={d.id || i} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-100 dark:border-gray-700">
                          <div className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 truncate">{d.description || d.type || 'Unknown'}</p>
                          </div>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            {ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
          </ScreenErrorBoundary>
        </div>

      </div>

      {/* Clear-time release prompt (dispatch/command only) */}
      {clearingCall && (
        <ClearCallModal
          d={clearingCall}
          onClose={() => setClearingCall(null)}
          onCleared={(id, released) => {
            const cleared = clearingCall;
            setClearingCall(null);
            if (activeCallMap?.id === id) setActiveCallMap(null);
            if (onCallCleared) onCallCleared(id);
            showUndo(cleared, released);
          }}
        />
      )}

      {/* Post-clear undo toast */}
      {undo && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[10001] flex items-center gap-3 bg-gray-900 text-white rounded-xl shadow-2xl px-4 py-3 border border-gray-700">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span className="text-sm font-semibold">
            Call cleared{undo.released?.length ? ` · ${undo.released.length} unit${undo.released.length === 1 ? '' : 's'} to Returning` : ''}
          </span>
          <button
            onClick={doUndo}
            className="text-sm font-bold text-blue-300 hover:text-blue-200 underline underline-offset-2"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
