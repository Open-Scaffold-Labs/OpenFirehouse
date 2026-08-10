// client/src/utils/mapkit.js
// Apple MapKit JS loader for OpenFirehouse.
//
// Loads the SDK from cdn.apple-mapkit.com and initializes it with an
// authorizationCallback that fetches a short-lived ES256 JWT from
// /api/mapkit-token (server/src/routes/mapkitToken.js). Replaces the iframe
// (Google Embed / OpenStreetMap) maps on Live Dispatch with Apple Maps.
//
// loadMapKit() is idempotent — the script is injected once and the init
// promise is memoized, so multiple map components share a single SDK load.

let _ready = null;

export function loadMapKit() {
  if (_ready) return _ready;
  _ready = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no_window'));

    const init = () => {
      const mk = window.mapkit;
      if (!mk) {
        reject(new Error('mapkit_not_on_window'));
        return;
      }
      // mapkit.init is safe to call once; guard against re-init.
      if (!mk.__ofInitialized) {
        mk.init({
          authorizationCallback: (done) => {
            fetch('/api/mapkit-token', { credentials: 'omit' })
              .then((r) => (r.ok ? r.text() : Promise.reject(new Error('http_' + r.status))))
              .then((t) => done(t.trim()))
              .catch(() => done(''));
          },
          language: 'en',
        });
        mk.__ofInitialized = true;
      }
      resolve(mk);
    };

    if (window.mapkit && window.mapkit.Map) {
      init();
      return;
    }

    const existing = document.getElementById('apple-mapkit-js');
    if (existing) {
      existing.addEventListener('load', init);
      existing.addEventListener('error', () => reject(new Error('mapkit_cdn_load_failed')));
      return;
    }

    const s = document.createElement('script');
    s.id = 'apple-mapkit-js';
    s.src = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js';
    s.async = true;
    s.crossOrigin = '';
    s.onload = init;
    s.onerror = () => reject(new Error('mapkit_cdn_load_failed'));
    document.head.appendChild(s);
  });
  return _ready;
}

// mapkit.Search — POI + fuzzy address lookup. More forgiving than Geocoder for
// partial / imprecise addresses (the kind CAD feeds often produce).
function searchOnce(mk, query) {
  return new Promise((resolve) => {
    if (!query) { resolve(null); return; }
    try {
      const s = new mk.Search({ getsUserLocation: false });
      s.search(query, (err, data) => {
        const places = (data && data.places) || [];
        resolve(places.length ? places[0].coordinate : null);
      });
    } catch (_) { resolve(null); }
  });
}

// mapkit.Geocoder — strict address resolution.
function geocodeOnce(mk, query) {
  return new Promise((resolve) => {
    if (!query) { resolve(null); return; }
    try {
      const g = new mk.Geocoder({ language: 'en', getsUserLocation: false });
      g.lookup(query, (err, data) => {
        const r = (data && data.results) || [];
        resolve(r.length ? r[0].coordinate : null);
      });
    } catch (_) { resolve(null); }
  });
}

// Resolve an address to a coordinate with graceful degradation:
//   Search(full) -> Geocoder(full) -> Search(fallback, e.g. "City, ST").
// Returns { coordinate, precise } or null. precise=false means only the
// town-level fallback matched, so the caller should widen the zoom and not
// imply a rooftop-accurate pin.
// Town-level fallbacks derived from the address STRING itself (robust when the
// dispatch object doesn't carry separate city/state fields): "200 Oak Lane,
// Maplewood, NJ" -> ["Maplewood, NJ", "NJ"].
function fallbackQueries(fullAddress) {
  const parts = String(fullAddress).split(',').map((s) => s.trim()).filter(Boolean);
  const out = [];
  if (parts.length >= 2) out.push(parts.slice(-2).join(', '));
  if (parts.length >= 1) out.push(parts[parts.length - 1]);
  return out;
}

export async function resolveCoordinate(mk, fullAddress) {
  if (!mk || !fullAddress) return null;
  let c = await searchOnce(mk, fullAddress);
  if (c) return { coordinate: c, precise: true };
  c = await geocodeOnce(mk, fullAddress);
  if (c) return { coordinate: c, precise: true };
  for (const q of fallbackQueries(fullAddress)) {
    c = await searchOnce(mk, q);
    if (c) return { coordinate: c, precise: false };
    c = await geocodeOnce(mk, q);
    if (c) return { coordinate: c, precise: false };
  }
  return null;
}

// Driving route between two coordinates via mapkit.Directions. Resolves
// { path, distance(m), time(s) } or null.
export function routeBetween(mk, origin, destination) {
  return new Promise((resolve) => {
    if (!mk || !origin || !destination) { resolve(null); return; }
    try {
      const directions = new mk.Directions();
      directions.route(
        { origin, destination, transportType: mk.Directions.Transport.Automobile },
        (err, data) => {
          const route = data && data.routes && data.routes[0];
          if (err || !route) { resolve(null); return; }
          // Use the SDK's own overlay (modern, full-resolution) rather than the
          // deprecated route.path simplified coordinate array.
          resolve({ polyline: route.polyline, distance: route.distance, time: route.expectedTravelTime });
        },
      );
    } catch (_) { resolve(null); }
  });
}

// A CoordinateRegion that comfortably frames a set of points (origin + scene).
export function regionForPoints(mk, points) {
  if (!points || !points.length) return null;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latD = Math.max((maxLat - minLat) * 1.6, 0.012);
  const lngD = Math.max((maxLng - minLng) * 1.6, 0.012);
  return new mk.CoordinateRegion(
    new mk.Coordinate((minLat + maxLat) / 2, (minLng + maxLng) / 2),
    new mk.CoordinateSpan(latD, lngD),
  );
}

// Great-circle distance in statute miles between two lat/lng points.
export function milesBetween(lat1, lng1, lat2, lng2) {
  const R = 3958.7613; // mean Earth radius, miles
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// A device GPS fix this far from the station is not a rig — it's a VPN exit node,
// a Wi-Fi geolocation miss, or someone reviewing the incident from out of town.
// Routing from it draws a cross-country line to the scene. Fall back to the
// station instead. Override per-department with VITE_MAX_GPS_ORIGIN_MI.
// Optional chaining so this module can be imported by `node --test`, where
// import.meta.env does not exist.
export const MAX_GPS_ORIGIN_MI = Number(import.meta.env?.VITE_MAX_GPS_ORIGIN_MI || 75);

// Decide where a response route should start. Returns the origin plus why.
//   { lat, lng, source: 'gps' | 'station', deviceMiles }
// source==='station' means either no fix, or a fix we judged implausible.
export function resolveRouteOrigin(dev, stationLat, stationLng, maxMi = MAX_GPS_ORIGIN_MI) {
  if (!dev || typeof dev.lat !== 'number' || typeof dev.lng !== 'number') {
    return { lat: stationLat, lng: stationLng, source: 'station', deviceMiles: null };
  }
  const deviceMiles = milesBetween(dev.lat, dev.lng, stationLat, stationLng);
  if (deviceMiles > maxMi) {
    return { lat: stationLat, lng: stationLng, source: 'station', deviceMiles };
  }
  return { lat: dev.lat, lng: dev.lng, source: 'gps', deviceMiles };
}

// This device's current GPS position (the rig running the software). Resolves
// { lat, lng } or null if geolocation is unavailable/denied — callers fall back
// to the configured station.
export function getDevicePosition() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}
