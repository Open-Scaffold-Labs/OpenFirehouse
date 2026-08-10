// components/CadIngestFaults.jsx — 4C.4. The CAD interface TROUBLE panel.
//
// Spec: docs/CAD-INGEST-4C4-SPEC-2026-08-05.md
//
// WHY THIS SCREEN EXISTS, in one sentence: a dispatch we stored but could not read is, to the
// department, indistinguishable from a call that never arrived — the sending CAD will not
// resend it and believes we have it (NENA-STA-024 §3.3.5.3.1), so a human being told is the
// only path back to that call.
//
// 09 NCAC 06C .0213(a)(4) requires "visual and audible indications to personnel designated by
// the PSAP" on an interface fault. NFPA 1221 §3.3.85 calls the artifact a Trouble Signal.
// (⚠ .0213 is ONE STATE's rule — the 4C.2 market pass found no equivalent elsewhere. It is
// honoured because the cost is a panel and a tone; it is not described as an industry norm.)
//
// DELIBERATELY ABSENT: mute, snooze, and dismiss-without-review. A CAD emitting unparseable
// payloads is a configuration defect to fix with that vendor, and this panel exists to make
// that conversation happen. The app-wide speaker toggle is the only audio opt-out.
import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, ShieldCheck, FileWarning, RefreshCw, Eye, X } from 'lucide-react';
import { api } from '../utils/api';
import { cadFaultTopic, subscribeBroadcast } from '../utils/supabase';
import { toneTrouble } from '../utils/alertTones';

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
function fmtClock(d) {
  return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
}

const STATUS_LABEL = {
  unparseable:       'Could not be read',
  processing_failed: 'Read, but failed to process',
};

