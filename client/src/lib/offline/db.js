// lib/offline/db.js — the device's durable store for offline field ops (Phase 3.6, Slice B1).
//
// Raw IndexedDB on purpose. No idb/dexie wrapper: this file is the ONE place an
// inspector's day physically lives, and a life-safety store should not depend on a
// library's upgrade semantics. Everything here is plain, boring, Safari/iOS-safe API —
// open/onupgradeneeded, objectStore, put/get/delete/getAll. Nothing exotic.
//
// FOUR STORES, each with a different job:
//   cache  (key)      — the pre-downloaded day, the department's legal text blocks, the
//                       code library/checklists, and the per-inspection working state.
//                       READ-ONLY MIRROR of the server plus our own optimistic overlay.
//   outbox (clientId) — syncCore entries. The append-only mutation log. THE record of
//                       work not yet on the server. Nothing is ever dropped from here
//                       except by an explicit server ack (or a human recovering a
//                       rejection).
//   photos (id)       — evidence photo blobs, written AT CAPTURE (R11). The outbox holds
//                       a REFERENCE (photo id), never the bytes, so a 4 MB photo does not
//                       ride every read of the queue.
//   meta   (key)      — lastSyncedAt, dayFetchedAt, persistGranted, the cross-tab drain
//                       lease.
//
// (R1) iOS EVICTS non-persistent IndexedDB under storage pressure. That is the single
// weakest link in the whole PWA: an eviction takes the inspector's entire day. So we ASK
// for persistence on init, we RECORD the answer, and the UI must be able to say out loud
// that the browser may clear this work. We do not get to be quiet about it.
// (R2) Photos are big. estimateStorage() exists so capture can be refused BEFORE a write
// fails, with an honest message — never after, with lost evidence.

const DB_NAME = 'of-fi-offline';
const DB_VERSION = 1;

export const CACHE = 'cache';
export const OUTBOX = 'outbox';
export const PHOTOS = 'photos';
export const META = 'meta';

const KEYPATHS = { [CACHE]: 'key', [OUTBOX]: 'clientId', [PHOTOS]: 'id', [META]: 'key' };

let _dbPromise = null;

/** Open (and if needed create) the database. Memoized — one connection per tab. */
export function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    // Safari in private browsing has historically thrown on access rather than
    // returning null. Treat "no IndexedDB" as a hard, SURFACEABLE failure — the
    // caller must not carry on believing the work is saved.
    let req;
    try {
      if (!('indexedDB' in globalThis) || !globalThis.indexedDB) {
        throw new Error('This browser has no offline storage available.');
      }
      req = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(new Error(`Offline storage is unavailable in this browser — ${e.message}`));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of Object.entries(KEYPATHS)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open offline storage.'));
    req.onblocked = () => reject(new Error('Offline storage is blocked by another tab — close the other tab and reload.'));
  });
  // A failed open must not be cached as a permanent verdict; a reload may well work.
  _dbPromise.catch(() => { _dbPromise = null; });
  return _dbPromise;
}

function run(store, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.onabort = () => reject(t.error || new Error('Offline write aborted.'));
    // A QuotaExceededError lands here. It MUST reject loudly — a silently swallowed
    // write is a lost violation (R2).
    t.onerror = () => reject(t.error || new Error('Offline storage error.'));
    t.oncomplete = () => resolve(req ? req.result : undefined);
  }));
}

export const idbGet = (store, key) => run(store, 'readonly', (s) => s.get(key));
export const idbAll = (store) => run(store, 'readonly', (s) => s.getAll()).then((r) => r || []);
export const idbPut = (store, value) => run(store, 'readwrite', (s) => s.put(value));
export const idbDel = (store, key) => run(store, 'readwrite', (s) => s.delete(key));

/** cache/meta rows are {key, value, at} envelopes so every cached surface can date itself (R12). */
export async function cacheGet(key) {
  const row = await idbGet(CACHE, key);
  return row ? row.value : undefined;
}
export const cachePut = (key, value) => idbPut(CACHE, { key, value, at: Date.now() });
export const cacheDel = (key) => idbDel(CACHE, key);

export async function metaGet(key) {
  const row = await idbGet(META, key);
  return row ? row.value : undefined;
}
export const metaPut = (key, value) => idbPut(META, { key, value, at: Date.now() });

// ── photos ───────────────────────────────────────────────────────────────────
// Keyed by `${violationId}:${uuid}` so a violation's evidence is addressable without an
// index, and so the key is stable across a reload (R11).
export const photoPut = (id, record) => idbPut(PHOTOS, { id, ...record });
export const photoGet = (id) => idbGet(PHOTOS, id);
export const photoDel = (id) => idbDel(PHOTOS, id);
export const photoAll = () => idbAll(PHOTOS);

// ── storage posture (R1 + R2) ────────────────────────────────────────────────

/**
 * (R1) Ask the browser to keep this origin's storage. The ANSWER is what matters: a
 * denial means iOS may clear the inspector's day under pressure, and the UI has to say
 * so. Never assume; never stay quiet.
 */
export async function requestPersistence() {
  let granted = false;
  try {
    if (navigator.storage?.persisted) granted = await navigator.storage.persisted();
    if (!granted && navigator.storage?.persist) granted = await navigator.storage.persist();
  } catch { granted = false; }
  try { await metaPut('persistGranted', granted); } catch { /* the answer is advisory; a failed note is not */ }
  return granted;
}

/** (R2) Pre-flight for a photo capture: refuse BEFORE the write fails, never after. */
export async function estimateStorage() {
  try {
    if (!navigator.storage?.estimate) return { usage: null, quota: null, remaining: null };
    const { usage = null, quota = null } = await navigator.storage.estimate();
    const remaining = usage != null && quota != null ? Math.max(0, quota - usage) : null;
    return { usage, quota, remaining };
  } catch {
    return { usage: null, quota: null, remaining: null };
  }
}

/** Init: open, request persistence, report the storage posture. Called once by useOffline. */
export async function initOfflineDb() {
  await openDb();
  const persisted = await requestPersistence();
  const { usage, quota, remaining } = await estimateStorage();
  return { persisted, usage, quota, remaining };
}
