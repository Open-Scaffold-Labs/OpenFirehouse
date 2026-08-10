// lib/offline/useOffline.js — the ONE entry point the UI uses for offline field ops
// (Phase 3.6, Slice B2/B3). The drain loop, the outbox, the day cache, the storage
// posture — all of it behind one hook.
//
// The brain is syncCore.js and it is NOT reimplemented here: makeEntry / collapseOutbox /
// drainBatch / drainPhotos / applyResults / applyTransportFailure / syncSummary decide
// everything. This file is only the plumbing they refused to own — IndexedDB, fetch, and
// when to run.
//
// ── WHY NOT THE BACKGROUND SYNC API ──────────────────────────────────────────
// Safari has no SyncManager, and the fleet is iPads. A sync built on `registration.sync`
// is a sync that never runs for our users — and worse, one nobody notices is not running.
// So the MECHANISM is a foreground drain (app start · 'online' · visibilitychange · a 60s
// interval while online). Background Sync is registered ONLY behind feature detection, as
// a bonus on the browsers that have it, and nothing depends on it.
//
// ── WHY THE OUTBOX IS COLLAPSED ON EVERY WRITE ───────────────────────────────
// drainBatch() collapses redundant full-replace ops (40 checklist taps = 1 answers.put
// worth sending). If we sent the collapsed batch but KEPT the superseded entries in the
// store, the next drain would find them, treat the newest survivor as "the last one", and
// replay a STALE checklist over the server's fresh one. So the collapse is applied at the
// STORAGE boundary: a superseded replace entry is physically removed, and the pending
// count the inspector reads stays honest.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken } from '../../utils/api';
import { localToday } from '../../components/prevention/fiApi';
import {
  makeEntry, collapseOutbox, drainBatch, drainPhotos,
  applyResults, applyTransportFailure, syncSummary,
} from './syncCore';
import {
  OUTBOX, idbAll, idbPut, idbDel,
  cacheGet, cachePut, metaGet, metaPut,
  photoPut, photoGet, photoDel, photoAll,
  estimateStorage, initOfflineDb,
} from './db';

const DAY_KEY = 'day';
const DEPT_KEY = 'department';
const DRAIN_LEASE_MS = 60_000;   // (R14) a crashed tab must not hold the lock forever
const DAY_STALE_MS = 15 * 60_000; // refresh the pre-download when it's this old and we have signal
const DRAIN_INTERVAL_MS = 60_000; // modest, and ONLY while online

/** In-tab guard. The cross-TAB half of R14 is the Web Lock / meta lease below. */
let drainInFlight = false;

/**
 * (R14) SINGLE DRAIN, EVER — even with two tabs open. Two concurrent drains would send the
 * same clientIds twice; the server's idempotency ledger would answer `duplicate` and no
 * legal record would double, but both tabs would then race the same IndexedDB rows and one
 * would resurrect entries the other had just acked. Web Locks where available (Chrome,
 * Safari 15.4+), a timestamp lease in `meta` everywhere else.
 */
async function withDrainLock(fn) {
  if (drainInFlight) return;
  drainInFlight = true;
  try {
    if (navigator.locks?.request) {
      await navigator.locks.request('of-fi-drain', { ifAvailable: true }, async (lock) => {
        if (!lock) return; // another tab is draining — its results land in our store anyway
        await fn();
      });
      return;
    }
    const lease = (await metaGet('drainLease')) || 0;
    if (Date.now() - lease < DRAIN_LEASE_MS) return;
    await metaPut('drainLease', Date.now());
    try { await fn(); } finally { await metaPut('drainLease', 0); }
  } finally {
    drainInFlight = false;
  }
}

/** The wire shape /api/fi-sync/batch expects. clientRecordedAt is METADATA — never a record time. */
const toOp = (e) => ({
  clientId: e.clientId,
  op: e.op,
  inspectionId: e.inspectionId ?? null,
  payload: e.payload ?? {},
  clientRecordedAt: e.clientRecordedAt,
});

