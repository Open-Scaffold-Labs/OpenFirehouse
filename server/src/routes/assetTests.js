'use strict';
/**
 * routes/assetTests.js — the generic asset-test engine (Phase 2.3, migration 0084).
 * Spec: docs/PHASE2-ASSET-TESTS-SPEC-2026-07-26.md.
 *
 *   Assets:  GET /assets · POST /assets · PATCH /assets/:id (mechanic/chief)
 *            POST /assets/:id/status — THE one disposition door (reasoned, audited;
 *            a FAIL result never flips this — a human does)
 *   Types:   GET /types (seeds the standards' defaults) · POST/PATCH/DELETE (soft)
 *   Events:  GET /events?asset_id|apparatus_id · POST /events (FINAL on write)
 *            DELETE /events/:id (chief, reason, soft, audited)
 *   Due:     GET /due — per (target × type) pairs + retirement clocks, computed on
 *            view; missing anchors are 'unknown' (never guessed); OOS targets paused.
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireMechanic, requireChief } = require('../middleware/requireRole');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { isIsoDay, addDaysISO } = require('../utils/localDate');
const {
  ASSET_FAMILIES, TYPE_FAMILIES, TEST_RESULTS_API, ASSET_STATUSES,
  STATUS_REASON_REQUIRED, ANCHORS, DEFAULT_TEST_TYPES, DEFAULT_RETIREMENT,
} = require('../constants/assetTestVocab');

const { mintTag } = require('./scan');

const idParam = z.object({ id: z.string().regex(/^\d+$/) });
const toDay = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ? String(v).slice(0, 10) : null));

async function seedTypes(stationId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM asset_test_types WHERE department_id = $1', [stationId]);
  if (rows[0].n > 0) return;
  for (const t of DEFAULT_TEST_TYPES) {
    await pool.query(
      `INSERT INTO asset_test_types (department_id, station_id, name, family, target, interval_days, anchor, first_anchor)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7)`,
      [stationId, t.name, t.family, t.target, t.interval_days, t.anchor, t.first_anchor || null]);
  }
}

// ── Test types ───────────────────────────────────────────────────────────────

router.get('/types', scoped(async ({ stationId }) => {
  await seedTypes(stationId);
  const { rows } = await pool.query(
    `SELECT * FROM asset_test_types WHERE department_id = $1 AND deleted_at IS NULL
      ORDER BY family, name`, [stationId]);
  return { data: rows };
}));

const typeBase = z.object({
  name: z.string().trim().min(1).max(120),
  family: z.enum(TYPE_FAMILIES),
  target: z.enum(['asset', 'apparatus']).optional(),
  interval_days: z.number().int().min(1).max(7300),
  anchor: z.enum(ANCHORS).optional(),
  first_anchor: z.enum(['manufacture', 'in_service']).nullable().optional(),
  active: z.boolean().optional(),
}).strict();

router.post('/types', requireMechanic, validate({ body: typeBase }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const target = b.target || (b.family === 'pump' ? 'apparatus' : 'asset');
    const { rows } = await pool.query(
      `INSERT INTO asset_test_types (department_id, station_id, name, family, target, interval_days, anchor, first_anchor)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [stationId, b.name, b.family, target, b.interval_days, b.anchor || 'last_event', b.first_anchor ?? null]);
    await audit(stationId, user, 'create', 'asset_test_types', rows[0].id, { name: b.name, family: b.family });
    return { data: rows[0], _status: 201 };
  }));

router.patch('/types/:id', requireMechanic,
  validate({ params: idParam, body: typeBase.partial() }),
  scoped(async ({ req, stationId, user }) => {
    const sets = []; const vals = [];
    for (const k of ['name', 'family', 'target', 'interval_days', 'anchor', 'first_anchor', 'active']) {
      if (req.body[k] === undefined) continue;
      vals.push(req.body[k]); sets.push(`${k} = $${vals.length}`);
    }
    if (!sets.length) throw httpError(400, 'No valid fields', 'NO_FIELDS');
    vals.push(req.params.id, stationId);
    const { rows } = await pool.query(
      `UPDATE asset_test_types SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${vals.length - 1} AND department_id = $${vals.length} AND deleted_at IS NULL RETURNING *`, vals);
    if (!rows.length) throw httpError(404, 'Test type not found.', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'asset_test_types', rows[0].id, { fields: sets.length });
    return { data: rows[0] };
  }));

router.delete('/types/:id', requireMechanic, validate({ params: idParam }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query(
      `UPDATE asset_test_types SET deleted_at = NOW(), active = FALSE, updated_at = NOW()
        WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL RETURNING id, name`,
      [req.params.id, stationId]);
    if (!rows.length) throw httpError(404, 'Test type not found.', 'NOT_FOUND');
    await audit(stationId, user, 'soft_delete', 'asset_test_types', rows[0].id, { name: rows[0].name });
    return { data: { id: rows[0].id, deleted: true } };
  }));

// ── Tracked assets ───────────────────────────────────────────────────────────

const assetBase = z.object({
  family: z.enum(ASSET_FAMILIES),
  name: z.string().trim().min(1).max(160),
  serial: z.string().trim().max(120).optional(),
  identity: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  manufacture_date: z.string().nullable().optional(),
  manufacture_year: z.number().int().min(1950).max(2100).nullable().optional(),
  in_service_date: z.string().nullable().optional(),
  assigned_member_id: z.number().int().positive().nullable().optional(),
  apparatus_id: z.number().int().positive().nullable().optional(),
  retirement_months: z.number().int().min(1).max(600).nullable().optional(),
  retirement_advisory: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
}).strict();

function checkDates(b) {
  for (const k of ['manufacture_date', 'in_service_date']) {
    if (b[k] && !isIsoDay(b[k])) throw httpError(422, `${k} must be a real calendar day (YYYY-MM-DD).`, 'BAD_DATE');
  }
}

router.get('/assets',
  validate({
    query: z.object({
      family: z.enum(ASSET_FAMILIES).optional(),
      status: z.enum(ASSET_STATUSES).optional(),
    }).partial(),
  }),
  scoped(async ({ req, stationId }) => {
    const conds = ['t.department_id = $1', 't.deleted_at IS NULL'];
    const vals = [stationId];
    if (req.query.family) { vals.push(req.query.family); conds.push(`t.family = $${vals.length}`); }
    if (req.query.status) { vals.push(req.query.status); conds.push(`t.status = $${vals.length}`); }
    const { rows } = await pool.query(
      `SELECT t.*, m.name AS assigned_member_name, a.designation AS apparatus_designation
         FROM tracked_assets t
         LEFT JOIN members m ON m.id = t.assigned_member_id
         LEFT JOIN apparatus a ON a.id = t.apparatus_id
        WHERE ${conds.join(' AND ')}
        ORDER BY t.family, t.name`, vals);
    return { data: rows };
  }));

router.post('/assets', requireMechanic, validate({ body: assetBase }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    checkDates(b);
    const retDefault = DEFAULT_RETIREMENT[b.family] || null;
    const { rows } = await pool.query(
      `INSERT INTO tracked_assets
         (department_id, station_id, family, name, serial, identity, manufacture_date,
          manufacture_year, in_service_date, assigned_member_id, apparatus_id,
          retirement_months, retirement_advisory, notes, scan_tag)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [stationId, b.family, b.name, b.serial || '', JSON.stringify(b.identity || {}),
       b.manufacture_date || null, b.manufacture_year ?? null, b.in_service_date || null,
       b.assigned_member_id ?? null, b.apparatus_id ?? null,
       b.retirement_months ?? (retDefault ? retDefault.months : null),
       b.retirement_advisory ?? (retDefault ? retDefault.advisory : false),
       b.notes || '', mintTag()]);
    await audit(stationId, user, 'create', 'tracked_assets', rows[0].id, { family: b.family, name: b.name });
    return { data: rows[0], _status: 201 };
  }));

router.patch('/assets/:id', requireMechanic,
  validate({ params: idParam, body: assetBase.partial() }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    checkDates(b);
    if (b.family !== undefined) delete b.family; // identity is fixed at creation
    const sets = []; const vals = [];
    for (const k of ['name', 'serial', 'manufacture_date', 'manufacture_year', 'in_service_date',
      'assigned_member_id', 'apparatus_id', 'retirement_months', 'retirement_advisory', 'notes']) {
      if (b[k] === undefined) continue;
      vals.push(b[k]); sets.push(`${k} = $${vals.length}`);
    }
    if (b.identity !== undefined) { vals.push(JSON.stringify(b.identity)); sets.push(`identity = $${vals.length}`); }
    if (!sets.length) throw httpError(400, 'No valid fields', 'NO_FIELDS');
    vals.push(req.params.id, stationId);
    const { rows } = await pool.query(
      `UPDATE tracked_assets SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${vals.length - 1} AND department_id = $${vals.length} AND deleted_at IS NULL RETURNING *`, vals);
    if (!rows.length) throw httpError(404, 'Asset not found.', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'tracked_assets', rows[0].id, { fields: sets.length });
    return { data: rows[0] };
  }));

// THE one disposition door — a human act, reasoned for anything but return-to-service.
// A FAIL test result never lands here on its own (the market-wide ceiling).
router.post('/assets/:id/status', requireMechanic,
  validate({
    params: idParam,
    body: z.object({
      status: z.enum(ASSET_STATUSES),
      reason: z.string().trim().max(500).optional(),
    }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const { status, reason } = req.body;
    if (STATUS_REASON_REQUIRED.includes(status) && !(reason && reason.length >= 3)) {
      throw httpError(422, 'A reason is required to take an asset out of service, condemn, or retire it.', 'REASON_REQUIRED');
    }
    const { rows } = await pool.query(
      `UPDATE tracked_assets SET status = $3, status_reason = $4, updated_at = NOW()
        WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL RETURNING *`,
      [req.params.id, stationId, status, reason || '']);
    if (!rows.length) throw httpError(404, 'Asset not found.', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'tracked_assets', rows[0].id,
      { action: 'status', to: status, reason: reason || '' });
    return { data: rows[0] };
  }));

router.delete('/assets/:id', requireChief,
  validate({ params: idParam, body: z.object({ reason: z.string().trim().min(3).max(500) }).strict() }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query(
      `UPDATE tracked_assets SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL RETURNING id, name`,
      [req.params.id, stationId]);
    if (!rows.length) throw httpError(404, 'Asset not found.', 'NOT_FOUND');
    await audit(stationId, user, 'soft_delete', 'tracked_assets', rows[0].id,
      { name: rows[0].name, reason: req.body.reason });
    return { data: { id: rows[0].id, deleted: true } };
  }));

// ── Test events (FINAL on write) ─────────────────────────────────────────────

router.get('/events',
  validate({
    query: z.object({
      asset_id: z.string().regex(/^\d+$/).optional(),
      apparatus_id: z.string().regex(/^\d+$/).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
    }).partial(),
  }),
  scoped(async ({ req, stationId }) => {
    const conds = ['e.department_id = $1', 'e.deleted_at IS NULL'];
    const vals = [stationId];
    if (req.query.asset_id) { vals.push(req.query.asset_id); conds.push(`e.asset_id = $${vals.length}`); }
    if (req.query.apparatus_id) { vals.push(req.query.apparatus_id); conds.push(`e.apparatus_id = $${vals.length}`); }
    const limit = Math.min(Number(req.query.limit || 100), 500);
    vals.push(limit);
    const { rows } = await pool.query(
      `SELECT e.*, tt.name AS test_type_name, tt.family,
              t.name AS asset_name, a.designation AS apparatus_designation
         FROM asset_test_events e
         JOIN asset_test_types tt ON tt.id = e.test_type_id
         LEFT JOIN tracked_assets t ON t.id = e.asset_id
         LEFT JOIN apparatus a ON a.id = e.apparatus_id
        WHERE ${conds.join(' AND ')}
        ORDER BY e.event_date DESC, e.id DESC
        LIMIT $${vals.length}`, vals);
    return { data: rows.map((r) => ({ ...r, event_date: toDay(r.event_date) })) };
  }));

router.post('/events', requireMechanic,
  validate({
    body: z.object({
      test_type_id: z.number().int().positive(),
      asset_id: z.number().int().positive().optional(),
      apparatus_id: z.number().int().positive().optional(),
      event_date: z.string(),
      result: z.enum(TEST_RESULTS_API),   // UNRECORDED is migration-only — not an API value
      performed_by_name: z.string().trim().max(160).optional(),
      outside_company: z.string().trim().max(200).optional(),
      pressure_used: z.number().int().min(0).max(999999).nullable().optional(),
      readings: z.record(z.string(), z.union([z.string(), z.number()])).nullable().optional(),
      note: z.string().trim().max(2000).optional(),
    }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    if (!isIsoDay(b.event_date)) throw httpError(422, 'event_date must be a real calendar day.', 'BAD_DATE');
    const serverDay = new Date().toISOString().slice(0, 10);
    if (b.event_date > addDaysISO(serverDay, 1)) throw httpError(422, 'event_date is in the future.', 'BAD_DATE');
    if ((b.asset_id ? 1 : 0) + (b.apparatus_id ? 1 : 0) !== 1) {
      throw httpError(422, 'Exactly one target: asset_id or apparatus_id.', 'BAD_TARGET');
    }
    const tt = await pool.query(
      'SELECT * FROM asset_test_types WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL',
      [b.test_type_id, stationId]);
    if (!tt.rows.length) throw httpError(404, 'Test type not found.', 'NOT_FOUND');
    const type = tt.rows[0];
    if (b.asset_id) {
      if (type.target !== 'asset') throw httpError(422, 'This test type targets apparatus.', 'BAD_TARGET');
      const a = await pool.query(
        'SELECT id, family FROM tracked_assets WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL',
        [b.asset_id, stationId]);
      if (!a.rows.length) throw httpError(422, 'Asset not found in your department.', 'BAD_TARGET');
      if (a.rows[0].family !== type.family) {
        throw httpError(422, `A ${type.family} test cannot be recorded on a ${a.rows[0].family} asset.`, 'FAMILY_MISMATCH');
      }
    } else {
      if (type.target !== 'apparatus') throw httpError(422, 'This test type targets assets.', 'BAD_TARGET');
      const a = await pool.query(
        'SELECT id FROM apparatus WHERE id = $1 AND department_id = $2', [b.apparatus_id, stationId]);
      if (!a.rows.length) throw httpError(422, 'Apparatus not found in your department.', 'BAD_TARGET');
    }
    const { rows } = await pool.query(
      `INSERT INTO asset_test_events
         (department_id, station_id, test_type_id, asset_id, apparatus_id, event_date, result,
          performed_by_user_id, performed_by_name, outside_company, pressure_used, readings,
          note, recorded_by_user_id)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [stationId, b.test_type_id, b.asset_id ?? null, b.apparatus_id ?? null, b.event_date,
       b.result, user.id, b.performed_by_name || user.name || user.username || '',
       b.outside_company || '', b.pressure_used ?? null,
       b.readings ? JSON.stringify(b.readings) : null, b.note || '', user.id]);
    await audit(stationId, user, 'create', 'asset_test_events', rows[0].id, {
      test_type_id: b.test_type_id, asset_id: b.asset_id ?? null,
      apparatus_id: b.apparatus_id ?? null, result: b.result,
    });
    return {
      data: {
        ...rows[0], event_date: toDay(rows[0].event_date),
        // A FAIL never flips status — it PROPOSES; the client offers the human door.
        disposition_suggested: b.result === 'FAIL',
      },
      _status: 201,
    };
  }));

// FINAL: no PATCH exists; an explicit closed door for clarity.
router.patch('/events/:id', validate({ params: idParam }),
  scoped(async () => {
    throw httpError(409, 'A recorded test is a finalized record — record a new test instead.', 'RECORD_FINALIZED');
  }));

router.delete('/events/:id', requireChief,
  validate({ params: idParam, body: z.object({ reason: z.string().trim().min(3).max(500) }).strict() }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query(
      `UPDATE asset_test_events SET deleted_at = NOW()
        WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL RETURNING id, result`,
      [req.params.id, stationId]);
    if (!rows.length) throw httpError(404, 'Test event not found.', 'NOT_FOUND');
    await audit(stationId, user, 'soft_delete', 'asset_test_events', rows[0].id,
      { reason: req.body.reason, result: rows[0].result });
    return { data: { id: rows[0].id, deleted: true } };
  }));

// ── Due board — computed on view; nothing guessed ────────────────────────────

router.get('/due',
  validate({ query: z.object({ today: z.string().optional() }).partial() }),
  scoped(async ({ req, stationId }) => {
    await seedTypes(stationId);
    const today = (req.query.today && isIsoDay(req.query.today))
      ? req.query.today : new Date().toISOString().slice(0, 10);
    const [types, assets, apparatus, latest] = await Promise.all([
      pool.query(`SELECT * FROM asset_test_types
                   WHERE department_id = $1 AND deleted_at IS NULL AND active = TRUE`, [stationId]),
      pool.query(`SELECT * FROM tracked_assets
                   WHERE department_id = $1 AND deleted_at IS NULL
                     AND status NOT IN ('condemned','retired')`, [stationId]),
      pool.query(`SELECT id, designation, status FROM apparatus WHERE department_id = $1`, [stationId]),
      pool.query(`SELECT DISTINCT ON (test_type_id, asset_id, apparatus_id)
                         test_type_id, asset_id, apparatus_id, event_date
                    FROM asset_test_events
                   WHERE department_id = $1 AND deleted_at IS NULL
                   ORDER BY test_type_id, asset_id, apparatus_id, event_date DESC, id DESC`, [stationId]),
    ]);
    const lastByKey = new Map();
    for (const e of latest.rows) {
      lastByKey.set(`${e.test_type_id}:${e.asset_id || ''}:${e.apparatus_id || ''}`, toDay(e.event_date));
    }
    const rows = [];
    for (const type of types.rows) {
      const targets = type.target === 'apparatus'
        ? apparatus.rows.map((a) => ({ kind: 'apparatus', id: a.id, label: a.designation, paused: a.status === 'Out of Service' }))
        : assets.rows.filter((t) => t.family === type.family)
          .map((t) => ({ kind: 'asset', id: t.id, label: t.name, paused: t.status === 'out_of_service', asset: t }));
      for (const tg of targets) {
        const key = `${type.id}:${tg.kind === 'asset' ? tg.id : ''}:${tg.kind === 'apparatus' ? tg.id : ''}`;
        const last = lastByKey.get(key) || null;
        let anchorDate = last;
        let anchorKind = 'last_event';
        if (!last) {
          const fa = type.first_anchor || (type.anchor !== 'last_event' ? type.anchor : null);
          if (fa && tg.asset) {
            anchorDate = toDay(tg.asset[fa === 'manufacture' ? 'manufacture_date' : 'in_service_date']);
            anchorKind = fa;
          }
        }
        let due_state = 'unknown';
        let due_date = null;
        if (tg.paused) {
          due_state = 'paused';
        } else if (anchorDate) {
          due_date = addDaysISO(anchorDate, type.interval_days);
          due_state = today < due_date ? 'ok' : (today === due_date ? 'due' : 'overdue');
        }
        rows.push({
          test_type_id: type.id, test_type_name: type.name, family: type.family,
          target_kind: tg.kind, target_id: tg.id, target_label: tg.label,
          last_event_date: last, anchor_kind: anchorKind, due_date, due_state,
        });
      }
    }
    // Retirement clocks (alert-only). Year-only manufacture = conservative Jan 1, FLAGGED.
    const retirement = assets.rows
      .filter((t) => t.retirement_months)
      .map((t) => {
        let base = toDay(t.manufacture_date);
        let approx = false;
        if (!base && t.manufacture_year) { base = `${t.manufacture_year}-01-01`; approx = true; }
        if (!base) {
          return { asset_id: t.id, name: t.name, family: t.family, retire_state: 'unknown', advisory: !!t.retirement_advisory };
        }
        const retireDate = addDaysISO(base, Math.round(t.retirement_months * 30.44));
        const state = today >= retireDate ? 'overdue'
          : (addDaysISO(today, 180) >= retireDate ? 'approaching' : 'ok');
        return {
          asset_id: t.id, name: t.name, family: t.family, retire_date: retireDate,
          retire_state: state, advisory: !!t.retirement_advisory, year_only_approximation: approx,
        };
      });
    return { data: { tests: rows, retirement } };
  }));

module.exports = router;
