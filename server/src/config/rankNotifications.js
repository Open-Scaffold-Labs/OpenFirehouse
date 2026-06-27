'use strict';
/**
 * Rank-derived notification model (shared source of truth).
 *
 * Notifications are determined by RANK TIER and relevance to rank — never a
 * per-member choice. Three tiers, seven categories. These are the FIXED defaults
 * (fixed-by-relevance); a department's chief can override any cell, and those
 * overrides live in the of_rank_notifications table (migration 0026).
 *
 * Cert-alert SCOPE is separate and fixed by tier doctrine (not a toggle):
 *   firefighter → own certs only · officer → their crew/station · command → all.
 */

const TIERS = ['firefighter', 'officer', 'command'];

const NOTIF_TYPES = [
  'dispatch',     // incident dispatch
  'training',     // training / drill reminders
  'certs',        // certification expirations (scope by tier)
  'bulletins',    // department bulletins / announcements
  'schedule',     // shift swaps, vacancies, understaffing
  'maintenance',  // apparatus + equipment/asset issues
  'meetings',     // department / committee meetings
];

// Fixed-by-relevance defaults. Everyone gets the safety/operational essentials;
// maintenance + meetings default to officers-and-up.
const DEFAULT_MATRIX = {
  firefighter: { dispatch: true,  training: true, certs: true, bulletins: true, schedule: true, maintenance: false, meetings: false },
  officer:     { dispatch: true,  training: true, certs: true, bulletins: true, schedule: true, maintenance: true,  meetings: true  },
  command:     { dispatch: true,  training: true, certs: true, bulletins: true, schedule: true, maintenance: true,  meetings: true  },
};

// Cert-alert scope per tier (doctrine; the officer scope is refined per member
// by decideCertScope — career officer → crew, volunteer/unassigned → station).
const CERT_SCOPE = { firefighter: 'own', officer: 'station', command: 'all' };

/** Map a permission role to its notification tier. */
function tierForRole(role, roleLevel) {
  // roleLevel is the ROLES[role].level (1 member / 2 officer / 3 command) when known.
  if (roleLevel >= 3) return 'command';
  if (roleLevel === 2) return 'officer';
  return 'firefighter';
}

/**
 * Merge a department's sparse overrides over the fixed defaults.
 * `overrides` = [{ tier, notif_type, enabled }]. Returns a full {tier:{type:bool}}.
 */
function mergeMatrix(overrides = []) {
  const out = {};
  for (const tier of TIERS) out[tier] = { ...DEFAULT_MATRIX[tier] };
  for (const o of overrides) {
    if (out[o.tier] && NOTIF_TYPES.includes(o.notif_type)) {
      out[o.tier][o.notif_type] = !!o.enabled;
    }
  }
  return out;
}

/**
 * PURE cert-oversight scope DECISION (Step 2 — migration 0027). Given the
 * viewer's tier, their resolved member row (or null), and a fallback station id
 * (from the JWT), decide the scope and which member set to query. The DB query
 * itself is run by the caller (routes/notificationPrefs.js) — keeping this pure
 * and unit-testable.
 *
 *   firefighter            → { scope:'own',  source:null }
 *   command                → { scope:'all',  source:null }
 *   career officer w/ crew → { scope:'crew', source:{kind:'crew', unitId, group} }
 *   volunteer/unassigned   → { scope:'station', source:{kind:'station', stationId} | null }
 *
 * Never throws; an unassigned officer falls back to station (show more, never
 * hide-all). A member with neither assignment nor any resolvable station yields
 * source:null → the caller shows all (safe default), not nothing.
 */
function decideCertScope(tier, member, fallbackStationId) {
  if (tier === 'firefighter') return { scope: 'own', source: null };
  if (tier === 'command')     return { scope: 'all', source: null };
  // Officer tier:
  if (member && member.employment_type === 'career' && member.assigned_unit_id && member.assigned_group) {
    return { scope: 'crew', source: { kind: 'crew', unitId: member.assigned_unit_id, group: member.assigned_group } };
  }
  const stationId = member?.station_id ?? fallbackStationId ?? null;
  return { scope: 'station', source: stationId != null ? { kind: 'station', stationId } : null };
}

module.exports = { TIERS, NOTIF_TYPES, DEFAULT_MATRIX, CERT_SCOPE, tierForRole, mergeMatrix, decideCertScope };
