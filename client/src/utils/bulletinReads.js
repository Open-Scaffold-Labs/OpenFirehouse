/**
 * bulletinReads.js — per-user localStorage read tracking for bulletins.
 *
 * When markRead() is called from ANY component, it:
 *   1. Persists the ID to localStorage
 *   2. Dispatches a 'bulletin:read' CustomEvent on window
 *
 * Every useBulletinAlerts instance listens for this event and increments
 * its local readVersion, causing all consumers to re-render simultaneously.
 * This achieves cross-component read sync without a Context provider.
 */

const KEY_PREFIX = 'bulletin_reads_';

function storageKey(username) {
  return `${KEY_PREFIX}${(username || 'guest').toLowerCase()}`;
}

/** Return the Set of bulletin IDs the user has already read. */
export function getReadIds(username) {
  try {
    const raw = localStorage.getItem(storageKey(username));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

/** Mark one or more bulletin IDs as read and broadcast to all listeners. */
export function markRead(username, ...ids) {
  try {
    const set = getReadIds(username);
    ids.forEach((id) => set.add(String(id)));
    localStorage.setItem(storageKey(username), JSON.stringify([...set]));
    // Notify all useBulletinAlerts instances across the component tree
    window.dispatchEvent(new CustomEvent('bulletin:read', { detail: { ids: ids.map(String) } }));
  } catch {
    // localStorage unavailable — fail silently
  }
}

/** Return true if the given bulletin ID has been read. */
export function isRead(username, id) {
  return getReadIds(username).has(String(id));
}

/**
 * Given an array of bulletin objects (must have an `id` field),
 * return the number that have NOT been read.
 */
export function getUnreadCount(username, bulletins = []) {
  const read = getReadIds(username);
  return bulletins.filter((b) => !read.has(String(b.id))).length;
}
