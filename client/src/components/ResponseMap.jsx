/**
 * ResponseMap.jsx — Live Apparatus Tracking Map (Command Board).
 *
 * Shows each rig in the department as a status-colored pin at its REAL live GPS
 * position, fed by GET /api/units/locations and the per-department Supabase
 * Realtime `unit-locations` Broadcast channel (id + coords only; the authz'd API
 * is the source of truth). Backed by a visibility-aware 30s poll so a missed
 * broadcast never strands the map. The incident is marked when its coordinates
 * are known.
 *
 * (Replaced the earlier demo that animated units from fake station origins toward
 * a hardcoded incident — positions are now genuine, from the Phase 1 GPS pipeline.)
 *
 * Maps on Apple MapKit JS (migrated off Leaflet/OSM — same SDK + token endpoint
 * as LiveDispatch; reuses client/src/utils/mapkit.js). Container uses an explicit
 * pixel height: MapKit's .mk-map-view is height:100% and resolves to 0 against a
 * min-height-only parent.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Navigation } from 'lucide-react';
import { api } from '../utils/api';
import { supabase, unitLocationsTopic } from '../utils/supabase';
import { loadMapKit, regionForPoints } from '../utils/mapkit';

// Canonical 7-status colors (migration 0022) — matches UnitStatusBoard semantics.
const STATUS_COLOR = {
  in_service: '#10b981',
  on_the_air: '#14b8a6',
  returning: '#34d399',
  dispatched: '#f59e0b',
  enroute: '#fb923c',
  on_scene: '#ef4444',
  out_of_service: '#6b7280',
};

function statusColor(status) {
  return STATUS_COLOR[status] || '#6b7280';
}

// "Tower Ladder 1" -> "TL1", "Engine 1" -> "E1".
function abbrev(designation) {
  const letters = String(designation).split(/\s+/).filter((w) => /[a-z]/i.test(w)).map((w) => w[0]).join('');
  const num = (String(designation).match(/\d+/) || [''])[0];
  return (letters + num).toUpperCase().slice(0, 4) || String(designation).slice(0, 3).toUpperCase();
}

// Read the incident's coordinates if present (CAD/geocode may not provide them).
function incidentCoord(incident) {
  const lat = incident?.latitude ?? incident?.lat;
  const lng = incident?.longitude ?? incident?.lng ?? incident?.lon;
  return (typeof lat === 'number' && typeof lng === 'number') ? { lat, lng } : null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ResponseMap({ incident, compact = false, departmentId = null }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const mkRef = useRef(null);
  const annRef = useRef({});           // apparatusId -> MarkerAnnotation
  const incidentAnnRef = useRef(null);
  const fitRef = useRef(false);
  const [locations, setLocations] = useState([]);
  const [mapReady, setMapReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/units/locations');
      setLocations(Array.isArray(data) ? data : []);
    } catch { /* keep last good data; realtime/poll will retry */ }
  }, []);

  // PRIMARY realtime: per-department Supabase Broadcast — each 'update' is a
  // "refetch now" signal. Skip when no department is known (the poll backstops).
  useEffect(() => {
    const topic = unitLocationsTopic(departmentId);
    if (!topic) return undefined;
    const channel = supabase
      .channel(topic)
      .on('broadcast', { event: 'update' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [departmentId, load]);

  // Initial load + slow visibility-aware backstop poll.
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

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
        try { map.colorScheme = mk.Map.ColorSchemes.Dark; } catch (_) { /* noop */ }
        // Continental US default until the first real positions arrive and frame it.
        map.region = new mk.CoordinateRegion(
          new mk.Coordinate(39.5, -98.35),
          new mk.CoordinateSpan(40, 40),
        );
        mapRef.current = map;
        mkRef.current = mk;
        setMapReady(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      annRef.current = {};
      incidentAnnRef.current = null;
      fitRef.current = false;
      mkRef.current = null;
      if (mapRef.current) {
        try { mapRef.current.destroy(); } catch (_) { /* noop */ }
        mapRef.current = null;
      }
    };
  }, []);

  // Incident marker (only when its coordinates are known).
  useEffect(() => {
    const map = mapRef.current, mk = mkRef.current;
    if (!mapReady || !map || !mk) return;
    if (incidentAnnRef.current) {
      try { map.removeAnnotation(incidentAnnRef.current); } catch (_) { /* noop */ }
      incidentAnnRef.current = null;
    }
    const c = incidentCoord(incident);
    if (c) {
      const a = new mk.MarkerAnnotation(new mk.Coordinate(c.lat, c.lng), {
        color: '#dc2626', glyphText: '!', title: incident?.address || 'Incident',
      });
      try { map.addAnnotation(a); incidentAnnRef.current = a; } catch (_) { /* noop */ }
    }
  }, [mapReady, incident]);

  // Sync unit markers to the live positions (add / move / remove).
  useEffect(() => {
    const map = mapRef.current, mk = mkRef.current;
    if (!mapReady || !map || !mk) return;
    const seen = new Set();
    locations.forEach((u) => {
      if (u.apparatusId == null || typeof u.lat !== 'number' || typeof u.lng !== 'number') return;
      seen.add(u.apparatusId);
      const color = statusColor(u.status);
      const existing = annRef.current[u.apparatusId];
      if (existing) {
        existing.coordinate = new mk.Coordinate(u.lat, u.lng);
        existing.color = color;
      } else {
        const a = new mk.MarkerAnnotation(new mk.Coordinate(u.lat, u.lng), {
          color, glyphText: abbrev(u.designation),
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
    // Frame everything once, when the first real positions arrive.
    if (!fitRef.current) {
      const pts = locations
        .filter((u) => typeof u.lat === 'number' && typeof u.lng === 'number')
        .map((u) => ({ latitude: u.lat, longitude: u.lng }));
      const c = incidentCoord(incident);
      if (c) pts.push({ latitude: c.lat, longitude: c.lng });
      if (pts.length) {
        const region = regionForPoints(mk, pts);
        if (region) { map.region = region; fitRef.current = true; }
      }
    }
  }, [mapReady, locations, incident]);

  const onScene = locations.filter((u) => u.status === 'on_scene').length;

  return (
    <div className="bg-gray-950 rounded-xl border border-gray-700 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800">
        <Navigation size={12} className="text-cyan-400" />
        <span className="text-[10px] font-black text-white flex-1">RESPONSE MAP — Apparatus Tracking</span>
        <span className="text-[9px] text-gray-500">
          {locations.length ? `${onScene}/${locations.length} on scene` : 'live'}
        </span>
      </div>
      <div className="relative w-full">
        <div ref={elRef} style={{ height: compact ? '180px' : '280px', width: '100%', display: 'block' }} />
        {failed && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950 text-[11px] text-gray-400 pointer-events-none">
            Map unavailable — unit positions still live in the status board.
          </div>
        )}
        {mapReady && !failed && locations.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[11px] text-gray-300 bg-gray-950/75 px-3 py-1 rounded-full">
              Waiting for live unit positions…
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
