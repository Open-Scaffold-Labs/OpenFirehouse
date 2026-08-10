import { useState, useEffect, useRef } from 'react';
import { Gauge } from 'lucide-react';
import { api } from '../utils/api';
import { loadMapKit, regionForPoints } from '../utils/mapkit';

/**
 * CoverageMap — MEASURED travel-time performance by area. (4B.4)
 *
 * ─── THE NAME MATTERS, SO IT IS NOT CALLED "COVERAGE" ON SCREEN ─────────────
 * ~3 of 9 surveyed platforms advertise "coverage analysis", and a market pass
 * (2026-07-27) found the term hides two different things: MODELED drive-time
 * isochrones from a routing engine (a prediction about places no rig has been),
 * and MEASURED performance from the department's own recorded incidents.
 *
 * We ship measured, and we say measured. NFPA frames its objectives as
 * performance achieved on ≥90% of incidents, and ISO's rating schedule
 * explicitly accepts demonstrated travel performance in lieu of its road-distance
 * test — so the measured number is the one that carries weight. We also have no
 * routing engine, and a polygon drawn from assumed speeds would contradict the
 * CAD-recorded times sitting in the same database.
 *
 * Calling this "coverage" would invite a chief to read a prediction into it.
 * The heading, the legend and the payload all say "measured".
 *
 * ─── SMALL n IS THE REAL HAZARD HERE ────────────────────────────────────────
 * A 90th percentile over two incidents is noise wearing a statistic's clothes,
 * and on a map it looks exactly as authoritative as a well-evidenced cell. Thin
 * cells are drawn HOLLOW and counted separately rather than dropped — dropping
 * them would quietly shrink the district.
 */

const BANDS = [
  { max: 240, color: '#16a34a', label: '≤ 4:00' },
  { max: 360, color: '#ca8a04', label: '4:00 – 6:00' },
  { max: 480, color: '#ea580c', label: '6:00 – 8:00' },
  { max: Infinity, color: '#dc2626', label: '> 8:00' },
];

const band = (s) => BANDS.find((b) => s <= b.max) || BANDS[BANDS.length - 1];
const mmss = (s) => (s === null || s === undefined ? '—'
  : `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`);

export default function CoverageMap({ from, to }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const elRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    (async () => {
      try {
        const res = await api.get(`/api/response-reports/coverage?from=${from}&to=${to}`);
        if (cancelled) return;
        setData(res.data || res);
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
      if (map.overlays && map.overlays.length) map.removeOverlays(map.overlays);

      const bins = (data.bins || []).filter((b) => b.p90_travel_seconds !== null);
      if (!bins.length) return;

      map.addOverlays(bins.map((b) => {
        const c = band(b.p90_travel_seconds).color;
        const o = new mk.CircleOverlay(new mk.Coordinate(b.lat, b.lng), 160);
        o.style = new mk.Style({
          fillColor: c,
          // A cell below the threshold is drawn HOLLOW — visibly present, and
          // visibly not something to make a decision on.
          fillOpacity: b.sufficient ? 0.55 : 0.12,
          strokeColor: c,
          strokeOpacity: b.sufficient ? 0.7 : 0.9,
          lineWidth: b.sufficient ? 1 : 2,
        });
        return o;
      }));

      // regionForPoints reads .latitude/.longitude, NOT .lat/.lng.
      const region = regionForPoints(mk, bins.map((b) => ({ latitude: b.lat, longitude: b.lng })));
      if (region) map.region = region;
    }).catch(() => { /* map stays blank; the figures below still tell the truth */ });

    return () => { cancelled = true; };
  }, [state, data]);

  useEffect(() => () => {
    try { mapRef.current?.destroy(); } catch (_) { /* already gone */ }
    mapRef.current = null;
  }, []);

  if (state === 'loading') {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading travel-time performance…</p>;
  }
  if (state === 'error') {
    return (
      <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
        <p className="text-sm text-amber-900 dark:text-amber-200">
          Travel-time performance couldn't be loaded for this period.
        </p>
      </div>
    );
  }

  const g = data.not_measurable || {};
  const measurable = data.incidents_measured || 0;

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        <Gauge className="inline h-4 w-4 mr-1" />Measured travel-time performance
      </h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        The 90th-percentile travel time your first-arriving unit actually
        achieved, by area — en route to on scene. This is recorded performance,
        not a predicted drive-time model.
      </p>

      {measurable === 0 ? (
        /* Not an error, and not an empty map. A specific, actionable account of
           why there is nothing to draw — the three causes have different fixes,
           so they are never added together into one discouraging number. */
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 px-4 py-4">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">
            Nothing measurable in this period yet
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            An area can only be measured where an incident has both a location
            and a recorded arrival. Of {g.incidents_in_period ?? 0} incident
            {g.incidents_in_period === 1 ? '' : 's'} in this period:
          </p>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc pl-4">
            {g.not_linked_to_a_call > 0 && (
              <li>
                <strong>{g.not_linked_to_a_call}</strong> aren't linked to a CAD
                call, so there's no location. Linking them on the Reconciliation
                page will place them here.
              </li>
            )}
            {g.linked_but_not_geocoded > 0 && (
              <li>
                <strong>{g.linked_but_not_geocoded}</strong> are linked to a call
                that arrived without coordinates. We don't geocode the address to
                fill that in — that would be a guess about where a legal record
                happened.
              </li>
            )}
            {g.no_arrival_recorded > 0 && (
              <li>
                <strong>{g.no_arrival_recorded}</strong> have a location but no
                on-scene status recorded, so there's no arrival to measure to.
              </li>
            )}
          </ul>
        </div>
      ) : (
        <>
          <div ref={elRef} style={{ height: 380 }} className="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900" />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {BANDS.map((b) => (
              <span key={b.label} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                {b.label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
              <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-gray-400" />
              fewer than {data.min_n} incidents — shown, but too thin to rely on
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {measurable} incident{measurable === 1 ? '' : 's'} measured across{' '}
            {data.bins?.length ?? 0} area{data.bins?.length === 1 ? '' : 's'};{' '}
            {data.bins_sufficient ?? 0} of those meet the {data.min_n}-incident
            threshold.
            {g.not_linked_to_a_call > 0 && ` ${g.not_linked_to_a_call} incident${g.not_linked_to_a_call === 1 ? ' is' : 's are'} not linked to a call and could not be placed.`}
          </p>
          {/* Worst-performing areas, because a map is hard to rank by eye and
              the question a chief is actually asking is "where are we slowest". */}
          {data.bins?.some((b) => b.sufficient) && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                Slowest areas
              </p>
              <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
                {data.bins.filter((b) => b.sufficient)
                  .sort((a, b) => b.p90_travel_seconds - a.p90_travel_seconds)
                  .slice(0, 5)
                  .map((b) => (
                    <li key={`${b.lat},${b.lng}`} className="flex justify-between gap-3">
                      <span className="text-gray-500 dark:text-gray-400 tabular-nums">
                        {b.lat.toFixed(3)}, {b.lng.toFixed(3)}
                      </span>
                      <span className="tabular-nums font-semibold" style={{ color: band(b.p90_travel_seconds).color }}>
                        {mmss(b.p90_travel_seconds)} <span className="text-gray-400 font-normal">(n={b.n})</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