export function useOffline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [entries, setEntries] = useState([]);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [storage, setStorage] = useState({ persisted: null, usage: null, quota: null, remaining: null, error: null });
  const [day, setDay] = useState(null);
  const [dayFetchedAt, setDayFetchedAt] = useState(null);
  const [department, setDepartment] = useState(null);
  const [now, setNow] = useState(() => Date.now()); // re-derives "retrying in…" and "synced N ago"

  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const mounted = useRef(true);
  // Serializes every outbox mutation in this tab (the cross-TAB half of R14 is the lock).
  const chainRef = useRef(Promise.resolve());

  /**
   * The ONE write path to the outbox store — a serialized read-modify-write.
   *
   * It re-reads the store INSIDE the mutation and hands the fresh rows to `fn`. That is not
   * fussiness: a naive "write back the array I snapshotted at the start of the drain" loses
   * every tap the inspector made WHILE the drain was in flight — the drain would resurrect
   * the entry it just sent and delete the newer one that superseded it. An inspector's
   * answer disappearing because they tapped during a sync is exactly the class of bug this
   * whole slice exists to eliminate.
   *
   * It also collapses (see the header) and deletes a photo's blob with its entry — the
   * entry is the only thing that knows the bytes are still owed to the server (R11).
   */
  const mutateOutbox = useCallback((fn) => {
    chainRef.current = chainRef.current.then(async () => {
      const stored = await idbAll(OUTBOX);
      const next = collapseOutbox(fn(stored) || []);
      const keep = new Set(next.map((e) => e.clientId));
      for (const e of stored) {
        if (keep.has(e.clientId)) continue;
        await idbDel(OUTBOX, e.clientId);
        if (e.op === 'photo.upload' && e.payload?.photoId) {
          // Gone because the server took it (or a human recovered it). Either way the bytes
          // are no longer owed, and holding them wastes the quota the NEXT photo needs (R2).
          await photoDel(e.payload.photoId).catch(() => {});
        }
      }
      for (const e of next) await idbPut(OUTBOX, e);
      entriesRef.current = next;
      if (mounted.current) setEntries(next);
      return next;
    });
    return chainRef.current;
  }, []);

  const stampSynced = useCallback(async (iso) => {
    const stamp = iso || new Date().toISOString();
    await metaPut('lastSyncedAt', stamp);
    if (mounted.current) setLastSyncedAt(stamp);
  }, []);

  // ── the drain ──────────────────────────────────────────────────────────────
  const syncNow = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    await withDrainLock(async () => {
      let current = collapseOutbox(await idbAll(OUTBOX));

      // ── JSON ops first ──────────────────────────────────────────────────────
      // Deliberately before photos: api.post() refreshes an expired access token on a 401
      // and retries, so by the time the multipart uploads run the Bearer is fresh. (R3 —
      // the outbox NEVER discards a write because a token died in a basement.)
      for (let round = 0; round < 6; round += 1) {   // (R6) bounded: never a runaway loop
        const batch = drainBatch(current);
        if (!batch.length) break;
        try {
          const res = await api.post('/api/fi-sync/batch', { ops: batch.map(toOp) });
          // (R4) PER-ITEM. Successes are dropped, rejections are KEPT and flagged, and
          // anything the server said nothing about is left exactly as it was.
          current = await mutateOutbox((stored) => applyResults(stored, res.results || []).entries);
          await stampSynced(res.serverTime);
        } catch (e) {
          // The WHOLE call failed — offline, 5xx, DNS, a dead session. Nothing is lost;
          // everything we tried to send backs off and stays queued (R3).
          current = await mutateOutbox((stored) => applyTransportFailure(batch, stored,
            { message: e?.message || 'No connection — still saved on this device' }));
          return; // no point hammering the photo endpoint through the same dead pipe
        }
      }

      // ── photos: same outbox, different door (multipart) ─────────────────────
      for (let round = 0; round < 4; round += 1) {
        const shots = drainPhotos(current, { limit: 2 });
        if (!shots.length) break;
        for (const entry of shots) {
          const rec = await photoGet(entry.payload?.photoId);
          if (!rec?.blob) {
            // The bytes are gone (an eviction, a cleared store). We cannot upload what we do
            // not have, and a permanently-stuck entry would make the unsynced count a lie.
            // Say what happened, out loud, while the inspector can still retake the shot.
            current = await mutateOutbox((stored) => applyResults(stored, [{
              clientId: entry.clientId, status: 'rejected', code: 'PHOTO_BYTES_MISSING',
              message: 'The photo file is no longer on this device — the browser may have cleared it. Retake it.',
            }]).entries);
            continue;
          }
          const fd = new FormData();
          fd.append('file', rec.blob, rec.name || 'evidence.jpg');
          fd.append('violationId', String(entry.payload.violationId ?? ''));
          let res;
          try {
            res = await fetch(`/api/fi-inspections/${entry.inspectionId}/photos`, {
              method: 'POST',
              credentials: 'include',
              headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
              body: fd,
            });
          } catch (e) {
            current = await mutateOutbox((stored) => applyTransportFailure([entry], stored,
              { message: e?.message || 'No connection — the photo is still on this device' }));
            return;
          }
          if (res.ok) {
            current = await mutateOutbox((stored) => applyResults(stored,
              [{ clientId: entry.clientId, status: 'applied' }]).entries);
            await stampSynced();
            continue;
          }
          // (R3) 401/408/429/5xx are NOT the officer's fault and NOT terminal — keep the work
          // and back off. Any other 4xx is the server applying a RULE to this photo (too big,
          // wrong type, no such violation): terminal, shown, and the bytes are preserved.
          const retryable = res.status === 401 || res.status === 408 || res.status === 429 || res.status >= 500;
          if (retryable) {
            current = await mutateOutbox((stored) => applyTransportFailure([entry], stored,
              { message: `The photo could not be uploaded yet (${res.status}) — it is still saved on this device.` }));
            return;
          }
          let msg = `The server refused this photo (${res.status}).`;
          try { msg = (await res.json()).error || msg; } catch { /* the status line will do */ }
          current = await mutateOutbox((stored) => applyResults(stored, [{
            clientId: entry.clientId, status: 'rejected', code: 'PHOTO_REJECTED', message: msg,
          }]).entries);
        }
      }
    });

    // Work arrived while we held the lock (the inspector kept tapping) — come back for it
    // rather than making them wait for the 60s tick while the header says "Syncing…".
    const left = entriesRef.current || [];
    if (drainBatch(left).length || drainPhotos(left).length) {
      if (navigator.onLine !== false && !drainInFlight) setTimeout(() => { syncNowRef.current?.(); }, 750);
    }
  }, [mutateOutbox, stampSynced]);
  const syncNowRef = useRef(syncNow);
  syncNowRef.current = syncNow;

  // ── enqueue (optimistic: returns immediately, drains in the background) ─────
  const enqueue = useCallback(async (op, inspectionId, payload) => {
    const entry = makeEntry(op, inspectionId ?? null, payload ?? {});
    await mutateOutbox((stored) => [...stored, entry]);
    if (typeof navigator === 'undefined' || navigator.onLine !== false) syncNow().catch(() => {});
    return entry;
  }, [syncNow, mutateOutbox]);

  /**
   * (R11 + R2) A photo is written to IndexedDB AT CAPTURE, and only a reference rides the
   * outbox. Before we take the bytes we check the quota and refuse HONESTLY if there is no
   * room — a capture that fails silently mid-walk is lost evidence, and the inspector
   * finds out at the hearing.
   */
  const enqueuePhoto = useCallback(async (inspectionId, violationId, file) => {
    const { remaining } = await estimateStorage();
    if (remaining != null && file.size != null && remaining < file.size * 2) {
      throw new Error(
        'This device is nearly out of storage — the photo was NOT saved. Sync what you have (you need signal), then take it again.',
      );
    }
    const id = `${violationId}:${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
    await photoPut(id, {
      violationId: String(violationId), inspectionId, blob: file,
      name: file.name || 'evidence.jpg', type: file.type || 'image/jpeg',
      size: file.size ?? null, capturedAt: new Date().toISOString(),
    });
    await enqueue('photo.upload', inspectionId, { photoId: id, violationId: String(violationId) });
    return id;
  }, [enqueue]);

  /** The photos still on this device for a violation (captured, not yet on the server). */
  const photosFor = useCallback(async (violationId) => {
    const all = await photoAll();
    return all.filter((p) => String(p.violationId) === String(violationId));
  }, []);

  // ── the day pre-download ───────────────────────────────────────────────────
  const downloadDay = useCallback(async () => {
    // (R10) the CLIENT supplies the local calendar day. toISOString() is UTC and would
    // ask for tomorrow's queue after ~8pm Eastern.
    const res = await api.get(`/api/fi-sync/day?today=${encodeURIComponent(localToday())}`);
    const payload = res.data;
    await cachePut(DAY_KEY, payload);
    const stamp = payload?.serverTime || new Date().toISOString();
    await metaPut('dayFetchedAt', stamp);
    // The department's NAME is the letterhead of a notice rendered on device, and the day
    // payload doesn't carry it. Best-effort: a missing name must never block the download.
    try {
      const dep = await api.get('/api/departments/me');
      if (dep?.data) { await cachePut(DEPT_KEY, dep.data); if (mounted.current) setDepartment(dep.data); }
    } catch { /* the notice falls back to 'Fire Department', exactly as the server's does */ }
    if (mounted.current) { setDay(payload); setDayFetchedAt(stamp); }
    return payload;
  }, []);

  // ── boot ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const posture = await initOfflineDb();          // (R1) persist() + (R2) estimate()
        if (mounted.current) setStorage({ ...posture, error: null });
      } catch (e) {
        // No IndexedDB = no offline promise. We must not pretend otherwise.
        if (mounted.current) {
          setStorage((s) => ({ ...s, error: e.message || 'Offline storage is unavailable in this browser.' }));
        }
        return;
      }
      const [stored, ls, cachedDay, fetchedAt, dept] = await Promise.all([
        idbAll(OUTBOX), metaGet('lastSyncedAt'), cacheGet(DAY_KEY), metaGet('dayFetchedAt'), cacheGet(DEPT_KEY),
      ]);
      if (!mounted.current) return;
      const collapsed = collapseOutbox(stored || []);
      setEntries(collapsed);
      entriesRef.current = collapsed;
      setLastSyncedAt(ls || null);
      setDay(cachedDay || null);
      setDayFetchedAt(fetchedAt || null);
      setDepartment(dept || null);

      if (navigator.onLine !== false) {
        syncNow().catch(() => {});
        // Refresh the pre-download when it's stale, so a walk that starts at the firehouse
        // carries TODAY's queue, codes, checklists and legal text into the basement (R12).
        const age = fetchedAt ? Date.now() - new Date(fetchedAt).getTime() : Infinity;
        if (age > DAY_STALE_MS) downloadDay().catch(() => {});
      }
    })();
    return () => { mounted.current = false; };
  }, [syncNow, downloadDay]);

  // ── drain triggers ─────────────────────────────────────────────────────────
  useEffect(() => {
    const goOnline = () => { setOnline(true); syncNow().catch(() => {}); };
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      setNow(Date.now());
      if (!document.hidden && navigator.onLine !== false) syncNow().catch(() => {});
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);

    const timer = setInterval(() => {
      setNow(Date.now());
      if (!document.hidden && navigator.onLine !== false) syncNow().catch(() => {});
    }, DRAIN_INTERVAL_MS);

    // BONUS ONLY, never the mechanism (see the header). If a browser happens to have
    // Background Sync it gets a nudge after a tab close; Safari doesn't and loses nothing.
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready
        .then((reg) => reg.sync?.register('of-fi-drain'))
        .catch(() => {});
    }

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [syncNow]);

  // (R9) The status the header shows is syncCore's, verbatim. It is TRUE by construction:
  // it never says "saved" while work is queued, and it never claims a retry we don't run.
  const summary = useMemo(
    // (B6) storage.error must reach the label — an empty outbox because the STORE IS
    // DEAD must never read as "All changes saved".
    () => syncSummary(entries, { online, lastSyncedAt, now, storageError: storage?.error ?? null }),
    [entries, online, lastSyncedAt, now, storage?.error],
  );

  const rejected = useMemo(() => entries.filter((e) => e.status === 'rejected'), [entries]);
  const pending = useMemo(() => entries.filter((e) => e.status !== 'rejected'), [entries]);

  /** A human dealt with a rejection (copied the work out, redid it). ONLY a human clears these. */
  const dismissRejected = useCallback(async (clientId) => {
    await mutateOutbox((stored) => stored.filter((e) => e.clientId !== clientId));
  }, [mutateOutbox]);

  return {
    online, summary, pending, rejected, lastSyncedAt,
    syncNow, enqueue, enqueuePhoto, photosFor, dismissRejected,
    downloadDay, day, dayFetchedAt, department, storage,
  };
}

export default useOffline;
