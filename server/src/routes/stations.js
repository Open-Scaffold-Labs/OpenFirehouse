'use strict';
/**
 * routes/stations.js — P4.3 station (firehouse) CRUD.
 *
 * A `stations` row is a physical firehouse ("house") owned by a department. The
 * department is the tenant; a department owns one-to-many houses. The founding
 * "mirror station" (the auth anchor created at signup, whose id backs
 * users.station_id) is simply the department's FIRST house — the Department
 * Setup Wizard fills it in as house #1 rather than creating a duplicate, so no
 * phantom/unnamed station row ever lingers in a department's list.
 *
 * Mounted BEHIND requireAuth + the dbTransaction GUC middleware, and AFTER the
 * /api/stations/tv-pin routes in index.js so this generic ':id' router does not
 * shadow them. `stations` is `bootstrap_read` PERMISSIVE (no RLS dept policy),
 * so isolation here is APP-LAYER: every query is filtered by
 * department_id = req.user.department_id, and :id routes refuse any station not
 * in the caller's department (404 — never a cross-tenant read/leak).
 *
 * Writes are chief-only (requireChief): standing up / editing houses is a
 * command-level action, consistent with stationConfig.js.
 */
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireChief } = require('../middleware/requireRole');

const router = express.Router();

// Columns a chief may set on a house. FLSA / AI-budget / tv_pin live on the
// mirror row and are managed by stationConfig.js / settings — intentionally NOT
// editable here (no drive-by widening of this surface).
const FIELDS = ['name', 'fdid', 'address', 'city', 'state', 'zip', 'phone', 'email', 'dept_type'];
const RETURNING =
  'id, name, fdid, address, city, state, zip, phone, email, dept_type, department_id';

const stationBody = z.object({
  name:      z.string().min(1).max(200),
  fdid:      z.string().max(10).optional(),
  address:   z.string().max(300).optional(),
  city:      z.string().max(120).optional(),
  state:     z.string().max(40).optional(),
  zip:       z.string().max(20).optional(),
  phone:     z.string().max(40).optional(),
  email:     z.string().max(200).optional(),
  dept_type: z.string().max(40).optional(),
});
const patchBody = stationBody.partial(); // every field optional on PATCH

const trim = (v) => (typeof v === 'string' ? v.trim() : v);

// ── GET /api/stations — list the department's houses ──────────────────────────
router.get('/', scoped(async ({ user }) => {
  const { rows } = await db.pool.query(
    `SELECT ${RETURNING} FROM stations WHERE department_id = $1 ORDER BY id ASC`,
    [user.department_id]
  );
  return { data: rows, count: rows.length };
}));

// ── GET /api/stations/:id — one house, own-department only ────────────────────
router.get('/:id',
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) }),
  scoped(async ({ req, user }) => {
    const { rows } = await db.pool.query(
      `SELECT ${RETURNING} FROM stations WHERE id = $1 AND department_id = $2`,
      [Number(req.params.id), user.department_id]
    );
    if (!rows.length) throw httpError(404, 'Station not found', 'NOT_FOUND');
    return { data: rows[0] };
  })
);

// ── POST /api/stations — add a house to the department ────────────────────────
router.post('/',
  requireChief,
  validate({ body: stationBody }),
  scoped(async ({ req, user }) => {
    const b = req.body;
    const cols = ['department_id'];
    const vals = [user.department_id];
    for (const f of FIELDS) {
      if (b[f] !== undefined) { cols.push(f); vals.push(trim(b[f])); }
    }
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db.pool.query(
      `INSERT INTO stations (${cols.join(', ')}) VALUES (${placeholders}) RETURNING ${RETURNING}`,
      vals
    );
    return { _status: 201, data: rows[0] };
  })
);

// ── PATCH /api/stations/:id — edit a house, own-department only ───────────────
router.patch('/:id',
  requireChief,
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }), body: patchBody }),
  scoped(async ({ req, user }) => {
    const id = Number(req.params.id);
    const b = req.body;
    const sets = [];
    const vals = [];
    let i = 1;
    for (const f of FIELDS) {
      if (b[f] !== undefined) { sets.push(`${f} = $${i++}`); vals.push(trim(b[f])); }
    }
    if (!sets.length) throw httpError(400, 'No updatable fields provided', 'NO_FIELDS');
    vals.push(id, user.department_id);
    const { rows } = await db.pool.query(
      `UPDATE stations SET ${sets.join(', ')} WHERE id = $${i} AND department_id = $${i + 1} RETURNING ${RETURNING}`,
      vals
    );
    if (!rows.length) throw httpError(404, 'Station not found', 'NOT_FOUND'); // not your dept / no such house
    return { data: rows[0] };
  })
);

// ── DELETE /api/stations/:id — remove a house (guarded) ───────────────────────
// A house is load-bearing: users.station_id anchors auth and apparatus carry a
// station_id house tag. Refuse to delete (a) the department's LAST house and
// (b) any house a user is still anchored to — either would break login or
// strand data. The chief reassigns first, then deletes. 409 with a clear reason.
router.delete('/:id',
  requireChief,
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) }),
  scoped(async ({ req, user }) => {
    const id = Number(req.params.id);

    // own-department existence check (no cross-tenant probe)
    const exists = await db.pool.query(
      'SELECT 1 FROM stations WHERE id = $1 AND department_id = $2', [id, user.department_id]
    );
    if (!exists.rows.length) throw httpError(404, 'Station not found', 'NOT_FOUND');

    const count = await db.pool.query(
      'SELECT count(*)::int AS n FROM stations WHERE department_id = $1', [user.department_id]
    );
    if (count.rows[0].n <= 1) {
      throw httpError(409, "Cannot delete the department's only station.", 'LAST_STATION');
    }

    const anchored = await db.pool.query(
      'SELECT count(*)::int AS n FROM users WHERE station_id = $1', [id]
    );
    if (anchored.rows[0].n > 0) {
      throw httpError(409,
        'Cannot delete a station that members are still assigned to. Reassign them first.',
        'STATION_IN_USE', { anchoredUsers: anchored.rows[0].n });
    }

    await db.pool.query('DELETE FROM stations WHERE id = $1 AND department_id = $2', [id, user.department_id]);
    return { data: { id, deleted: true } };
  })
);

module.exports = router;
