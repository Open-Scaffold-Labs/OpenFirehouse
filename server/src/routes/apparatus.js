'use strict';
/**
 * routes/apparatus.js — CRUD REST API for apparatus
 *
 * Mounted at /api/apparatus in index.js
 *
 * GET    /api/apparatus          — list all units
 * GET    /api/apparatus/:id      — get one unit
 * POST   /api/apparatus          — create a unit
 * PATCH  /api/apparatus/:id      — update unit fields
 * DELETE /api/apparatus/:id      — delete a unit
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const router  = express.Router();
const { apparatus: db, pool } = require('../db');
const { requireOfficer } = require('../middleware/requireRole');
const { z } = require('zod');
const { validate } = require('../utils/routeKit');

// 4.3 zod rollout (as-touched): numeric :id param fence — reject a malformed id
// with a clean 400 rather than letting it reach the query. Mirrors incidents.js.
const idParam = z.object({ id: z.string().regex(/^\d+$/, 'numeric id') });

// Initials for a unit account derived from its designation, e.g.
// "Engine 1" -> "E1", "Ladder 12" -> "L12", "Tower Ladder 1" -> "TL1".
function unitInitials(designation) {
  const s = String(designation || '').trim();
  const letters = (s.match(/\b[A-Za-z]/g) || []).join('').toUpperCase();
  const digits  = (s.match(/\d+/) || [''])[0];
  return (letters + digits).slice(0, 5) || 'U';
}

const REQUIRED_FIELDS = ['designation', 'type', 'year'];

function validateUnit(body, requireAll = true) {
  const errors = [];
  if (requireAll) {
    for (const field of REQUIRED_FIELDS) {
      const val = body[field];
      if (val === undefined || val === null || String(val).trim() === '') {
        errors.push(`${field} is required`);
      }
    }
  }
  if (body.year !== undefined) {
    const y = Number(body.year);
    if (isNaN(y) || y < 1900 || y > new Date().getFullYear() + 2) {
      errors.push('year must be a valid 4-digit year');
    }
  }
  if (body.mileage !== undefined && body.mileage !== '') {
    if (isNaN(Number(body.mileage)) || Number(body.mileage) < 0) {
      errors.push('mileage must be a non-negative number');
    }
  }
  return errors;
}

/** Coerce numeric fields from the request body before writing to DB */
function coerce(data) {
  const out = { ...data };
  if (out.year       !== undefined) out.year       = parseInt(out.year,    10) || 0;
  if (out.mileage    !== undefined) out.mileage    = parseInt(out.mileage, 10) || 0;
  if (out.station_id !== undefined) out.station_id = parseInt(out.station_id, 10);
  return out;
}

/**
 * A rig's house (station_id) MUST belong to the caller's own department —
 * otherwise a chief could tag a rig to another tenant's firehouse. Returns true
 * when no house is supplied (the tag is optional; appCreate falls back to the
 * department's mirror station).
 */
async function stationInDept(stationId, departmentId) {
  if (stationId === undefined || stationId === null || stationId === '') return true;
  const r = await pool.query(
    'SELECT 1 FROM stations WHERE id = $1 AND department_id = $2',
    [Number(stationId), departmentId]
  );
  return r.rows.length > 0;
}

/**
 * Resolve the client-supplied house tag for a rig. This is the ONE place the
 * server reads a client station_id — and it is a HOUSE TAG within the caller's
 * own department, NOT the tenant key (department_id, from the JWT, is). The
 * value is validated against the caller's department before use, which is why
 * this single read is an explicit, reviewed exception to the tenancy guard
 * (allowlisted by line shape in tenancyGuard.test.js).
 * Returns { provided:false } when no tag was sent (appCreate then falls back to
 * the department's mirror station), else { provided:true, valid, houseId }.
 */
async function resolveHouseTag(req) {
  const clientHouseTag = req.body.station_id; // house tag, validated below — not the tenant key
  if (clientHouseTag === undefined || clientHouseTag === null || clientHouseTag === '') {
    return { provided: false };
  }
  const valid = await stationInDept(clientHouseTag, req.user.department_id);
  return { provided: true, valid, houseId: Number(clientHouseTag) };
}

// ── GET /api/apparatus ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const units = await db.all(req.user.department_id);
    res.json({ data: units, count: units.length });
  } catch (err) {
    console.error('GET /apparatus error:', err);
    res.status(500).json({ error: 'Failed to fetch apparatus' });
  }
});

// ── GET /api/apparatus/:id ────────────────────────────────────────────────────
router.get('/:id', validate({ params: idParam }), async (req, res) => {
  try {
    const unit = await db.findById(Number(req.params.id), req.user.department_id);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    res.json({ data: unit });
  } catch (err) {
    console.error('GET /apparatus/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch unit' });
  }
});

