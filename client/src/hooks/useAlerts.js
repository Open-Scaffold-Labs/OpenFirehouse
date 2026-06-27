// useAlerts — LIVE per-department alert feed.
//
// The alert engine now lives SERVER-SIDE (GET /api/alerts): the server computes
// alerts from the department's real apparatus/asset/training/shift data and
// applies rank-notification gating + cert-oversight scope. This hook just fetches
// that, so a real department sees ITS data and a brand-new department sees a clean
// empty list (no bundled demo content). Replaces the old static client engine.
//
// Optional `thresholds` (how early to warn) are passed through as query params so
// the NotificationsCenter threshold panel keeps working; the badge/portal omit
// them and get the server defaults.
//
// Returns { alerts, loading, error }. On error it NEVER silently returns an empty
// list as if "all clear" — error is surfaced so callers can show a problem state
// rather than hide a life-safety alert.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../utils/api';

const TTL = 5 * 60 * 1000; // 5 min; also refetched on tab refocus
const cache = new Map();   // requestKey -> { alerts, at }
const inflight = new Map(); // requestKey -> Promise

function buildQuery(thresholds) {
  if (!thresholds) return '';
  const allow = ['certExpiry', 'apparatusService', 'assetInspection', 'shiftMinCrew'];
  const params = new URLSearchParams();
  for (const k of allow) {
    const v = thresholds[k];
    if (v != null && v !== '' && !Number.isNaN(Number(v))) params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function fetchAlerts(reqKey, path) {
  if (inflight.has(reqKey)) return inflight.get(reqKey);
  const p = api.get(`/api/alerts${path}`).then((r) => r?.data?.alerts || []);
  inflight.set(reqKey, p);
  try {
    const alerts = await p;
    cache.set(reqKey, { alerts, at: Date.now() });
    return alerts;
  } finally {
    inflight.delete(reqKey);
  }
}

export function useAlerts(user, thresholds = null) {
  const qs = useMemo(() => buildQuery(thresholds), [thresholds && JSON.stringify(thresholds)]);
  const reqKey = user?.id ? `${user.id}${qs}` : null;

  const freshEntry = reqKey ? cache.get(reqKey) : null;
  const isFresh = freshEntry && Date.now() - freshEntry.at < TTL;
  const [state, setState] = useState(() => ({
    alerts: isFresh ? freshEntry.alerts : [],
    loading: !!reqKey && !isFresh,
    error: false,
  }));

  const load = useCallback(async () => {
    if (!reqKey) { setState({ alerts: [], loading: false, error: false }); return; }
    try {
      const alerts = await fetchAlerts(reqKey, qs);
      setState({ alerts, loading: false, error: false });
    } catch {
      // Keep last-known alerts, flag error — never imply "all clear" on a failure.
      setState((s) => ({ alerts: s.alerts, loading: false, error: true }));
    }
  }, [reqKey, qs]);

  useEffect(() => {
    if (!reqKey) { setState({ alerts: [], loading: false, error: false }); return undefined; }
    const entry = cache.get(reqKey);
    if (entry && Date.now() - entry.at < TTL) {
      setState({ alerts: entry.alerts, loading: false, error: false });
    } else {
      load();
    }
    const onVis = () => { if (!document.hidden) load(); };
    const t = setInterval(() => { if (!document.hidden) load(); }, TTL);
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [reqKey, load]);

  return state; // { alerts, loading, error }
}

// Drop the cache (e.g. after a chief changes notification rules, or on logout).
export function clearAlertsCache() { cache.clear(); inflight.clear(); }
