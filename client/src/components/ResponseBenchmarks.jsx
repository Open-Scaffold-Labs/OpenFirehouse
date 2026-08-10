import { useState, useEffect, useCallback } from 'react';
import { Target, RotateCcw } from 'lucide-react';
import { api } from '../utils/api';

/**
 * ResponseBenchmarks — the department's ADOPTED response-time targets. (4.3b)
 *
 * The market ships department-configurable targets, and NFPA permits an AHJ to
 * modify the prescribed goals after a community risk assessment. An agency's
 * adopted benchmark is what its own reports are measured against.
 *
 * Migration 0101 created the table and the compliance report already read it —
 * but there was NO WRITE PATH AT ALL until now. The table could only be filled
 * by direct SQL: a migration shipped for a feature nobody could use.
 *
 * ─── DESIGN NOTES ───────────────────────────────────────────────────────────
 * • It lives next to the performance it governs, not in a settings screen. A
 *   target you set somewhere else is a target you set without seeing whether
 *   you are meeting it.
 * • The STANDARD's number is always visible, even when a department has adopted
 *   its own. Someone reading "45s" a year from now needs to know NFPA says 80.
 * • Reverting DELETES the row rather than writing the standard's value back.
 *   Absence means "use the standard", so a future NFPA correction reaches every
 *   department that never adopted its own — a stored copy would strand them.
 * • Chief-only, and the server enforces it. This control simply is not rendered
 *   for anyone else rather than being shown and then failing on save.
 */

function secondsToMMSS(s) {
  if (s === null || s === undefined || s === '') return '';
  const n = Number(s);
  if (!Number.isFinite(n)) return '';
  return `${Math.floor(n / 60)}:${String(Math.round(n) % 60).padStart(2, '0')}`;
}

export default function ResponseBenchmarks({ isChief, onChanged }) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading');
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await api.get('/api/response-reports/benchmarks');
      setRows(res?.data || []);
      setState('ready');
    } catch (_) {
      setState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A VALID TARGET IS A PRECONDITION, NOT AN ERROR TO REPORT. The Adopt button
  // is disabled until the input is a real positive number, so "Enter the target
  // in seconds" — a message I wrote earlier — can no longer happen. Telling
  // someone off for pressing a button we let them press is not a fix.
  const validTarget = (key) => {
    const n = Number(draft[key]);
    return draft[key] !== '' && draft[key] !== undefined && Number.isFinite(n) && n > 0 && n <= 86400;
  };

  async function adopt(key) {
    if (!validTarget(key)) return;          // unreachable from the UI; belt and braces
    const seconds = Number(draft[key]);
    setBusy(key); setNote(null);
    try {
      await api.put(`/api/response-reports/benchmarks/${key}`, { target_seconds: seconds });
      setNote({ kind: 'ok', text: 'Target adopted.' });
      setDraft((d) => ({ ...d, [key]: '' }));
      await load();
      onChanged?.();
    } catch (e) {
      setNote({ kind: 'err', text: e?.message || 'Could not save that target.' });
    } finally { setBusy(null); }
  }

  async function revert(key) {
    setBusy(key); setNote(null);
    try {
      await api.delete(`/api/response-reports/benchmarks/${key}`);
      setNote({ kind: 'ok', text: 'Reverted to the standard.' });
      await load();
      onChanged?.();
    } catch (e) {
      setNote({ kind: 'err', text: e?.message || 'Could not revert.' });
    } finally { setBusy(null); }
  }

  if (state === 'error') {
    return (
      <p className="text-sm text-amber-800 dark:text-amber-300">Couldn’t load adopted targets.</p>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="bg-gray-50 dark:bg-gray-950 px-4 py-2">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <Target className="inline h-4 w-4 mr-1" />Your adopted targets
        </p>
      </div>

      <div className="px-4 py-3">
        <p className="mb-3 text-xs text-gray-600 dark:text-gray-400">
          Reports are measured against these. Leave one unset to use the standard’s number —
          that way a future revision of the standard reaches you automatically.
        </p>

        {/* Only genuine failures reach here now — network loss or a server
            error. Empty input, a non-number, an out-of-range value and the
            wrong role were all removed at the cause: the button is disabled,
            the input is bounded, and the controls are not rendered for
            non-chiefs at all. */}
        {note && (
          <p role="status" className={`mb-3 text-sm ${note.kind === 'ok'
            ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {note.text}
          </p>
        )}

        {state === 'loading' ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left">
                <tr className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th className="py-2 pr-3">Objective</th>
                  <th className="py-2 pr-3">Standard</th>
                  <th className="py-2 pr-3">Yours</th>
                  {isChief && <th className="py-2">Set</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((r) => (
                  <tr key={r.objective_key}>
                    <td className="py-2 pr-3">
                      <span className="text-gray-900 dark:text-gray-100">{r.applies_to}</span>
                      <span className="block text-[11px] text-gray-400">{r.source}</span>
                    </td>
                    {/* The standard stays visible even when overridden — someone
                        reading "0:45" next year needs to know NFPA says 1:20. */}
                    <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">
                      {secondsToMMSS(r.standard_seconds)}
                    </td>
                    <td className="py-2 pr-3">
                      {r.is_adopted ? (
                        <span className="font-medium text-blue-700 dark:text-blue-400">
                          {secondsToMMSS(r.adopted_seconds)}
                        </span>
                      ) : (
                        <span className="text-gray-400">using the standard</span>
                      )}
                    </td>
                    {isChief && (
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <label htmlFor={`bm-${r.objective_key}`} className="sr-only">
                            Target in seconds for {r.applies_to}
                          </label>
                          <input
                            id={`bm-${r.objective_key}`}
                            type="number" min="1" max="86400" step="1" inputMode="numeric"
                            placeholder="secs"
                            value={draft[r.objective_key] ?? ''}
                            onChange={(e) => setDraft((d) => ({ ...d, [r.objective_key]: e.target.value }))}
                            className="w-24 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1 text-sm dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                          />
                          <button
                            onClick={() => adopt(r.objective_key)}
                            disabled={busy === r.objective_key || !validTarget(r.objective_key)}
                            className="min-h-[44px] rounded-lg bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Adopt
                          </button>
                          {r.is_adopted && (
                            <button
                              onClick={() => revert(r.objective_key)}
                              disabled={busy === r.objective_key}
                              title="Revert to the standard"
                              className="min-h-[44px] inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
