/**
 * offlineQueue
 *
 * A localStorage-backed queue for API writes that failed due to being offline.
 * Each entry: { id, method, url, body, timestamp, label, attempts }
 *
 * W4.4 hardening (roadmap 3.4, 2026-06-10) — the old queue had "no endpoint
 * validation, queues invalid requests forever":
 *  - push() validates method + url shape; unknown requests are rejected
 *    (returns false + warns), not silently queued.
 *  - flushQueue() drops entries the server rejects as permanently invalid
 *    (4xx except 401/408/429) instead of retrying them forever, and expires
 *    entries older than 72h or past 10 attempts. Transient failures
 *    (network, 5xx, auth) stay queued.
 *
 * Usage:
 *   offlineQueue.push({ method: 'POST', url: '/api/incidents', body: {...}, label: 'Incident 26-0012' })
 *   offlineQueue.getAll()   → array of queued items
 *   offlineQueue.remove(id) → removes one item
 *   offlineQueue.clear()    → removes all
 */

const KEY = 'openfirehouse_offline_queue';

const MAX_AGE_MS = 72 * 60 * 60 * 1000; // 72h — older than a duty cycle is stale
const MAX_ATTEMPTS = 10;

// Write endpoints that are legitimate to replay later. Anything else is a
// programming error or junk — reject at push time, don't queue forever.
const ALLOWED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOWED_URL = /^\/api\/[a-z0-9\-_/]+$/i;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

function save(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); }
  catch { /* storage full — fail silently */ }
}

export const offlineQueue = {
  /** @returns {boolean} true if queued, false if rejected as invalid */
  push(entry) {
    const method = String(entry?.method || '').toUpperCase();
    const url = String(entry?.url || '');
    if (!ALLOWED_METHODS.has(method) || !ALLOWED_URL.test(url.split('?')[0])) {
      console.warn('[offlineQueue] rejected invalid entry:', method, url);
      return false;
    }
    const items = load();
    items.push({
      id: `oq-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      attempts: 0,
      ...entry,
      method,
    });
    save(items);
    return true;
  },
  getAll() { return load(); },
  remove(id) { save(load().filter((e) => e.id !== id)); },
  clear() { save([]); },
  count() { return load().length; },
};

/** True when a replay error means the request will NEVER succeed (drop it).
 * 401 (re-auth), 408 (timeout), 429 (throttle) and all 5xx are transient. */
function isPermanentRejection(err) {
  const s = Number(err?.status);
  return s >= 400 && s < 500 && s !== 401 && s !== 408 && s !== 429;
}

/**
 * flushQueue
 * Attempt to replay all queued requests via the api util.
 * Returns { replayed, failed, dropped, droppedLabels } — dropped = expired or
 * permanently-rejected entries removed from the queue.
 */
export async function flushQueue(apiFn) {
  const items = offlineQueue.getAll();
  if (!items.length) return { replayed: 0, failed: 0, dropped: 0, droppedLabels: [] };

  let replayed = 0, failed = 0;
  const droppedLabels = [];
  const now = Date.now();

  for (const item of items) {
    // Expire stale / repeatedly-failing entries
    if (now - (item.timestamp || 0) > MAX_AGE_MS || (item.attempts || 0) >= MAX_ATTEMPTS) {
      offlineQueue.remove(item.id);
      droppedLabels.push(item.label || item.url);
      continue;
    }
    try {
      if (item.method === 'POST') await apiFn.post(item.url, item.body);
      else if (item.method === 'PUT') await apiFn.put(item.url, item.body);
      else if (item.method === 'PATCH') await apiFn.patch(item.url, item.body);
      else if (item.method === 'DELETE') await apiFn.delete(item.url);
      offlineQueue.remove(item.id);
      replayed++;
    } catch (err) {
      if (isPermanentRejection(err)) {
        // The server understood the request and said no — retrying forever
        // can't fix it. Drop it and surface it.
        offlineQueue.remove(item.id);
        droppedLabels.push(item.label || item.url);
      } else {
        // Transient (offline again, 5xx, expired session) — keep, count the attempt
        const all = load();
        const idx = all.findIndex((e) => e.id === item.id);
        if (idx >= 0) { all[idx].attempts = (all[idx].attempts || 0) + 1; save(all); }
        failed++;
      }
    }
  }
  return { replayed, failed, dropped: droppedLabels.length, droppedLabels };
}
