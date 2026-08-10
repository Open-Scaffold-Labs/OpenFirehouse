/**
 * useBulletinAlerts — bulletin data + unread tracking for any component.
 *
 * Uses bulletinCache.js (single shared fetch) and listens for 'bulletin:read'
 * CustomEvents dispatched by bulletinReads.js. This means:
 *   - Only ONE network request fires across App, NotificationsCenter, DailyNotices
 *   - Marking a bulletin read in ANY component immediately updates ALL components
 */

import { useState, useEffect, useCallback } from 'react';
import { getStoredUser } from '../utils/api';
import { getReadIds, markRead as persistMarkRead } from '../utils/bulletinReads';
import { localToday, toLocalDay } from '../utils/localDay';
import { fetchBulletins, subscribeBulletins, invalidateBulletins, getCachedBulletins } from '../utils/bulletinCache';

// A Daily Notice belongs to the LOCAL day it was posted on, and "today's shift"
// is a local day. Both sides used to be derived from UTC: `created_at.split('T')`
// is the UTC date of the post, compared against the UTC date now. Those agree
// most of the day and diverge in the evening — in America/New_York, from 20:00
// EDT the UTC date rolls to tomorrow, so every notice posted earlier that same
// local day stopped matching and the "Today's Shift" card silently emptied out
// for the last four hours of every day. Convert the instant to a local day first.
function isToday(isoStr) {
  if (!isoStr) return false;
  const d = new Date(isoStr);
  return Number.isNaN(d.getTime()) ? false : toLocalDay(d) === localToday();
}

export function useBulletinAlerts() {
  const user     = getStoredUser();
  const username = user?.username || 'guest';

  // Hydrate from cache immediately if already loaded (avoids loading flash on 2nd+ consumer)
  const [allBulletins, setAllBulletins] = useState(() => getCachedBulletins() ?? []);
  const [loading,     setLoading]     = useState(true);
  // Bumped when 'bulletin:read' fires — forces recalculation of unread sets
  const [readVersion, setReadVersion] = useState(0);

  // ── Fetch (via cache — only one real request fires across all instances) ──
  useEffect(() => {
    let mounted = true;

    fetchBulletins().then((data) => {
      if (mounted) { setAllBulletins(data); setLoading(false); }
    });

    // Subscribe to future cache invalidations (e.g. after posting a new bulletin)
    const unsub = subscribeBulletins((data) => {
      if (mounted) setAllBulletins(data);
    });

    return () => { mounted = false; unsub(); };
  }, []);

  // ── Listen for read events from any component ──────────────────────────────
  useEffect(() => {
    const handler = () => setReadVersion((v) => v + 1);
    window.addEventListener('bulletin:read', handler);
    return () => window.removeEventListener('bulletin:read', handler);
  }, []);

  // ── markRead — persists to localStorage + fires CustomEvent (syncs all) ──
  const markRead = useCallback((id) => {
    persistMarkRead(username, id); // also dispatches 'bulletin:read'
  }, [username]);

  // ── Derived data — recalculated when bulletins or readVersion change ───────
  const readIds = readVersion >= 0 ? getReadIds(username) : new Set();

  const dailyNotices     = allBulletins.filter((b) => b.category === 'Daily Notice' && isToday(b.created_at));
  const regularBulletins = allBulletins.filter((b) => b.category !== 'Daily Notice');

  const unreadDaily    = dailyNotices.filter((b)     => !readIds.has(String(b.id)));
  const unreadBulletin = regularBulletins.filter((b) => !readIds.has(String(b.id)));

  return {
    loading,
    allBulletins,
    dailyNotices,
    regularBulletins,
    unreadDaily,
    unreadBulletin,
    unreadCount: unreadDaily.length + unreadBulletin.length,
    isRead:  (id) => readIds.has(String(id)),
    markRead,
    refresh: invalidateBulletins,
    sortedBulletins: [...allBulletins].sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
      return new Date(b.created_at) - new Date(a.created_at);
    }),
  };
}
