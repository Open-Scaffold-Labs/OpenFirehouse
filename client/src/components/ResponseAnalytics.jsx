import { useState, useEffect, useCallback } from 'react';
import { Clock, AlertTriangle, RefreshCw, Building2, Download } from 'lucide-react';
import { api, getStoredUser } from '../utils/api';
import IncidentHeatMap from './IncidentHeatMap';
import CoverageMap from './CoverageMap';
import IncidentActivity from './IncidentActivity';
import ResponseBenchmarks from './ResponseBenchmarks';
import ReportSchedules from './ReportSchedules';
import { isBcPlus } from '../data/auth';

/**
 * ResponseAnalytics — NFPA 1710 response-time compliance. (4.1h)
 *
 * ─── WHAT THIS REPLACED, AND WHY ────────────────────────────────────────────
 * This page used to read GET /api/response-analytics, which computed
 * `incidents.time -> incidents."dispatchTime"` and labelled the result
 * "turnout time". Two things were wrong with that:
 *
 *   1. `dispatchTime` HAS NO LIVE WRITER. It is absent from incUpdate's
 *      allowlist, absent from the CAD pipeline, and absent from this form. All
 *      ten populated values on production are seed fixtures. The page was
 *      rendering demo data as if it were the department's performance.
 *   2. Even taken at face value, `time -> dispatchTime` is not turnout. Turnout
 *      is notification to the start of travel. The label was wrong by two
 *      segments.
 *
 * It now reads the real thing: unit-status timestamps, attributed to a call by
 * its CAD run number, at the 90th percentile.
 *
 * ─── THE DESIGN RULE HERE ───────────────────────────────────────────────────
 * A number a chief hands to their AHJ has to say where it came from and what it
 * could not measure. So: an uncaptured segment renders "Not captured" with the
 * reason — never a zero, which would read as perfect performance. Anchors that
 * deviate from the standard say so. Out-of-order timestamps are shown as
 * discarded rather than quietly wrapped into plausible numbers.
 */

