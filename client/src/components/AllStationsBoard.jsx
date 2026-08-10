import { useState, useEffect, useCallback } from 'react';
import { Building2, Users, AlertTriangle, CheckCircle2, ChevronRight, RefreshCw } from 'lucide-react';
import { api } from '../utils/api';

// Department-wide "all houses at a glance" rollup for a multi-station department.
// Market bar (2026 pass): command/dispatch needs every station's staffing for a
// date on one screen — per-station panels + an aggregate on-duty count — and the
// understaffed condition must be shown ON the station/rig that is short, then
// rolled up to the department. Consumes GET /api/run-list/all (published rosters)
// + GET /api/apparatus-assignments/staffing/stations (per-station min-staffing).
// Advisory only — never a control (radio/staffing doctrine).

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AllStationsBoard({ onSelectStation = null }) {
  const [rows, setRows]       = useState([]);
  const [totalOnDuty, setTotalOnDuty] = useState(0);
  const [deptShort, setDeptShort]     = useState(false);
  const [loading, setLoading] = useState(true);
  const today = localToday();

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const [rl, st] = await Promise.all([
        api.get(`/api/run-list/all?date=${today}&_=${Date.now()}`).catch(() => null),
        api.get(`/api/apparatus-assignments/staffing/stations?date=${today}&_=${Date.now()}`).catch(() => null),
      ]);
      const rlStations = rl?.data?.stations ?? [];
      const stStations = st?.data?.stations ?? [];
      // Merge staffing (every house appears here) with the published-roster counts.
      const rlById = new Map(rlStations.map((s) => [s.station_id, s]));
      const merged = stStations.map((s) => {
        const r = rlById.get(s.station_id) || {};
        return {
          station_id: s.station_id,
          station_name: s.station_name,
          apparatus_total: s.apparatus_total ?? 0,
          apparatus_short: s.apparatus_short ?? 0,
          understaffed: !!s.understaffed,
          crew_count: r.crew_count ?? 0,
          published: !!r.published,
        };
      });
      // Stations with a published roster but no apparatus template still count.
      for (const r of rlStations) {
        if (!merged.some((m) => m.station_id === r.station_id)) {
          merged.push({
            station_id: r.station_id, station_name: r.station_name,
            apparatus_total: 0, apparatus_short: 0, understaffed: false,
            crew_count: r.crew_count ?? 0, published: !!r.published,
          });
        }
      }
      merged.sort((a, b) => (a.station_name || '').localeCompare(b.station_name || ''));
      setRows(merged);
      setTotalOnDuty(rl?.data?.total_on_duty ?? merged.reduce((n, m) => n + (m.crew_count || 0), 0));
      setDeptShort(st?.data?.department_understaffed ?? merged.some((m) => m.understaffed));
    } catch (_) {
      // silent — keep prior view
    } finally {
      if (initial) setLoading(false);
    }
  }, [today]);

  useEffect(() => { load(true); }, [load]);
  // Visibility-aware refresh so a backgrounded command board jumps fresh on refocus.
  useEffect(() => {
    const onVis = () => { if (!document.hidden) load(false); };
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(() => { if (!document.hidden) load(false); }, 5 * 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(id); };
  }, [load]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-red-600 dark:text-red-400" />
            <span className="text-sm font-black text-gray-900 dark:text-gray-100 uppercase tracking-wide">All Stations</span>
            <span className="text-[10px] text-gray-400 hidden sm:inline">{today}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
              <Users size={10} /> {totalOnDuty} on duty
            </span>
            {deptShort ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">
                <AlertTriangle size={10} /> Understaffed
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300">
                <CheckCircle2 size={10} /> All houses OK
              </span>
            )}
            <button
              onClick={() => load(false)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Per-station panels ── */}
      <div className="p-4">
        {loading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading station staffing…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No stations found for this department.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((s) => (
              <div
                key={s.station_id}
                className={`rounded-xl border p-3.5 ${
                  s.understaffed
                    ? 'border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-950/30'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-gray-900 dark:text-gray-100 truncate">{s.station_name}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {s.published ? 'Roster published' : 'Draft / not published'}
                    </p>
                  </div>
                  {s.understaffed ? (
                    <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white">
                      <AlertTriangle size={10} /> {s.apparatus_short} short
                    </span>
                  ) : (
                    <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-600 text-white">
                      <CheckCircle2 size={10} /> OK
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <div>
                    <p className="text-lg font-black text-gray-900 dark:text-gray-100 leading-none">{s.crew_count}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">On duty</p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-gray-900 dark:text-gray-100 leading-none">
                      {s.apparatus_total - s.apparatus_short}<span className="text-gray-400 text-sm">/{s.apparatus_total}</span>
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Rigs staffed</p>
                  </div>
                  {onSelectStation && (
                    <button
                      onClick={() => onSelectStation(s.station_id)}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-red-700 hover:bg-red-800 text-white transition-colors"
                      title={`Open ${s.station_name}'s board`}
                    >
                      Open <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
