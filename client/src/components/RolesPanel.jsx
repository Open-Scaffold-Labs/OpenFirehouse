import { useEffect, useState } from 'react';
import { Shield, Loader2, Trash2, Plus } from 'lucide-react';
import { api } from '../utils/api';
import { PAGE_ACCESS } from '../data/auth';

/**
 * RolesPanel — department-authored custom roles (Phase 5 / 5.7, migration 0113).
 *
 * Market model being copied: 6 of 12 competitors ship custom role authoring. The
 * screen they describe is a per-role page checklist, with the built-in roles
 * listed alongside but not editable. That is this.
 *
 * Chief-only. The server enforces every rule here regardless — this UI only makes
 * the rules visible and hard to trip over.
 */
export default function RolesPanel() {
  const [data, setData]   = useState(null); // { builtin:[], custom:[] }
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm]   = useState({ key: '', label: '', level: 1, pages: [] });

  // The page list a role can be granted comes from the SAME map the app gates on,
  // so a page can never be offered here that the client doesn't actually know.
  const allPages = Object.keys(PAGE_ACCESS || {}).sort();

  async function load() {
    try { setData((await api.get('/api/roles'))?.data || { builtin: [], custom: [] }); }
    catch (e) { setErr(e?.message || 'Could not load roles.'); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setBusy(true); setErr('');
    try {
      await api.post('/api/roles', {
        key: form.key.trim(), label: form.label.trim(),
        level: Number(form.level), pages: form.pages,
      });
      setForm({ key: '', label: '', level: 1, pages: [] });
      setAdding(false);
      await load();
    } catch (e) {
      setErr(e?.message || 'Could not create the role.');
    } finally { setBusy(false); }
  }

  async function remove(r) {
    if (!window.confirm(`Delete the role "${r.label}"? This cannot be undone.`)) return;
    setBusy(true); setErr('');
    try { await api.delete(`/api/roles/${r.id}`); await load(); }
    catch (e) { setErr(e?.message || 'Could not delete the role.'); }
    finally { setBusy(false); }
  }

  const togglePage = (p) => setForm((f) => ({
    ...f, pages: f.pages.includes(p) ? f.pages.filter((x) => x !== p) : [...f.pages, p],
  }));

  const LEVELS = [
    { v: 1, t: 'Member — daily operations' },
    { v: 2, t: 'Officer — management and compliance' },
    { v: 3, t: 'Chief — department-wide authority' },
  ];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
        <Shield size={16} className="text-red-600 dark:text-red-400" />
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Roles &amp; Access</h2>
      </div>

      <div className="px-6 py-5 space-y-5">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The built-in roles cover most departments. If yours has a job that doesn&rsquo;t fit one —
          a prevention clerk, a fleet coordinator — you can add your own role and choose exactly
          which pages it opens. Built-in roles cannot be changed or removed. (Chief-only setting.)
        </p>

        {err && <p className="text-xs font-medium text-red-600 dark:text-red-400">{err}</p>}

        {data === null ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {/* Built-in — shown so a chief can see the whole picture, marked as fixed. */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                Built in — cannot be changed
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.builtin.map((r) => (
                  <span key={r.key}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2.5 py-1 text-xs text-gray-600 dark:text-gray-300">
                    {r.key}
                    {r.inUse > 0 && <span className="text-gray-400">· {r.inUse}</span>}
                  </span>
                ))}
              </div>
            </div>

            {/* Custom */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                Your department&rsquo;s roles
              </p>
              {data.custom.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  None yet. The built-in roles are handling everything so far.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {data.custom.map((r) => (
                    <li key={r.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{r.label}</span>
                      <code className="text-[11px] text-gray-400">{r.key}</code>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {LEVELS.find((l) => l.v === r.level)?.t.split(' — ')[0] || `Level ${r.level}`}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {r.pages.length} page{r.pages.length === 1 ? '' : 's'}
                      </span>
                      {r.inUse > 0 && (
                        <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                          {r.inUse} assigned
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(r)}
                        disabled={busy}
                        className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Add */}
            {adding ? (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="role-label" className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      Name people will see
                    </label>
                    <input id="role-label" type="text" value={form.label}
                      onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                      placeholder="Fire Prevention Clerk"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                  </div>
                  <div>
                    <label htmlFor="role-key" className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      Short id (lower case, no spaces)
                    </label>
                    <input id="role-key" type="text" value={form.key}
                      onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                      placeholder="prevention_clerk"
                      className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                  </div>
                </div>

                <div>
                  <label htmlFor="role-level" className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    Authority level
                  </label>
                  <select id="role-level" value={form.level}
                    onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))}
                    className="w-full sm:w-96 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    {LEVELS.map((l) => <option key={l.v} value={l.v}>{l.t}</option>)}
                  </select>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    You can&rsquo;t give a role more authority than you have yourself.
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                    Pages this role can open ({form.pages.length} selected)
                  </p>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 p-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
                    {allPages.map((p) => (
                      <label key={p} className="flex items-center gap-1.5 text-[11px] text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input type="checkbox" checked={form.pages.includes(p)} onChange={() => togglePage(p)} />
                        {p}
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Selecting none is allowed — that role can sign in but reach nothing.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button type="button" onClick={create}
                    disabled={busy || !form.key.trim() || !form.label.trim()}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white disabled:opacity-50">
                    {busy ? 'Creating…' : 'Create role'}
                  </button>
                  <button type="button" onClick={() => { setAdding(false); setErr(''); }}
                    className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setAdding(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                <Plus size={14} /> Add a role
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
