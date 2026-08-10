import { useState, useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';
import { api } from '../utils/api';
import { loadMapKit, regionForPoints } from '../utils/mapkit';

/**
 * IncidentHeatMap — incident density on the existing MapKit stack. (4.2)
 *
 * Heat maps are the most consistently advertised analytics feature in this
 * market (~6 of 9 platforms), so this sits at the bar rather than past it.
 *
 * ─── HOW IT DRAWS ───────────────────────────────────────────────────────────
 * The server bins incidents into ~200 m cells; each cell renders as a
 * mapkit.CircleOverlay whose radius and opacity scale with the count. MapKit JS
 * has no continuous density layer, so binned circles ARE the idiom here.
 * (Verified before writing this: mapkit.CircleOverlay and mapkit.PolygonOverlay
 * are real MapKit JS classes — the codebase had never used either, only
 * MarkerAnnotation and one route polyline.)
 *
 * ─── WHAT IT REFUSES TO DO ──────────────────────────────────────────────────
 * It does not pretend to plot incidents it cannot locate. incidents carry no
 * coordinates at all; an incident is on this map only if its CAD call carried
 * them. The count of unplotted incidents is stated under the map, because a
 * chief looking at ten dots would otherwise read them as the whole call volume.
 *
 * Explicit pixel height — MapKit's .mk-map-view is height:100% and resolves to
 * ZERO against a min-height-only parent, which has shipped a blank map here
 * before.
 */
export default function IncidentHeatMap({ from, to }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    (async () => {
      try {
        const res = await api.get(`/api/response-reports/heatmap?from=${from}&to=${to}`);
        if (cancelled) return;
        setData(res?.data || null);
        setState('ready');
      } catch (_) {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [from, to]);

  useEffect(() => {
    if (state !== 'ready' || !data || !elRef.current) return;
    let cancelled = false;

    loadMapKit().then((mk) => {
      if (cancelled || !elRef.current) return;

      if (!mapRef.current) {
        mapRef.current = new mk.Map(elRef.current, {
          showsCompass: mk.FeatureVisibility.Hidden,
          showsZoomControl: true,
          showsMapTypeControl: false,
          isRotationEnabled: false,
        });
      }
      const map = mapRef.current;
      // Redraw from scratch each period change — stale cells on a density map
      // are worse than an empty one.
      if (map.overlays && map.overlays.length) map.removeOverlays(map.overlays);

      const cells = data.cells || [];
      if (!cells.length) return;

      const max = Math.max(...cells.map((c) => c.count));
      const overlays = cells.map((c) => {
        const weight = c.count / max;                 // 0..1
        const radius = 90 + weight * 260;             // metres
        const overlay = new mk.CircleOverlay(
          new mk.Coordinate(c.lat, c.lng), radius
        );
        overlay.style = new mk.Style({
          fillColor: '#dc2626',
          fillOpacity: 0.18 + weight * 0.45,
          strokeColor: '#dc2626',
          strokeOpacity: 0.35,
          lineWidth: 1,
        });
        overlay.data = { count: c.count };
        return overlay;
      });
      map.addOverlays(overlays);

      // regionForPoints reads .latitude/.longitude, NOT .lat/.lng — passing the
      // server's shape straight through yields a NaN region and an unframed map.
      const region = regionForPoints(mk, cells.map((c) => ({ latitude: c.lat, longitude: c.lng })));
      if (region) map.region = region;
    }).catch(() => { /* map stays blank; the counts below still tell the truth */ });

    return () => { cancelled = true; };
  }, [state, data]);

  useEffect(() => () => {
    try { mapRef.current?.destroy(); } catch (_) { /* already gone */ }
    mapRef.current = null;
  }, []);

  if (state === 'error') {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3">
        <p className="text-sm text-amber-900 dark:text-amber-200">Couldn’t load the incident map.</p>
      </div>
    );
  }

  const nothingToPlot = state === 'ready' && (data?.cells?.length ?? 0) === 0;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="bg-gray-50 dark:bg-gray-950 px-4 py-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <MapPin className="inline h-4 w-4 mr-1" />Where the calls are
        </p>
        {data && (
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {data.incidents_plotted} plotted
          </p>
        )}
      </div>

      {/* Explicit pixel height — a min-height-only parent renders MapKit at 0. */}
      <div ref={elRef} style={{ height: '380px', width: '100%', display: 'block' }} />

      {nothingToPlot && (
        <div className="px-4 py-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            No incidents in this period have a location.
          </p>
        </div>
      )}

      {/* Two plain facts. Without the second, ten dots read as the whole call
          volume — the same failure as a segment showing 0 instead of "not
          captured". */}
      {data && data.incidents_without_location > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {data.incidents_without_location} incident{data.incidents_without_location === 1 ? '' : 's'} in
            this period {data.incidents_without_location === 1 ? 'is' : 'are'} not on this map — {data.no_location_reason}.
          </p>
        </div>
      )}
    </div>
  );
}
