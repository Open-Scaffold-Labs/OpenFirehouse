// prevention/ViolationDashboard.jsx — violation aging + reporting (Phase 3 §3.3).
// Reads the rows-authoritative /api/fi-reports/open-violations: every row is the
// CURRENT open violation with its lineage-resolved ORIGINAL reported date.
// Aging is computed here against the viewer's LOCAL today (doctrine 8 — the
// server returns dates, never "today").
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, TrendingUp, Building2 } from 'lucide-react';
import { fi, localToday, daysBetween } from './fiApi';
import { Section, Input, Badge, Spinner, EmptyState } from './ui';

const BUCKETS = [
  ['0–30 days', 0, 30, 'gray'],
  ['31–60 days', 31, 60, 'yellow'],
  ['61–90 days', 61, 90, 'amber'],
  ['90+ days', 91, Infinity, 'red'],
];

function reportedDate(v) {
  return String(v.root_completed_date || v.root_scheduled_date || v.root_created_date || '').slice(0, 10) || null;
}

export default function ViolationDashboard() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const today = localToday();

  useEffect(() => {
    let cancelled = false;
    const load = () => fi.reports.openViolations()
      .then((r) => { if (!cancelled) setRows(r.data ?? []); })
      .catch((e) => { if (!cancelled) setErr(e.message); });
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 120000);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const enriched = useMemo(() => (rows ?? []).map((v) => {
    const rep = reportedDate(v);
    return { ...v, reported: rep, daysOpen: rep ? Math.max(0, daysBetween(rep, today) ?? 0) : null };
  }), [rows, today]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return enriched;
    return enriched.filter((v) => [v.property_name, v.property_address, v.code, v.description, v.inspector_name]
      .some((x) => String(x || '').toLowerCase().includes(needle)));
  }, [enriched, q]);

  if (err) return <p className="text-red-700 dark:text-red-400 font-semibold" role="alert">{err}</p>;
  if (rows === null) return <Spinner label="Loading open violations…" />;

  const byBucket = BUCKETS.map(([label, lo, hi, tone]) =>
    [label, enriched.filter((v) => v.daysOpen != null && v.daysOpen >= lo && v.daysOpen <= hi).length, tone]);
  const byCode = [...enriched.reduce((m, v) => {
    const k = v.code || '(no code)';
    m.set(k, (m.get(k) || 0) + 1); return m;
  }, new Map())].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const byProperty = [...enriched.reduce((m, v) => {
    const k = v.property_name || `#${v.property_id}`;
    m.set(k, (m.get(k) || 0) + 1); return m;
  }, new Map())].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const imminent = enriched.filter((v) => v.imminent_hazard);

  return (
    <div className="space-y-5">
      {imminent.length > 0 && (
        <p className="rounded-2xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 px-4 py-3 font-bold text-red-800 dark:text-red-300 flex items-center gap-2" role="alert">
          <AlertTriangle size={18} aria-hidden="true" /> {imminent.length} open imminent-hazard violation{imminent.length === 1 ? '' : 's'} — these lead the list below.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {byBucket.map(([label, count, tone]) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 px-4 py-3">
            <p className={`text-2xl font-black ${tone === 'red' && count ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>{count}</p>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Open {label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Most-cited codes" subtitle="Where this district actually fails — aim the education program here.">
          {byCode.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">No open violations.</p> : (
            <ul className="space-y-2">
              {byCode.map(([code, n]) => (
                <li key={code} className="flex items-center gap-3">
                  <span className="font-mono font-bold text-red-700 dark:text-red-400 w-20 shrink-0">{code}</span>
                  <div className="flex-1 h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div className="h-full bg-red-600" style={{ width: `${(n / byCode[0][1]) * 100}%` }} />
                  </div>
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300 w-6 text-right">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Repeat properties" subtitle="Most open violations per premises — the reinspection loop's priority list.">
          {byProperty.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">No open violations.</p> : (
            <ul className="space-y-2">
              {byProperty.map(([name, n]) => (
                <li key={name} className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-800 dark:text-gray-200 truncate flex items-center gap-2">
                    <Building2 size={15} className="text-gray-400 shrink-0" aria-hidden="true" /> {name}
                  </span>
                  <Badge tone={n >= 3 ? 'red' : 'amber'}>{n}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Open violations" subtitle="Every row keeps its ORIGINAL reported date across reinspections — aging never resets on a carry-forward.">
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <Input aria-label="Search open violations" placeholder="Search property, code, description, inspector…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={TrendingUp} title={q ? 'Nothing matches' : 'Zero open violations'}
            body={q ? 'Loosen the search.' : 'Every citation in the district is corrected or withdrawn. That is the whole job — well done.'} />
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Open violations table">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th scope="col" className="py-2 pr-3">Property</th>
                  <th scope="col" className="py-2 pr-3">Violation</th>
                  <th scope="col" className="py-2 pr-3">Status</th>
                  <th scope="col" className="py-2 pr-3">Reported</th>
                  <th scope="col" className="py-2 pr-3">Days open</th>
                  <th scope="col" className="py-2">Rechecks</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .slice()
                  .sort((a, b) => (b.imminent_hazard - a.imminent_hazard) || (b.daysOpen ?? -1) - (a.daysOpen ?? -1))
                  .map((v) => (
                    <tr key={v.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{v.property_name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{v.property_address}</p>
                      </td>
                      <td className="py-2.5 pr-3">
                        <p className="text-gray-800 dark:text-gray-200">
                          {v.imminent_hazard && (
                            <span className="inline-flex items-center gap-1 mr-1 font-bold text-red-700 dark:text-red-400">
                              <AlertTriangle size={14} aria-hidden="true" /> IMMINENT HAZARD
                            </span>
                          )}
                          {v.code && <span className="font-mono font-bold text-red-700 dark:text-red-400 mr-1">{v.code}</span>}
                          {v.description}
                        </p>
                      </td>
                      <td className="py-2.5 pr-3"><Badge tone={v.status === 'Time Extension' ? 'yellow' : 'amber'}>{v.status}</Badge></td>
                      <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300">{v.reported || '—'}</td>
                      <td className="py-2.5 pr-3">
                        {v.daysOpen == null ? '—' : (
                          <Badge tone={v.daysOpen > 90 ? 'red' : v.daysOpen > 60 ? 'amber' : v.daysOpen > 30 ? 'yellow' : 'gray'}>{v.daysOpen}d</Badge>
                        )}
                      </td>
                      <td className="py-2.5 text-gray-700 dark:text-gray-300">{v.reinspection_count || 0}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
