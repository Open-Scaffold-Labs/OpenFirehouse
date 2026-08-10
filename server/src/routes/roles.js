'use strict';
/**
 * roles.js — department-authored custom roles (Phase 5 / 5.7, migration 0113).
 *
 *   GET    /api/roles        — built-ins + this department's custom roles
 *   POST   /api/roles        — author a custom role
 *   PATCH  /api/roles/:id    — edit a custom role
 *   DELETE /api/roles/:id    — remove a custom role (refused while anyone holds it)
 *
 * Chief-only. Authoring roles IS the permission surface; an officer editing it
 * would be an officer editing what officers can do.
 *
 * COPIED FROM THE MARKET, NOT INVENTED:
 *  - built-in roles are listed alongside custom ones but cannot be edited or
 *    deleted (a competitor documents exactly this, and it is the safe half);
 *  - the permission atom is the PAGE — module/page granularity is what the
 *    fire-side products describe. Field-level permissions are a police-RMS trait
 *    and are deliberately NOT copied;
 *  - roles COMPOSE with the existing per-user grants (fleet_maintenance,
 *    cs_manager) rather than replacing them — "permission groups plus per-user
 *    override" is the deepest model in the survey.
 *
 * GUARDRAILS (each has a test that can fail):
 *  - a chief cannot mint a role above their own level (no self-promotion);
 *  - a role in use cannot be deleted — it would strand its holders at level 0;
 *  - a custom role can never take a built-in key;
 *  - every write is department-scoped and audited.
 */

const express = require('express');
const { z } = require('zod');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { requireChief, roleLevel } = require('../middleware/requireRole');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { audit } = require('../utils/auditLog');
const {
  BUILTIN_LEVELS, isBuiltin, canAuthorAtLevel, invalidate,
} = require('../utils/roleResolver');

const router = express.Router();
router.use(requireAuth);

const keyShape = z.string().regex(/^[a-z][a-z0-9_]{1,38}$/,
  'key must be lower-case letters, digits and underscores, starting with a letter');

const bodySchema = z.object({
  key:   keyShape,
  label: z.string().min(1).max(80),
  level: z.number().int().min(1).max(3),
  pages: z.array(z.string().min(1).max(64)).max(200),
});

const patchSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  level: z.number().int().min(1).max(3).optional(),
  pages: z.array(z.string().min(1).max(64)).max(200).optional(),
});

// GET /api/roles
router.get('/', requireChief, scoped(async ({ user }) => {
  const { rows } = await db.pool.query(
    `SELECT id, key, label, level, pages, is_builtin, created_at, updated_at
       FROM of_roles WHERE department_id = $1 ORDER BY is_builtin DESC, label ASC`,
    [user.department_id]
  );

  // How many people hold each role — the UI needs this to explain why a delete
  // is refused, rather than just refusing.
  const { rows: counts } = await db.pool.query(
    `SELECT u.role AS key, count(*)::int AS n
       FROM users u
       JOIN of_user_departments d ON d.user_id = u.id
      WHERE d.department_id = $1 GROUP BY u.role`,
    [user.department_id]
  );
  const inUse = Object.fromEntries(counts.map((c) => [c.key, c.n]));

  return {
    data: {
      // Built-ins are surfaced from CODE, not the table, so they are present and
      // correct even in a department that has never authored a role.
      builtin: Object.entries(BUILTIN_LEVELS).map(([key, level]) => ({
        key, label: key, level, isBuiltin: true, pages: null, inUse: inUse[key] || 0,
      })),
      custom: rows.filter((r) => !r.is_builtin).map((r) => ({
        id: r.id, key: r.key, label: r.label, level: r.level,
        pages: Array.isArray(r.pages) ? r.pages : [],
        isBuiltin: false, inUse: inUse[r.key] || 0,
        createdAt: r.created_at, updatedAt: r.updated_at,
      })),
    },
  };
}));

