/**
 * IncidentMap.jsx — Interactive GIS Map on Apple MapKit JS
 *
 * Displays hydrants, pre-plans, Knox Boxes, active incidents, and the station
 * on an interactive map. Migrated off Leaflet/OSM to Apple MapKit JS (same SDK
 * + token endpoint as LiveDispatch/ResponseMap; reuses client/src/utils/mapkit.js).
 *
 * Layers (status-colored MarkerAnnotations; click a pin for the detail panel):
 *  - Hydrants (blue)
 *  - Pre-Incident Plans (colored by risk)
 *  - Knox Boxes (amber; red if damaged)
 *  - Active Incidents (red)
 *  - Station location
 *
 * The map container uses an explicit pixel height — MapKit's .mk-map-view is
 * height:100% and resolves to 0 against a min-height-only parent.
 */

import { useState, useEffect, useRef } from 'react';
import {
  MapPin, Droplets, KeyRound, Building2, Flame, Loader2, Home,
} from 'lucide-react';
import { api } from '../utils/api';
import { loadMapKit } from '../utils/mapkit';

// ─── Demo coordinates for Maplewood, NJ area ────────────────────────────────
// These simulate realistic locations for demo data that lacks GPS fields
const MAPLEWOOD_CENTER = { lat: 40.7312, lng: -74.2674 };

const DEMO_HYDRANTS = [
  { id: 'h1', label: 'H-114', lat: 40.7325, lng: -74.2690, flow: 1200, status: 'In Service', address: 'Elm St — NW corner' },
  { id: 'h2', label: 'H-115', lat: 40.7318, lng: -74.2655, flow: 900, status: 'In Service', address: 'Oak Lane — rear gate' },
  { id: 'h3', label: 'H-088', lat: 40.7340, lng: -74.2710, flow: 1500, status: 'In Service', address: 'Riverside Dr — front' },
  { id: 'h4', label: 'H-211', lat: 40.7290, lng: -74.2620, flow: 1000, status: 'In Service', address: 'Rt. 22 — near Depot Rd' },
  { id: 'h5', label: 'H-055', lat: 40.7305, lng: -74.2700, flow: 900, status: 'In Service', address: 'Maple Ave — NE corner' },
  { id: 'h6', label: 'H-177', lat: 40.7280, lng: -74.2650, flow: 1500, status: 'In Service', address: 'Valley Road — main' },
  { id: 'h7', label: 'H-305', lat: 40.7260, lng: -74.2580, flow: 2000, status: 'In Service', address: 'Commerce Pkwy — main' },
  { id: 'h8', label: 'H-056', lat: 40.7300, lng: -74.2715, flow: 750, status: 'Needs Inspection', address: 'Birch St — church lot' },
];

const DEMO_PREPLANS = [
  { id: 'pp1', name: 'Maplewood Elementary School', lat: 40.7328, lng: -74.2685, risk: 'High', type: 'Education', address: '300 Elm Street' },
  { id: 'pp2', name: 'Riverside Nursing & Rehab', lat: 40.7342, lng: -74.2705, risk: 'Critical', type: 'Healthcare', address: '45 Riverside Drive' },
  { id: 'pp3', name: "Hannigan's Fuel & Auto", lat: 40.7288, lng: -74.2615, risk: 'High', type: 'Hazmat', address: '775 Route 22' },
  { id: 'pp4', name: 'Maplewood Community Church', lat: 40.7308, lng: -74.2698, risk: 'Moderate', type: 'Assembly', address: '120 Maple Avenue' },
  { id: 'pp5', name: 'Valley View Apartments', lat: 40.7278, lng: -74.2648, risk: 'High', type: 'Residential', address: '500 Valley Road' },
  { id: 'pp6', name: 'Industrial Distribution Ctr', lat: 40.7255, lng: -74.2575, risk: 'Moderate', type: 'Industrial', address: '1200 Commerce Pkwy' },
  { id: 'pp7', name: 'Township Municipal Building', lat: 40.7315, lng: -74.2672, risk: 'Low', type: 'Government', address: '50 Township Blvd' },
  { id: 'pp8', name: 'Maplewood Hotel & Conference', lat: 40.7320, lng: -74.2660, risk: 'Moderate', type: 'Commercial', address: '800 Main Street' },
];

const DEMO_KNOX = [
  { id: 'k1', label: 'K-047', lat: 40.7326, lng: -74.2687, property: 'Maplewood Elementary', status: 'active' },
  { id: 'k2', label: 'K-022', lat: 40.7341, lng: -74.2708, property: 'Riverside Nursing', status: 'active' },
  { id: 'k3', label: 'K-091', lat: 40.7289, lng: -74.2617, property: "Hannigan's Fuel", status: 'active' },
  { id: 'k4', label: 'K-068', lat: 40.7307, lng: -74.2700, property: 'Community Church', status: 'active' },
  { id: 'k5', label: 'K-034', lat: 40.7279, lng: -74.2646, property: 'Valley View Apts', status: 'active' },
  { id: 'k6', label: 'K-PL-006', lat: 40.7257, lng: -74.2577, property: 'Distribution Ctr', status: 'active' },
  { id: 'k7', label: 'K-PL-009', lat: 40.7350, lng: -74.2730, property: 'Water Treatment', status: 'damaged' },
];