/** The raw payload. A separate, audited read — the bytes carry caller PII and never expire. */
function RawPayloadModal({ fault, onClose }) {
  const [row, setRow]     = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.get(`/api/cad-ingest/faults/${fault.log_event_id}/raw`)
      .then(r => { if (alive) setRow(r?.data || r); })
      .catch(e => { if (alive) setError(e?.message || 'That message could not be loaded.'); });
    return () => { alive = false; };
  }, [fault.log_event_id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Raw CAD message">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-base font-black text-gray-900 dark:text-gray-100">The message exactly as it arrived</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {fault.vendor} · {fmt(fault.received_at)} · this view is recorded in the audit trail
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-auto space-y-4">
          {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
          {!row && !error && <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}
          {row && (
            <>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-gray-500 dark:text-gray-400">From</span>
                  <p className="font-mono text-gray-900 dark:text-gray-100">{row.source_ip || 'not recorded'}</p></div>
                <div><span className="text-gray-500 dark:text-gray-400">We answered</span>
                  <p className="font-mono text-gray-900 dark:text-gray-100">HTTP {row.responded_status ?? '—'}</p></div>
              </div>
              {row.parse_error && (
                <div>
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Why it could not be read</p>
                  <p className="text-sm text-red-700 dark:text-red-300 break-words">{row.parse_error}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
                  Headers <span className="font-normal">(credentials were redacted before storage)</span>
                </p>
                <pre className="text-[11px] font-mono bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg p-3 overflow-auto max-h-40 text-gray-800 dark:text-gray-200">
{JSON.stringify(row.headers || {}, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Body</p>
                <pre className="text-[11px] font-mono bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg p-3 overflow-auto max-h-72 whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200">
{row.raw_body || '(empty)'}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CadIngestFaults({ departmentId }) {
  const [summary, setSummary]   = useState(null);
  const [faults, setFaults]     = useState([]);
  const [scope, setScope]       = useState('open');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [asOf, setAsOf]         = useState(null);
  const [rawFor, setRawFor]     = useState(null);
  const [busyId, setBusyId]     = useState(null);
  const [noteFor, setNoteFor]   = useState(null);
  const [note, setNote]         = useState('');
  // Rising edge only: tone when the unreviewed count GOES UP, never on every poll.
  const lastUnreviewed = useRef(null);

  const load = useCallback(async (opts = {}) => {
    try {
      const [s, f] = await Promise.all([
        api.get('/api/cad-ingest/summary'),
        api.get(`/api/cad-ingest/faults?scope=${opts.scope || scope}`),
      ]);
      const sum = s?.data || s || {};
      const list = Array.isArray(f?.data) ? f.data : [];
      setSummary(sum);
      setFaults(list);
      setError('');
      setAsOf(new Date());
      const n = Number(sum.unreviewed || 0);
      if (lastUnreviewed.current !== null && n > lastUnreviewed.current) toneTrouble();
      lastUnreviewed.current = n;
    } catch (e) {
      // Say what is actually unknown. A stale panel that looks live is the failure mode this
      // whole module exists to prevent.
      setError('The interface-fault list could not be refreshed, so what you see below may be out of date.');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  // Visibility-aware poll. 60s while the console is open; paused when the tab is hidden and
  // refetched the moment it comes back. NOT accelerated when realtime is down — a synchronised
  // request spike from every client turns "one card is stale" into "the app is down".
  useEffect(() => {
    const tick = () => { if (!document.hidden) load(); };
    const id = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [load]);

  // The push half — its OWN topic, through the ref-counted helper.
  //
  // 🔴 THIS SHIPPED BROKEN AND THE FIX IS THE COMMENT. The first version subscribed to
  // `dispatchTopic` and called `supabase.removeChannel()` in cleanup. supabase-js returns the
  // EXISTING channel for a known topic, so this component was handed the object App.jsx uses
  // for live dispatch push and destroyed it on unmount — and, because `load` is in the deps
  // and `load` changes with `scope`, ALSO on every "Needs review"/"All faults" toggle. Live
  // dispatch died app-wide, silently, for the rest of the session.
  //
  // Two changes: a dedicated topic (so App.jsx is untouchable from here), and
  // subscribeBroadcast, which ref-counts so only the LAST leaver tears the channel down —
  // this component and CadTroubleBanner are both on this topic and would otherwise reproduce
  // the same bug between themselves.
  useEffect(() => {
    if (departmentId == null) return;                // never default a tenant
    return subscribeBroadcast(cadFaultTopic(departmentId), 'cad_ingest_fault', () => load());
  }, [departmentId, load]);

  async function review(fault) {
    setBusyId(fault.id);
    try {
      await api.post(`/api/cad-ingest/faults/${fault.id}/review`, note.trim() ? { note: note.trim() } : {});
      setNoteFor(null); setNote('');
      await load();
    } catch (e) {
      setError(e?.message || 'That review could not be saved, so the fault is still open.');
    } finally {
      setBusyId(null);
    }
  }

  const unreviewed = Number(summary?.unreviewed || 0);
  const burst = !!summary?.burst;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-black text-gray-900 dark:text-gray-100">Interface faults</h2>
          {unreviewed > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
              {unreviewed} to review
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-500 dark:text-gray-400" title="The list refreshes every minute while this page is open.">
            as of {fmtClock(asOf)}
          </span>
          <button type="button" onClick={() => load()}
            className="flex items-center gap-1 py-2 -my-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:underline">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="px-5 py-2.5 bg-red-50 dark:bg-red-950/40 border-b border-red-100 dark:border-red-900 text-xs text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {burst && (
        <div className="px-5 py-3 bg-red-50 dark:bg-red-950/40 border-b border-red-100 dark:border-red-900">
          <p className="text-sm font-bold text-red-900 dark:text-red-200">
            {summary.lastWindow} messages in the last {summary.burstWindowMinutes} minutes could not be read.
          </p>
          <p className="text-xs text-red-800 dark:text-red-300 mt-0.5">
            A run this size usually means the CAD vendor changed their message format. Call them with one of
            these messages open — every call sent during the change is in this list and nowhere else.
          </p>
        </div>
      )}

      <div className="flex items-center gap-1 px-5 py-2 border-b border-gray-100 dark:border-gray-700">
        {[['open', 'Needs review'], ['all', 'All faults']].map(([id, label]) => (
          <button key={id} type="button"
            onClick={() => { setScope(id); setLoading(true); load({ scope: id }); }}
            className={`px-3 py-1 rounded-lg text-xs font-bold ${
              scope === id
                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">Loading interface faults…</p>
      ) : faults.length === 0 ? (
        <div className="text-center py-12 px-6 text-gray-500 dark:text-gray-400">
          <ShieldCheck size={28} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {scope === 'open' ? 'Every message your CAD has sent was read successfully.' : 'No interface faults have ever been recorded.'}
          </p>
          <p className="text-xs mt-1">
            If a dispatch ever arrives in a shape we cannot read, the message is kept in full and it appears here.
          </p>
        </div>
      ) : (
        faults.map(f => (
          <div key={f.id} className="px-5 py-3 border-b border-gray-50 dark:border-gray-800 last:border-b-0">
            <div className="flex items-start gap-3">
              <div className={`shrink-0 mt-0.5 ${f.reviewed_at ? 'text-gray-300 dark:text-gray-600' : 'text-amber-500'}`}>
                {f.reviewed_at ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-gray-900 dark:text-gray-100">
                    {STATUS_LABEL[f.parse_status] || f.parse_status}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    · {f.vendor}{f.connection_name ? ` · ${f.connection_name}` : ''}
                  </span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">· we answered HTTP {f.responded_status}</span>
                </div>
                {f.parse_error && (
                  <p className="text-xs text-red-700 dark:text-red-300 mt-0.5 break-words">{f.parse_error}</p>
                )}
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                  Arrived {fmt(f.received_at)} · {f.raw_bytes ?? 0} bytes kept
                  {f.source_ip ? ` · from ${f.source_ip}` : ''}
                </p>
                {f.reviewed_at && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    Reviewed by {f.reviewer_name} · {fmt(f.reviewed_at)}
                    {f.review_note ? ` — “${f.review_note}”` : ''}
                  </p>
                )}

                {noteFor === f.id && (
                  <div className="mt-2 flex items-start gap-2">
                    <input
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      maxLength={2000}
                      placeholder="What did you do about it? (optional)"
                      className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                    />
                    <button type="button" disabled={busyId === f.id} onClick={() => review(f)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-900 text-white disabled:opacity-50">
                      {busyId === f.id ? 'Saving…' : 'Save review'}
                    </button>
                    <button type="button" onClick={() => { setNoteFor(null); setNote(''); }}
                      className="px-2 py-1.5 text-xs font-bold text-gray-500 hover:underline">Cancel</button>
                  </div>
                )}
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <button type="button" onClick={() => setRawFor(f)}
                  className="flex items-center gap-1 py-2 -my-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:underline">
                  <Eye size={12} /> View message
                </button>
                {noteFor !== f.id && (
                  <button type="button" onClick={() => { setNoteFor(f.id); setNote(''); }}
                    className="flex items-center gap-1 py-2 -my-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:underline">
                    <FileWarning size={12} /> {f.reviewed_at ? 'Review again' : 'Mark reviewed'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      {rawFor && <RawPayloadModal fault={rawFor} onClose={() => setRawFor(null)} />}
    </div>
  );
}
