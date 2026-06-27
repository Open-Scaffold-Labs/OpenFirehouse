// OfflineBanner — shown at the top of the app when the device has no network.
// Also shows a "syncing" state when flushing the offline queue on reconnect.

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { offlineQueue, flushQueue } from '../utils/offlineQueue';
import { api } from '../utils/api';

export default function OfflineBanner() {
  const { online } = useNetworkStatus();
  const [syncing,  setSyncing]  = useState(false);
  const [synced,   setSynced]   = useState(null);   // { replayed, failed } | null
  const [queueLen, setQueueLen] = useState(offlineQueue.count());

  // Refresh queue count when online status changes
  useEffect(() => {
    setQueueLen(offlineQueue.count());
  }, [online]);

  // Auto-flush when coming back online
  useEffect(() => {
    if (!online || offlineQueue.count() === 0) return;

    setSyncing(true);
    flushQueue(api).then((result) => {
      setSyncing(false);
      setSynced(result);
      setQueueLen(offlineQueue.count());
      // Hide success message after 4 s
      setTimeout(() => setSynced(null), 4000);
    });
  }, [online]);

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
    <div className={`fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 text-white text-xs font-medium px-4 py-2 ${
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
