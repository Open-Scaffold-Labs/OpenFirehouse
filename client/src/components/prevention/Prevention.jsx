// prevention/Prevention.jsx — the Prevention Center shell (Phase 3).
// Tabs: Queue (every member sees their work) · Dashboard · Schedule (bureau
// admin) · Settings (bureau admin). The runner takes over full-screen.
// UI gating mirrors fiAuth; every write is enforced server-side regardless.
import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Inbox, BarChart3, CalendarClock, Settings2, CloudOff, RefreshCw, Mail, Receipt, Banknote } from 'lucide-react';
import { useFiContext } from './fiApi';
import { useOffline } from '../../lib/offline/useOffline';
import { Spinner, EmptyState, Btn } from './ui';
import MyInspections from './MyInspections';
import ScheduleAdmin from './ScheduleAdmin';
import ViolationDashboard from './ViolationDashboard';
import PreventionSettings from './PreventionSettings';
import Mailroom from './Mailroom';
import PermitsTab from './PermitsTab';
import BillingTab from './BillingTab';
import InspectionRunner from './InspectionRunner';

export default function Prevention({ user }) {
  const fiCtx = useFiContext(user);
  const off = useOffline();
  const [tab, setTab] = useState('queue');
  const [runnerId, setRunnerId] = useState(null);
  const [queueKey, setQueueKey] = useState(0); // remount the queue after a runner exit

  // ── PRE-DOWNLOAD THE DAY ────────────────────────────────────────────────────
  // THE promise: an inspector can lose signal at any moment and keep working. That
  // is only true if the day is already ON THE DEVICE before the signal goes. The
  // moment to fetch it is when they open the Prevention Center — NOT when they open
  // a specific inspection, because by then they may already be in the basement.
  //
  // (Caught in the 2026-07-13 signal-loss walkthrough: the offline layer was wired
  // for WRITES but nothing ever populated the cache, so an inspector arriving with
  // no signal saw an empty queue. The feature was inert.)
  // NOTE the dependency list. Depending on `off` (a fresh object every render) made
  // this fire on every render — five /day fetches on one page load, caught in the
  // walkthrough. Depend ONLY on the two facts that should actually trigger a pull:
  // "am I an inspector" and "do I have signal". The function itself lives in a ref.
  const pulled = useRef(false);
  const dl = useRef(off.downloadDay);
  dl.current = off.downloadDay;
  useEffect(() => {
    if (!fiCtx.isInspector || !off.online) { return; }
    if (pulled.current) return;               // once per online session…
    pulled.current = true;
    dl.current().catch(() => { pulled.current = false; }); // …but a FAILED pull must stay retryable
  }, [fiCtx.isInspector, off.online]);

  // Signal came back after being away → refresh the day (it may be stale).
  useEffect(() => {
    if (!off.online) pulled.current = false;
  }, [off.online]);

  if (fiCtx.loading) return <Spinner label="Opening the Prevention Center…" />;
  if (fiCtx.error) return <p className="p-6 text-red-700 dark:text-red-400 font-semibold" role="alert">{fiCtx.error}</p>;

  const tabs = [
    ['queue', 'Queue', Inbox, true],
    ['dashboard', 'Dashboard', BarChart3, true],
    // Permits (R6, 2026-07-26). Visible to everyone, like Dashboard: a crew looking at
    // a building needs to see what permits it holds. The write affordances inside are
    // gated on isInspector / isPreventionAdmin, and the server enforces regardless.
    ['permits', 'Permits', Receipt, true],
    // Billing (3.2 Slice D, 2026-08-07). Gated on isInspector, NOT on everyone: every read
    // behind this tab is requireInspector server-side, so showing it to an undesignated
    // member in a bureau-only department would be a tab full of 403s. Every WRITE inside is
    // gated on isPreventionAdmin — money is authored by the bureau, not by the crew.
    ['billing', 'Billing', Banknote, fiCtx.isInspector],
    ['schedule', 'Schedule', CalendarClock, fiCtx.isPreventionAdmin],
    ['mailroom', 'Mailroom', Mail, fiCtx.isPreventionAdmin],
    ['settings', 'Settings', Settings2, fiCtx.isPreventionAdmin],
  ].filter(([, , , show]) => show);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ShieldCheck className="text-red-600" size={26} aria-hidden="true" /> Prevention Center
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Queue → walkthrough → findings → signatures → served notice. The record is legal-grade at every step.
          </p>
        </div>
        <nav className="flex gap-2" aria-label="Prevention sections">
          {tabs.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
              className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl font-semibold text-sm transition-colors ${
                tab === id ? 'bg-red-600 text-white'
                  : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              <Icon size={16} aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>
      </header>

      {/* The honest status strip. It never claims saved-ness we do not have, and it
          never treats "offline" as an error — an inspector is SUPPOSED to be able to
          work with no signal. (R9, R12) */}
      {fiCtx.isInspector && (
        <div role="status" aria-live="polite" className="space-y-2">
          {!off.online && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
              <CloudOff size={18} className="mt-0.5 text-amber-800 dark:text-amber-300 shrink-0" aria-hidden="true" />
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Offline — keep working.{' '}
                <span className="font-normal">
                  {off.day
                    ? 'Your day is on this device. Everything you record is saved here and syncs when you have signal.'
                    : 'This device has no saved copy of your day yet — open the Prevention Center once with signal so it can download.'}
                </span>
              </p>
            </div>
          )}
          {/* (R1) This is the "iOS may throw away your day" warning. It was the
              quietest element on the page — a bare 12px line. Give it the same weight
              the runner gives it: it is the difference between losing a walkthrough
              and not. */}
          {off.storage?.persisted === false && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
              <ShieldCheck size={18} className="mt-0.5 text-amber-800 dark:text-amber-300 shrink-0" aria-hidden="true" />
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                This browser may clear saved work if storage runs low — sync as soon as you have signal.
              </p>
            </div>
          )}
          {/* (B2) `off.pending` is an ARRAY — `array > 0` is NaN, so this block never
              rendered and "Sync now" was dead code. Worse: while OFFLINE with queued
              work, the count vanished entirely — the one screen where "N changes saved
              on this device" matters most. Use the summary's numbers.
              (M8) And size it to be read at arm's length, not squinted at. */}
          {(off.summary?.pending > 0 || off.summary?.rejected > 0 || off.online) && (
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              <span>{off.summary?.label}</span>
              {off.online && off.summary?.pending > 0 && (
                <button onClick={() => off.syncNow()} className="inline-flex items-center gap-1 underline min-h-[44px] px-1">
                  <RefreshCw size={14} aria-hidden="true" /> Sync now
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!fiCtx.isInspector && tab === 'queue' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700">
          <EmptyState icon={ShieldCheck} title="You're not designated for inspections yet"
            body="This department runs a designated bureau (crew inspections are off). A chief can designate you as an Inspector in Settings › People — any rank qualifies."
            action={fiCtx.isPreventionAdmin ? <Btn variant="primary" onClick={() => setTab('settings')}>Open Settings</Btn> : null} />
        </div>
      )}

      {tab === 'queue' && fiCtx.isInspector && (
        <MyInspections key={queueKey} user={user} fiCtx={fiCtx} off={off}
          onStart={(i) => setRunnerId(i.id)} onView={(i) => setRunnerId(i.id)} />
      )}
      {tab === 'dashboard' && <ViolationDashboard />}
      {tab === 'permits' && <PermitsTab fiCtx={fiCtx} />}
      {tab === 'billing' && fiCtx.isInspector && <BillingTab fiCtx={fiCtx} />}
      {tab === 'schedule' && fiCtx.isPreventionAdmin && <ScheduleAdmin fiCtx={fiCtx} />}
      {tab === 'mailroom' && fiCtx.isPreventionAdmin && <Mailroom fiCtx={fiCtx} />}
      {tab === 'settings' && fiCtx.isPreventionAdmin && <PreventionSettings fiCtx={fiCtx} />}

      {runnerId && (
        <InspectionRunner inspectionId={runnerId} user={user} fiCtx={fiCtx}
          onExit={() => { setRunnerId(null); setQueueKey((k) => k + 1); }} />
      )}
    </div>
  );
}
