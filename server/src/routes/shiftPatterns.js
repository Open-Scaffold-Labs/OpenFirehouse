'use strict';
/**
 * routes/shiftPatterns.js — shift pattern templates (Phase 1.1b hardened).
 *
 * GET    /api/shift-patterns          — list all patterns
 * GET    /api/shift-patterns/presets  — named fire-service rotation presets
 * GET    /api/shift-patterns/:id      — get one pattern
 * POST   /api/shift-patterns          — create a pattern (officer+)
 * PATCH  /api/shift-patterns/:id      — update a pattern (officer+)
 * DELETE /api/shift-patterns/:id      — delete a pattern (officer+)
 * POST   /api/shift-patterns/expand   — preview OR apply patterns for a range,
 *                                       with conflict-check on apply (officer+)
 *
 * Hardening (1.1b): zod validate + httpError (routeKit) on every route; tenant
 * key is req.user.department_id (auth fails closed if it can't be resolved — so
 * this matches the FI gold-standard rather than routeKit.scoped(), whose
 * stationId is the WRONG key for these department-scoped tables). RBAC floors
 * from 1.1a are kept: officer+ for every write.
 */

const express = require('express');
const { z } = require('zod');
const router  = express.Router();
const { httpError, validate } = require('../utils/routeKit');
const { requireOfficer } = require('../middleware/requireRole');
const { shiftPatterns: db, shifts: shiftsDb } = require('../db');
const { PATTERN_PRESETS, isPreset, detectConflicts } = require('../utils/shiftPatternEngine');

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const patternShape = {
  name:               z.string().trim().min(1).max(120),
  shiftType:          z.string().trim().min(1).max(60),
  startDate:          z.string().regex(ISO, 'startDate must be YYYY-MM-DD'),
  endDate:            z.string().regex(ISO).nullable().optional(),
  repeatRule:         z.enum(['daily', 'weekly', 'biweekly', 'platoon', 'cycle']).optional(),
  repeatDays:         z.array(z.number().int().min(0).max(7)).max(7).optional(),
  memberIds:          z.array(z.number().int().positive()).max(200).optional(),
  minCrew:            z.number().int().min(0).max(50).optional(),
  isActive:           z.boolean().optional(),
  notes:              z.string().max(2000).optional(),
  // 1.1b calendar-core config
  preset_key:         z.string().max(40).optional(),
  cycle_pattern:      z.array(z.number().int().min(0).max(1)).max(60).optional(),
  cycle_on:           z.number().int().min(0).max(60).optional(),
  cycle_off:          z.number().int().min(0).max(60).optional(),
  cycle_type:         z.string().max(40).optional(),
  platoon:            z.string().max(40).optional(),
  kelly_day_interval: z.number().int().min(0).max(60).optional(),
  anchor_date:        z.string().regex(ISO).optional(),
};

const createSchema = z.object(patternShape).strict();
const updateSchema = z.object(patternShape).partial().strict();
const expandSchema = z.object({
  startDate: z.string().regex(ISO, 'startDate must be YYYY-MM-DD'),
  endDate:   z.string().regex(ISO, 'endDate must be YYYY-MM-DD'),
  commit:    z.boolean().optional(),
}).strict();

// A preset picked in the UI fills the concrete cycle fields the row didn't
// override, so the stored pattern is self-contained and editable afterwards
// (self-serve authoring — start from "24/48", then tweak).
function applyPresetDefaults(body) {
  if (!isPreset(body.preset_key)) return body;
  const p = PATTERN_PRESETS[body.preset_key];
  const out = { ...body };
  if (out.repeatRule == null) out.repeatRule = p.repeatRule;
  if (out.cycle_on == null) out.cycle_on = p.cycle_on;
  if (out.cycle_off == null) out.cycle_off = p.cycle_off;
  if (out.cycle_pattern == null && Array.isArray(p.cycle_pattern) && p.cycle_pattern.length) {
    out.cycle_pattern = p.cycle_pattern.slice();
  }
  return out;
}

router.get('/', async (req, res, next) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch (err) { next(err); }
});

