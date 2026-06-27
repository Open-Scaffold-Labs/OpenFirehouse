/**
 * bulletinCache.js — module-level singleton cache for /api/bulletins.
 *
 * All three consumers (App bell count, NotificationsCenter, DailyNotices)
 * hit this cache instead of making independent API calls. The result:
 *   - One network request per session
 *   - Instant data on the second and third render
 *   - Call invalidate() after posting/editing to trigger a fresh fetch
 */

import { api } from './api';

let cached = null;       // resolved bulletin array or null
let pending = null;      // in-flight Promise or null
const listeners = new Set(); // components that want to know when cache updates

/** Fetch bulletins once; return cached array on subsequent calls. */
export async function fetchBulletins() {
  if (cached !== null) return cached;
  if (pending) return pending;

  pending = api.get('/api/bulletins')
    .then((raw) => {
      cached = Array.isArray(raw?.data) ? raw.data
             : Array.isArray(raw)       ? raw
             : [];
      pending = null;
      // Notify all active subscribers that fresh data is available
      listeners.forEach((fn) => fn(cached));
      return cached;
    })
    .catch((err) => {
      // Do NOT cache on auth failures (401/403) — leave cached = null so the
      // next call re-fetches once the user logs in. Only cache [] on genuine
      // server errors (5xx) where retrying immediately won't help.
      const status = err?.response?.status ?? err?.status;
      if (!status || status === 401 || status === 403) {
        cached = null;  // allow re-fetch after login
      } else {
        cached = [];    // 5xx or network error — return empty for now
      }
      pending = null;
      return cached ?? [];
    });

  return pending;
}

/** Drop the cache and re-fetch (call after POST/PATCH/DELETE). */
export async function invalidateBulletins() {
  cached = null;
  pending = null;
  return fetchBulletins();
}

/** Subscribe to cache updates. Returns an unsubscribe function. */
export function subscribeBulletins(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Return the current cached value synchronously (may be null if not yet loaded). */
export function getCachedBulletins() {
  return cached;
}
