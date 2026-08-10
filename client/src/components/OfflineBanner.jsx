// OfflineBanner — shown at the top of the app when the device has no network.
// Also shows a "syncing" state when flushing the offline queue on reconnect.

import { useEffect, useRef, useState, useCallback } from 'react';
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { offlineQueue, flushQueue } from '../utils/offlineQueue';
import { api } from '../utils/api';

const RETRY_INTERVAL_MS = 20000;   // background retry cadence while items are queued

export default function OfflineBanner() {
  const { online } = useNetworkStatus();
  const [syncing,  setSyncing]  = useState(false);
  const [synced,   setSynced]   = useState(null);   // { replayed, failed } | null
  const [queueLen, setQueueLen] = useState(offlineQueue.count());
  // Concurrency guard: many triggers can fire at once (online + interval +
  // visibility). flushQueue must NOT run twice in parallel — two runs could each
  // grab the same queued entry and double-POST it. That is fine for the PAR
  // (idempotent via client_id) but NOT for a queued incident save (creates a
  // duplicate legal record). One flush at a time.
  const flushingRef = useRef(false);

  // The single, robust flusher. Reads navigator.onLine DIRECTLY (not the React
  // `online` state) so it is never stale and works from an interval/event.
  const tryFlush = useCallback(async () => {
    if (flushingRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (offlineQueue.count() === 0) return;
    flushingRef.current = true;
    setSyncing(true);
    try {
      const result = await flushQueue(api);
      setSynced(result);
      setTimeout(() => setSynced(null), 4000);
    } catch (_) {
      // flushQueue itself never rejects; belt-and-braces.
    } finally {
      flushingRef.current = false;
      setSyncing(false);
      setQueueLen(offlineQueue.count());
    }
  }, []);

  // Keep the count fresh + flush on an online transition (device regained signal).
  useEffect(() => {
    setQueueLen(offlineQueue.count());
    if (online) tryFlush();
  }, [online, tryFlush]);

  // The other four triggers — this is what fixes "server recovered while the
  // browser stayed online," which the online-transition alone never caught:
  //   • on mount (app opened with a queue already pending)
  //   • a FRESH enqueue (offlineQueue.push fires 'of:offline-queue-push')
  //   • tab refocus (visibilitychange → visible)
  //   • a periodic background retry while anything is queued
  // A queued INCIDENT SAVE (IncidentLog) rode the same narrow trigger and had the
  // same latency; this fixes both consumers at once.
  useEffect(() => {
    tryFlush();   // on mount

    const onPush = () => tryFlush();
    const onVisible = () => { if (document.visibilityState === 'visible') tryFlush(); };
    window.addEventListener('of:offline-queue-push', onPush);
    document.addEventListener('visibilitychange', onVisible);

    const iv = setInterval(() => {
      // Visibility-aware: don't burn requests in a backgrounded tab.
      if (document.visibilityState === 'visible' && offlineQueue.count() > 0) tryFlush();
    }, RETRY_INTERVAL_MS);

    return () => {
      window.removeEventListener('of:offline-queue-push', onPush);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(iv);
    };
  }, [tryFlush]);

  // Success flash — show briefly even when online
  if (synced && online) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-emerald-600 text-white text-xs font-medium px-4 py-2 animate-in fade-in slide-in-from-top duration-300">
        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
        {synced.replayed > 0
          ? `Back online — synced ${synced.replayed} pending ${synced.replayed === 1 ? 'item' : 'items'}.`
          : 'Back online.'}
        {synced.failed > 0 && ` (${synced.failed} failed — will retry)`}
        {synced.dropped > 0 && ` (${synced.dropped} could not be saved and ${synced.dropped === 1 ? 'was' : 'were'} discarded — re-enter if still needed)`}
      </div>
    );
  }

  if (online && !syncing) return null;

  return (
    <div data-testid="offline-banner" data-state={syncing ? 'syncing' : 'offline'} className={`fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 text-white text-xs font-medium px-4 py-2 ${
      syncing ? 'bg-blue-600' : 'bg-gray-700'
    }`}>
      {syncing ? (
        <>
          <RefreshCw className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
          Syncing {queueLen} pending {queueLen === 1 ? 'item' : 'items'}…
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
          No connection — changes will sync when you're back online.
          {queueLen > 0 && ` (${queueLen} queued)`}
        </>
      )}
    </div>
  );
}