const STATION = { lat: 40.7312, lng: -74.2674, name: 'Station 14 — Maplewood VFD' };

const RISK_COLORS = { Critical: '#dc2626', High: '#ea580c', Moderate: '#ca8a04', Low: '#16a34a' };

// NFPA-291 hydrant cap color by available fire flow at 20 psi (GPM):
//   Class AA ≥1500 (light blue) · Class A 1000–1499 (green) · Class B 500–999 (orange) · Class C <500 (red).
function nfpaHydrantColor(flow) {
  const f = Number(flow);
  if (!Number.isFinite(f)) return '#2563eb';      // unknown flow → neutral blue
  if (f >= 1500) return '#38bdf8';                 // AA light blue
  if (f >= 1000) return '#16a34a';                 // A  green
  if (f >= 500) return '#f97316';                  // B  orange
  return '#dc2626';                                // C  red
}
function nfpaClass(flow) {
  const f = Number(flow);
  if (!Number.isFinite(f)) return 'Unrated';
  if (f >= 1500) return 'AA (≥1500 GPM)';
  if (f >= 1000) return 'A (1000–1499)';
  if (f >= 500) return 'B (500–999)';
  return 'C (<500)';
}

// ─── Layer Toggle ────────────────────────────────────────────────────────────

function LayerToggle({ icon: Icon, label, color, count, active, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
        active ? `bg-${color}-100 text-${color}-700 border border-${color}-300 shadow-sm` : 'bg-gray-100 dark:bg-gray-800 text-gray-400 border border-transparent'
      }`}
    >
      <Icon size={12} />
      {label}
      {count > 0 && <span className={`text-[10px] font-black ${active ? '' : 'text-gray-300 dark:text-gray-600'}`}>({count})</span>}
    </button>
  );
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

function DetailPanel({ selected, onClose }) {
  if (!selected) return null;
  const { type, data } = selected;
  return (
    <div className="absolute top-2 right-2 z-[1000] bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-72 max-h-80 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700">
        <span className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase">{type}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs font-bold">Close</button>
      </div>
      <div className="p-3 space-y-1.5 text-xs">
        {Object.entries(data).map(([k, v]) => (
          v && <div key={k}><span className="text-gray-400 font-bold uppercase text-[10px]">{k}: </span><span className="text-gray-800 dark:text-gray-100 font-medium">{String(v)}</span></div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Map Component ──────────────────────────────────────────────────────

export default function IncidentMap() {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const mkRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(null);

  // Layer visibility
  const [showHydrants, setShowHydrants] = useState(true);
  const [showPrePlans, setShowPrePlans] = useState(true);
  const [showKnox, setShowKnox] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);

  // Live data from API
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch live incidents
  useEffect(() => {
    api.get('/api/cad/alerts').then(r => {
      const alerts = (r.data || r || []).slice(0, 10);
      setLiveIncidents(alerts.filter(a => a.latitude && a.longitude).map(a => ({
        id: a.id, lat: Number(a.latitude), lng: Number(a.longitude),
        description: a.description, address: a.address,
        time: a.dispatched_at,
      })));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Initialize the Apple MapKit map once.
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
        try { map.colorScheme = mk.Map.ColorSchemes.Auto; } catch (_) { /* noop */ }
        map.region = new mk.CoordinateRegion(
          new mk.Coordinate(MAPLEWOOD_CENTER.lat, MAPLEWOOD_CENTER.lng),
          new mk.CoordinateSpan(0.03, 0.03),
        );
        mapRef.current = map;
        mkRef.current = mk;
        setMapReady(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      mkRef.current = null;
      if (mapRef.current) {
        try { mapRef.current.destroy(); } catch (_) { /* noop */ }
        mapRef.current = null;
      }
    };
  }, []);

  // Rebuild annotations when the map is ready, layers toggle, or data changes.
  useEffect(() => {
    const map = mapRef.current, mk = mkRef.current;
    if (!mapReady || !map || !mk) return;

    try { map.removeAnnotations(map.annotations); } catch (_) { /* noop */ }

    const make = (lat, lng, color, glyph, title, subtitle, onSelect) => {
      const a = new mk.MarkerAnnotation(new mk.Coordinate(lat, lng), {
        color, glyphText: glyph, title, subtitle: subtitle || '',
      });
      if (onSelect) a.addEventListener('select', onSelect);
      return a;
    };

    const anns = [];

    // Station (always shown)
    anns.push(make(STATION.lat, STATION.lng, '#1B3A5C', 'S', STATION.name, 'Station', null));

    if (showHydrants) {
      DEMO_HYDRANTS.forEach(h => anns.push(make(
        h.lat, h.lng, nfpaHydrantColor(h.flow), 'H', h.label, `${h.flow} GPM · NFPA ${nfpaClass(h.flow)}`,
        () => setSelected({ type: 'Hydrant', data: { ID: h.label, Address: h.address, Flow: `${h.flow} GPM`, 'NFPA-291 Class': nfpaClass(h.flow), Status: h.status } }),
      )));
    }
    if (showPrePlans) {
      DEMO_PREPLANS.forEach(p => anns.push(make(
        p.lat, p.lng, RISK_COLORS[p.risk] || '#666', 'P', p.name, `${p.type} · ${p.risk}`,
        () => setSelected({ type: 'Pre-Plan', data: { Name: p.name, Address: p.address, Type: p.type, Risk: p.risk } }),
      )));
    }
    if (showKnox) {
      DEMO_KNOX.forEach(k => anns.push(make(
        k.lat, k.lng, k.status === 'damaged' ? '#dc2626' : '#d97706', 'K', k.label, k.property,
        () => setSelected({ type: 'Knox Box', data: { ID: k.label, Property: k.property, Status: k.status } }),
      )));
    }
    if (showIncidents) {
      liveIncidents.forEach(inc => anns.push(make(
        inc.lat, inc.lng, '#dc2626', '!', inc.description || 'Incident', inc.address || '',
        () => setSelected({ type: 'Active Incident', data: { Description: inc.description, Address: inc.address, Time: inc.time ? new Date(inc.time).toLocaleString() : 'Unknown' } }),
      )));
    }

    try { map.addAnnotations(anns); } catch (_) { /* noop */ }
  }, [mapReady, showHydrants, showPrePlans, showKnox, showIncidents, liveIncidents]);

  const centerOnStation = () => {
    const map = mapRef.current, mk = mkRef.current;
    if (!map || !mk) return;
    map.region = new mk.CoordinateRegion(
      new mk.Coordinate(MAPLEWOOD_CENTER.lat, MAPLEWOOD_CENTER.lng),
      new mk.CoordinateSpan(0.03, 0.03),
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center">
            <MapPin size={22} className="text-blue-700 dark:text-blue-300" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">Incident Map</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Hydrants, pre-plans, Knox Boxes, and active incidents</p>
          </div>
        </div>
        <button
          onClick={centerOnStation}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg transition-colors"
        >
          <Home size={13} /> Center on Station
        </button>
      </div>

      {/* Layer toggles */}
      <div className="flex flex-wrap gap-2">
        <LayerToggle icon={Droplets} label="Hydrants" color="blue" count={DEMO_HYDRANTS.length} active={showHydrants} onToggle={() => setShowHydrants(v => !v)} />
        <LayerToggle icon={Building2} label="Pre-Plans" color="orange" count={DEMO_PREPLANS.length} active={showPrePlans} onToggle={() => setShowPrePlans(v => !v)} />
        <LayerToggle icon={KeyRound} label="Knox Boxes" color="amber" count={DEMO_KNOX.length} active={showKnox} onToggle={() => setShowKnox(v => !v)} />
        <LayerToggle icon={Flame} label="Active Incidents" color="red" count={liveIncidents.length} active={showIncidents} onToggle={() => setShowIncidents(v => !v)} />
      </div>

      {/* Map container */}
      <div className="relative">
        <div
          ref={elRef}
          className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
          style={{ height: '520px', display: 'block' }}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-2xl z-[500]">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        )}
        {failed && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-950 rounded-2xl text-xs text-gray-500 dark:text-gray-400">
            Map unavailable right now.
          </div>
        )}
        <DetailPanel selected={selected} onClose={() => setSelected(null)} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          Hydrant (NFPA-291):
          <span className="w-3 h-3 rounded-full" style={{ background: '#38bdf8' }} title="Class AA ≥1500 GPM" /> AA
          <span className="w-3 h-3 rounded-full" style={{ background: '#16a34a' }} title="Class A 1000–1499 GPM" /> A
          <span className="w-3 h-3 rounded-full" style={{ background: '#f97316' }} title="Class B 500–999 GPM" /> B
          <span className="w-3 h-3 rounded-full" style={{ background: '#dc2626' }} title="Class C <500 GPM" /> C
        </span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500" /> Pre-Plan (by risk)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500" /> Knox Box</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-600 animate-pulse" /> Active Incident</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-700" /> Station 14</span>
      </div>
    </div>
  );
}
