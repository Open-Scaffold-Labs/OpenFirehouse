/**
 * actingAs.js — session badge label for Ask Open Firehouse.
 *
 * The chat inherits the signed-in user's JWT and role. There is no
 * separate bot account. Display matches the product role families:
 * Chief / Officer / Member / Trainee.
 */

import { ROLES } from '../data/auth';

export function actingAsRole(user) {
  if (!user) return 'Member';
  const raw = String(user.role || '').toLowerCase();
  if (raw === 'trainee' || raw === 'recruit' || raw === 'probationary') return 'Trainee';
  const level = ROLES[user.role]?.level ?? 1;
  if (level >= 3) return 'Chief';
  if (level >= 2) return 'Officer';
  return 'Member';
}

export function actingAsLine(user) {
  const name = String(user?.name || user?.username || 'Signed-in member').trim();
  return `${name} · ${actingAsRole(user)}`;
}

export function actingAsInitials(user) {
  if (user?.initials) return String(user.initials).slice(0, 2).toUpperCase();
  const name = String(user?.name || user?.username || '').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (name.slice(0, 2) || 'OF').toUpperCase();
}