// Named rotation presets so the client offers "24/48, 48/96, Kelly, 2-2-3…"
// without a vendor ticket. The challenger bar: self-serve pattern authoring.
router.get('/presets', (req, res) => {
  res.json({
    data: Object.entries(PATTERN_PRESETS).map(([key, p]) => ({
      key,
      label: p.label,
      repeatRule: p.repeatRule,
      cycle_on: p.cycle_on,
      cycle_off: p.cycle_off,
      cycle_pattern: p.cycle_pattern,
      cycleLength: p.cycle_pattern && p.cycle_pattern.length
        ? p.cycle_pattern.length
        : (p.cycle_on + p.cycle_off) || null,
    })),
  });
});

router.get('/:id',
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) }),
  async (req, res, next) => {
    try {
      const p = await db.findById(Number(req.params.id), req.user.department_id);
      if (!p) throw httpError(404, 'Pattern not found', 'NOT_FOUND');
      res.json({ data: p });
    } catch (err) { next(err); }
  });

router.post('/', requireOfficer, validate({ body: createSchema }), async (req, res, next) => {
  try {
    const body = applyPresetDefaults(req.body);
    const p = await db.create({
      name:       body.name,
      shiftType:  body.shiftType,
      startDate:  body.startDate,
      endDate:    body.endDate || null,
      repeatRule: body.repeatRule || 'weekly',
      repeatDays: Array.isArray(body.repeatDays) ? body.repeatDays : [],
      memberIds:  Array.isArray(body.memberIds) ? body.memberIds : [],
      minCrew:    body.minCrew != null ? body.minCrew : 3,
      isActive:   body.isActive !== false,
      notes:      body.notes || '',
      preset_key: body.preset_key || '',
      cycle_pattern: Array.isArray(body.cycle_pattern) ? body.cycle_pattern : [],
      cycle_on:   body.cycle_on || 0,
      cycle_off:  body.cycle_off || 0,
      cycle_type: body.cycle_type || '',
      platoon:    body.platoon || '',
      kelly_day_interval: body.kelly_day_interval || 0,
      anchor_date: body.anchor_date || '',
    }, req.user.department_id);
    res.status(201).json({ data: p });
  } catch (err) { next(err); }
});

router.patch('/:id', requireOfficer,
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }), body: updateSchema }),
  async (req, res, next) => {
    try {
      const p = await db.update(Number(req.params.id), req.body, req.user.department_id);
      if (!p) throw httpError(404, 'Pattern not found', 'NOT_FOUND');
      res.json({ data: p });
    } catch (err) { next(err); }
  });

router.delete('/:id', requireOfficer,
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) }),
  async (req, res, next) => {
    try {
      await db.remove(Number(req.params.id), req.user.department_id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

// Preview (commit:false) OR apply (commit:true) pattern expansion for a range.
// CONFLICT-CHECK ON APPLY (the market bar): applying never silently overwrites.
// If any generated shift collides with an existing shift/override, or two
// patterns collide in the same run, the apply is REFUSED (409) with the full
// conflict list — the user resolves, then re-applies. Preview always returns
// the conflicts alongside the generated shifts so they are visible first.
router.post('/expand', requireOfficer, validate({ body: expandSchema }), async (req, res, next) => {
  try {
    const deptId = req.user.department_id;
    const { startDate, endDate, commit } = req.body;
    if (endDate < startDate) throw httpError(400, 'endDate is before startDate', 'BAD_RANGE');

    const generated = await db.expand(deptId, startDate, endDate);

    // Existing shifts in range → conflict surface.
    const allShifts = await shiftsDb.all(deptId);
    const existing = allShifts.filter((s) => s.date >= startDate && s.date <= endDate);
    const conflicts = detectConflicts(generated, existing);

    if (commit === true) {
      if (conflicts.length) {
        throw httpError(409, 'Pattern apply conflicts with existing shifts', 'PATTERN_CONFLICTS', {
          conflicts,
          generatedCount: generated.length,
        });
      }
      for (const shift of generated) {
        await shiftsDb.create(shift, deptId);
      }
      return res.json({ ok: true, committed: generated.length, conflicts: [], data: generated });
    }

    // Preview: show what WOULD be generated, and every conflict up front.
    res.json({ data: generated, conflicts, generatedCount: generated.length });
  } catch (err) { next(err); }
});

module.exports = router;
