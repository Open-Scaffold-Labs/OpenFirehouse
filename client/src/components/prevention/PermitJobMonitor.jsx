// PermitJobMonitor.jsx — the expiry job's run history and the R8 staleness verdict (3.1b).
//
// TWO CAPABILITIES AT TWO DIFFERENT HEIGHTS, and the difference is stated here so nobody
// later cites the second one back as "what the market does":
//   AT THE BAR — the run monitor itself. Both enterprise platforms with reachable
//   documentation ship a customer-admin view of scheduled jobs. This is a copy.
//   A DELIBERATE DEPARTURE (R8) — the staleness banner. No platform we reached documents
//   detecting a job that STOPS FIRING, and a state licensing/permitting RFP requirements
//   matrix (~125 scored requirements, read end to end) asks for zero batch-job-health items.
//
// WHY IT EARNS ITS PLACE ON A SCREEN: moving a permit down the expiry ladder is the only
// status change in this module that no human authors, so nobody would notice it stopping.
// Every documented alerting mechanism is either pull-based or fires BECAUSE the job ran —
// and all three ways this job goes quiet (a rotated cron secret refused at the door, the
// schedule dropped in a merge, the function timing out) produce silence. Absence of success
// is the only signal that catches them, and a human has to be able to see it.
import { useState, useEffect, useCallback } from 'react';
import { Clock, AlertTriangle, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { fi } from './fiApi';
import { Section, Badge, Spinner, EmptyState } from './ui';

const fmt = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

export default function PermitJobMonitor() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try { setState((await fi.permitJobs.runs(20)).data); setError(null); }
    catch (e) { setError(e?.message || 'Could not load the job history.'); }
  }, []);

  // Visibility-aware polling: the repo's default cadence for a live card. A backgrounded tab
  // must not burn requests, but coming back to it should show current state.
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  if (error) {
    return (
      <Section title="Expiry job" subtitle="The nightly pass that moves permits through their renewal window, grace period and expiry.">
        <div role="alert" className="m-5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      </Section>
    );
  }
  if (!state) return <div className="py-12 flex justify-center"><Spinner /></div>;

  const { stale, neverRun, lastSuccessAt, hoursSinceLastSuccess, staleAfterHours,
          lastSkippedNoTerms, runs } = state;
  // Defaulted rather than destructured bare: an older deploy of the API predates the notice
  // tally, and a missing object here would take the whole Permits tab into the ErrorBoundary.
  // That exact failure — a dead identifier, green build, green suite — is what §3.8 is about.
  const notices = state.notices || { queued: 0, noRecipient: 0, sent: 0, failed: 0 };

  return (
    <Section
      title="Expiry job"
      subtitle="The nightly pass that moves permits through their renewal window, grace period and expiry."
    >
      {/* NEVER RUN and STALE are reported as different things on purpose. On a department
          that has only just been set up, "it has not run yet" is the honest answer, and
          calling that stale would train people to ignore the indicator. */}
      {neverRun && (
        <div className="mx-5 mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-3 flex items-start gap-2">
          <HelpCircle size={18} className="mt-0.5 shrink-0 text-gray-500" aria-hidden="true" />
          <div className="text-sm">
            <div className="font-bold text-gray-800 dark:text-gray-200">It hasn’t run yet</div>
            <p className="text-gray-600 dark:text-gray-400 mt-0.5">
              The job runs once a day. Nothing is wrong — there is simply no history for your
              department yet.
            </p>
          </div>
        </div>
      )}

      {stale && (
        <div role="alert" className="mx-5 mt-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
          <div className="text-sm">
            <div className="font-bold text-amber-900 dark:text-amber-200">
              This job hasn’t finished successfully in {Math.round(hoursSinceLastSuccess)} hours
            </div>
            <p className="text-amber-800 dark:text-amber-300 mt-0.5">
              {/* Say what it MEANS for the records, not just that a job is late. */}
              It normally runs daily. While it is not running, permits that have reached the end
              of their term will keep showing as current. Nothing has been lost — the job picks
              up where the dates say when it next runs — but the register may be behind.
            </p>
          </div>
        </div>
      )}

      <dl className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-b border-gray-100 dark:border-gray-800">
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Last successful run</dt>
          <dd className="font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{fmt(lastSuccessAt)}</dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Status</dt>
          <dd className="mt-0.5">
            {neverRun ? <Badge tone="gray">Not run yet</Badge>
              : stale ? <Badge tone="amber">Behind</Badge>
              : <Badge tone="green">Up to date</Badge>}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Expected within</dt>
          <dd className="font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{staleAfterHours} hours</dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">No permit type</dt>
          <dd className="font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
            {lastSkippedNoTerms == null ? '—' : lastSkippedNoTerms}
          </dd>
        </div>
      </dl>

      {/* The skipped count is not an error and must not read like one — but it must not
          disappear either. These are permits the job CANNOT evaluate because they carry no
          permit type, so no term/window/grace exists to measure against. Inventing terms
          would be worse than leaving them alone, so the honest move is to show the number
          and say what closes it.
          ⚠ COPY RULE (Matt, 2026-08-03): describe the RECORD's condition, never product
          history. An earlier version said "issued before your permit catalogue existed" —
          developer-timeline narration a customer should never read, and factually wrong
          for the real-world case (a department importing legacy records HAS a catalogue;
          the records just aren't linked to a type). */}
      {lastSkippedNoTerms > 0 && (
        <div className="mx-5 mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-3 text-sm">
          <div className="font-bold text-gray-800 dark:text-gray-200">
            {lastSkippedNoTerms} permit{lastSkippedNoTerms === 1 ? '' : 's'} not linked to a permit type
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-0.5">
            {lastSkippedNoTerms === 1 ? 'This permit isn’t' : 'These permits aren’t'} linked to a
            permit type, so there is no term, renewal window or grace period on record to measure
            against. Rather than guess at dates on a legal record, the nightly pass leaves
            {lastSkippedNoTerms === 1 ? ' it' : ' them'} unchanged. Renew or reissue
            {lastSkippedNoTerms === 1 ? ' it' : ' them'} under a permit type and
            {lastSkippedNoTerms === 1 ? ' it joins' : ' they join'} the ladder automatically.
          </p>
        </div>
      )}

      {/* NOTICES. Two states that look similar and are not, so they are never merged into a
          single "pending" number:
            · no recipient — a to-do a CLERK can close (no email on file for the holder).
            · queued       — awaiting the nightly delivery attempt. The client CANNOT see
                             whether outbound mail is configured server-side (a Vercel env
                             var), so this panel must never claim it is or isn't — the old
                             copy asserted "delivery isn't switched on" and was WRONG on
                             prod (the key existed since Jun 17; verified 2026-08-03).
                             Never claim a status the app isn't reading.
          Saying "sent" for anything the mail service did not accept would be the single most
          damaging lie this panel could tell: a bureau would believe holders had been warned. */}
      {(notices.queued > 0 || notices.noRecipient > 0 || notices.sent > 0 || notices.failed > 0) && (
        <div className="mx-5 mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-3 text-sm">
          <div className="font-bold text-gray-800 dark:text-gray-200">Expiry notices</div>
          <dl className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Ready to send</dt>
              <dd className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{notices.queued}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">No email on file</dt>
              <dd className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{notices.noRecipient}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Sent</dt>
              <dd className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{notices.sent}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Failed</dt>
              <dd className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{notices.failed}</dd>
            </div>
          </dl>
          {notices.queued > 0 && (
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Queued notices are written down and waiting — the nightly pass attempts
              delivery on every run. Each one is kept with the exact wording and the address
              it is addressed to, and a notice is only ever marked Sent after the mail
              service accepted it. Nothing is lost while anything remains queued.
            </p>
          )}
          {notices.noRecipient > 0 && (
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {notices.noRecipient} notice{notices.noRecipient === 1 ? ' has' : 's have'} no
              email address to go to, because the property has no owner email on file. The
              notice is still recorded — add the address to the property and future notices
              will reach them.
            </p>
          )}
        </div>
      )}

      {!runs?.length ? (
        <EmptyState icon={Clock} title="No runs recorded yet"
          body="Each nightly pass records what it examined and what it changed. The history appears here." />
      ) : (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="px-5 py-2 font-semibold">Finished</th>
                <th className="px-3 py-2 font-semibold">For date</th>
                <th className="px-3 py-2 font-semibold">Result</th>
                <th className="px-3 py-2 font-semibold text-right">Checked</th>
                <th className="px-3 py-2 font-semibold text-right">Changed</th>
                <th className="px-3 py-2 font-semibold text-right">Notices</th>
                <th className="px-3 py-2 font-semibold text-right">Skipped</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800/60">
                  <td className="px-5 py-2.5 text-gray-700 dark:text-gray-300">{fmt(r.finished_at)}</td>
                  <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">
                    {String(r.evaluated_for).slice(0, 10)}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.outcome === 'success'
                      ? <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-semibold">
                          <CheckCircle2 size={15} aria-hidden="true" /> Completed</span>
                      : <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 font-semibold"
                              title={r.error || undefined}>
                          <XCircle size={15} aria-hidden="true" /> Failed</span>}
                    {r.outcome !== 'success' && r.error && (
                      <div className="text-xs text-red-700/80 dark:text-red-400/80 mt-0.5 max-w-md truncate">{r.error}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.examined}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{r.transitioned}</td>
                  {/* A run that changed permits but wrote no notices is the gap 0117's column
                      exists to make visible — flagged rather than left to be spotted by
                      someone comparing two columns of numbers by eye.
                      🔴 THE WORDING IS "wrote no NEW notices", NOT "sent none", for two
                      reasons found in the prod design pass. Nothing is ever *sent* while
                      delivery is off, and "sent" is the one word this whole surface must not
                      use loosely. And this legitimately fires on a replay: if a permit is put
                      back and re-walks a rung it was already notified about, the run
                      transitions it and correctly writes nothing, because the notice already
                      exists. Calling that "sent no notices" would be a wolf-cry on a healthy
                      run, and this file's sibling route already records why that is worse
                      than having no indicator at all. */}
                  <td className={`px-3 py-2.5 text-right tabular-nums${
                    r.transitioned > 0 && !r.notified ? ' text-amber-700 dark:text-amber-400 font-semibold' : ''}`}>
                    {r.notified ?? 0}
                    {r.transitioned > 0 && !r.notified && (
                      <span className="sr-only"> — this run changed permits but wrote no new notices; they may already have been written</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.skipped_no_terms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
