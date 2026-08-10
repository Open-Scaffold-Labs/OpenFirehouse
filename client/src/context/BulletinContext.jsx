/**
 * BulletinContext — single source of truth for all bulletin data.
 *
 * Fetches /api/bulletins ONCE at the app level and shares the data with every
 * consumer: DailyNotices (The Board), BulletinBoard, NotificationsCenter, and
 * the App-level bell badge.
 *
 * Read state lives in localStorage (per user) and is kept in sync via a shared
 * `readVersion` counter. When ANY component calls `markRead()`, the version bumps,
 * causing ALL consumers to re-render with updated read state simultaneously.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, getStoredUser } from '../utils/api';
import { getReadIds, markRead as persistMarkRead } from '../utils/bulletinReads';
import { localToday, toLocalDay } from '../utils/localDay';

// ─── Context ──────────────────────────────────────────────────────────────────

const BulletinContext = createContext(null);

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Local day, not UTC — see the note in hooks/useBulletinAlerts.js. Deriving both
// sides from toISOString() emptied the "Today's Shift" notices card every evening
// once the UTC date rolled over ahead of the local one.
function isToday(isoStr) {
  if (!isoStr) return false;
  const d = new Date(isoStr);
  return Number.isNaN(d.getTime()) ? false : toLocalDay(d) === localToday();
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BulletinProvider({ children }) {
  const [allBulletins, setAllBulletins] = useState([]);
  const [loading,      setLoading]      = useState(true);
  // Bumped after every markRead so all consumers recalculate unread state together
  const [readVersion,  setReadVersion]  = useState(0);

  const user     = getStoredUser();
  const username = user?.username || 'guest';

  // ── Single fetch ────────────────────────────────────────────────────────
  const fetchBulletins = useCallback(async () => {
    try {
      const raw = await api.get('/api/bulletins');
      const arr = Array.isArray(raw?.data) ? raw.data
                : Array.isArray(raw)       ? raw
                : [];
      setAllBulletins(arr);
    } catch {
      // fail silently — bell count stays 0, no disruption to app
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBulletins(); }, [fetchBulletins]);

  // ── Shared markRead — updates localStorage + triggers re-render everywhere ─
  const markRead = useCallback((id) => {
    persistMarkRead(username, id);
    setReadVersion((v) => v + 1);
  }, [username]);

  // ── Derived data — recalculated whenever bulletins or readVersion change ──
  // readVersion >= 0 is always true; referencing it forces React to re-run this
  const readIds = readVersion >= 0 ? getReadIds(username) : new Set();

  const dailyNotices     = allBulletins.filter((b) => b.category === 'Daily Notice' && isToday(b.created_at));
  const regularBulletins = allBulletins.filter((b) => b.category !== 'Daily Notice');

  const unreadDaily      = dailyNotices.filter((b)     => !readIds.has(String(b.id)));
  const unreadBulletin   = regularBulletins.filter((b) => !readIds.has(String(b.id)));
  const unreadCount      = unreadDaily.length + unreadBulletin.length;

  const isRead = (id) => readIds.has(String(id));

  const value = {
    loading,
    allBulletins,
    dailyNotices,
    regularBulletins,
    unreadDaily,
    unreadBulletin,
    unreadCount,
    isRead,
    markRead,
    refresh: fetchBulletins,
    // Pass through raw bulletin list sorted for BulletinBoard
    sortedBulletins: [...allBulletins].sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
      return new Date(b.created_at) - new Date(a.created_at);
    }),
  };

  return (
    <BulletinContext.Provider value={value}>
      {children}
    </BulletinContext.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useBulletins() {
  const ctx = useContext(BulletinContext);
  if (!ctx) throw new Error('useBulletins must be used inside <BulletinProvider>');
  return ctx;
}
