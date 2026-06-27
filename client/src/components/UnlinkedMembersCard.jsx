import { useState, useEffect, useCallback } from 'react';
import { Link2, ShieldCheck, Mail, UserCircle, AlertTriangle, Loader2, Check, Send, KeyRound } from 'lucide-react';
import { api } from '../utils/api';

/**
 * UnlinkedMembersCard — P5 of the identity-link gameplan (v2).
 *
 * The PERMANENT answer for legacy/migrated roster rows that have no login
 * (members.user_id IS NULL). Chief-facing, setup-time — it NEVER blocks dispatch.
 * Each unlinked member shows ranked candidate logins WITH THE EVIDENCE for each
 * suggestion (the matched email / SSO id), so the chief confirms a *reason*, not
 * a guess. A name-only match is shown but clearly flagged "verify". One-tap
 * confirm; inline create-invite when no login exists.
 *
 * Renders NOTHING when every member is linked (the zero-config happy path —
 * departments provisioned after P2 never see this card).
 */

const EVIDENCE = {
  external_id: { label: 'SSO ID match', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300', Icon: ShieldCheck },
  email:       { label: 'Email match',  cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300', Icon: Mail },
  name:        { label: 'Name only — verify', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', Icon: AlertTriangle },
};

function EvidenceBadge({ kind }) {
  const e = EVIDENCE[kind];
  if (!e) return null;
  const { Icon } = e;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${e.cls}`}>
      <Icon size={11} /> {e.label}
    </span>
  );
}

export default function UnlinkedMembersCard({ onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [invite, setInvite] = useState(null); // { memberId, token, acceptPath }

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get('/api/members/unlinked');
      setRows(r.data || []);
    } catch (e) {
      setError(e?.message || 'Failed to load unlinked members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmLink = async (memberId, userId) => {
    setBusyId(`${memberId}:${userId}`); setError(null);
    try {
      await api.post(`/api/members/${memberId}/link`, { userId });
      setRows((rs) => rs.filter((m) => m.id !== memberId));
      onChanged?.();
    } catch (e) {
      setError(e?.message || 'Link failed');
    } finally {
      setBusyId(null);
    }
  };

  const createInvite = async (memberId) => {
    setBusyId(`inv:${memberId}`); setError(null);
    try {
      const r = await api.post(`/api/members/${memberId}/invite`, {});
      setInvite({ memberId, token: r.data?.token, acceptPath: r.data?.acceptPath });
    } catch (e) {
      setError(e?.message || 'Could not create invite');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-500">
        <Loader2 size={15} className="animate-spin" /> Checking roster links…
      </div>
    );
  }
  if (!rows.length) return null; // zero-config happy path — every member linked

  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 border-b border-amber-200 dark:border-amber-800/60 px-4 py-3">
        <Link2 size={18} className="text-amber-600 dark:text-amber-400" />
        <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
          Roster setup · {rows.length} member{rows.length === 1 ? '' : 's'} not linked to a login
        </h3>
      </div>
      <p className="px-4 pt-2 text-xs text-amber-800/80 dark:text-amber-300/70">
        These roster records aren’t connected to an account yet, so they can’t be scored for staffing.
        Confirm the right login below — we show the matching evidence so you’re confirming a reason, not a guess.
        Linking happens here in setup and never interrupts dispatch.
      </p>

      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-100 dark:bg-red-900/40 px-3 py-2 text-xs text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="divide-y divide-amber-200/70 dark:divide-amber-800/40 p-2">
        {rows.map((m) => (
          <div key={m.id} className="px-2 py-3 sm:px-3">
            <div className="flex flex-wrap items-center gap-2">
              <UserCircle size={20} className="text-amber-600 dark:text-amber-400" />
              <span className="font-semibold text-gray-900 dark:text-gray-100">{m.name}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{m.rank} · {m.memberNumber}</span>
            </div>

            {m.candidates && m.candidates.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {m.candidates.map((c) => (
                  <li key={c.userId}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-white dark:bg-gray-900 px-3 py-2 ring-1 ring-gray-200 dark:ring-gray-700">
                    <KeyRound size={14} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{c.username}</span>
                    {c.email && <span className="text-xs text-gray-500">{c.email}</span>}
                    <span className="flex flex-wrap gap-1">
                      {c.matchedOn.map((k) => <EvidenceBadge key={k} kind={k} />)}
                    </span>
                    <button
                      onClick={() => confirmLink(m.id, c.userId)}
                      disabled={busyId === `${m.id}:${c.userId}`}
                      className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                      {busyId === `${m.id}:${c.userId}`
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Check size={14} />}
                      Confirm
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-white dark:bg-gray-900 px-3 py-2 ring-1 ring-gray-200 dark:ring-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400">No matching login found.</span>
                {invite && invite.memberId === m.id ? (
                  <span className="ml-auto text-xs font-mono text-emerald-700 dark:text-emerald-400">
                    Invite link: {invite.acceptPath}
                  </span>
                ) : (
                  <button
                    onClick={() => createInvite(m.id)}
                    disabled={busyId === `inv:${m.id}`}
                    className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors">
                    {busyId === `inv:${m.id}` ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Create invite
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
