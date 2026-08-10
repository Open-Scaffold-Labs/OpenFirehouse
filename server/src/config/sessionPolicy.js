'use strict';
/**
 * sessionPolicy.js — per-department session + idle timeout policy (Phase 5, migration 0110).
 *
 * MARKET BAR (competitor-shipping inventory 2026-07-26): 7 of 12 fire/EMS RMS
 * products ship an admin-configurable session/idle timeout; the two strongest
 * expose SEPARATE web and mobile windows plus a max-session-hours cap. Before
 * this module, ACCESS_TTL and REFRESH_TTL were a hardcoded '7d' with no idle
 * window and no administrative control.
 *
 * HOW IDLE TIMEOUT WORKS WITHOUT A SESSIONS TABLE
 * ------------------------------------------------
 * The refresh cookie is ROLLING: it is minted with a lifetime equal to the
 * department's idle window and re-minted on every successful refresh. So
 *   - active client  → each refresh restarts the window, session continues
 *   - idle client    → the refresh cookie expires, the next refresh 401s
 * which is exactly an idle timeout, with no server-side session state.
 *
 * The ABSOLUTE cap is carried in the refresh token as `sst` (session start
 * time, epoch seconds). It is preserved across rotations, so a continuously
 * active client is still forced to re-authenticate at session_max_hours.
 *
 * ⚠ WHY THE ACCESS TOKEN TTL TRACKS THE IDLE WINDOW RATHER THAN BEING CAPPED
 * SHORT: OpenFirehouseMobile's api.ts flags native refresh-cookie persistence
 * across a cold start as an OPEN, UNVERIFIED item. Today a 7-day ACCESS token
 * is what actually carries a native session through a cold start. Capping the
 * access TTL at, say, 60 minutes would silently rely on that unverified cookie
 * and could sign a crew out of the cab. So the access TTL equals the idle
 * window: with the shipped defaults nothing changes at all, and a department
 * that tightens the window is opting in knowingly.
 */

const { pool } = require('../db');

// Mirrors migration 0110's CHECK constraints. Kept here so the API can reject
// out-of-range input with a clean 400 instead of surfacing a Postgres error.
const LIMITS = Object.freeze({
  idleMinutesMin: 5,
  idleMinutesMax: 10080, // 7 days
  maxHoursMin:    1,
  maxHoursMax:    168,   // 7 days
});

// Pre-0110 behaviour. Used when a department row can't be read, so a policy
// lookup failure NEVER hardens a session unexpectedly mid-shift — it degrades
// to exactly what shipped before this feature existed.
const DEFAULTS = Object.freeze({
  session_idle_minutes_web:    10080,
  session_idle_minutes_mobile: 10080,
  session_max_hours:           168,
});

const PLATFORMS = Object.freeze(['web', 'mobile']);

/** Normalize a client-supplied platform hint. Unknown/absent → 'web'. */
function normalizePlatform(p) {
  return PLATFORMS.includes(p) ? p : 'web';
}

/**
 * Read one department's session policy. Falls back to pre-0110 defaults on any
 * error (see DEFAULTS above for why that direction is the safe one).
 * @param {number|string|null} departmentId
 */
async function getSessionPolicy(departmentId) {
  if (!departmentId) return { ...DEFAULTS };
  try {
    const { rows } = await pool.query(
      `SELECT session_idle_minutes_web, session_idle_minutes_mobile, session_max_hours
         FROM departments WHERE id = $1`,
      [departmentId]
    );
    if (!rows.length) return { ...DEFAULTS };
    return {
      session_idle_minutes_web:    rows[0].session_idle_minutes_web    ?? DEFAULTS.session_idle_minutes_web,
      session_idle_minutes_mobile: rows[0].session_idle_minutes_mobile ?? DEFAULTS.session_idle_minutes_mobile,
      session_max_hours:           rows[0].session_max_hours           ?? DEFAULTS.session_max_hours,
    };
  } catch (err) {
    console.warn('sessionPolicy: falling back to defaults —', err.message);
    return { ...DEFAULTS };
  }
}

/** Idle window in minutes for a given platform under a given policy. */
function idleMinutesFor(policy, platform) {
  const p = policy || DEFAULTS;
  return normalizePlatform(platform) === 'mobile'
    ? p.session_idle_minutes_mobile
    : p.session_idle_minutes_web;
}

/**
 * Has this session exceeded its absolute cap?
 * @param {number} sessionStartSeconds  epoch seconds, from the refresh token's `sst`
 * @param {number} maxHours
 * @param {number} [nowSeconds]
 */
function isBeyondMaxAge(sessionStartSeconds, maxHours, nowSeconds = Math.floor(Date.now() / 1000)) {
  // A token minted before 0110 has no `sst`. Treat it as starting now rather
  // than as infinitely old — otherwise deploying this would sign out every
  // existing session at once.
  if (!Number.isFinite(sessionStartSeconds)) return false;
  const capSeconds = Math.max(1, Number(maxHours) || DEFAULTS.session_max_hours) * 3600;
  return (nowSeconds - sessionStartSeconds) > capSeconds;
}

module.exports = {
  LIMITS,
  DEFAULTS,
  PLATFORMS,
  normalizePlatform,
  getSessionPolicy,
  idleMinutesFor,
  isBeyondMaxAge,
};
