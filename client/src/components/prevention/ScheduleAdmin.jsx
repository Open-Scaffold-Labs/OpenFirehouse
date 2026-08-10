// prevention/ScheduleAdmin.jsx — scheduling administration (Phase 3 §3.1):
// per-inspector workload, multi-select rebalancing, and the batch wizard
// (select occupancies → assign inspector + date → preview → create).
// Prevention-admin surface; the server enforces the same gate.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Users2, Search, CheckSquare, Square, ArrowRightLeft } from 'lucide-react';
import { fi, localToday } from './fiApi';
import { Section, Field, Input, Select, Btn, Modal, EmptyState, Badge, Spinner } from './ui';

export default function ScheduleAdmin({ fiCtx }) {
  const [inspections, setInspections] = useState(null);
  const [properties, setProperties] = useState([]);
  const [types, setTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [wizard, setWizard] = useState(null); // {step, propertyIds:Set, q, type, date, assignee}
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    const [i, p, t, u] = await Promise.all([
      fi.inspections.list(), fi.properties.list(), fi.types.list(),
      fi.designations.eligibleUsers().catch(() => ({ data: [] })),
    ]);
    setInspections(i.data ?? []); setProperties(p.data ?? []);
    setTypes((t.data ?? []).filter((x) => x.active)); setUsers(u.data ?? []);
  }, []);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);

  const propsById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const pending = useMemo(() => (inspections ?? []).filter((i) => !i.completedDate), [inspections]);

  const workload = useMemo(() => {
    const m = new Map();
    for (const i of pending) {
      const key = i.assigned_to_user_id ? `u:${i.assigned_to_user_id}` : (i.inspectorName ? `n:${i.inspectorName}` : 'unassigned');
      const label = i.assigned_to_user_id
        ? (users.find((u) => String(u.id) === String(i.assigned_to_user_id))?.name || i.inspectorName || `User #${i.assigned_to_user_id}`)
        : (i.inspectorName || 'Unassigned');
      const e = m.get(key) || { label, count: 0 };
      e.count += 1; m.set(key, e);
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [pending, users]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulkAssign = async (assignee) => {
    setErr(null);
    try {
      const r = await fi.inspections.bulkAssign({
        inspectionIds: [...selected],
        assignedToUserId: assignee ? Number(assignee) : null,
        // Send '' and let the server resolve the display name from the user id.
        // This used to send the literal string 'Unassigned', which is TRUTHY — so
        // an un-assigned inspection vanished from the queue's "Unassigned" count
        // (MyInspections keys on `!inspectorName`) and rendered an inspector
        // literally named "Unassigned". Two screens disagreed. (2026-07-13)
        inspectorName: '',
      });
      setAssignOpen(false); setSelected(new Set());
      setResult({ kind: 'assign', ...r.data });
      await load();
    } catch (e) { setErr(e.message); }
  };

  const commitBatch = async () => {
    setErr(null);
    try {
      const r = await fi.inspections.batchSchedule({
        propertyIds: [...wizard.propertyIds],
        type: wizard.type,
        scheduledDate: wizard.date,
        ...(wizard.assignee ? { assignedToUserId: Number(wizard.assignee) } : {}),
      });
      setWizard(null);
      setResult({ kind: 'batch', ...r.data });
      await load();
    } catch (e) { setErr(e.message); }
  };

  if (err && inspections === null) return <p className="text-red-700 dark:text-red-400 font-semibold" role="alert">{err}</p>;
  if (inspections === null) return <Spinner label="Loading schedule…" />;

  const wizProps = wizard
    ? properties.filter((p) => {
        const needle = (wizard.q || '').trim().toLowerCase();
        return !needle || [p.name, p.address, p.occupancyType].some((v) => String(v || '').toLowerCase().includes(needle));
      })
    : [];

  return (
    <div className="space-y-5">
      {result && (
        <p className="rounded-xl bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 px-4 py-3 text-sm font-semibold" role="status">
          {result.kind === 'batch'
            ? `Scheduled ${result.createdCount} inspection${result.createdCount === 1 ? '' : 's'}${result.skippedExisting ? ` · ${result.skippedExisting} already on the books (skipped, never duplicated)` : ''}.`
            : `Reassigned ${result.updatedCount} inspection${result.updatedCount === 1 ? '' : 's'}${result.skipped ? ` · ${result.skipped} completed record${result.skipped === 1 ? '' : 's'} left untouched` : ''}.`}
          <button className="ml-3 underline" onClick={() => setResult(null)}>Dismiss</button>
        </p>
      )}
      {err && <p className="text-sm font-semibold text-red-700 dark:text-red-400" role="alert">{err}</p>}

      <Section
        title="Inspector workload"
        subtitle="Open inspections per inspector — spot the pile-up before it becomes one."
        actions={<Btn variant="primary" onClick={() => setWizard({ step: 1, propertyIds: new Set(), q: '', type: types[0]?.name || '', date: localToday(), assignee: '' })}>
          <CalendarPlus size={16} aria-hidden="true" /> Batch schedule
        </Btn>}
      >
        {workload.length === 0
          ? <EmptyState icon={Users2} title="Nothing pending" body="Every scheduled inspection is done. Run the batch wizard to plan the next cycle." />
          : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {workload.map(([key, w]) => (
                <li key={key} className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                  <span className="font-semibold text-gray-800 dark:text-gray-200 truncate">{w.label}</span>
                  <Badge tone={key === 'unassigned' && w.count ? 'amber' : 'gray'}>{w.count}</Badge>
                </li>
              ))}
            </ul>
          )}
      </Section>

      <Section
        title="Pending inspections"
        subtitle="Select any set and move it to another inspector in one act — staffing changes shouldn't mean re-keying a month of scheduling."
        actions={selected.size > 0 && (
          <Btn variant="primary" onClick={() => setAssignOpen(true)}>
            <ArrowRightLeft size={16} aria-hidden="true" /> Reassign {selected.size}
          </Btn>
        )}
      >
        {pending.length === 0
          ? <EmptyState icon={CheckSquare} title="No pending inspections" body="The board is clean." />
          : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[26rem] overflow-y-auto">
              {pending
                .slice()
                .sort((a, b) => String(a.scheduledDate || '9999').localeCompare(String(b.scheduledDate || '9999')))
                .map((i) => {
                  const p = propsById.get(i.propertyId);
                  const on = selected.has(i.id);
                  return (
                    <li key={i.id}>
                      <button onClick={() => toggle(i.id)} aria-pressed={on}
                        className="w-full min-h-[52px] flex items-center gap-3 py-2 text-left">
                        {on ? <CheckSquare size={20} className="text-red-600 shrink-0" aria-hidden="true" /> : <Square size={20} className="text-gray-300 dark:text-gray-600 shrink-0" aria-hidden="true" />}
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-gray-900 dark:text-gray-100 truncate">{p?.name || `Property #${i.propertyId}`}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {i.type} · {i.scheduledDate ? String(i.scheduledDate).slice(0, 10) : 'no date'} · {i.inspectorName || 'Unassigned'}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
      </Section>

      {assignOpen && (
        <Modal title={`Reassign ${selected.size} inspection${selected.size === 1 ? '' : 's'}`} onClose={() => setAssignOpen(false)}>
          <AssignPicker users={users} onCancel={() => setAssignOpen(false)} onCommit={bulkAssign} />
        </Modal>
      )}

      {wizard && (
        <Modal title={`Batch schedule — step ${wizard.step} of 3`} onClose={() => setWizard(null)} wide>
          {wizard.step === 1 && (
            <div className="space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <Input aria-label="Search properties" placeholder="Search name, address, occupancy…" value={wizard.q}
                  onChange={(e) => setWizard({ ...wizard, q: e.target.value })} className="pl-9" />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-gray-600 dark:text-gray-300">{wizard.propertyIds.size} selected</span>
                <div className="flex gap-3">
                  <button className="underline text-gray-600 dark:text-gray-300" onClick={() => setWizard({ ...wizard, propertyIds: new Set([...wizard.propertyIds, ...wizProps.map((p) => p.id)]) })}>Select all shown</button>
                  <button className="underline text-gray-600 dark:text-gray-300" onClick={() => setWizard({ ...wizard, propertyIds: new Set() })}>Clear</button>
                </div>
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[22rem] overflow-y-auto">
                {wizProps.map((p) => {
                  const on = wizard.propertyIds.has(p.id);
                  return (
                    <li key={p.id}>
                      <button aria-pressed={on} className="w-full min-h-[48px] flex items-center gap-3 py-2 text-left"
                        onClick={() => setWizard((w) => { const s = new Set(w.propertyIds); s.has(p.id) ? s.delete(p.id) : s.add(p.id); return { ...w, propertyIds: s }; })}>
                        {on ? <CheckSquare size={20} className="text-red-600 shrink-0" aria-hidden="true" /> : <Square size={20} className="text-gray-300 dark:text-gray-600 shrink-0" aria-hidden="true" />}
                        <span className="min-w-0">
                          <span className="block font-semibold text-gray-900 dark:text-gray-100 truncate">{p.name}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{p.address || 'No address'} {p.occupancyType ? `· ${p.occupancyType}` : ''}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {wizProps.length === 0 && <li className="py-6 text-center text-sm text-gray-600 dark:text-gray-400">No properties match.</li>}
              </ul>
              <div className="flex justify-end gap-2">
                <Btn onClick={() => setWizard(null)}>Cancel</Btn>
                <Btn variant="primary" disabled={wizard.propertyIds.size === 0} onClick={() => setWizard({ ...wizard, step: 2 })}>
                  Next — details
                </Btn>
              </div>
            </div>
          )}
          {wizard.step === 2 && (
            <div className="space-y-4">
              <Field label="Inspection type">
                <Select value={wizard.type} onChange={(e) => setWizard({ ...wizard, type: e.target.value })}>
                  {types.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label="Scheduled date">
                <Input type="date" value={wizard.date} onChange={(e) => setWizard({ ...wizard, date: e.target.value })} />
              </Field>
              <Field label="Assign to" hint="Optional — leave unassigned to pool the work.">
                <Select value={wizard.assignee} onChange={(e) => setWizard({ ...wizard, assignee: e.target.value })}>
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.username}</option>)}
                </Select>
              </Field>
              <div className="flex justify-between gap-2">
                <Btn onClick={() => setWizard({ ...wizard, step: 1 })}>Back</Btn>
                <Btn variant="primary" disabled={!wizard.type || !wizard.date} onClick={() => setWizard({ ...wizard, step: 3 })}>
                  Next — review
                </Btn>
              </div>
            </div>
          )}
          {wizard.step === 3 && (
            <div className="space-y-4">
              <p className="text-gray-800 dark:text-gray-200">
                Create <strong>{wizard.propertyIds.size}</strong> “{wizard.type}” inspection{wizard.propertyIds.size === 1 ? '' : 's'} scheduled
                {' '}<strong>{wizard.date}</strong>, assigned to <strong>{wizard.assignee ? (users.find((u) => String(u.id) === String(wizard.assignee))?.name || 'inspector') : 'nobody (pooled)'}</strong>.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                A property that already has an identical pending inspection is skipped automatically — running this twice never double-books.
              </p>
              <div className="flex justify-between gap-2">
                <Btn onClick={() => setWizard({ ...wizard, step: 2 })}>Back</Btn>
                <Btn variant="primary" onClick={commitBatch}>Create inspections</Btn>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function AssignPicker({ users, onCancel, onCommit }) {
  const [assignee, setAssignee] = useState('');
  return (
    <div className="space-y-4">
      <Field label="Move to">
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Unassigned pool</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.username}</option>)}
        </Select>
      </Field>
      <p className="text-sm text-gray-500 dark:text-gray-400">Completed inspections in your selection stay put — records don't move.</p>
      <div className="flex justify-end gap-2">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" onClick={() => onCommit(assignee)}>Reassign</Btn>
      </div>
    </div>
  );
}
