import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { api } from '../utils/api';

/**
 * RecordHistory — the customer-visible change history for ONE record (Phase 5, 5.4).
 *
 * Market bar (competitor-shipping inventory, 12 fire/EMS RMS, 2026-07-26): 7 of 12
 * expose a customer-visible audit trail, and the scope that ships is RECORD-LEVEL
 * change history — you open a record and see what happened to it. That is exactly
 * this component. There is deliberately no tenant-wide feed and no authentication
 * log, because essentially nobody in the market ships one.
 *
 * Self-contained and lazy: it fetches only when actually rendered, so putting it
 * inside a collapsed row costs nothing until the row is opened.
 *
 * Officer+ only on the server. A member gets a 403, which is rendered here as a
 * plain sentence rather than an error — being not-permitted is not a failure.
 */
export default function RecordHistory({ recordType, recordId, title = 'Record history' }) {
  const [state, setState] = useState({ status: 'loading', entries: [], label: '', truncated: false });

  useEffect(() => {
    let alive = true;
    if (!recordType || !recordId) return undefined;
    setState((s) => ({ ...s, status: 'loading' }));
    api.get(`/api/audit/record/${recordType}/${recordId}`)
      .then((r) => {
        if (!alive) return;
        const d = r?.data || {};
        setState({
          status: 'ready',
          entries: d.entries || [],
          label: d.recordTypeLabel || '',
          truncated: !!d.truncated,
        });
      })
      .catch((e) => {
        if (!alive) return;
        // 403 is "not for you", not "something broke" — say which.
        setState({ status: e?.status === 403 ? 'forbidden' : 'error', entries: [], label: '', truncated: false });
      });
    return () => { alive = false; };
  }, [recordType, recordId]);

  const head = (
    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
      <History size={12} /> {title}
    </p>
  );

  if (state.status === 'loading') {
    return (
      <div>
        {head}
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </p>
      </div>
    );
  }

  if (state.status === 'forbidden') {
    return (
      <div>
        {head}
        <p className="text-xs text-gray-500 dark:text-gray-400">Officers and chiefs can view this record&rsquo;s history.</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div>
        {head}
        <p className="text-xs text-amber-600 dark:text-amber-400">
          The history could not be loaded. It has not been lost — try again.
        </p>
      </div>
    );
  }

  if (!state.entries.length) {
    return (
      <div>
        {head}
        {/* Honest empty state: says WHY it might be empty rather than implying
            nothing ever happened to this record. */}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No recorded changes. Records created before change-tracking began have no history.
        </p>
      </div>
    );
  }

  return (
    <div>
      {head}
      <ol className="space-y-1.5">
        {state.entries.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className="font-semibold text-gray-700 dark:text-gray-300">{e.actionLabel}</span>
            <span className="text-gray-500 dark:text-gray-400">by {e.by}</span>
            <span className="text-gray-500 dark:text-gray-400 tabular-nums">
              {e.at ? new Date(e.at).toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              }) : '—'}
            </span>
            {e.detail?.reason && (
              <span className="text-gray-600 dark:text-gray-300 italic">&ldquo;{e.detail.reason}&rdquo;</span>
            )}
          </li>
        ))}
      </ol>
      {state.truncated && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
          Showing the first 500 entries. This record has more.
        </p>
      )}
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
        Entries are append-only and kept for the life of the record.
      </p>
    </div>
  );
}
