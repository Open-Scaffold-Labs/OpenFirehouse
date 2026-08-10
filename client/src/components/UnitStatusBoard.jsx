/**
 * UnitStatusBoard.jsx — live, color-coded per-unit status (Phase 2).
 *
 * Reads GET /api/units/status and polls it on a short, visibility-aware
 * interval (polling is the reliable realtime channel on Vercel serverless —
 * see docs/UNIT-STATUS-LIFECYCLE-PLAN.md §5). Authorized users change a unit's
 * status via PATCH /api/units/:id/status with an optimistic update; the next
 * poll reconciles against the server (server is authoritative).
 *
 * Edit permissions mirror the server (requireUnitStatusAuth):
 *   - dispatch / chief / deputy_chief / battalion_chief → any unit
 *   - the rig's officer (incl. acting A/C, A/LT per today's run list) → own rig
 *   - everyone else → read-only
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../utils/api';
import { toneOverdue } from '../utils/alertTones';
import { canClearCalls } from '../data/auth';
import { supabase, unitStatusTopic } from '../utils/supabase';
import { reportChannelStatus, reportMessageReceived, forgetChannel } from '../utils/realtimeHealth';
import FeedStatus from './FeedStatus';

// Radio ladder (status model 2026-06-15): In Service ⇄ On the Air (in service,
// in-district, out of quarters) → Dispatched → En Route → On Scene → Returning
// ("back in service" — DISPATCHABLE while returning) → In Service. The three
// DISPATCHABLE statuses are In Service, Returning, On the Air (all green).
// Out of Service (fuel / training / aerial check) is not dispatchable.
const STATUS_META = {
  in_service:     { label: 'In Service',          cls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' },
  dispatched:     { label: 'Dispatched',          cls: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-400 dark:border-amber-700' },
  enroute:        { label: 'En Route',            cls: 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border-blue-400 dark:border-blue-700' },
  on_scene:       { label: 'On Scene',            cls: 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300 border-red-400 dark:border-red-700' },
  returning:      { label: 'In Service · Returning', cls: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-400 dark:border-emerald-700' },
  on_the_air:     { label: 'On the Air',          cls: 'bg-cyan-100 dark:bg-cyan-950/50 text-cyan-800 dark:text-cyan-300 border-cyan-400 dark:border-cyan-700' },
  transporting:   { label: 'Transporting',        cls: 'bg-purple-100 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 border-purple-400 dark:border-purple-700' },
  at_hospital:    { label: 'At Hospital',         cls: 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border-blue-400 dark:border-blue-700' },
  out_of_service: { label: 'Out of Service',      cls: 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-400 dark:border-gray-600' },
};
// Lockstep with server db.UNIT_STATUS_VALUES + mobile constants/statusMeta.ts.
const STATUS_ORDER = ['in_service', 'dispatched', 'enroute', 'on_scene', 'transporting', 'at_hospital', 'returning', 'on_the_air', 'out_of_service'];

// Hours stopped being readable somewhere around the second day: a unit last
// touched eight weeks ago rendered "1366h ago", which is a number you have to do
// arithmetic on to understand — on a board whose entire job is to be read at a
// glance. Roll up past a day, and keep the unit label so the scale is explicit.
function relTime(ts) {
  if (!ts) return '';
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  return w < 9 ? `${w}w ago` : `${Math.floor(d / 30)}mo ago`;
}

function isOfficerSeat(position) {
  const p = (position || '').toLowerCase();
  return /\b(captain|lieutenant|officer|oic)\b/.test(p) || p.includes('acting') || p.includes('a/c') || p.includes('a/lt');
}

export default function UnitStatusBoard({ user = null, title = 'Unit Status', selectedStation = null }) {
  const [units, setUnits] = useState([]);
  const [ownedIds, setOwnedIds] = useState(() => new Set());
  const [error, setError] = useState('');
  const [pending, setPending] = useState(() => new Set()); // apparatus ids mid-update
  const timerRef = useRef(null);

  const isCommand = canClearCalls(user);

  // Rising-edge overdue tone (0046 timers + tones 2026-07-13): one triple-beep
  // when a unit BECOMES overdue — never a repeating alarm (the pulsing card is
  // the persistent signal). Tracks last-seen overdue set across polls.
  const overdueIdsRef = useRef(null); // null = first load (seed silently, like the dispatch seen-set)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/units/status');
      const list = Array.isArray(data) ? data : [];
      // Tone only for units NEWLY crossing into overdue since the last poll.
      // First load seeds silently — opening the board mid-shift must not tone
      // for a unit that has been overdue for an hour (dispatch seen-set doctrine).
      const nowOverdue = new Set(list.filter((u) => u.timer?.overdue && u.apparatus_id != null).map((u) => u.apparatus_id));
      if (overdueIdsRef.current !== null
          && [...nowOverdue].some((id) => !overdueIdsRef.current.has(id))) {
        toneOverdue();
      }
      overdueIdsRef.current = nowOverdue;
      setUnits(list);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load unit status');
    }
  }, []);

  // Resolve which rigs THIS user owns today (officer seat) so we can show
  // edit controls that match the server. Command roles edit everything.
  useEffect(() => {
    if (isCommand || !user?.name) { setOwnedIds(new Set()); return; }
    let cancelled = false;
    api.get('/api/run-list/today').then(({ data }) => {
      if (cancelled) return;
      const crew = Array.isArray(data?.payload?.crew) ? data.payload.crew : [];
      const name = (user.name || '').trim().toLowerCase();
      const ids = new Set();
      for (const c of crew) {
        const mine = (c.member_name || '').trim().toLowerCase() === name;
        if (mine && isOfficerSeat(c.position_name || c.position || c.member_rank) && c.apparatus_id != null) {
          ids.add(Number(c.apparatus_id));
        }
      }
      setOwnedIds(ids);
    }).catch(() => { if (!cancelled) setOwnedIds(new Set()); });
    return () => { cancelled = true; };
  }, [user?.name, isCommand]);

  // PRIMARY realtime: Supabase Broadcast on a per-DEPARTMENT topic (P6.2). Each
  // message is a "something changed" signal -> refetch the authoritative API.
  // Skip if no department is known (never default a tenant); the poll backstops.
  useEffect(() => {
    const topic = unitStatusTopic(user?.department_id);
    if (!topic || !supabase) return undefined; // no dept or no realtime client → poll backstops
    const channel = supabase
      .channel(topic)
      .on('broadcast', { event: 'changed' }, () => { reportMessageReceived(); load(); })
      // The status callback used to be thrown away here. realtime-js already
      // reports SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED and already
      // reconnects — nothing observed it, which is why a dead push channel was
      // invisible for 34 days. FeedStatus reads this.
      .subscribe((status) => reportChannelStatus(topic, status));
    return () => { forgetChannel(topic); supabase.removeChannel(channel); };
  }, [user?.department_id, load]);

  // Initial load + a slow 30s backstop poll (in case a realtime message is
  // ever missed) + immediate refresh on refocus.
  useEffect(() => {
    load();
    timerRef.current = setInterval(() => { if (!document.hidden) load(); }, 30000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(timerRef.current); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  const canEditUnit = (u) => isCommand || (u.apparatus_id != null && ownedIds.has(Number(u.apparatus_id)));

  // Last-unit clear suggestion (2026-07-12): when the dispatcher moves the
  // final committed unit off an active call, the server suggests closing the
  // call too — the reverse-direction prompt mature CAD platforms ship. The
  // dispatcher decides; dismissing keeps the call open.
  const [clearSuggestion, setClearSuggestion] = useState(null);
  const [suggestBusy, setSuggestBusy] = useState(false);

  const setStatus = async (u, status) => {
    if (status === u.status) return;
    const id = u.apparatus_id;
    if (id == null) return;
    setPending(p => new Set(p).add(id));
    setUnits(list => list.map(x => x.apparatus_id === id ? { ...x, status, updated_at: new Date().toISOString() } : x)); // optimistic
    try {
      const res = await api.patch(`/api/units/${id}/status`, { status });
      if (res?.clearSuggestion) setClearSuggestion({ ...res.clearSuggestion, unit: u.designation });
    } catch (e) {
      setError(e.message || 'Update failed');
      load(); // reconcile from server on failure
    } finally {
      setPending(p => { const n = new Set(p); n.delete(id); return n; });
    }
  };

  // Status-timer ack (0046): the dispatcher's recorded "status check" —
  // radio the rig, get an answer, click; the timer resets. Dispatch only.
  const [acking, setAcking] = useState(new Set());
  const ackStatusCheck = async (u) => {
    if (u.apparatus_id == null) return;
    setAcking(p => new Set(p).add(u.apparatus_id));
    try {
      await api.post(`/api/units/${u.apparatus_id}/status-ack`, {});
      load(); // refresh timers from the server
    } catch (e) {
      setError(e.message || 'Failed to record status check');
    } finally {
      setAcking(p => { const n = new Set(p); n.delete(u.apparatus_id); return n; });
    }
  };

  // "471h 59m in Dispatched" is the same unreadable-hours problem as relTime.
  const fmtElapsed = (sec) => {
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  };

  const acceptClearSuggestion = async () => {
    if (!clearSuggestion) return;
    setSuggestBusy(true);
    try {
      await api.post(`/api/cad/alerts/${clearSuggestion.alertId}/clear`, {});
      setClearSuggestion(null);
    } catch {
      setError('Could not clear the call — try from Live Dispatch.');
    } finally {
      setSuggestBusy(false);
    }
  };

  // P6.3 — filter by house when a station is selected; units with no station_id
  // (legacy rows from the unit_statuses UNION branch) show in all views.
  const visibleUnits = selectedStation
    ? units.filter((u) => u.station_id == null || u.station_id === selectedStation)
    : units;

  return (
    <div className="glove-friendly bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 uppercase tracking-wide">
          {title}
          {/* Which channel is carrying this board, and when it last updated.
              Beside the title on purpose: an operator deciding whether to trust
              the screen should not have to go looking for that answer. */}
          <FeedStatus className="ml-2 normal-case tracking-normal font-medium" />
        </h3>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">{visibleUnits.length} units · live</span>
      </div>
      {error && (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300 mb-3">{error}</div>
      )}
      {/* Last-unit clear suggestion — dispatcher's choice, never automatic. */}
      {clearSuggestion && (
        <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-300 dark:border-blue-800 rounded-lg px-3 py-2 text-xs mb-3 flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-blue-800 dark:text-blue-200">
            {clearSuggestion.unit} was the last unit on “{clearSuggestion.description || 'the call'}”
            {clearSuggestion.address ? ` — ${clearSuggestion.address}` : ''}. Clear the call?
          </span>
          <span className="flex gap-2 ml-auto">
            <button
              onClick={acceptClearSuggestion}
              disabled={suggestBusy}
              className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50"
            >
              {suggestBusy ? 'Clearing…' : 'Clear call'}
            </button>
            <button
              onClick={() => setClearSuggestion(null)}
              className="px-2.5 py-1 rounded-md border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-200 font-bold"
            >
              Keep open
            </button>
          </span>
        </div>
      )}
      {/* Radio-doctrine reminder: committed units whose call was cleared are
          never auto-flipped — dispatch confirms over the radio, then updates. */}
      {visibleUnits.some((u) => u.orphaned) && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300 mb-3">
          ⚠ {visibleUnits.filter((u) => u.orphaned).map((u) => u.designation).join(', ')} still committed to a cleared call — confirm status over the radio and update.
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {visibleUnits.map((u) => {
          const meta = STATUS_META[u.status] || STATUS_META.in_service;
          const editable = canEditUnit(u);
          const busy = pending.has(u.apparatus_id);
          const overdue = u.timer?.overdue === true;
          return (
            <div key={(u.apparatus_id ?? 'x') + u.designation} className={`rounded-lg border ${meta.cls} px-3 py-2 ${busy ? 'opacity-60' : ''} ${overdue ? 'ring-2 ring-red-500 animate-pulse' : u.orphaned ? 'ring-2 ring-amber-400' : ''}`}>
              <div className="flex items-center justify-between gap-1">
                <span className="font-black text-[13px] truncate">{u.designation}</span>
                {u.orphaned && <span className="text-[9px] font-black text-amber-700 dark:text-amber-300 flex-shrink-0" title="Call cleared — confirm status over the radio">⚠</span>}
                {u.updated_at && <span className="text-[9px] opacity-70 flex-shrink-0">{relTime(u.updated_at)}</span>}
              </div>
              {/* Status timer (0046): overdue = past the department threshold with
                  no radio confirmation — the dispatcher's cue for a status check. */}
              {overdue && (
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span className="text-[10px] font-black text-red-700 dark:text-red-400" title={`Over the ${u.timer.thresholdMin}-minute ${meta.label} timer${u.timer.ackedAt ? ' (since last status check)' : ''}`}>
                    ⏱ {fmtElapsed(u.timer.elapsedSec)} in {meta.label}
                  </span>
                  {isCommand && (
                    <button
                      onClick={() => ackStatusCheck(u)}
                      data-testid="status-check"
                      data-unit={u.apparatus_id}
                      disabled={acking.has(u.apparatus_id)}
                      className="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 flex-shrink-0"
                      title="Radio the unit, confirm status, then record the check (resets the timer)"
                    >
                      {acking.has(u.apparatus_id) ? '…' : 'Status check ✓'}
                    </button>
                  )}
                </div>
              )}
              {editable ? (
                <select
                  value={u.status}
                  disabled={busy}
                  onChange={(e) => setStatus(u, e.target.value)}
                  className="mt-1 w-full text-[11px] font-bold bg-white/70 dark:bg-gray-900/70 border border-current/20 rounded px-1.5 py-1 cursor-pointer"
                  title="Change unit status"
                  aria-label={`${u.designation} unit status`}
                >
                  {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              ) : (
                <div className="mt-1 text-[12px] font-bold">{meta.label}</div>
              )}
            </div>
          );
        })}
        {visibleUnits.length === 0 && !error && (
          <div className="col-span-full text-center text-xs text-gray-500 dark:text-gray-400 py-4">Loading units…</div>
        )}
      </div>
    </div>
  );
}

// Lightweight counts for a compact strip (e.g. under the incident banner).
export function unitStatusCounts(units) {
  const c = {};
  for (const u of units) c[u.status] = (c[u.status] || 0) + 1;
  return c;
}
