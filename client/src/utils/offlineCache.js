/**
 * offlineCache.js — IndexedDB offline data cache for rig/field use
 *
 * Caches critical data locally so crews can access it when cellular drops:
 *  - Active incident (current incident from Command Board)
 *  - Pre-incident plans (all plans for the jurisdiction)
 *  - Hydrants (all hydrants with flow data)
 *  - Knox Boxes (all boxes with contents/access info)
 *  - Pending actions queue (status changes made offline, synced on reconnect)
 *
 * Uses IndexedDB via a thin async wrapper. Falls back gracefully if
 * IndexedDB is unavailable (private browsing on some devices).
 */

const DB_NAME = 'openfirehouse-offline';
const DB_VERSION = 1;

const STORES = {
  incidents:  'incidents',
  preplans:   'preplans',
  hydrants:   'hydrants',
  knox:       'knox',
  pendingActions: 'pendingActions',
  meta:       'meta',
};

// ─── Open / Init DB ──────────────────────────────────────────────────────────

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn('IndexedDB not available — offline cache disabled');
      return resolve(null);
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.incidents))
        db.createObjectStore(STORES.incidents, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.preplans))
        db.createObjectStore(STORES.preplans, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.hydrants))
        db.createObjectStore(STORES.hydrants, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.knox))
        db.createObjectStore(STORES.knox, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.pendingActions))
        db.createObjectStore(STORES.pendingActions, { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains(STORES.meta))
        db.createObjectStore(STORES.meta, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { console.warn('IndexedDB open failed'); resolve(null); };
  });
  return dbPromise;
}

// ─── Generic CRUD helpers ────────────────────────────────────────────────────

async function putAll(storeName, items) {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    items.forEach(item => store.put(item));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getAll(storeName) {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function put(storeName, item) {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function get(storeName, key) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function clearStore(storeName) {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => resolve();
  });
}

async function deleteItem(storeName, key) {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => resolve();
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const offlineCache = {
  // ── Incidents ──
  async cacheIncident(incident) {
    if (!incident) return;
    const item = { ...incident, id: incident.id || 'active', _cachedAt: Date.now() };
    await put(STORES.incidents, item);
  },
  async getActiveIncident() {
    return get(STORES.incidents, 'active');
  },
  async clearIncidents() {
    return clearStore(STORES.incidents);
  },

  // ── Pre-Plans ──
  async cachePrePlans(plans) {
    await clearStore(STORES.preplans);
    await putAll(STORES.preplans, plans.map((p, i) => ({ ...p, id: p.id || `pp-${i}` })));
    await put(STORES.meta, { key: 'preplans_cached', time: Date.now(), count: plans.length });
  },
  async getPrePlans() {
    return getAll(STORES.preplans);
  },
  async getPrePlansCacheTime() {
    const m = await get(STORES.meta, 'preplans_cached');
    return m?.time || null;
  },

  // ── Hydrants ──
  async cacheHydrants(hydrants) {
    await clearStore(STORES.hydrants);
    await putAll(STORES.hydrants, hydrants.map((h, i) => ({ ...h, id: h.id || `h-${i}` })));
    await put(STORES.meta, { key: 'hydrants_cached', time: Date.now(), count: hydrants.length });
  },
  async getHydrants() {
    return getAll(STORES.hydrants);
  },
  async getHydrantsCacheTime() {
    const m = await get(STORES.meta, 'hydrants_cached');
    return m?.time || null;
  },

  // ── Knox Boxes ──
  async cacheKnoxBoxes(boxes) {
    await clearStore(STORES.knox);
    await putAll(STORES.knox, boxes.map((k, i) => ({ ...k, id: k.id || `k-${i}` })));
    await put(STORES.meta, { key: 'knox_cached', time: Date.now(), count: boxes.length });
  },
  async getKnoxBoxes() {
    return getAll(STORES.knox);
  },

  // ── Pending Actions (offline queue) ──
  async queueAction(action) {
    // action: { type: 'unit_status' | 'note' | ..., payload: {...}, queuedAt: ISO }
    await put(STORES.pendingActions, { ...action, id: Date.now(), queuedAt: new Date().toISOString() });
  },
  async getPendingActions() {
    return getAll(STORES.pendingActions);
  },
  async clearAction(id) {
    return deleteItem(STORES.pendingActions, id);
  },
  async clearAllActions() {
    return clearStore(STORES.pendingActions);
  },

  // ── Sync: flush pending actions to server ──
  async syncPendingActions(apiPost) {
    const actions = await getAll(STORES.pendingActions);
    if (!actions.length) return { synced: 0, failed: 0 };
    let synced = 0, failed = 0;
    for (const action of actions) {
      try {
        await apiPost(action.endpoint, action.payload);
        await deleteItem(STORES.pendingActions, action.id);
        synced++;
      } catch (e) {
        failed++;
        console.warn('Sync failed for action:', action, e);
      }
    }
    return { synced, failed };
  },

  // ── Bulk prefetch: cache everything for offline use ──
  async prefetchAll(api) {
    const results = { preplans: 0, hydrants: 0, knox: 0, errors: [] };
    try {
      const pp = await api.get('/api/pre-plans');
      const plans = pp.data || pp || [];
      await this.cachePrePlans(plans);
      results.preplans = plans.length;
    } catch (e) { results.errors.push('pre-plans: ' + e.message); }

    try {
      const hy = await api.get('/api/hydrants');
      const hydrants = hy.data || hy || [];
      await this.cacheHydrants(hydrants);
      results.hydrants = hydrants.length;
    } catch (e) { results.errors.push('hydrants: ' + e.message); }

    try {
      const kn = await api.get('/api/knox-keys');
      const boxes = kn.data || kn || [];
      await this.cacheKnoxBoxes(boxes);
      results.knox = boxes.length;
    } catch (e) { results.errors.push('knox: ' + e.message); }

    await put(STORES.meta, { key: 'last_prefetch', time: Date.now(), results });
    return results;
  },

  // ── Status ──
  async getCacheStatus() {
    const pp = await get(STORES.meta, 'preplans_cached');
    const hy = await get(STORES.meta, 'hydrants_cached');
    const kn = await get(STORES.meta, 'knox_cached');
    const lp = await get(STORES.meta, 'last_prefetch');
    const pending = await getAll(STORES.pendingActions);
    return {
      preplans: pp ? { count: pp.count, time: pp.time } : null,
      hydrants: hy ? { count: hy.count, time: hy.time } : null,
      knox: kn ? { count: kn.count, time: kn.time } : null,
      lastPrefetch: lp?.time || null,
      pendingActions: pending.length,
    };
  },
};
