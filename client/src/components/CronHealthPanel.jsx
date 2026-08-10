// components/CronHealthPanel.jsx — are the scheduled jobs still firing? (X-PHASE, 0128)
//
// OpenFirehouse runs five scheduled jobs and, until this shipped, nothing noticed if one
// stopped. Every way a cron goes quiet produces SILENCE inside the app — a rotated secret
// refuses the invocation before any handler runs, a dropped schedule removes it entirely, a
// timeout kills it mid-flight — so error-based alerting is structurally blind to all three.
// Absence of success is the only signal that catches them.
//
// DELIBERATELY QUIETER THAN THE CAD TROUBLE SIGNAL (4C.4), and the difference is the point:
// a lost dispatch is life-safety and time-critical, so it annunciates app-wide with a tone.
// A cron four hours late is operational. Copying the louder treatment here would exceed the
// market bar in the direction R1 forbids just as clearly as falling short of it. This is a
// monitor a chief opens — which is what every documented product in this space ships.
import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Clock, RefreshCw, XCircle } from 'lucide-react';
import { api } from '../utils/api';

function fmt(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
function ago(hours) {
  if (hours === null || hours === undefined) return null;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const VERDICT = {
  healthy:   { Icon: CheckCircle2,  cls: 'text-green-700 dark:text-green-300',  label: 'Running' },
  stale:     { Icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-300',  label: 'Overdue' },
  // Distinct from Overdue on purpose: the remedy differs. Overdue means it stopped being
  // invoked (a rotated secret, a dropped schedule); Failing means it IS invoked and breaks
  // every time. Both count toward the badge — the first version counted only Overdue, so a
  // job failing nightly showed a grey "Not yet seen" and a header reading 0.
  failing:   { Icon: XCircle,       cls: 'text-red-700 dark:text-red-300',      label: 'Failing every run' },
  never_run: { Icon: Clock,         cls: 'text-gray-500 dark:text-gray-400',    label: 'Not yet seen' },
};

export default function CronHealthPanel() {
  const [data, setData]       = useState(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf]       = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/api/cron-health');
      setData(r?.data || r || null);
      setError('');
      setAsOf(new Date());
    } catch (e) {
      // Say plainly that the reading failed. A health panel that silently shows old numbers is
      // worse than one that admits it could not check — that is the whole failure class here.
      setError(e?.status === 403
        ? 'Scheduled-job health is visible to chiefs.'
        : 'The scheduled-job check could not run, so nothing below is current.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Visibility-aware, 5 minutes — the house default for a card that pulls live data. Not
  // faster: this reads a ledger that changes at most hourly.
  useEffect(() => {
    const tick = () => { if (!document.hidden) load(); };
    const id = setInterval(tick, 300000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [load]);

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <h2 className="text-sm font-black text-gray-900 dark:text-gray-100">Scheduled jobs</h2>
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{error}</p>
      </div>
    );
  }

  const jobs = data?.jobs || [];
  // The badge reads needsAttention (overdue + failing), not stale alone.
  const needsAttention = Number(data?.needsAttention ?? data?.stale ?? 0);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-black text-gray-900 dark:text-gray-100">Scheduled jobs</h2>
          {needsAttention > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
              {needsAttention} need{needsAttention === 1 ? 's' : ''} attention
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {asOf ? `as of ${asOf.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '—'}
          </span>
          <button type="button" onClick={load}
            className="flex items-center gap-1 py-2 -my-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:underline">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Checking…</p>
      ) : (
        <>
          {jobs.map((j) => {
            const v = VERDICT[j.verdict] || VERDICT.never_run;
            const { Icon } = v;
            return (
              <div key={j.name} className="flex items-start gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800 last:border-b-0">
                <Icon size={16} className={`shrink-0 mt-0.5 ${v.cls}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-gray-900 dark:text-gray-100">{j.label}</span>
                    <span className={`text-[11px] font-bold ${v.cls}`}>· {v.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {j.verdict === 'failing'
                      ? `It is being invoked and has never finished successfully — last attempt ${fmt(j.lastRunAt)}.`
                      : j.verdict === 'never_run'
                      // Honest, and specific about WHY there is nothing to show. On the day this
                      // check ships that is true of every job, and saying "overdue" instead
                      // would be a false alarm on five rows at once. It stops being benign once
                      // the ledger has been collecting longer than this job's schedule allows.
                      ? `No run recorded yet. Runs ${j.cadenceHours === 1 ? 'hourly' : 'daily'}; the first one will appear here after it does.`
                      : j.lastSuccessAt
                      ? `Last completed ${fmt(j.lastSuccessAt)} (${ago(j.hoursSinceSuccess)}). Runs ${j.cadenceHours === 1 ? 'hourly' : 'daily'}.`
                      : `Never completed successfully. Runs ${j.cadenceHours === 1 ? 'hourly' : 'daily'}.`}
                  </p>
                  {j.verdict === 'stale' && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                      Expected every {j.cadenceHours === 1 ? 'hour' : 'day'};{' '}
                      {j.hoursSinceSuccess === null
                        ? 'it has never succeeded and enough time has now passed that this is not a new install'
                        : `nothing has succeeded for ${ago(j.hoursSinceSuccess)}`}. The usual causes are a
                      rotated cron secret or a schedule that was removed — neither raises an error, which is
                      why this check exists.
                    </p>
                  )}
                  {j.lastRunOutcome === 'failed' && j.lastRunError && (
                    <p className="text-[11px] text-red-700 dark:text-red-300 mt-0.5 break-words">
                      Last attempt failed: {j.lastRunError}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">{j.path}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">
                    {j.scope === 'platform' ? 'whole platform' : 'every department'}
                  </p>
                </div>
              </div>
            );
          })}
          <p className="px-5 py-2.5 text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-950/40">
            A job is called overdue when nothing has succeeded for longer than its schedule allows.
            Detecting a job that has stopped firing is something we chose to build — it is not
            standard in this market — because every way one goes quiet is silent by nature.
          </p>
        </>
      )}
    </div>
  );
}
