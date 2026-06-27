import { useState, useEffect, useRef } from 'react';
import { Siren, Truck, MapPin, Clock, Radio, CheckCircle, Wifi, WifiOff, Maximize2, Minimize2, X, LogIn } from 'lucide-react';
import { loadMapKit } from '../utils/mapkit';
import ScreenErrorBoundary from './ScreenErrorBoundary';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(ts) {
  if (!ts) return '--:--';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatTimeShort(ts) {
  if (!ts) return '--:--';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const PRIORITY_STYLES = {
  high:   { border: 'border-red-500',    bg: 'bg-red-950/60',   badge: 'bg-red-600',   text: 'text-red-300',   label: 'HIGH'   },
  medium: { border: 'border-amber-500',  bg: 'bg-amber-950/60', badge: 'bg-amber-500', text: 'text-amber-300', label: 'MEDIUM' },
  low:    { border: 'border-blue-500',   bg: 'bg-blue-950/60',  badge: 'bg-blue-500',  text: 'text-blue-300',  label: 'LOW'    },
};

const STATUS_LABELS = {
  dispatched: { label: 'DISPATCHED', color: 'text-red-400 bg-red-900/60 border-red-700' },
  en_route:   { label: 'EN ROUTE',   color: 'text-amber-400 bg-amber-900/60 border-amber-700' },
  on_scene:   { label: 'ON SCENE',   color: 'text-emerald-400 bg-emerald-900/60 border-emerald-700' },
  available:  { label: 'AVAILABLE',  color: 'text-gray-400 bg-gray-800 border-gray-600' },
  closed:     { label: 'CLEARED',    color: 'text-gray-500 bg-gray-900 border-gray-700' },
};

// ─── Active Call Card (large, TV-readable) ────────────────────────────────────
function ActiveCallCard({ d }) {
  const priority = PRIORITY_STYLES[d.priority || 'high'] || PRIORITY_STYLES.high;
  const status = STATUS_LABELS[d.status] || STATUS_LABELS.dispatched;
  const units = Array.isArray(d.units)
    ? d.units
    : (d.units || '').split(',').map(u => u.trim()).filter(Boolean);
  const ts = d.dispatched_at || d.timestamp;
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    function update() {
      if (!ts) return;
      const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      setElapsed(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [ts]);

  return (
    <div className={`rounded-2xl border-2 ${priority.border} ${priority.bg} p-5 flex flex-col gap-3 shadow-lg shadow-black/40`}>
      {/* Top row: type + status + elapsed */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Siren size={26} className={`flex-shrink-0 ${priority.text} animate-pulse`} />
          <div className="min-w-0">
            <p className="text-xl font-black text-white leading-tight truncate">
              {d.description || d.type || 'Unknown Call'}
            </p>
            {d.id && (
              <p className="text-xs text-gray-500 font-mono mt-0.5">{d.id}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={`text-xs font-black px-3 py-1 rounded-full border ${status.color}`}>
            {status.label}
          </span>
          {elapsed && (
            <span className="text-sm font-mono font-bold text-gray-300 tabular-nums">
              {elapsed}
            </span>
          )}
        </div>
      </div>

      {/* Address */}
      {(d.address || d.location) && (
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-gray-400 flex-shrink-0" />
          <p className="text-base font-semibold text-gray-200 truncate">
            {d.address || d.location}
          </p>
        </div>
      )}

      {/* Details */}
      {d.details && (
        <p className="text-sm text-gray-400 bg-black/30 rounded-xl px-3 py-2 leading-relaxed">
          {d.details}
        </p>
      )}

      {/* Units */}
      {units.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {units.map((unit, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 text-sm font-bold bg-white/10 border border-white/20 rounded-xl px-3 py-1 text-white">
              <Truck size={13} className="text-gray-300" />
              {unit}
            </span>
          ))}
        </div>
      )}

      {/* Dispatched time */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 pt-1 border-t border-white/5">
        <Clock size={11} />
        <span>Dispatched {formatTime(ts)}</span>
      </div>
    </div>
  );
}

// ─── History Row (compact, bottom strip) ─────────────────────────────────────
function HistoryRow({ d }) {
  const units = Array.isArray(d.units)
    ? d.units
    : (d.units || '').split(',').map(u => u.trim()).filter(Boolean);
  const ts = d.dispatched_at || d.timestamp;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-900/60 rounded-xl border border-gray-800 min-w-0">
      <CheckCircle size={14} className="text-gray-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-400 truncate">{d.description || d.type || 'Unknown'}</p>
        {(d.address || d.location) && (
          <p className="text-xs text-gray-600 truncate">{d.address || d.location}</p>
        )}
      </div>
      {units.length > 0 && (
        <div className="hidden sm:flex gap-1 flex-shrink-0">
          {units.slice(0, 2).map((u, i) => (
            <span key={i} className="text-[10px] font-semibold text-gray-600 bg-gray-800 rounded px-1.5 py-0.5">{u}</span>
          ))}
          {units.length > 2 && <span className="text-[10px] text-gray-700">+{units.length - 2}</span>}
        </div>
      )}
      <span className="text-xs text-gray-600 flex-shrink-0 tabular-nums">{formatTimeShort(ts)}</span>
    </div>
  );
}

// ─── District Map (Apple MapKit — same engine as Live Dispatch) ──────────────
// The kiosk previously embedded Google Maps gated on VITE_GOOGLE_MAPS_KEY,
// which is never set — so the watch desk showed a dark placeholder forever.
// Non-negotiable UX rule: the map is ALWAYS on screen.
const DISTRICT_LAT  = parseFloat(import.meta.env.VITE_DISTRICT_LAT  || '40.7282');
const DISTRICT_LNG  = parseFloat(import.meta.env.VITE_DISTRICT_LNG  || '-74.2090');
const DISTRICT_ZOOM = parseFloat(import.meta.env.VITE_DISTRICT_ZOOM || '13');

function DistrictMap() {
  const elRef  = useRef(null);
  const mapRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMapKit()
      .then((mk) => {
        if (cancelled || !elRef.current) return;
        const map = new mk.Map(elRef.current, {
          showsCompass: mk.FeatureVisibility.Hidden,
          showsZoomControl: false,
          showsMapTypeControl: false,
          isRotationEnabled: false,
        });
        map.mapType = mk.Map.MapTypes.Hybrid;
        const delta = 360 / Math.pow(2, DISTRICT_ZOOM);
        map.region = new mk.CoordinateRegion(
          new mk.Coordinate(DISTRICT_LAT, DISTRICT_LNG),
          new mk.CoordinateSpan(delta, delta),
        );
        mapRef.current = map;
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        try { mapRef.current.destroy(); } catch (_) { /* noop */ }
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex-1 relative mx-5 mb-5 rounded-2xl overflow-hidden border border-gray-700 shadow-2xl shadow-black/60">
      {/* Absolute inset gives MapKit's height:100% a definite size (a
          min-height-only parent renders a 0-height blank map). */}
      <div ref={elRef} className="absolute inset-0" />
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900">
          <MapPin size={36} className="text-gray-700" />
          <p className="text-sm font-semibold text-gray-600">Map unavailable — check network</p>
        </div>
      )}
      <div className="absolute top-3 left-3 flex items-center gap-2 bg-gray-950/80 text-white text-xs font-bold px-3 py-1.5 rounded-xl backdrop-blur-sm border border-gray-700">
        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        District Coverage — All Clear
      </div>
    </div>
  );
}

// ─── Standby / Idle Screen ────────────────────────────────────────────────────
function StandbyScreen({ now }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
          <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">All Clear — Monitoring Dispatch Feed</p>
        </div>
        <p className="text-lg font-mono font-bold text-gray-600 tabular-nums">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
      </div>
      {/* Map fills remaining space */}
      <DistrictMap />
    </div>
  );
}

// ─── Main Kiosk Component ─────────────────────────────────────────────────────
export default function KioskDispatch({ dispatches = [], connected = true, authMissing = false }) {
  const now = useLiveClock();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  const active = dispatches.filter(d => d.status !== 'closed' && d.status !== 'available');
  const history = dispatches.filter(d => d.status === 'closed' || d.status === 'available').slice(0, 8);

  // Fullscreen toggle
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }

  // Exit the watch desk: close the tab if we were opened by the app
  // (window.open), otherwise return to the main app. Esc works too — the
  // kiosk previously had NO way out.
  function exitKiosk() {
    if (window.opener) {
      window.close();
      return;
    }
    window.location.href = window.location.pathname; // strips ?kiosk=true
  }

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    function onKeyDown(e) {
      // Esc exits the kiosk (when not in browser fullscreen — Esc leaves
      // fullscreen first, then a second Esc exits the page).
      if (e.key === 'Escape' && !document.fullscreenElement) exitKiosk();
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="glove-friendly min-h-screen bg-gray-950 text-white flex flex-col"
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        {/* Left: branding */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-red-700 flex items-center justify-center">
            <Siren size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-black text-white tracking-wide">OPEN FIREHOUSE</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">Live Dispatch</p>
          </div>
        </div>

        {/* Center: active count */}
        <div className="flex items-center gap-3">
          {active.length > 0 ? (
            <div className="flex items-center gap-2 bg-red-900/60 border border-red-700 rounded-full px-4 py-1.5">
              <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-black text-red-300">
                {active.length} ACTIVE CALL{active.length !== 1 ? 'S' : ''}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-full px-4 py-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-bold text-gray-400">ALL CLEAR</span>
            </div>
          )}
        </div>

        {/* Right: clock + connection + fullscreen */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-base font-mono font-bold text-white tabular-nums">
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className="text-[10px] text-gray-500">
              {now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-1.5" title={connected ? 'Feed connected' : 'Reconnecting...'}>
            {connected
              ? <Wifi size={14} className="text-green-500" />
              : <WifiOff size={14} className="text-red-500 animate-pulse" />
            }
          </div>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            onClick={exitKiosk}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
            title="Exit watch desk (Esc)"
            aria-label="Exit watch desk"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Auth notice — kiosk reuses the app session from this browser ── */}
      {authMissing && (
        <div className="flex items-center justify-center gap-2 bg-amber-950/70 border-b border-amber-800 px-4 py-2.5">
          <LogIn size={14} className="text-amber-400" />
          <p className="text-sm font-semibold text-amber-300">
            Not signed in — open the Watch Desk from inside OpenFirehouse so it can use your session. Live calls will not appear.
          </p>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ScreenErrorBoundary label="Watch Desk Display">
        {active.length === 0 ? (
          <StandbyScreen now={now} />
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            <div className={`grid gap-4 ${
              active.length === 1 ? 'grid-cols-1 max-w-2xl mx-auto' :
              active.length === 2 ? 'grid-cols-1 lg:grid-cols-2' :
              'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
            }`}>
              {active.map((d, i) => (
                <ActiveCallCard key={d.id || i} d={d} />
              ))}
            </div>
          </div>
        )}
        </ScreenErrorBoundary>

        {/* ── Call History Strip ── */}
        {history.length > 0 && (
          <div className="flex-shrink-0 border-t border-gray-800 bg-gray-950 px-5 py-3">
            <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">
              Recent Calls
            </p>
            <div className="flex flex-col gap-1.5">
              <ScreenErrorBoundary label="Recent Calls">
                {history.map((d, i) => (
                  <HistoryRow key={d.id || i} d={d} />
                ))}
              </ScreenErrorBoundary>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
