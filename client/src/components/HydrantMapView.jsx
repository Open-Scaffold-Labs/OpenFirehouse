/**
 * HydrantMapView — Full-screen NFPA 291 color-coded hydrant map
 *
 * Uses Apple MapKit JS. Pins color-coded by ISO flow class per NFPA 291:
 *   Blue  ≥1500 GPM   Green 1000–1499   Orange 500–999   Red <500   Gray=unrated
 */
import { useEffect, useRef, useState } from 'react';
import { XCircle, Loader2, MapPin } from 'lucide-react';
import { loadMapKit } from '../utils/mapkit';
import { nfpa291Class, NFPA291_CLASSES, nfpaGlyph } from '../utils/nfpa291';

function NfpaLegend({ filter, onFilter }) {
  return (
    <div className="absolute bottom-4 left-4 z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-3 space-y-1.5">
      <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">NFPA 291 Flow Class</p>
      {NFPA291_CLASSES.map(cls => (
        <button key={cls.id} onClick={() => onFilter(filter === cls.id ? null : cls.id)}
          className={`flex items-center gap-2 w-full px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
            filter === cls.id
              ? cls.tailwind + ' ring-2 ring-offset-1 ring-gray-400'
              : cls.tailwind
          }`}>
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cls.dot}`} />
          <span className="flex-1 text-left">{cls.label}</span>
          <span className="text-[10px] opacity-70">{cls.desc}</span>
        </button>
      ))}
      {filter && (
        <button onClick={() => onFilter(null)}
          className="w-full text-center text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 pt-1">
          Clear filter
        </button>
      )}
    </div>
  );
}

export default function HydrantMapView({ hydrants, onClose }) {
  const mapRef     = useRef(null);
  const mapObj     = useRef(null);
  const annsRef    = useRef([]);
  const [ready,    setReady]    = useState(false);
  const [selected, setSelected] = useState(null);
  const [filter,   setFilter]   = useState(null);

  const geoHydrants = hydrants.filter(h => h.lat != null && h.lng != null);
  const noGeo       = hydrants.length - geoHydrants.length;

  const visible = filter
    ? geoHydrants.filter(h => nfpa291Class(h.flowRate).id === filter)
    : geoHydrants;

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!mapRef.current) return;
      try {
        const mk = await loadMapKit();
        if (cancelled) return;

        // Center on the cluster of hydrants, or a default
        let region;
        if (geoHydrants.length) {
          const lats = geoHydrants.map(h => h.lat);
          const lngs = geoHydrants.map(h => h.lng);
          const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
          const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
          const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), 0.01) * 1.3;
          const spanLng = Math.max(Math.max(...lngs) - Math.min(...lngs), 0.01) * 1.3;
          region = new mk.CoordinateRegion(
            new mk.Coordinate(midLat, midLng),
            new mk.CoordinateSpan(spanLat, spanLng)
          );
        }

        mapObj.current = new mk.Map(mapRef.current, {
          mapType: mk.Map.MapTypes.Standard,
          showsUserLocation: true,
          region,
        });

        setReady(true);
        renderAnnotations(mk);
      } catch (err) {
        console.error('HydrantMapView init error', err);
      }
    }
    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render pins whenever filter changes
  useEffect(() => {
    if (!mapObj.current || !ready) return;
    loadMapKit().then(mk => renderAnnotations(mk)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, ready]);

  function renderAnnotations(mk) {
    if (!mapObj.current) return;
    // Remove existing
    if (annsRef.current.length) mapObj.current.removeAnnotations(annsRef.current);
    annsRef.current = [];

    const toShow = filter
      ? geoHydrants.filter(h => nfpa291Class(h.flowRate).id === filter)
      : geoHydrants;

    const anns = toShow.map(h => {
      const cls = nfpa291Class(h.flowRate);
      const ann = new mk.MarkerAnnotation(
        new mk.Coordinate(h.lat, h.lng),
        {
          color:      cls.pinColor,
          glyphText:  nfpaGlyph(cls),
          title:      `#${h.hydrantNumber}`,
          subtitle:   h.flowRate ? `${h.flowRate} GPM` : 'Unrated',
        }
      );
      ann._hydrant = h;
      ann.addEventListener('select', () => setSelected(h));
      ann.addEventListener('deselect', () => setSelected(null));
      return ann;
    });

    if (anns.length) mapObj.current.addAnnotations(anns);
    annsRef.current = anns;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60">
      <div className="flex items-center justify-between px-5 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-2">
          <MapPin size={18} className="text-red-600" />
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Hydrant Map — NFPA 291</h2>
            <p className="text-[10px] text-gray-400">
              {geoHydrants.length} of {hydrants.length} hydrant{hydrants.length !== 1 ? 's' : ''} mapped
              {noGeo > 0 && ` · ${noGeo} without GPS`}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <XCircle size={20} />
        </button>
      </div>

      <div className="relative flex-1">
        {/* Map — explicit px height required for MapKit */}
        <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        )}

        {geoHydrants.length === 0 && ready && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 text-center max-w-sm">
              <MapPin size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300">No hydrants have GPS coordinates yet</p>
              <p className="text-xs text-gray-400 mt-1">Edit hydrants and drop a pin, or import from ArcGIS to populate this map.</p>
            </div>
          </div>
        )}

        <NfpaLegend filter={filter} onFilter={setFilter} />

        {selected && (
          <div className="absolute top-4 right-4 z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-4 w-64">
            {(() => {
              const cls = nfpa291Class(selected.flowRate);
              return (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-bold text-sm text-gray-900 dark:text-gray-100">#{selected.hydrantNumber}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls.tailwind}`}>{cls.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{selected.streetAddress}</p>
                  {selected.intersection && <p className="text-[10px] text-gray-400">@ {selected.intersection}</p>}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <p className="text-gray-400 uppercase">Flow Rate</p>
                      <p className="font-bold text-gray-800 dark:text-gray-100">{selected.flowRate ? `${selected.flowRate} GPM` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 uppercase">Status</p>
                      <p className="font-bold text-gray-800 dark:text-gray-100">{selected.status}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 uppercase">Type</p>
                      <p className="font-bold text-gray-800 dark:text-gray-100">{selected.type}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 uppercase">Main Size</p>
                      <p className="font-bold text-gray-800 dark:text-gray-100">{selected.mainSize || '—'}</p>
                    </div>
                  </div>
                  <a
                    href={`https://maps.apple.com/?ll=${selected.lat},${selected.lng}&q=Hydrant+${selected.hydrantNumber}`}
                    target="_blank" rel="noopener noreferrer"
                    className="mt-3 block text-center text-[11px] text-blue-500 hover:underline"
                  >Open in Maps →</a>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
