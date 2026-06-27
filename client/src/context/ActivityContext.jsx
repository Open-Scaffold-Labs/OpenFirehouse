/**
 * ActivityContext — shared today's activity count.
 *
 * Polls /api/activity-entries once on mount and after each save, giving both
 * MyPortal's "Log Activity" button and the full ActivityLogger page a live
 * count of how many entries have been logged today without each component
 * maintaining its own independent fetch.
 *
 * Usage:
 *   const { todayCount, refresh } = useActivity();
 *
 * Call refresh() after a successful save so the count increments everywhere
 * simultaneously without waiting for the next poll.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

// ─── Context ──────────────────────────────────────────────────────────────────

const ActivityContext = createContext(null);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ActivityProvider({ children }) {
  const [todayCount, setTodayCount] = useState(0);
  const [loading,    setLoading]    = useState(true);

  const fetchCount = useCallback(async () => {
    try {
      const today = todayStr();
      const res   = await api.get(`/api/activity-entries?date=${today}`);
      // The endpoint returns { data: [...] } or a plain array
      const arr = Array.isArray(res?.data) ? res.data
                : Array.isArray(res)       ? res
                : [];
      setTodayCount(arr.length);
    } catch {
      // Fail silently — todayCount stays at 0, no disruption to app
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => { fetchCount(); }, [fetchCount]);

  // Re-fetch every 2 minutes in case another browser/device logged an entry
  useEffect(() => {
    const id = setInterval(fetchCount, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchCount]);

  const value = {
    todayCount,
    loading,
    /** Call this immediately after a successful save to bump the count everywhere. */
    refresh: fetchCount,
  };

  return (
    <ActivityContext.Provider value={value}>
      {children}
    </ActivityContext.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useActivity() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error('useActivity must be used inside <ActivityProvider>');
  return ctx;
}
