// PushNotificationSetup
// Shown in Settings (or wherever we choose to surface it).
// Handles permission request, service-worker subscription, and server registration.

import { useState, useEffect } from 'react';
import { Bell, BellOff, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData  = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function getCurrentSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export default function PushNotificationSetup() {
  const [permission,   setPermission]   = useState(Notification.permission);
  const [subscribed,   setSubscribed]   = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [testing,      setTesting]      = useState(false);
  const [status,       setStatus]       = useState(null);  // { ok, message }
  const [supported,    setSupported]    = useState(false);

  useEffect(() => {
    const ok = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC;
    setSupported(ok);
    if (!ok) return;

    getCurrentSubscription().then((sub) => setSubscribed(!!sub));
  }, []);

  async function subscribe() {
    setLoading(true);
    setStatus(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setStatus({ ok: false, message: 'Permission denied. Enable notifications for this site in your browser settings.' });
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });

      await api.post('/api/push/subscribe', { subscription: sub.toJSON() });
      setSubscribed(true);
      setStatus({ ok: true, message: 'Notifications enabled! You\'ll be alerted when a new incident is created.' });
    } catch (err) {
      setStatus({ ok: false, message: err.message || 'Failed to enable notifications.' });
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setLoading(true);
    setStatus(null);
    try {
      const sub = await getCurrentSubscription();
      if (sub) {
        await api.delete('/api/push/subscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setStatus({ ok: true, message: 'Notifications disabled.' });
    } catch (err) {
      setStatus({ ok: false, message: err.message || 'Failed to disable notifications.' });
    } finally {
      setLoading(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setStatus(null);
    try {
      const res = await api.post('/api/push/test', {});
      setStatus({ ok: true, message: `Test sent to ${res.data?.sent ?? 0} device(s). Check your notifications!` });
    } catch (err) {
      setStatus({ ok: false, message: err.message || 'Test failed.' });
    } finally {
      setTesting(false);
    }
  }

  if (!supported) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">Push notifications not available</p>
          <p className="text-xs mt-0.5">
            {!VAPID_PUBLIC
              ? 'VITE_VAPID_PUBLIC_KEY is not set. Add it to your Vercel environment variables.'
              : 'Your browser does not support push notifications.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Incident Notifications</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {subscribed
              ? 'You\'ll receive a push notification when a new incident is created.'
              : 'Get alerted the moment a new incident is logged.'}
          </p>
        </div>
        <button type="button" onClick={subscribed ? unsubscribe : subscribe} disabled={loading}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
            subscribed
              ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900'
              : 'bg-red-600 text-white hover:bg-red-700'
          } disabled:opacity-50`}>
          {loading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : subscribed ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
          {loading ? 'Working…' : subscribed ? 'Turn Off' : 'Turn On'}
        </button>
      </div>

      {subscribed && (
        <button type="button" onClick={sendTest} disabled={testing}
          className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 disabled:opacity-50">
          {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
          {testing ? 'Sending…' : 'Send test notification'}
        </button>
      )}

      {status && (
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
          status.ok
            ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
        }`}>
          {status.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
          {status.message}
        </div>
      )}
    </div>
  );
}
