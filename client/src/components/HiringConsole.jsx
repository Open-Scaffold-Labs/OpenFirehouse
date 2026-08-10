/**
 * HiringConsole.jsx — Phase 1.5 hiring-engine surfaces used by the Vacancies page:
 *
 *  - HiringEventModal: open a hiring run on a vacancy (pick list + mode) and work it —
 *    the at-the-moment snapshot (candidates in order with factors, exclusions with
 *    reasons — the transparency the market treats as load-bearing), live offers with
 *    expiry countdowns, skip-with-reason, mandate (mandatory lists only), cancel.
 *  - HiringListsTab: chief list config (rule family, charges, window) + membership.
 *
 * Everything renders from the server's engine state; the panel polls while open
 * (lazy advance rides the poll — no cron anywhere).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, X, Loader2, Clock, CheckCircle, XCircle, SkipForward,
  Gavel, ListOrdered, ShieldAlert, Download,
} from 'lucide-react';
import { api } from '../utils/api';

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-gray-50 dark:bg-gray-950 dark:text-gray-100';

const OUTCOME_STYLES = {
  pending:    { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300', label: 'Pending' },
  accepted:   { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-300', label: 'Accepted' },
  declined:   { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400', label: 'Declined' },
  expired:    { bg: 'bg-amber-100 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-300', label: 'Expired' },
  skipped:    { bg: 'bg-amber-100 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-300', label: 'Skipped' },
  superseded: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-400', label: 'Superseded' },
};

const METHOD_LABELS = {
  hours_asc: 'OT hours (lowest first)', rotation: 'Rotation (last awarded)',
  seniority: 'Seniority', manual: 'Manual order',
};

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// The grievance packet as CSV (1.5 critique follow-up): three labeled sections —
// the snapshot order, the offer sequence, the charges. Cells are quoted; a leading
// tab guards formula-injection on ids/notes (the import-hardening convention).
function csvCell(v) {
  const s = v == null ? '' : String(v);
  const guarded = /^[=+\-@]/.test(s) ? `\t${s}` : s;
  return `"${guarded.replace(/"/g, '""')}"`;
}
function exportToCsv(data) {
  const rows = [];
  const push = (arr) => rows.push(arr.map(csvCell).join(','));
  push(['HIRING EVENT', data.event?.id, 'vacancy', data.event?.vacancy_id, 'list', data.event?.list_name,
        'mode', data.event?.mode, 'status', data.event?.status, 'award_method', data.event?.award_method]);
  push([]);
  push(['LIST ORDER AT THE MOMENT OF HIRING']);
  push(['position', 'member_id', 'name', 'rank', 'balance_h', 'mandate_count', 'fatigue_advisory']);
  for (const c of (data.event?.list_snapshot?.candidates || [])) {
    push([c.position, c.member_id, c.name, c.rank, c.factors?.balance, c.factors?.mandateCount, c.fatigueAdvisory ? 'yes' : '']);
  }
  push(['EXCLUDED', '', '', '', '', '', '']);
  for (const x of (data.event?.list_snapshot?.excluded || [])) {
    push(['', x.memberId, x.name, '', '', x.kind, x.reason]);
  }
  push([]);
  push(['OFFER SEQUENCE']);
  push(['position', 'member', 'offered_at', 'expires_at', 'channel', 'outcome', 'outcome_at', 'note']);
  for (const o of (data.offers || [])) {
    push([o.position_in_list, o.member_name, o.offered_at, o.expires_at, o.channel, o.outcome, o.outcome_at, o.outcome_note]);
  }
  push([]);
  push(['CHARGES']);
  push(['member_id', 'delta_hours', 'reason', 'source', 'note', 'at']);
  for (const ch of (data.charges || [])) {
    push([ch.member_id, ch.delta_hours, ch.reason, `${ch.source_kind || ''} ${ch.source_id || ''}`.trim(), ch.note, ch.created_at]);
  }
  return rows.join('\r\n');
}

function countdown(expiresAt) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'window lapsed';
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}m left`;
}

// ─── The officer event panel ─────────────────────────────────────────────────

export function HiringEventModal({ vacancy, onClose, onChanged }) {
  const [lists, setLists] = useState([]);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [listId, setListId] = useState('');
  const [mode, setMode] = useState('sequential');
  const [skipFor, setSkipFor] = useState(null);
  const [skipReason, setSkipReason] = useState('');
  const [mandateFor, setMandateFor] = useState(null);   // 1.5 critique: inline confirm, not confirm()
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ls, evs] = await Promise.all([
        api.get('/api/hiring/lists'),
        api.get(`/api/hiring/events?vacancy_id=${vacancy.id}`),
      ]);
      setLists((ls.data || []).filter(l => l.active));
      const open = (evs.data || []).find(e => e.status === 'open') || (evs.data || [])[0] || null;
      if (open) {
        const detail = await api.get(`/api/hiring/events/${open.id}`);
        setEvent(detail.data);
      } else {
        setEvent(null);
      }
    } catch (e) { setError(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [vacancy.id]);

  useEffect(() => { load(); }, [load]);
  // Poll while open — expiries + sequential advance are honest on each read.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function act(fn) {
    setBusy(true); setError('');
    try { await fn(); await load(); onChanged?.(); }
    catch (e) { setError(e?.message || 'Action failed'); }
    finally { setBusy(false); }
  }

  const snapshot = event?.list_snapshot || null;
  const isMandatory = event && lists.find(l => l.id === event.list_id)?.list_type === 'mandatory';
  const live = event?.status === 'open';

  return (
    <Modal title={`Hiring — ${String(vacancy.shift_date).slice(0, 10)}${vacancy.position_name ? ` ${vacancy.position_name}` : ''}`} onClose={onClose} wide>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
      ) : !event ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Open an ordered hiring run. The eligible list is snapshotted at this moment —
            that order is the record a grievance is decided from.
          </p>
          {lists.length === 0 ? (
            <p className="text-sm text-gray-400">No hiring lists yet — a chief can create one on the Lists tab.</p>
          ) : (
            <>
              <select className={INPUT} value={listId} onChange={e => setListId(e.target.value)}>
                <option value="">Select hiring list…</option>
                {lists.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name} — {l.list_type === 'mandatory' ? 'MANDATORY' : METHOD_LABELS[l.order_method]} ({l.member_count} members)
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                {['sequential', 'blast'].map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border ${mode === m ? 'border-red-400 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>
                    {m === 'sequential' ? 'In order (one at a time)' : 'Blast (offer everyone)'}
                  </button>
                ))}
              </div>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              <button disabled={!listId || busy}
                onClick={() => act(() => api.post(`/api/vacancies/${vacancy.id}/hire`, { list_id: Number(listId), mode }))}
                className="w-full py-2 bg-red-700 text-white font-bold text-sm rounded-xl hover:bg-red-800 disabled:opacity-50 flex items-center justify-center gap-1">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <ListOrdered size={14} />}
                Open Hiring Run
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              event.status === 'open' ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
              : event.status === 'awarded' ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
              {event.status.toUpperCase()}{event.award_method ? ` · ${event.award_method}` : ''}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">
              {event.mode}
            </span>
            {isMandatory && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white flex items-center gap-1">
                <Gavel size={10} /> MANDATORY LIST
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              <a className="text-[11px] font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1 cursor-pointer"
                 onClick={async () => {
                   const r = await api.get(`/api/hiring/events/${event.id}/export`);
                   downloadBlob(JSON.stringify(r.data, null, 2), 'application/json', `hiring-event-${event.id}.json`);
                 }}>
                <Download size={11} /> JSON
              </a>
              <a className="text-[11px] font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1 cursor-pointer"
                 title="The grievance packet as CSV (candidates, offers, charges)"
                 onClick={async () => {
                   const r = await api.get(`/api/hiring/events/${event.id}/export`);
                   downloadBlob(exportToCsv(r.data), 'text/csv', `hiring-event-${event.id}.csv`);
                 }}>
                <Download size={11} /> CSV
              </a>
            </span>
          </div>

          {/* Offers */}
          {(event.offers || []).length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-gray-400 mb-1">Offers</p>
              <div className="space-y-1">
                {event.offers.map(o => {
                  const s = OUTCOME_STYLES[o.outcome] || OUTCOME_STYLES.pending;
                  return (
                    <div key={o.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-950 rounded-lg px-3 py-2">
                      <span className="text-xs font-bold text-gray-900 dark:text-gray-100">#{o.position_in_list} {o.member_name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
                      {o.outcome === 'pending' && o.expires_at && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-1"><Clock size={10} />{countdown(o.expires_at)}</span>
                      )}
                      {o.outcome_note && <span className="text-[10px] text-gray-400 italic">“{o.outcome_note}”</span>}
                      {live && o.outcome === 'pending' && (
                        skipFor === o.id ? (
                          <span className="ml-auto flex items-center gap-1">
                            <input className="border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-[11px] bg-white dark:bg-gray-900" placeholder="Skip reason (recorded)"
                              value={skipReason} onChange={e => setSkipReason(e.target.value)} />
                            <button disabled={!skipReason.trim() || busy}
                              onClick={() => act(async () => { await api.post(`/api/hiring/offers/${o.id}/skip`, { reason: skipReason.trim() }); setSkipFor(null); setSkipReason(''); })}
                              className="text-[10px] font-bold text-white bg-amber-600 px-2 py-1 rounded disabled:opacity-50">Skip</button>
                          </span>
                        ) : (
                          <button onClick={() => setSkipFor(o.id)}
                            className="ml-auto text-[10px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                            <SkipForward size={10} /> Skip
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Snapshot */}
          {snapshot && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-gray-400 mb-1">
                List order at the moment of hiring {isMandatory ? '(mandate order: fewest holds, then least senior)' : ''}
              </p>
              <div className="space-y-1">
                {(snapshot.candidates || []).map(c => (
                  <div key={c.member_id} className="flex items-center gap-2 rounded-lg px-3 py-1.5 border border-gray-100 dark:border-gray-800">
                    <span className="text-xs font-bold text-gray-900 dark:text-gray-100">#{c.position} {c.name}</span>
                    <span className="text-[10px] text-gray-400">
                      {isMandatory ? `${c.factors?.mandateCount ?? 0} holds` : `${c.factors?.balance ?? 0}h`}
                      {c.rank ? ` · ${c.rank}` : ''}
                    </span>
                    {c.fatigueAdvisory && (
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-0.5" title="Rode the board the previous day — advisory only">
                        <ShieldAlert size={10} /> worked yesterday
                      </span>
                    )}
                    {live && isMandatory && (
                      mandateFor === c.member_id ? (
                        <span className="ml-auto flex items-center gap-1">
                          <span className="text-[10px] font-bold text-red-700 dark:text-red-300">Recorded hold for {c.name}?</span>
                          <button disabled={busy}
                            onClick={() => act(async () => { await api.post(`/api/hiring/events/${event.id}/mandate`, { member_id: c.member_id }); setMandateFor(null); })}
                            className="text-[10px] font-bold text-white bg-red-700 px-2 py-1 rounded">Confirm</button>
                          <button onClick={() => setMandateFor(null)}
                            className="text-[10px] font-bold text-gray-500 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">Back</button>
                        </span>
                      ) : (
                        <button disabled={busy} onClick={() => setMandateFor(c.member_id)}
                          className="ml-auto text-[10px] font-bold text-white bg-red-700 px-2 py-1 rounded flex items-center gap-1">
                          <Gavel size={10} /> Mandate
                        </button>
                      )
                    )}
                  </div>
                ))}
                {(snapshot.excluded || []).length > 0 && (
                  <details className="text-[11px] text-gray-400 pt-1">
                    <summary className="cursor-pointer font-bold">Excluded ({snapshot.excluded.length}) — every exclusion has a recorded reason</summary>
                    <ul className="pl-4 pt-1 space-y-0.5">
                      {snapshot.excluded.map(x => (
                        <li key={x.memberId}>{x.name} — {x.reason} <span className="italic">({x.kind})</span></li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          )}

          {event.status === 'exhausted' && (
            <p className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2">
              List exhausted with no acceptance. The engine stops and reports — mandating is a
              separate, recorded act from a mandatory list.
            </p>
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          {live && (
            showCancel ? (
              <div className="flex items-center gap-2">
                <input className={INPUT} placeholder="Cancel reason (recorded)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
                <button disabled={!cancelReason.trim() || busy}
                  onClick={() => act(async () => { await api.post(`/api/hiring/events/${event.id}/cancel`, { reason: cancelReason.trim() }); setShowCancel(false); })}
                  className="text-xs font-bold text-white bg-gray-600 px-3 py-2 rounded-lg disabled:opacity-50 whitespace-nowrap">Cancel run</button>
              </div>
            ) : (
              <button onClick={() => setShowCancel(true)} className="text-xs font-bold text-gray-500 dark:text-gray-400">
                Cancel this hiring run…
              </button>
            )
          )}
        </div>
      )}
    </Modal>
  );
}

// ─── Chief: hiring lists config ──────────────────────────────────────────────

export function HiringListsTab({ user }) {
  const [lists, setLists] = useState([]);
  const [members, setMembers] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [listMembers, setListMembers] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', list_type: 'voluntary', order_method: 'hours_asc', target_rank: '', offer_window_minutes: 30, charge_refused: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isChief = ['chief', 'battalion_chief', 'deputy_chief', 'admin', 'training_battalion'].includes(user?.role);

  const load = useCallback(async () => {
    try {
      const [ls, ms] = await Promise.all([api.get('/api/hiring/lists'), api.get('/api/members')]);
      setLists(ls.data || []);
      setMembers(ms.data || []);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function loadListMembers(id) {
    const r = await api.get(`/api/hiring/lists/${id}/members`);
    setListMembers(lm => ({ ...lm, [id]: r.data || [] }));
  }

  async function createList() {
    setBusy(true); setError('');
    try {
      await api.post('/api/hiring/lists', {
        name: form.name, list_type: form.list_type, order_method: form.order_method,
        target_rank: form.target_rank || undefined,
        offer_window_minutes: Number(form.offer_window_minutes) || 30,
        charge_refused: !!form.charge_refused,
      });
      setShowCreate(false); setForm(f => ({ ...f, name: '' })); load();
    } catch (e) { setError(e?.message || 'Create failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Ordered hiring lists — who gets offered first, per your department's rules. Changes are audited.
        </p>
        {isChief && (
          <button onClick={() => setShowCreate(s => !s)} className="flex items-center gap-1 text-xs font-bold text-red-700 dark:text-red-300">
            <Plus size={12} /> New list
          </button>
        )}
      </div>

      {showCreate && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className={INPUT} placeholder="List name (e.g. FF Overtime)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <select className={INPUT} value={form.list_type} onChange={e => setForm(f => ({ ...f, list_type: e.target.value }))}>
              <option value="voluntary">Voluntary (offers)</option>
              <option value="mandatory">Mandatory (holds)</option>
            </select>
            <select className={INPUT} value={form.order_method} onChange={e => setForm(f => ({ ...f, order_method: e.target.value }))} disabled={form.list_type === 'mandatory'}>
              {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className={INPUT} placeholder="Target rank (optional)" value={form.target_rank} onChange={e => setForm(f => ({ ...f, target_rank: e.target.value }))} />
            <input type="number" min="1" max="10080" className={INPUT} value={form.offer_window_minutes}
              onChange={e => setForm(f => ({ ...f, offer_window_minutes: e.target.value }))} placeholder="Offer window (min)" />
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={form.charge_refused} onChange={e => setForm(f => ({ ...f, charge_refused: e.target.checked }))} />
              Charge refused offers (CBA-dependent)
            </label>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <button disabled={!form.name.trim() || busy} onClick={createList}
            className="w-full py-2 bg-red-700 text-white font-bold text-sm rounded-xl hover:bg-red-800 disabled:opacity-50">
            Create list
          </button>
        </div>
      )}

      {lists.length === 0 && !showCreate ? (
        <div className="text-center py-10">
          <ListOrdered size={28} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm font-bold text-gray-500 dark:text-gray-400">No hiring lists yet.</p>
          <p className="text-xs text-gray-400 mt-1">A chief creates the lists your CBA calls for — the engine offers in that order.</p>
        </div>
      ) : (
        lists.map(l => (
          <div key={l.id} className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 ${!l.active ? 'opacity-50' : ''}`}>
            <button className="w-full flex items-center gap-2 text-left"
              onClick={() => { setExpanded(x => x === l.id ? null : l.id); if (!listMembers[l.id]) loadListMembers(l.id); }}>
              <span className="text-sm font-black text-gray-900 dark:text-gray-100">{l.name}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${l.list_type === 'mandatory' ? 'bg-red-600 text-white' : 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'}`}>
                {l.list_type === 'mandatory' ? 'MANDATORY' : METHOD_LABELS[l.order_method]}
              </span>
              <span className="text-[10px] text-gray-400">{l.member_count} members · {l.offer_window_minutes}m window{l.charge_refused ? ' · refusals charge' : ''}</span>
              {!l.active && <span className="text-[10px] font-bold text-gray-400">INACTIVE</span>}
            </button>
            {expanded === l.id && (
              <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-800 space-y-1">
                {(listMembers[l.id] || []).map(m => (
                  <div key={m.id} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                    <Users size={11} className="text-gray-400" />
                    {m.name} <span className="text-gray-400">— {m.rank}</span>
                    {isChief && (
                      <button onClick={async () => { await api.delete(`/api/hiring/lists/${l.id}/members/${m.member_id}`); loadListMembers(l.id); load(); }}
                        className="ml-auto text-gray-400 hover:text-red-600"><X size={12} /></button>
                    )}
                  </div>
                ))}
                {isChief && (
                  <AddMemberRow list={l} members={members} existing={listMembers[l.id] || []}
                    onAdded={() => { loadListMembers(l.id); load(); }} />
                )}
                {isChief && <ListEditPanel list={l} onSaved={load} />}
                {isChief && l.active && (
                  <button onClick={async () => { await api.patch(`/api/hiring/lists/${l.id}`, { active: false }); load(); }}
                    className="text-[11px] font-bold text-gray-400 pt-1">Deactivate list (kept for history)</button>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function AddMemberRow({ list, members, existing, onAdded }) {
  const [sel, setSel] = useState('');
  const [q, setQ] = useState(''); // 1.5 critique: searchable picker for big departments
  const have = new Set(existing.map(m => String(m.member_id)));
  const needle = q.trim().toLowerCase();
  const options = members
    .filter(m => !have.has(String(m.id)))
    .filter(m => !needle || `${m.name} ${m.rank || ''}`.toLowerCase().includes(needle));
  return (
    <div className="flex items-center gap-2 pt-1">
      <input className={INPUT} style={{ maxWidth: '10rem' }} placeholder="Search…" value={q}
        onChange={e => { setQ(e.target.value); setSel(''); }} />
      <select className={INPUT} value={sel} onChange={e => setSel(e.target.value)}>
        <option value="">{options.length ? `Add member… (${options.length})` : 'No matches'}</option>
        {options.slice(0, 100).map(m => <option key={m.id} value={m.id}>{m.name} — {m.rank}</option>)}
      </select>
      <button disabled={!sel}
        onClick={async () => { await api.post(`/api/hiring/lists/${list.id}/members`, { member_id: Number(sel) }); setSel(''); onAdded(); }}
        className="text-xs font-bold text-white bg-red-700 px-3 py-2 rounded-lg disabled:opacity-50 whitespace-nowrap">Add</button>
    </div>
  );
}

// 1.5 critique follow-up: edit the rule config after creation (PATCH already existed —
// the UI didn't). Tie-breakers as ordered preset chains (the common CBA shapes).
const TIE_CHAINS = [
  { value: '["seniority","member_id"]', label: 'Seniority → stable id' },
  { value: '["hire_date","member_id"]', label: 'Hire date → stable id' },
  { value: '["manual_order","member_id"]', label: 'Manual order → stable id' },
  { value: '["member_id"]', label: 'Stable id only' },
];
function ListEditPanel({ list, onSaved }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  function openPanel() {
    setF({
      order_method: list.order_method,
      tie_breakers: JSON.stringify(JSON.parse(list.tie_breakers || '["seniority","member_id"]')),
      charge_worked: !!list.charge_worked, charge_refused: !!list.charge_refused,
      charge_expired: !!list.charge_expired, reset_period: list.reset_period,
      reset_anchor: list.reset_anchor, offer_window_minutes: list.offer_window_minutes,
      target_rank: list.target_rank || '',
    });
    setOpen(true);
  }
  async function save() {
    setSaving(true); setError('');
    try {
      await api.patch(`/api/hiring/lists/${list.id}`, {
        order_method: f.order_method,
        tie_breakers: JSON.parse(TIE_CHAINS.some(t => t.value === f.tie_breakers) ? f.tie_breakers : '["seniority","member_id"]'),
        charge_worked: f.charge_worked, charge_refused: f.charge_refused, charge_expired: f.charge_expired,
        reset_period: f.reset_period, reset_anchor: f.reset_anchor,
        offer_window_minutes: Number(f.offer_window_minutes) || 30,
        target_rank: f.target_rank,
      });
      setOpen(false); onSaved();
    } catch (e) { setError(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  }
  if (!open) {
    return (
      <button onClick={openPanel} className="text-[11px] font-bold text-blue-700 dark:text-blue-300 pt-1 text-left">
        Edit rules (order, tie-breaks, charges, window, reset)…
      </button>
    );
  }
  return (
    <div className="mt-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-950 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {list.list_type !== 'mandatory' && (
          <select className={INPUT} value={f.order_method} onChange={e => setF(x => ({ ...x, order_method: e.target.value }))}>
            {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        <select className={INPUT} value={f.tie_breakers} onChange={e => setF(x => ({ ...x, tie_breakers: e.target.value }))}>
          {TIE_CHAINS.map(t => <option key={t.value} value={t.value}>Tie-break: {t.label}</option>)}
        </select>
        <select className={INPUT} value={f.reset_period} onChange={e => setF(x => ({ ...x, reset_period: e.target.value }))}>
          <option value="annual">Counters reset annually</option>
          <option value="none">Counters never reset</option>
        </select>
        <input className={INPUT} value={f.reset_anchor} onChange={e => setF(x => ({ ...x, reset_anchor: e.target.value }))}
          placeholder="Reset anchor MM-DD" disabled={f.reset_period === 'none'} />
        <input type="number" min="1" max="10080" className={INPUT} value={f.offer_window_minutes}
          onChange={e => setF(x => ({ ...x, offer_window_minutes: e.target.value }))} placeholder="Offer window (min)" />
        <input className={INPUT} value={f.target_rank} onChange={e => setF(x => ({ ...x, target_rank: e.target.value }))}
          placeholder="Target rank (blank = any)" />
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-300">
        <label className="flex items-center gap-1"><input type="checkbox" checked={f.charge_worked} onChange={e => setF(x => ({ ...x, charge_worked: e.target.checked }))} /> charge worked</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={f.charge_refused} onChange={e => setF(x => ({ ...x, charge_refused: e.target.checked }))} /> charge refused</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={f.charge_expired} onChange={e => setF(x => ({ ...x, charge_expired: e.target.checked }))} /> charge expired</label>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="flex-1 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-600 dark:text-gray-300">Back</button>
        <button onClick={save} disabled={saving} className="flex-1 py-1.5 bg-red-700 text-white text-xs font-bold rounded-lg disabled:opacity-50">
          {saving ? 'Saving…' : 'Save rules (audited)'}
        </button>
      </div>
    </div>
  );
}