// POST /api/roles
router.post('/', requireChief, validate({ body: bodySchema }), scoped(async ({ req, user }) => {
  const { key, label, level, pages } = req.body;

  // A custom role may never take a built-in name. The DB unique key is per
  // department, so it would happily accept 'chief' — this is the real guard, and
  // roleResolver resolving built-ins first is the belt to this braces.
  if (isBuiltin(key)) {
    throw httpError(409, `"${key}" is a built-in role and cannot be redefined.`, 'ROLE_KEY_RESERVED');
  }

  // No self-promotion: you cannot author a role more powerful than you are.
  if (!canAuthorAtLevel(roleLevel(user.role), level)) {
    throw httpError(403, 'You cannot create a role with more access than your own.', 'ROLE_LEVEL_ESCALATION');
  }

  let row;
  try {
    ({ rows: [row] } = await db.pool.query(
      `INSERT INTO of_roles (department_id, key, label, level, pages, is_builtin, created_by)
       VALUES ($1,$2,$3,$4,$5,FALSE,$6)
       RETURNING id, key, label, level, pages, is_builtin, created_at, updated_at`,
      [user.department_id, key, label.trim(), level, JSON.stringify(pages), user.id]
    ));
  } catch (err) {
    if (err.code === '23505') {
      throw httpError(409, `A role named "${key}" already exists in your department.`, 'ROLE_KEY_TAKEN');
    }
    throw err;
  }

  invalidate(user.department_id);
  await audit(user.department_id, user, 'create', 'of_roles', row.id, { key, level });
  return { data: row };
}));

// PATCH /api/roles/:id
router.patch('/:id',
  requireChief,
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }), body: patchSchema }),
  scoped(async ({ req, user }) => {
    const { rows: [existing] } = await db.pool.query(
      'SELECT id, key, level, is_builtin FROM of_roles WHERE id = $1 AND department_id = $2',
      [Number(req.params.id), user.department_id]
    );
    // Scoped to the department, so another tenant's role is simply "not found".
    if (!existing) throw httpError(404, 'Role not found', 'NOT_FOUND');
    if (existing.is_builtin) {
      throw httpError(409, 'Built-in roles cannot be edited.', 'ROLE_BUILTIN_IMMUTABLE');
    }

    const b = req.body;
    if (b.level !== undefined && !canAuthorAtLevel(roleLevel(user.role), b.level)) {
      throw httpError(403, 'You cannot give a role more access than your own.', 'ROLE_LEVEL_ESCALATION');
    }

    const sets = []; const vals = []; let i = 1;
    if (b.label !== undefined) { sets.push(`label = $${i++}`); vals.push(b.label.trim()); }
    if (b.level !== undefined) { sets.push(`level = $${i++}`); vals.push(b.level); }
    if (b.pages !== undefined) { sets.push(`pages = $${i++}`); vals.push(JSON.stringify(b.pages)); }
    if (!sets.length) throw httpError(400, 'No updatable fields provided', 'NO_FIELDS');
    sets.push('updated_at = now()');
    vals.push(Number(req.params.id), user.department_id);

    const { rows: [row] } = await db.pool.query(
      `UPDATE of_roles SET ${sets.join(', ')} WHERE id = $${i++} AND department_id = $${i}
       RETURNING id, key, label, level, pages, is_builtin, created_at, updated_at`,
      vals
    );

    invalidate(user.department_id);
    await audit(user.department_id, user, 'update', 'of_roles', row.id, { key: row.key, level: row.level });
    return { data: row };
  })
);

// DELETE /api/roles/:id
router.delete('/:id',
  requireChief,
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) }),
  scoped(async ({ req, user }) => {
    const { rows: [existing] } = await db.pool.query(
      'SELECT id, key, is_builtin FROM of_roles WHERE id = $1 AND department_id = $2',
      [Number(req.params.id), user.department_id]
    );
    if (!existing) throw httpError(404, 'Role not found', 'NOT_FOUND');
    if (existing.is_builtin) {
      throw httpError(409, 'Built-in roles cannot be deleted.', 'ROLE_BUILTIN_IMMUTABLE');
    }

    // Deleting a role someone holds would strand them at level 0 — signed in and
    // able to reach nothing, with no obvious cause. Refuse and say who.
    const { rows: [{ n }] } = await db.pool.query(
      `SELECT count(*)::int AS n FROM users u
         JOIN of_user_departments d ON d.user_id = u.id
        WHERE d.department_id = $1 AND u.role = $2`,
      [user.department_id, existing.key]
    );
    if (n > 0) {
      throw httpError(409,
        `${n} ${n === 1 ? 'person is' : 'people are'} still assigned this role. Move them to another role first.`,
        'ROLE_IN_USE');
    }

    await db.pool.query('DELETE FROM of_roles WHERE id = $1 AND department_id = $2',
      [Number(req.params.id), user.department_id]);

    invalidate(user.department_id);
    await audit(user.department_id, user, 'soft_delete', 'of_roles', existing.id, { key: existing.key });
    return { data: { deleted: true } };
  })
);

module.exports = router;
