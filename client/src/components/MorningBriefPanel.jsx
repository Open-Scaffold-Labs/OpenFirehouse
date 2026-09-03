/**
 * MorningBriefPanel — first OpenFirehouse routine, next to Ask.
 *
 * Shows the latest weekday digest and a "Run morning brief now" control
 * so a chief can demo without waiting on cron. Content comes from
 * POST /api/agent/routines/morning-brief/run → the same invoke reads
 * Ask already uses. Read-only. Never names the plumbing layer.
 */

import { useCallback, useEffect, useState } from 'react';
import { Sunrise } from 'lucide-react';
import { fetchMorningBrief, runMorningBriefNow } from '../utils/askInvoke';

function formatWhen(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function MorningBriefPanel({
  compact = false,
  showRun = true,
  onRan,
}) {
  const [brief, setBrief] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    fetchMorningBrief()
      .then((row) => { setBrief(row); setError(null); })
      .catch((err) => {
        setBrief(null);
        if (err?.status && err.status !== 404) {
          setError(err.message || 'Could not load the morning brief.');
        }
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runNow() {
    setBusy(true);
    setError(null);
    try {
      const out = await runMorningBriefNow();
      setBrief((prev) => ({
        ...(prev || {}),
        latest: {
          digest: out.digest,
          silent: out.silent,
          triggerKind: out.run?.triggerKind || 'manual',
          actorName: out.run?.actorName,
          actorRole: out.run?.actorRole,
          createdAt: out.run?.createdAt || new Date().toISOString(),
        },
        lastCheck: {
          createdAt: out.run?.createdAt || new Date().toISOString(),
          silent: !!out.silent,
          triggerKind: 'manual',
        },
      }));
      if (onRan) onRan(out);
    } catch (err) {
      setError(err.message || 'Could not run the morning brief.');
    } finally {
      setBusy(false);
    }
  }

  const digest = brief?.latest?.digest;
  const lastCheck = brief?.lastCheck;
  const schedule = brief?.schedule;
  const quiet = !digest && lastCheck?.silent;

  return (
    <div
      className={compact
        ? 'rounded-lg border border-slate-200 bg-white p-3'
        : 'bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden'}
      data-routine="morning-shift-brief"
    >
      <div className={compact ? 'space-y-2' : 'flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700'}>
        <div className="flex items-center gap-2 min-w-0">
          <Sunrise size={16} className="text-[#c41e3a] flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className={compact ? 'text-sm font-bold text-slate-800' : 'text-sm font-bold text-gray-700 dark:text-gray-300'}>
              Morning shift brief
            </h2>
            <p className="text-[11px] text-slate-500 leading-snug">
              Weekday {schedule?.localHour ?? 7}:00 {schedule?.timeZone || 'dept local'} · read-only
            </p>
          </div>
        </div>
        {showRun && (
          <button
            type="button"
            onClick={runNow}
            disabled={busy}
            className="w-full sm:w-auto rounded-md bg-[#1e3a5f] px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50 whitespace-nowrap"
            data-testid="run-morning-brief-now"
          >
            {busy ? 'Reading…' : 'Run morning brief now'}
          </button>
        )}
      </div>

      <div className={compact ? 'mt-2' : 'px-5 py-3'}>
        {error && <p className="text-[11px] text-red-600 mb-2">{error}</p>}
        {digest ? (
          <>
            <p className="text-[11px] text-slate-400 mb-1">
              {formatWhen(brief.latest.createdAt)}
              {brief.latest.actorName ? ` · ${brief.latest.actorName}` : ''}
            </p>
            <pre className="whitespace-pre-wrap text-sm leading-snug text-slate-800 dark:text-slate-100 font-sans">
              {digest}
            </pre>
          </>
        ) : quiet ? (
          <p className="text-xs text-slate-500">
            House is quiet. Last check {formatWhen(lastCheck.createdAt) || 'this morning'} — nothing to report.
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            No brief yet today. Click <span className="font-semibold">Run morning brief now</span> to
            read the board, duty list, and apparatus as your badge.
          </p>
        )}
      </div>
    </div>
  );
}