function fmt(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, '0')}`;
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function SegmentCard({ seg }) {
  const captured = seg.state === 'ok' && seg.p90_seconds !== null;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {seg.label}
      </p>
      {captured ? (
        <>
          <p className="mt-1 text-3xl font-black text-gray-900 dark:text-gray-100">{fmt(seg.p90_seconds)}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">90th percentile · n={seg.n}</p>
        </>
      ) : (
        <>
          {/* Never a zero. A zero here reads as perfect performance. */}
          <p className="mt-1 text-2xl font-bold text-gray-400 dark:text-gray-500">Not captured</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {seg.not_captured_reason || 'no data in this period'}
          </p>
        </>
      )}
      {seg.anchor_note && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">{seg.anchor_note}</p>
      )}
      {seg.defects > 0 && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
          {seg.defects} discarded — the timestamp ended before it started
        </p>
      )}
      <p className="mt-2 text-[11px] text-gray-400">{seg.source}</p>
    </div>
  );
}

export default function ResponseAnalytics() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [dlError, setDlError] = useState('');

  // A VALID PERIOD IS A PRECONDITION, NOT AN ERROR TO REPORT.
  // A cleared date input yields '', which the server rejects with 400 — and
  // rendering "Download failed (400)" is not a fix, it is a nicer failure. The
  // request simply is not made unless the period is real, and the browser is
  // told the bounds so the invalid state is hard to reach in the first place.
  const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  const periodValid = isDay(from) && isDay(to) && from <= to;
  // isBcPlus is level 3 — the same bar requireChief enforces server-side.
  const chief = isBcPlus(getStoredUser());

  const load = useCallback(async () => {
    if (!periodValid) { setState('ready'); return; }   // nothing to ask for
    setState('loading');
    try {
      const res = await api.get(`/api/response-reports/compliance?from=${from}&to=${to}`);
      setData(res?.data || null);
      setState('ready');
    } catch (_) {
      setState('error');
    }
  }, [from, to, periodValid]);

  useEffect(() => { load(); }, [load]);

  if (state === 'error') {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3">
          <p className="text-sm text-amber-900 dark:text-amber-200">Couldn’t load the response report.</p>
          <button onClick={load} className="mt-2 text-sm underline underline-offset-2">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Response times</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {data ? `${data.edition.standard} (${data.edition.year}), amended by ${data.edition.amended_by}` : ' '}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="rFrom" className="block text-xs text-gray-600 dark:text-gray-400">From</label>
            <input id="rFrom" type="date" value={from} max={to || undefined} required
              onChange={(e) => setFrom(e.target.value)}
              className="min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label htmlFor="rTo" className="block text-xs text-gray-600 dark:text-gray-400">To</label>
            <input id="rTo" type="date" value={to} min={from || undefined} required
              onChange={(e) => setTo(e.target.value)}
              className="min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
          </div>
          <button onClick={load} disabled={!periodValid}
            className="min-h-[44px] inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            <RefreshCw className={`h-4 w-4 ${state === 'loading' ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {/* api.download, NOT a plain <a href>: the access token is an
              Authorization header, not a cookie, so browser navigation sends no
              credentials and the download would 401. The file comes from the
              SAME computation as this page, so the two can never disagree. */}
          <button
            disabled={!periodValid}
            onClick={async () => {
              setDlError('');
              try {
                await api.download(
                  `/api/response-reports/compliance.csv?from=${from}&to=${to}`,
                  `response-compliance-${from}_to_${to}.csv`);
              } catch (e) {
                setDlError(e.message || 'Download failed');
              }
            }}
            className="min-h-[44px] inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
        </div>
      </div>

      {!periodValid && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Pick a start and end date to see the report.
        </p>
      )}

      {periodValid && state === 'loading' && (
        <p className="text-sm text-gray-600 dark:text-gray-400">Loading…</p>
      )}

      {/* Reachable only for GENUINE failures now — network loss or a server
          error. The preventable cases (no auth header, bad period, wrong role,
          foreign station) were removed at their cause rather than reported:
          the header is sent, the button is disabled, the page is officer-gated,
          and the UI never sends a station. A failure that DOES reach here is
          still said out loud, because a silently missing file is worse — the
          user assumes it saved and goes looking for it. */}
      {dlError && (
        <div role="status" className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3">
          <p className="text-sm text-red-900 dark:text-red-200">{dlError}</p>
        </div>
      )}

      {periodValid && data && (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.segments.map((s) => <SegmentCard key={s.key} seg={s} />)}
          </section>

          <IncidentActivity from={from} to={to} />

          <IncidentHeatMap from={from} to={to} />

          {/* Where the calls are, then how fast we reach them — same bins, same
              incidents, so the two layers are directly comparable. */}
          <CoverageMap from={from} to={to} />

          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              <Clock className="inline h-4 w-4 mr-1" />Objectives
            </h2>
            {data.objectives.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No incidents in this period had the timestamps needed to evaluate an objective.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-950 text-left">
                    <tr className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      <th className="px-3 py-2">Objective</th>
                      <th className="px-3 py-2">90th %ile</th>
                      <th className="px-3 py-2">Target</th>
                      <th className="px-3 py-2">Meeting</th>
                      <th className="px-3 py-2">n</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {data.objectives.map((o) => (
                      <tr key={o.key}>
                        <td className="px-3 py-2">
                          <span className="text-gray-900 dark:text-gray-100">{o.applies_to}</span>
                          <span className="block text-[11px] text-gray-400">{o.source}</span>
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                          {fmt(o.p90_seconds) ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                          {fmt(o.target_seconds)}
                          {o.target_is_department_override && (
                            <span className="ml-1 text-[11px] text-blue-700 dark:text-blue-400">(yours)</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {o.fraction_meeting === null ? '—' : (
                            <span className={o.meets_objective ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                              {Math.round(o.fraction_meeting * 100)}%
                              <span className="text-[11px] text-gray-500"> of {Math.round(o.target_fraction * 100)}%</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{o.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* §4.1.2.5.2 evaluates "in each geographic area"; §4.1.2.6.1 requires
              the report to NAME the areas not meeting objectives. */}
          {data.by_station.length > 1 && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                <Building2 className="inline h-4 w-4 mr-1" />By station
              </h2>
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-950 text-left">
                    <tr className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      <th className="px-3 py-2">Station</th>
                      <th className="px-3 py-2">Turnout</th>
                      <th className="px-3 py-2">Travel</th>
                      <th className="px-3 py-2">Total</th>
                      <th className="px-3 py-2">Incidents</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {data.by_station.map((s) => (
                      <tr key={s.station_id ?? 'none'}>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{s.station_name || `Station ${s.station_id}`}</td>
                        <td className="px-3 py-2">{fmt(s.turnout.p90_seconds) ?? '—'}</td>
                        <td className="px-3 py-2">{fmt(s.travel.p90_seconds) ?? '—'}</td>
                        <td className="px-3 py-2">{fmt(s.total_response.p90_seconds) ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{s.incidents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* The targets live next to the performance they govern — a target set
              in a settings screen is a target set without seeing whether you are
              meeting it. Reloads the report on change so the objectives table
              re-evaluates against the new number immediately. */}
          <ResponseBenchmarks isChief={chief} onChanged={load} />

          {/* Delivery sits with the report it delivers — a schedule set up in a
              settings screen is one nobody checks against the thing it sends. */}
          <ReportSchedules isChief={chief} />

          {/* Named, not omitted — a shorter list would read as complete. */}
          <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              <AlertTriangle className="inline h-4 w-4 mr-1" />Not measured
            </p>
            <ul className="space-y-1">
              {data.not_computed.map((x) => (
                <li key={x.key} className="text-xs text-gray-600 dark:text-gray-400">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{x.key}</span> — {x.reason}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-gray-400">
              Reported at the {Math.round(data.percentile * 100)}th percentile. {data.edition.successor}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
