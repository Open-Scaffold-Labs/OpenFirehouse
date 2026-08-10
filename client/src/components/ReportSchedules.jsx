import { useState, useEffect, useCallback } from 'react';
import { Mail, Plus, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../utils/api';

/**
 * ReportSchedules — standing instructions to deliver a report on a cadence. (4B.3)
 *
 * Roughly four of the nine surveyed platforms ship scheduled delivery. That is
 * short of a majority and I had it recorded as below the bar; Matt's ruling on
 * 2026-07-27 is that four is still enough to match.
 *
 * ─── THE ONE THING THIS SCREEN MUST NEVER DO ────────────────────────────────
 * Let a chief believe a report is going out when it is not. That belief costs
 * nothing to hold and is only discovered when someone asks for a report that
 * was never sent, months later. So:
 *
 * • If email is not configured on this deployment, the screen SAYS so, at the
 *   top, before any schedule is created — not as an error after the fact.
 * • Every schedule shows its LAST OUTCOME in plain language. "Not sent — email
 *   isn't set up" is a state we display; silence is never treated as success.
 * • Every schedule shows the period it will next cover, because "monthly" does
 *   not tell you what will actually arrive or when.
 *
 * Chief-gated, and the server enforces it — the controls are not rendered for
 * anyone else rather than shown and then refused on save.
 */

const REPORTS = { response_compliance: 'Response times' };
const CADENCES = { monthly: 'Monthly', weekly: 'Weekly' };

/** Plain language for a delivery outcome. Never a bare enum, never a blank. */
function outcome(s) {
  if (!s.last_status) {
    return { text: 'Nothing delivered yet', tone: 'muted' };
  }
  const when = s.last_run_at ? new Date(s.last_run_at).toLocaleDateString() : '';
  switch (s.last_status) {
    case 'sent':
      return { text: `Sent ${s.last_period_key}${when ? ` on ${when}` : ''}`, tone: 'ok' };
    case 'no_email_configured':
      return { text: `Not sent — email isn't set up on this deployment`, tone: 'warn' };
    case 'send_failed':
      return { text: `Not sent — ${s.last_error || 'the mail provider refused it'}`, tone: 'bad' };
    case 'no_data':
      return { text: `Nothing to send for ${s.last_period_key} — no incidents in that period`, tone: 'muted' };
    default:
      return { text: s.last_status, tone: 'muted' };
  }
}

const TONE = {
  ok: 'text-green-700 dark:text-green-400',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-red-700 dark:text-red-400',
  muted: 'text-gray-500 dark:text-gray-400',
};

export default function ReportSchedules({ isChief }) {
  const [rows, setRows] = useState([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [state, setState] = useState('loading');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState({
    report_key: 'response_compliance', cadence: 'monthly', recipients: '',
  });

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/report-schedules');
      const d = res.data || res;
      setRows(d.schedules || []);
      setEmailConfigured(d.email_configured !== false);
      setState('ready');
    } catch (e) {
      setErr(e.message || 'Could not load schedules');
      setState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    setErr('');
    // Split on comma OR whitespace — a chief pasting from an address book gets
    // either, and rejecting one of them teaches nothing useful.
    const recipients = draft.recipients.split(/[,\s]+/).map((r) => r.trim()).filter(Boolean);
    if (!recipients.length) { setErr('Add at least one email address.'); return; }
    setBusy('new');
    try {
      await api.post('/api/report-schedules', { ...draft, recipients });
      setDraft({ report_key: 'response_compliance', cadence: 'monthly', recipients: '' });
      setAdding(false);
      await load();
    } catch (e) {
      setErr(e.message || 'Could not save the schedule');
    } finally { setBusy(null); }
  }

  async function toggle(s) {
    setBusy(s.id);
    try { await api.patch(`/api/report-schedules/${s.id}`, { enabled: !s.enabled }); await load(); }
    catch (e) { setErr(e.message || 'Could not update the schedule'); }
    finally { setBusy(null); }
  }

  async function remove(s) {
    setBusy(s.id);
    try { await api.delete(`/api/report-schedules/${s.id}`); await load(); }
    catch (e) { setErr(e.message || 'Could not delete the schedule'); }
    finally { setBusy(null); }
  }

  if (state === 'loading') {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading schedules…</p>;
  }

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <Mail className="inline h-4 w-4 mr-1" />Scheduled delivery
        </h2>
        {isChief && !adding && (
          <button onClick={() => setAdding(true)}
            className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline">
            <Plus className="inline h-3 w-3 mr-0.5" />Add a schedule
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Emails the report as a CSV once each period is complete. It's the same
        file as the download button on this page.
      </p>

      {/* Stated up front, not discovered later. A chief must not set this up
          believing it will send when the deployment cannot send anything. */}
      {!emailConfigured && (
        <div role="status"
          className="mb-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
          <p className="text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
            Email delivery isn't set up on this deployment yet, so nothing will
            actually be sent. You can still create schedules — they'll start
            delivering as soon as an administrator turns email on.
          </p>
        </div>
      )}

      {err && (
        <div role="status" className="mb-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2">
          <p className="text-xs text-red-900 dark:text-red-200">{err}</p>
        </div>
      )}

      {adding && isChief && (
        <form onSubmit={create} className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-900/60 p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <select value={draft.report_key}
              onChange={(e) => setDraft({ ...draft, report_key: e.target.value })}
              className="text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5">
              {Object.entries(REPORTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <select value={draft.cadence}
              onChange={(e) => setDraft({ ...draft, cadence: e.target.value })}
              className="text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5">
              {Object.entries(CADENCES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <input type="text" value={draft.recipients}
            onChange={(e) => setDraft({ ...draft, recipients: e.target.value })}
            placeholder="chief@department.gov, clerk@town.gov"
            className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5" />
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            Separate addresses with commas. They don't have to be department
            members — these often go to a town clerk or council.
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={busy === 'new'}
              className="text-xs font-semibold rounded-lg bg-red-600 text-white px-3 py-1.5 disabled:opacity-50">
              {busy === 'new' ? <Loader2 className="inline h-3 w-3 animate-spin" /> : 'Save schedule'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setErr(''); }}
              className="text-xs text-gray-600 dark:text-gray-300 px-2">Cancel</button>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No schedules yet.{isChief ? ' Add one to have this report emailed automatically.' : ''}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((s) => {
            const o = outcome(s);
            return (
              <li key={s.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {REPORTS[s.report_key] || s.report_key} · {CADENCES[s.cadence] || s.cadence}
                    {!s.enabled && (
                      <span className="ml-2 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                        Paused
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {s.recipients.join(', ')}
                    {s.station_name ? ` · ${s.station_name} only` : ''}
                  </p>
                  <p className={`text-xs mt-0.5 ${TONE[o.tone]}`}>{o.text}</p>
                  {/* What will actually arrive, and when — "monthly" alone
                      doesn't answer either question. */}
                  {s.enabled && s.next_period && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Next: {s.next_period}, delivered once that period is complete
                    </p>
                  )}
                  {s.enabled && !s.next_period && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Up to date — the next report goes out when the current period ends
                    </p>
                  )}
                </div>
                {isChief && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => toggle(s)} disabled={busy === s.id}
                      className="text-xs text-gray-600 dark:text-gray-300 hover:underline disabled:opacity-50">
                      {s.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button onClick={() => remove(s)} disabled={busy === s.id}
                      aria-label="Delete schedule"
                      className="text-gray-400 hover:text-red-600 disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
