// prevention/MyInspections.jsx — the personal inspection queue (Phase 3 §3.1).
// Incumbent-verified: red = initial, yellow = reinspection; Scheduled/All filter;
// one-tap start. The overdue treatment (aging badge) is ours — no incumbent
// documents one publicly, and it's a place to beat them.
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Search, Play, MapPin, Inbox, Eye, Users } from 'lucide-react';
import { fi, localToday, daysBetween, isOverdue, isReinspection } from './fiApi';
import { Input, Select, Btn, EmptyState, Badge, Spinner, Modal, Field } from './ui';

function Stat({ label, value, tone }) {
  const tones = { red: 'text-red-700 dark:text-red-400', amber: 'text-amber-600 dark:text-amber-400', gray: 'text-gray-900 dark:text-gray-100' };
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 px-4 py-3">
      <p className={`text-2xl font-black ${tones[tone] || tones.gray}`}>{value}</p>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
    </div>
  );
}

export default function MyInspections({ user, fiCtx, onStart, onView, off }) {
  const [inspections, setInspections] = useState(null);
  const [properties, setProperties] = useState([]);
  const [err, setErr] = useState(null);
  const [scope, setScope] = useState('mine');       // mine | all
  const [when, setWhen] = useState('open');         // open | done
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const today = localToday();

  // ── Reassignment (2026-07-15) — a clerk/officer hands a PENDING reinspection to another
  // inspector (the one multi-person case). Admin-gated in the UI; the server is the control.
  const [reassigning, setReassigning] = useState(null); // the inspection being reassigned
  const [people, setPeople] = useState([]);             // dept users eligible to receive it
  const [toUserId, setToUserId] = useState('');
  const [reason, setReason] = useState('');
  const [rBusy, setRBusy] = useState(false);
  const [rErr, setRErr] = useState(null);

  useEffect(() => {
    if (!fiCtx.isPreventionAdmin) return;
    fi.designations.eligibleUsers().then((r) => setPeople(r.data ?? [])).catch(() => {});
  }, [fiCtx.isPreventionAdmin]);

  const openReassign = (i) => { setReassigning(i); setToUserId(''); setReason(''); setRErr(null); };
  const doReassign = async () => {
    if (!toUserId) { setRErr('Choose an inspector to reassign to.'); return; }
    setRBusy(true); setRErr(null);
    try {
      await fi.inspections.reassign(reassigning.id, { toUserId: Number(toUserId), reason });
      const r = await fi.inspections.list();      // refresh so it moves in the queue
      setInspections(r.data ?? []);
      setReassigning(null);
    } catch (e) { setRErr(e.message); } finally { setRBusy(false); }
  };

  // The queue must render WITH NO SIGNAL. The day was pre-downloaded when the
  // inspector opened the Prevention Center; if the network is gone we serve it from
  // that cache rather than showing an empty screen in a basement. Online, the
  // network is still the source of truth — the cache is the fallback, never the
  // authority. (Found inert in the 2026-07-13 signal-loss walkthrough.)
  useEffect(() => {
    let cancelled = false;
    const fromCache = () => {
      const day = off?.day;
      if (!day) return false;
      if (!cancelled) {
        setInspections(day.inspections ?? []);
        setProperties(day.properties ?? []);
        setErr(null);
      }
      return true;
    };

    const load = () => {
      if (!navigator.onLine) {
        // (B1) No signal AND no cached day → resolve the load to an EMPTY list so the
        // empty state can explain it. It used to leave `inspections` null, which renders
        // a spinner labelled "Loading…" forever — and an inspector in a basement reads
        // "loading" as "wait", not as "you need to go outside and open this once".
        if (!fromCache()) setInspections([]);
        return Promise.resolve();
      }
      return Promise.all([fi.inspections.list(), fi.properties.list()])
        .then(([i, p]) => { if (!cancelled) { setInspections(i.data ?? []); setProperties(p.data ?? []); setErr(null); } })
        // A failed fetch must NOT blank the queue — fall back to the day on the device.
        .catch((e) => { if (!cancelled && !fromCache()) setErr(e.message); });
    };
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', load);
    window.addEventListener('offline', load);
    return () => {
      cancelled = true; clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', load);
      window.removeEventListener('offline', load);
    };
  }, [off?.day]);

  const propsById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const types = useMemo(() => [...new Set((inspections ?? []).map((i) => i.type).filter(Boolean))].sort(), [inspections]);

  const isMine = (i) =>
    String(i.assigned_to_user_id ?? '') === String(user?.id ?? '__') ||
    (!!user?.name && i.inspectorName === user.name);

  const list = useMemo(() => {
    if (!inspections) return [];
    const needle = q.trim().toLowerCase();
    return inspections
      .filter((i) => (when === 'open' ? !i.completedDate : !!i.completedDate))
      .filter((i) => (scope === 'mine' ? isMine(i) : true))
      .filter((i) => (type ? i.type === type : true))
      .filter((i) => {
        if (!needle) return true;
        const p = propsById.get(i.propertyId);
        return [p?.name, p?.address, i.type, i.inspectorName].some((v) => String(v || '').toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        if (when === 'done') return String(b.completedDate).localeCompare(String(a.completedDate));
        return String(a.scheduledDate || '9999').localeCompare(String(b.scheduledDate || '9999'));
      });
  }, [inspections, when, scope, type, q, propsById]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <p className="text-red-700 dark:text-red-400 font-semibold" role="alert">{err}</p>;
  if (inspections === null) return <Spinner label="Loading your queue…" />;

  const open = inspections.filter((i) => !i.completedDate);
  const mineOpen = open.filter(isMine);
  const overdue = mineOpen.filter((i) => isOverdue(i, today));
  const dueToday = mineOpen.filter((i) => String(i.scheduledDate || '').slice(0, 10) === today);
  const unassigned = open.filter((i) => !i.assigned_to_user_id && !i.inspectorName);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Due today" value={dueToday.length} tone={dueToday.length ? 'amber' : 'gray'} />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? 'red' : 'gray'} />
        <Stat label="My open" value={mineOpen.length} />
        <Stat label="Unassigned" value={unassigned.length} tone={unassigned.length ? 'amber' : 'gray'} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden" role="group" aria-label="Whose inspections">
          {[['mine', 'My inspections'], ['all', 'Department']].map(([id, label]) => (
            <button key={id} onClick={() => setScope(id)} aria-pressed={scope === id}
              className={`min-h-[44px] px-4 font-semibold text-sm ${scope === id ? 'bg-red-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden" role="group" aria-label="Open or completed">
          {[['open', 'Scheduled'], ['done', 'Completed']].map(([id, label]) => (
            <button key={id} onClick={() => setWhen(id)} aria-pressed={when === id}
              className={`min-h-[44px] px-4 font-semibold text-sm ${when === id ? 'bg-red-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300'}`}>
              {label}
            </button>
          ))}
        </div>
        <Select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className="max-w-[14rem]">
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <Input aria-label="Search queue" placeholder="Search property, address…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>

      {/* (B1) OFFLINE WITH NOTHING CACHED is not an empty queue — it is a device that
          never downloaded the day. Saying "Your queue is clear" here would be a lie,
          and it would send an inspector into a building believing there is no work. */}
      {list.length === 0 && !navigator.onLine && !off?.day ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700">
          <EmptyState icon={Inbox} title="This device hasn't downloaded your day"
            body="You're offline and there's no saved copy on this device — so we can't tell you what's due. Get signal for a moment and open the Prevention Center once; after that it all works with no signal." />
        </div>
      ) : list.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700">
          <EmptyState icon={Inbox}
            title={when === 'done' ? 'No completed inspections match' : scope === 'mine' ? 'Your queue is clear' : 'No open inspections'}
            body={when === 'done' ? 'Adjust the filters to find past work.' : scope === 'mine'
              ? 'Nothing assigned and nothing due. The buildings of this district thank you.'
              : 'Schedule the next round from the Schedule tab — the batch wizard does a district in one pass.'} />
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((i) => {
            const p = propsById.get(i.propertyId);
            const reins = isReinspection(i);
            const over = when === 'open' && isOverdue(i, today);
            const openViol = (i.violations || []).filter((v) => v?.status === 'Open' || v?.status === 'Time Extension').length;
            return (
              <li key={i.id}
                className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-4 border-l-4 ${
                  reins ? 'border-l-yellow-400' : 'border-l-red-600'}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-900 dark:text-gray-100 truncate">{p?.name || `Property #${i.propertyId}`}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
                    <MapPin size={13} aria-hidden="true" /> {p?.address || 'No address on file'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone={reins ? 'yellow' : 'red'}>{i.type}</Badge>
                    {when === 'open' && i.scheduledDate && (
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
                        <CalendarClock size={13} aria-hidden="true" /> {String(i.scheduledDate).slice(0, 10)}
                      </span>
                    )}
                    {when === 'done' && <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Completed {String(i.completedDate).slice(0, 10)}{i.result ? ` · ${i.result}` : ''}</span>}
                    {over && <Badge tone="red">{daysBetween(String(i.scheduledDate).slice(0, 10), today)}d overdue</Badge>}
                    {openViol > 0 && <Badge tone="amber">{openViol} open violation{openViol === 1 ? '' : 's'}</Badge>}
                    {i.inspectorName && scope === 'all' && <span className="text-xs text-gray-600 dark:text-gray-400">{i.inspectorName}</span>}
                  </div>
                </div>
                {when === 'open' ? (
                  <div className="flex items-center gap-2 shrink-0">
                    {fiCtx.isPreventionAdmin && (
                      <Btn onClick={() => openReassign(i)} aria-label={`Reassign ${i.type} at ${p?.name || i.propertyId}`}>
                        <Users size={16} aria-hidden="true" /> Reassign
                      </Btn>
                    )}
                    {fiCtx.isInspector && (
                      <Btn variant="primary" onClick={() => onStart(i)} aria-label={`Start ${i.type} at ${p?.name || i.propertyId}`}>
                        <Play size={16} aria-hidden="true" /> {reins ? 'Reinspect' : 'Start'}
                      </Btn>
                    )}
                  </div>
                ) : (
                  <Btn onClick={() => onView(i)} aria-label={`View completed inspection at ${p?.name || i.propertyId}`}>
                    <Eye size={16} aria-hidden="true" /> View
                  </Btn>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {reassigning && (
        <Modal title="Reassign inspection" onClose={() => setReassigning(null)}>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Hand this pending {isReinspection(reassigning) ? 'reinspection' : 'inspection'} to another inspector.
            It moves into their queue. A completed inspection is a finalized record and can never be reassigned.
          </p>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {propsById.get(reassigning.propertyId)?.name || `Property #${reassigning.propertyId}`}
            <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">{reassigning.type}</span>
          </p>
          {rErr && <p className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{rErr}</p>}
          <Field label="Reassign to">
            <Select value={toUserId} onChange={(e) => setToUserId(e.target.value)} aria-label="New inspector">
              <option value="">Choose an inspector…</option>
              {people.map((pp) => (
                <option key={pp.id} value={pp.id}>{pp.name || pp.username || `User #${pp.id}`}</option>
              ))}
            </Select>
          </Field>
          <div className="mt-3">
            <Field label="Reason" hint="Optional — e.g. out sick, off, workload. Recorded on the audit trail.">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it moving?" maxLength={500} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Btn onClick={() => setReassigning(null)}>Cancel</Btn>
            <Btn variant="primary" disabled={!toUserId || rBusy} onClick={doReassign}>
              {rBusy ? 'Reassigning…' : 'Reassign'}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
