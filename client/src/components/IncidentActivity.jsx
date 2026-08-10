import { useState, useEffect } from 'react';
import { Flame, Truck } from 'lucide-react';
import { api } from '../utils/api';

/**
 * IncidentActivity — the two most-named analytical reports in competitor
 * libraries: incident breakdown by type, and apparatus call counts.
 *
 * OF already exported 14 record types, but those are ROW DUMPS. "Incident Log"
 * as a CSV of incidents is data; "how many structure fires last quarter, and
 * which rig ran the most calls" is an answer. Competitors advertise the answers
 * by name — that is the gap this closes.
 *
 * The two panels have DIFFERENT DENOMINATORS and the component says so. Every
 * incident has a type; only incidents whose unit times are attributed to a call
 * can be counted per rig. Showing both under one total would be a quiet lie.
 */
export default function IncidentActivity({ from, to }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    (async () => {
      try {
        const res = await api.get(`/api/response-reports/incident-activity?from=${from}&to=${to}`);
        if (cancelled) return;
        setData(res?.data || null);
        setState('ready');
      } catch (_) {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [from, to]);

  if (state === 'error') {
    return <p className="text-sm text-amber-800 dark:text-amber-300">Couldn\u2019t load incident activity.</p>;
  }
  if (state === 'loading' || !data) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">Loading\u2026</p>;
  }

  const maxType = Math.max(1, ...data.by_type.map((t) => t.count));
  const maxRig = Math.max(1, ...data.by_apparatus.map((a) => a.calls));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-950 px-4 py-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <Flame className="inline h-4 w-4 mr-1" />What you ran
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">{data.total_incidents} incidents</p>
        </div>
        <div className="px-4 py-3">
          {data.by_type.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">No incidents in this period.</p>
          ) : (
            <ul className="space-y-2">
              {data.by_type.map((t) => (
                <li key={t.type}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-gray-900 dark:text-gray-100">{t.type}</span>
                    <span className="text-gray-600 dark:text-gray-400">{t.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-gray-100 dark:bg-gray-800">
                    <div className="h-1.5 rounded bg-red-600"
                      style={{ width: `${(t.count / maxType) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-950 px-4 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <Truck className="inline h-4 w-4 mr-1" />Which rigs ran them
          </p>
        </div>
        <div className="px-4 py-3">
          {data.by_apparatus.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No unit times are attached to incidents in this period.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.by_apparatus.map((a) => (
                <li key={a.designation}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-gray-900 dark:text-gray-100">
                      {a.designation}
                      <span className="ml-1 text-[11px] text-gray-400">{a.apparatus_type}</span>
                    </span>
                    <span className="text-gray-600 dark:text-gray-400">{a.calls}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-gray-100 dark:bg-gray-800">
                    <div className="h-1.5 rounded bg-gray-500"
                      style={{ width: `${(a.calls / maxRig) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {/* Different denominator, stated. Every incident has a type; only
              attributed ones can be counted per rig. */}
          <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
            Counts {data.apparatus_basis.incidents_with_unit_data} of {data.total_incidents} incidents \u2014 {data.apparatus_basis.note}.
          </p>
        </div>
      </section>
    </div>
  );
}
