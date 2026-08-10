'use strict';
/**
 * routes/fiDesignations.js — the prevention designation list (Phase 2.4).
 * Rank-independent by design (Matt's bureau doctrine): ANY user in the department
 * can be granted 'inspector' or 'prevention_admin' — including members who are
 * not active suppression personnel. Granting/revoking is chief-gated; revocation
 * keeps the row (grant history is a record). All mutations audited.
 */
const express = require('express');
const router  = express.Router();
const { z } = require('zod');
const { pool } = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireChief } = require('../middleware/requireRole');
const { audit } = require('../utils/auditLog');

// P3: the picker's user list — the department's own login accounts (station tag
// or P4 mapping). Prevention-admin gated: designation granting stays chief-only,
// but assignment pickers (batch wizard, rebalancing) are bureau administration.
const { loadFiContext, requirePreventionAdmin } = require('../middleware/fiAuth');
router.get('/eligible-users', loadFiContext, requirePreventionAdmin, scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.name, u.role FROM users u
     WHERE u.station_id = $1
        OR EXISTS (SELECT 1 FROM of_user_departments m WHERE m.user_id = u.id AND m.department_id = $1)
     ORDER BY u.name, u.username`, [stationId]);
  return { data: rows };
}));

router.get('/', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.user_id, d.role, d.granted_by, d.granted_at,
            u.username, u.name
     FROM fi_designations d
     JOIN users u ON u.id = d.user_id
     WHERE d.department_id = $1 AND d.revoked_at IS NULL
     ORDER BY d.role, u.name`, [stationId]);
  return { data: rows };
}));

router.post('/', requireChief,
  validate({ body: z.object({ userId: z.number().int().positive(), role: z.enum(['inspector', 'prevention_admin']) }) }),
  scoped(async ({ req, stationId, user }) => {
    const { userId, role } = req.body;
    // The target must belong to THIS department (station tag or P4 mapping) —
    // never let a chief designate a foreign account.
    const member = await pool.query(
      `SELECT 1 FROM users u
       WHERE u.id = $1 AND (u.station_id = $2
         OR EXISTS (SELECT 1 FROM of_user_departments m WHERE m.user_id = u.id AND m.department_id = $2))`,
      [userId, stationId]);
    if (!member.rows.length) throw httpError(404, 'User not found in this department.', 'USER_NOT_IN_DEPT');
    const { rows } = await pool.query(
      `INSERT INTO fi_designations (department_id, user_id, role, granted_by_user_id, granted_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (department_id, user_id, role) WHERE revoked_at IS NULL DO NOTHING
       RETURNING id, user_id, role, granted_at`,
      [stationId, userId, role, user?.id ?? null, user?.name || user?.username || '']);
    if (!rows.length) throw httpError(409, 'That designation is already active for this user.', 'ALREADY_DESIGNATED');
    await audit(stationId, user, 'create', 'fi_designations', rows[0].id, { userId, role });
    return { data: rows[0], _status: 201 };
  }));

router.delete('/:id', requireChief,
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query(
      `UPDATE fi_designations SET revoked_at = NOW(), revoked_by = $3
       WHERE id = $1 AND department_id = $2 AND revoked_at IS NULL
       RETURNING id, user_id, role`,
      [req.params.id, stationId, user?.name || user?.username || '']);
    if (!rows.length) throw httpError(404, 'Not found', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'fi_designations', rows[0].id,
      { revoked: true, userId: rows[0].user_id, role: rows[0].role });
    return { message: 'Designation revoked.' };
  }));

module.exports = router;
