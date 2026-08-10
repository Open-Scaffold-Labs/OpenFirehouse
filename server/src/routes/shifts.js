'use strict';
/**
 * routes/shifts.js — duty schedule shifts (Phase 1.1b hardened).
 *
 * GET    /api/shifts       — list all shifts (crew derived from memberIds)
 * GET    /api/shifts/:id   — one shift
 * POST   /api/shifts       — create (officer+)
 * PATCH  /api/shifts/:id   — update (officer+)
 * DELETE /api/shifts/:id   — delete (officer+)
 *
 * Hardening (1.1b): zod validate + httpError; tenant key req.user.department_id
 * (auth fails closed). Roster canonicalization: memberIds (ids) is the
 * AUTHORITATIVE roster; a legacy client that still posts crew NAME strings is
 * bridged to ids best-effort so the store becomes id-backed either way. crew
 * names are derived from memberIds (see db.shiftCreate/resolveShiftRosters).
 */

const express = require('express');
const { z } = require('zod');
const router  = express.Router();
const { httpError, validate } = require('../utils/routeKit');
const { requireOfficer } = require('../middleware/requireRole');
const { shifts: db, pool } = require('../db');

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Non-strict (unknown keys are stripped, not rejected) so a transitional client
// sending extra fields is not 400'd mid-rollout.
const createSchema = z.object({
  date:       z.string().regex(ISO, 'date must be YYYY-MM-DD'),
  shiftType:  z.string().trim().min(1).max(60),
  memberIds:  z.array(z.number().int().positive()).max(200).optional(),
  crew:       z.array(z.string().max(120)).max(200).optional(), // legacy: names
  isOverride: z.boolean().optional(),
  patternId:  z.number().int().positive().nullable().optional(),
  notes:      z.string().max(2000).optional(),
});
const updateSchema = createSchema.partial();

// Legacy bridge: resolve crew NAME strings -> member ids (best-effort, dept-scoped).
async function idsFromNames(deptId, names) {
  if (!Array.isArray(names) || !names.length) return [];
  const r = await pool.query('SELECT id, name FROM members WHERE department_id = $1', [deptId]);
  const byName = new Map(r.rows.map((m) => [String(m.name).toLowerCase(), m.id]));
  return names.map((n) => byName.get(String(n).toLowerCase())).filter((v) => v != null);
}

router.get('/', async (req, res, next) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch (err) { next(err); }
});

router.get('/:id',
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) }),
  async (req, res, next) => {
    try {
      const s = await db.findById(Number(req.params.id), req.user.department_id);
      if (!s) throw httpError(404, 'Shift not found', 'NOT_FOUND');
      res.json({ data: s });
    } catch (err) { next(err); }
  });

router.post('/', requireOfficer, validate({ body: createSchema }), async (req, res, next) => {
  try {
    const deptId = req.user.department_id;
    const b = req.body;
    let memberIds = b.memberIds;
    if ((!memberIds || !memberIds.length) && Array.isArray(b.crew) && b.crew.length) {
      memberIds = await idsFromNames(deptId, b.crew); // bridge legacy name-strings
    }
    const s = await db.create({
      date:       b.date,
      shiftType:  b.shiftType,
      memberIds:  memberIds || [],
      crew:       Array.isArray(b.crew) ? b.crew : [], // re-derived from memberIds when present
      isOverride: b.isOverride === true,
      patternId:  b.patternId || null,
      notes:      b.notes || '',
    }, deptId);
    res.status(201).json({ data: s });
  } catch (err) { next(err); }
});

router.patch('/:id', requireOfficer,
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }), body: updateSchema }),
  async (req, res, next) => {
    try {
      const deptId = req.user.department_id;
      const id = Number(req.params.id);
      if (!await db.findById(id, deptId)) throw httpError(404, 'Shift not found', 'NOT_FOUND');
      const b = { ...req.body };
      if ((!b.memberIds || !b.memberIds.length) && Array.isArray(b.crew) && b.crew.length) {
        b.memberIds = await idsFromNames(deptId, b.crew);
      }
      res.json({ data: await db.update(id, b, deptId) });
    } catch (err) { next(err); }
  });

router.delete('/:id', requireOfficer,
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) }),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!await db.findById(id, req.user.department_id)) throw httpError(404, 'Shift not found', 'NOT_FOUND');
      await db.remove(id, req.user.department_id);
      res.json({ message: `Shift ${id} deleted` });
    } catch (err) { next(err); }
  });

module.exports = router;
