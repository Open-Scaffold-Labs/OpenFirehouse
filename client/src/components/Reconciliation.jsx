import { useState, useEffect, useCallback } from 'react';
import { Link2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../utils/api';

/**
 * Reconciliation — 4.1a-R.5.
 *
 * The repair surface for a call that never got attached to a report. This is the
 * market's own word for this screen ("reconciliation", with a MISSING status);
 * "exceptions queue" and "unmatched" return zero hits across fire/EMS docs.
 *
 * It is deliberately a QUEUE, not a notification. A toast an officer dismisses at
 * 0300 and a list a records clerk works in March are different artifacts — and
 * the person who works this screen is the same person who compiles the annual
 * report, which is where an unattached call would otherwise surface as a hole.
 *
 * Read is officer+; the repair itself is chief-only and audited server-side.
 */
export default function Reconciliation() {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null); // { kind: 'ok'|'err', text }
  const [picked, setPicked] = useState({}); // alert_id -> incident id

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await api.get(`/api/reconciliation?days=${days}`);
      setData(res?.data || null);
      setState('ready');
    } catch (_) {
      setState('error');
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  async function attach(runNumber) {
    const incidentId = Number(picked[runNumber]);
    if (!incidentId) return;
    setBusy(runNumber);
    setNote(null);
    try {
      await api.post('/api/reconciliation/associate', {
        incident_id: incidentId,
        cad_run_number: runNumber,
      });
      setNote({ kind: 'ok', text: `Attached CAD run ${runNumber}.` });
      await load();
    } catch (e) {
      // The server's refusals are specific and worth showing verbatim — an
      // already-attached report names the run it belongs to, which is the fact
      // the operator needs to decide what to do next.
      setNote({ kind: 'err', text: e?.message || 'Could not attach that call.' });
    } finally {
      setBusy(null);
    }
  }

  if (state === 'error') {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-900 dark:text-amber-200">Couldn’t load reconciliation.</p>
            <button onClick={load} className="mt-2 text-sm underline underline-offset-2">Try again</button>
          </div>
        </div>
      </div>
    );
  }

  const missingReport = data?.missing_report || [];
  const missingCall = data?.missing_call || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Reconciliation</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Calls and reports that aren’t attached to each other. Attaching them is what gives a call its response times.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="recWindow" className="text-sm text-gray-600 dark:text-gray-400">Window</label>
          <select
            id="recWindow" value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>1 year</option>
          </select>
          <button
            onClick={load}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <RefreshCw className={`h-4 w-4 ${state === 'loading' ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {note && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-sm ${note.kind === 'ok'
            ? 'bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-200 border border-green-300 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200 border border-red-300 dark:border-red-800'}`}
        >
          {note.text}
        </div>
      )}

      {/* THE actionable list: a call happened and nobody filed a report for it. */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
          Calls with no report ({missingReport.length})
        </h2>
        {state === 'loading' ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading…</p>
        ) : missingReport.length === 0 ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-6 text-center">
            <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Every call in the last {data?.window_days ?? days} days is on a report. Nothing to chase.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
            {missingReport.map((c) => (
              <div key={c.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {c.dispatched_at ? new Date(c.dispatched_at).toLocaleString() : 'time unknown'} · {c.address || 'no address'}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {c.units || 'no units'} · run {c.alert_id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor={`rec-${c.id}`} className="sr-only">Report to attach this call to</label>
                  <select
                    id={`rec-${c.id}`}
                    value={picked[c.alert_id] || ''}
                    onChange={(e) => setPicked((p) => ({ ...p, [c.alert_id]: e.target.value }))}
                    className="min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Attach to a report…</option>
                    {missingCall.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.incidentNumber} · {i.date} · {i.type}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => attach(c.alert_id)}
                    disabled={!picked[c.alert_id] || busy === c.alert_id}
                    className="min-h-[44px] inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Link2 className="h-4 w-4" />
                    {busy === c.alert_id ? 'Attaching…' : 'Attach'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* The inverse. Often entirely legitimate, so it is stated as information —
          never as an error queue to drive to zero. */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
          Reports with no call ({missingCall.length})
        </h2>
        <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
          Normal for a walk-in, a still alarm, or a department with no CAD feed. Listed so you can attach one if it
          should have a call — not because anything is wrong.
        </p>
        {missingCall.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">None in this window.</p>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
            {missingCall.map((i) => (
              <div key={i.id} className="px-4 py-2.5">
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {i.incidentNumber} · {i.type}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {i.date}{i.time ? ` ${i.time}` : ''} · {i.address || 'no address'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {data && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {data.linked_count} call{data.linked_count === 1 ? '' : 's'} in this window {data.linked_count === 1 ? 'is' : 'are'} already attached to a report.
        </p>
      )}
    </div>
  );
}