// ── POST /api/apparatus ───────────────────────────────────────────────────────
router.post('/', requireOfficer, async (req, res) => {
  try {
    const errors = validateUnit(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    if (await db.findByDesignation(req.body.designation, req.user.department_id)) {
      return res.status(409).json({ error: `Designation "${req.body.designation}" already exists` });
    }

    const house = await resolveHouseTag(req);
    if (house.provided && !house.valid) {
      return res.status(400).json({ error: 'station_id must be a station in your department' });
    }

    const unit = await db.create(coerce({
      designation:      req.body.designation,
      type:             req.body.type,
      year:             req.body.year,
      make:             req.body.make             || '',
      model:            req.body.model            || '',
      status:           req.body.status           || 'In Service',
      mileage:          req.body.mileage          ?? 0,
      lastService:      req.body.lastService      || '',
      nextServiceDue:   req.body.nextServiceDue   || '',
      assignedOperator: req.body.assignedOperator || '',
      notes:            req.body.notes            || '',
      // House tag (the rig's firehouse). Omitted ⇒ appCreate defaults to the
      // department's mirror station. Ownership validated above.
      ...(house.provided ? { station_id: house.houseId } : {}),
    }), req.user.department_id);

    res.status(201).json({ data: unit });
  } catch (err) {
    console.error('POST /apparatus error:', err);
    res.status(500).json({ error: 'Failed to create unit' });
  }
});

// ── PATCH /api/apparatus/:id ──────────────────────────────────────────────────
router.patch('/:id', requireOfficer, validate({ params: idParam }), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.findById(id, req.user.department_id);
    if (!existing) return res.status(404).json({ error: 'Unit not found' });

    const errors = validateUnit(req.body, false);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    if (req.body.designation && req.body.designation !== existing.designation) {
      const collision = await db.findByDesignation(req.body.designation, req.user.department_id);
      if (collision) return res.status(409).json({ error: `Designation "${req.body.designation}" already in use` });
    }

    // Reassigning the rig's house: the target house must be in this department.
    // A blank/absent house tag is dropped rather than silently nulling it.
    const house = await resolveHouseTag(req);
    if (house.provided && !house.valid) {
      return res.status(400).json({ error: 'station_id must be a station in your department' });
    }
    const patch = { ...req.body };
    if (house.provided) patch.station_id = house.houseId; else delete patch.station_id;

    const updated = await db.update(id, coerce(patch), req.user.department_id);
    res.json({ data: updated });
  } catch (err) {
    console.error('PATCH /apparatus/:id error:', err);
    res.status(500).json({ error: 'Failed to update unit' });
  }
});

// ── DELETE /api/apparatus/:id ─────────────────────────────────────────────────
router.delete('/:id', requireOfficer, validate({ params: idParam }), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Unit not found' });
    await db.remove(id, req.user.department_id);
    res.json({ message: `Unit ${id} deleted` });
  } catch (err) {
    console.error('DELETE /apparatus/:id error:', err);
    res.status(500).json({ error: 'Failed to delete unit' });
  }
});

// ── POST /api/apparatus/:id/unit-login ────────────────────────────────────────
// Provision (or reset) the UNIT LOGIN for an apparatus — the dedicated in-cab
// account (role='unit', migration 0025) the rig terminal signs in with. Chief/
// officer only. Creating it once, then resetting the password later, both land
// here (idempotent on the apparatus's single unit account). The account inherits
// the rig's house (station_id) so requireAuth resolves its department via the
// station mirror — no of_user_departments row needed.
router.post('/:id/unit-login', requireOfficer, validate({ params: idParam }), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const unit = await db.findById(id, req.user.department_id);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!username || username.length < 3) {
      return res.status(400).json({ error: 'username is required (min 3 chars)' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'password is required (min 6 chars)' });
    }

    // Username is globally unique. Allow it only if free, or already owned by
    // THIS apparatus's unit account (a password reset keeping the same username).
    const taken = await pool.query(
      'SELECT id, apparatus_id FROM users WHERE username = $1', [username],
    );
    if (taken.rows.length && Number(taken.rows[0].apparatus_id) !== id) {
      return res.status(409).json({ error: `Username "${username}" is already in use` });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await pool.query(
      'SELECT id FROM users WHERE apparatus_id = $1', [id],
    );

    let row;
    if (existing.rows.length) {
      const r = await pool.query(
        `UPDATE users SET username = $1, "passwordHash" = $2, station_id = $3, role = 'unit'
         WHERE id = $4 RETURNING id, username, role, station_id, apparatus_id`,
        [username, passwordHash, unit.station_id, existing.rows[0].id],
      );
      row = r.rows[0];
    } else {
      const r = await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", station_id, apparatus_id, email_verified)
         VALUES ($1, $2, $3, 'unit', $4, $5, $6, TRUE)
         RETURNING id, username, role, station_id, apparatus_id`,
        [username, unit.designation, unitInitials(unit.designation), passwordHash, unit.station_id, id],
      );
      row = r.rows[0];
    }

    // Never echo the password or hash.
    res.status(existing.rows.length ? 200 : 201).json({
      data: { apparatusId: id, designation: unit.designation, username: row.username, role: row.role },
    });
  } catch (err) {
    console.error('POST /apparatus/:id/unit-login error:', err);
    res.status(500).json({ error: 'Failed to set unit login' });
  }
});

module.exports = router;
