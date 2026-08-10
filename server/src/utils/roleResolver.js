'use strict';
/**
 * roleResolver.js — resolve a role key to a level + page set (Phase 5 / 5.7, migration 0113).
 *
 * MARKET MODEL BEING COPIED
 * -------------------------
 * 6 of 12 fire/EMS RMS products ship custom role authoring — all three head
 * vendors plus one of the low-cost tail products we compete against. The deepest
 * shipped model is "permission groups PLUS per-user override". We already had the
 * override half (fleet_maintenance 0083, cs_manager 0087); this adds the group
 * half. They COMPOSE — a grant is not replaced by a role and never revoked by one.
 *
 * Built-in roles remain and cannot be edited or deleted, which is the documented
 * behaviour of at least one competitor and the safe half of it.
 *
 * THE ONE RULE THAT MATTERS MOST
 * ------------------------------
 * This runs on the authenticated path of EVERY request, so it must FAIL CLOSED.
 * An unknown role, a database error, a deleted role, a role belonging to another
 * department — every one of those resolves to level 0 (no access), never to a
 * default of "member" and certainly never to chief. A permission resolver whose
 * error path grants access is worse than no resolver.
 */

const { pool } = require('../db');

/**
 * The built-in ladder. This is the SAME table the code has always used — custom
 * roles are additive on top, they do not replace it. Kept here (not read from the
 * DB) so that a database problem can never dissolve the built-in roles and lock
 * an entire department out of its own system.
 */
const BUILTIN_LEVELS = Object.freeze({
  member:             1,
  lieutenant:         2,
  officer:            2,
  training_captain:   2,
  dispatch:           2,
  battalion_chief:    3,
  deputy_chief:       3,
  chief:              3,
  training_battalion: 3,
  admin:              3, // platform owner — never locked out
});

// `unit` is deliberately absent: an in-cab terminal is not on the ladder at all,
// it runs off an explicit page allowlist. Level 0 so any level check fails closed.

const CACHE_MS = 30_000;
const _cache = new Map(); // departmentId -> { at, byKey: Map }

function isBuiltin(key) {
  return Object.prototype.hasOwnProperty.call(BUILTIN_LEVELS, key);
}

/** Drop a department's cached roles. Called after any write so a change is immediate. */
function invalidate(departmentId) {
  if (departmentId == null) _cache.clear();
  else _cache.delete(String(departmentId));
}

async function loadDepartmentRoles(departmentId) {
  const k = String(departmentId);
  const hit = _cache.get(k);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.byKey;

  const byKey = new Map();
  try {
    const { rows } = await pool.query(
      'SELECT key, label, level, pages, is_builtin FROM of_roles WHERE department_id = $1',
      [departmentId]
    );
    for (const r of rows) {
      byKey.set(r.key, {
        key: r.key,
        label: r.label,
        level: Number(r.level) || 0,
        pages: Array.isArray(r.pages) ? r.pages : [],
        isBuiltin: r.is_builtin === true,
      });
    }
  } catch (err) {
    // A read failure must NOT invent permissions. Return an empty custom set:
    // built-ins still resolve (they are in code), customs resolve to level 0.
    console.warn('roleResolver: custom role lookup failed, failing closed —', err.message);
    return new Map();
  }

  _cache.set(k, { at: Date.now(), byKey });
  return byKey;
}

/**
 * Resolve a role for a department.
 * @returns {{ key: string, label: string, level: number, pages: string[]|null, isBuiltin: boolean, known: boolean }}
 *   `pages: null` means "not page-restricted" — the built-in behaviour, where the
 *   static PAGE_ACCESS map governs. Only custom roles carry an explicit page list.
 */
async function resolveRole(roleKey, departmentId) {
  const key = typeof roleKey === 'string' ? roleKey : '';

  // Built-ins win, always. A department cannot shadow `chief` with its own row —
  // the unique key would allow the INSERT, so this ordering is the real guard.
  if (isBuiltin(key)) {
    return { key, label: key, level: BUILTIN_LEVELS[key], pages: null, isBuiltin: true, known: true };
  }

  if (!departmentId) {
    return { key, label: key, level: 0, pages: [], isBuiltin: false, known: false };
  }

  const byKey = await loadDepartmentRoles(departmentId);
  const found = byKey.get(key);
  if (!found) {
    // Unknown role → NO access. Not member. Not a guess.
    return { key, label: key, level: 0, pages: [], isBuiltin: false, known: false };
  }
  return { ...found, pages: found.pages, known: true };
}

/**
 * May this role open this page?
 * Built-ins return null pages and defer to the existing level-based PAGE_ACCESS
 * check, exactly as before. Custom roles are governed by their explicit list.
 */
function roleAllowsPage(resolved, pageId) {
  if (!resolved || resolved.level <= 0) return false;
  if (resolved.pages == null) return null; // defer to the level-based check
  return resolved.pages.includes(pageId);
}

/**
 * The escalation guard. A chief authoring a role must not be able to mint one
 * above their own standing — otherwise "create a role" becomes "promote myself".
 */
function canAuthorAtLevel(authorLevel, requestedLevel) {
  const a = Number(authorLevel) || 0;
  const r = Number(requestedLevel) || 0;
  return r >= 1 && r <= 3 && r <= a;
}

module.exports = {
  BUILTIN_LEVELS,
  isBuiltin,
  resolveRole,
  roleAllowsPage,
  canAuthorAtLevel,
  invalidate,
  _cacheForTests: _cache,
};
