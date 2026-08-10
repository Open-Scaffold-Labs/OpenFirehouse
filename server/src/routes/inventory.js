'use strict';
/**
 * routes/inventory.js — par-level inventory + expirations (Phase 2.4, migration 0085).
 * Spec: docs/PHASE2-INVENTORY-SPEC-2026-07-26.md.
 *
 * The leave-banks pattern: an APPEND-ONLY movement ledger (inventory_txns) behind cached
 * balances (inventory_stock / inventory_lots), with ONE write door (postTxn) whose
 * negative-stock block is physical (CHECK qty >= 0 + guarded UPDATE).
 *
 *   Config (mechanic/chief): items CRUD-soft · locations CRUD-soft · PATCH par
 *   Crew (any member): usage · usage-transfer · counts (variance needs a reason) ·
 *                      requisition create/cancel
 *   Mechanic/officer: restock (mints lots at receipt) · transfer · requisition
 *                     decide/fulfill (ACCEPTANCE NEVER MOVES STOCK — fulfillment records do)
 *   Views: stock (?below_par=1 = the pick report, suggest = max − on-hand) · alerts
 *          (below-par + expiring/expired lots) · txn history — all computed on view.
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireMechanic, roleLevel } = require('../middleware/requireRole');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { isIsoDay } = require('../utils/localDate');

const { mintTag } = require('./scan');

const idParam = z.object({ id: z.string().regex(/^\d+$/) });
const qty = z.number().min(0.01).max(999999);

function requireOfficerOrMechanic(req, res, next) {
  if (!req.user || (roleLevel(req.user.role) < 2 && req.user.fleet_maintenance !== true)) {
    return res.status(403).json({ error: 'This action requires officer authority or the fleet-maintenance grant.', code: 'FORBIDDEN_ROLE' });
  }
  next();
}

/** THE one stock door. Guarded updates keep balances ≥ 0 (422 on shortfall); every change
 *  writes a ledger row. lotId required by callers when the item tracks lots. */
async function postTxn(stationId, user, {
  itemId, locationId, lotId = null, verb, delta,
  counterpartLocationId = null, countedQty = null, incidentRef = '', reason = '',
  requisitionId = null,
}) {
  // Ensure the stock row exists (0 default), then apply the guarded delta.
  await pool.query(
    `INSERT INTO inventory_stock (department_id, item_id, location_id, qty)
     VALUES ($1, $2, $3, 0) ON CONFLICT (item_id, location_id) DO NOTHING`,
    [stationId, itemId, locationId]);
  const s = await pool.query(
    `UPDATE inventory_stock SET qty = qty + $4, updated_at = NOW()
      WHERE department_id = $1 AND item_id = $2 AND location_id = $3 AND qty + $4 >= 0
      RETURNING qty`,
    [stationId, itemId, locationId, delta]);
  if (!s.rows.length) {
    throw httpError(422, 'Not enough stock at that location — record a count to correct the balance first.', 'INSUFFICIENT_STOCK');
  }
  if (lotId != null) {
    const l = await pool.query(
      `UPDATE inventory_lots SET qty = qty + $4, updated_at = NOW()
        WHERE id = $5 AND department_id = $1 AND item_id = $2 AND location_id = $3 AND qty + $4 >= 0
        RETURNING qty`,
      [stationId, itemId, locationId, delta, lotId]);
    if (!l.rows.length) {
      // Recover the stock cache (the lot guard refused) — mirror delta back.
      await pool.query(
        `UPDATE inventory_stock SET qty = qty - $4, updated_at = NOW()
          WHERE department_id = $1 AND item_id = $2 AND location_id = $3`,
        [stationId, itemId, locationId, delta]);
      throw httpError(422, 'Not enough stock in that lot.', 'INSUFFICIENT_STOCK');
    }
  }
  const t = await pool.query(
    `INSERT INTO inventory_txns
       (department_id, item_id, location_id, lot_id, verb, qty_delta, counterpart_location_id,
        counted_qty, incident_ref, reason, requisition_id, performed_by_user_id, performed_by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [stationId, itemId, locationId, lotId, verb, delta, counterpartLocationId,
     countedQty, incidentRef, reason, requisitionId, user.id, user.name || user.username || '']);
  return { txn: t.rows[0], qty: Number(s.rows[0].qty) };
}

async function fetchItem(stationId, id) {
  const r = await pool.query(
    'SELECT * FROM inventory_items WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [id, stationId]);
  return r.rows[0] || null;
}
async function fetchLocation(stationId, id) {
  const r = await pool.query(
    'SELECT * FROM inventory_locations WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [id, stationId]);
  return r.rows[0] || null;
}
/** Resolve + validate the (item, location[, lot]) triple. requireLot applies the
 *  lot-required-when-tracked rule — true for CONSUMING moves (usage, transfer-out),
 *  false where the lot is minted or irrelevant (restock, par, receiving side). */
async function resolveTarget(stationId, itemId, locationId, lotId, requireLot = true) {
  const item = await fetchItem(stationId, itemId);
  if (!item) throw httpError(422, 'Item not found.', 'BAD_ITEM');
  const loc = await fetchLocation(stationId, locationId);
  if (!loc) throw httpError(422, 'Location not found.', 'BAD_LOCATION');
  if (requireLot && item.tracks_lots && lotId == null) {
    throw httpError(422, 'This item tracks lots — pick the lot (never guessed for you).', 'LOT_REQUIRED');
  }
  if (lotId != null) {
    const l = await pool.query(
      'SELECT id FROM inventory_lots WHERE id = $1 AND department_id = $2 AND item_id = $3 AND location_id = $4',
      [lotId, stationId, itemId, locationId]);
    if (!l.rows.length) throw httpError(422, 'Lot not found at that location.', 'BAD_LOT');
  }
  return { item, loc };
}

// ── Config: items + locations + par (mechanic/chief) ─────────────────────────

router.get('/items', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    'SELECT * FROM inventory_items WHERE department_id = $1 AND deleted_at IS NULL ORDER BY category, name', [stationId]);
  return { data: rows };
}));

const itemBase = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().max(80).optional(),
  unit: z.string().trim().max(30).optional(),
  tracks_lots: z.boolean().optional(),
  notes: z.string().trim().max(1000).optional(),
  active: z.boolean().optional(),
}).strict();

router.post('/items', requireMechanic, validate({ body: itemBase }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO inventory_items (department_id, station_id, name, category, unit, tracks_lots, notes, scan_tag)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [stationId, b.name, b.category || '', b.unit || 'each', b.tracks_lots ?? false, b.notes || '', mintTag()]);
    await audit(stationId, user, 'create', 'inventory_items', rows[0].id, { name: b.name });
    return { data: rows[0], _status: 201 };
  }));

router.patch('/items/:id', requireMechanic, validate({ params: idParam, body: itemBase.partial() }),
  scoped(async ({ req, stationId, user }) => {
    const sets = []; const vals = [];
    for (const k of ['name', 'category', 'unit', 'tracks_lots', 'notes', 'active']) {
      if (req.body[k] === undefined) continue;
      vals.push(req.body[k]); sets.push(`${k} = $${vals.length}`);
    }
    if (!sets.length) throw httpError(400, 'No valid fields', 'NO_FIELDS');
    vals.push(req.params.id, stationId);
    const { rows } = await pool.query(
      `UPDATE inventory_items SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${vals.length - 1} AND department_id = $${vals.length} AND deleted_at IS NULL RETURNING *`, vals);
    if (!rows.length) throw httpError(404, 'Item not found.', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'inventory_items', rows[0].id, { fields: sets.length });
    return { data: rows[0] };
  }));

router.delete('/items/:id', requireMechanic, validate({ params: idParam }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query(
      `UPDATE inventory_items SET deleted_at = NOW(), active = FALSE, updated_at = NOW()
        WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL RETURNING id, name`,
      [req.params.id, stationId]);
    if (!rows.length) throw httpError(404, 'Item not found.', 'NOT_FOUND');
    await audit(stationId, user, 'soft_delete', 'inventory_items', rows[0].id, { name: rows[0].name });
    return { data: { id: rows[0].id, deleted: true } };
  }));

router.get('/locations', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT l.*, a.designation AS apparatus_designation
       FROM inventory_locations l LEFT JOIN apparatus a ON a.id = l.apparatus_id
      WHERE l.department_id = $1 AND l.deleted_at IS NULL ORDER BY l.kind, l.name`, [stationId]);
  return { data: rows };
}));

const locBase = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['supply_room', 'station', 'apparatus', 'kit', 'other']).optional(),
  apparatus_id: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
}).strict();

router.post('/locations', requireMechanic, validate({ body: locBase }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    if (b.apparatus_id) {
      const a = await pool.query('SELECT id FROM apparatus WHERE id = $1 AND department_id = $2', [b.apparatus_id, stationId]);
      if (!a.rows.length) throw httpError(422, 'Apparatus not found in your department.', 'BAD_APPARATUS');
    }
    const { rows } = await pool.query(
      `INSERT INTO inventory_locations (department_id, station_id, name, kind, apparatus_id, scan_tag)
       VALUES ($1, $1, $2, $3, $4, $5) RETURNING *`,
      [stationId, b.name, b.kind || 'supply_room', b.apparatus_id ?? null, mintTag()]);
    await audit(stationId, user, 'create', 'inventory_locations', rows[0].id, { name: b.name, kind: rows[0].kind });
    return { data: rows[0], _status: 201 };
  }));

router.patch('/locations/:id', requireMechanic, validate({ params: idParam, body: locBase.partial() }),
  scoped(async ({ req, stationId, user }) => {
    const sets = []; const vals = [];
    for (const k of ['name', 'kind', 'apparatus_id', 'active']) {
      if (req.body[k] === undefined) continue;
      vals.push(req.body[k]); sets.push(`${k} = $${vals.length}`);
    }
    if (!sets.length) throw httpError(400, 'No valid fields', 'NO_FIELDS');
    vals.push(req.params.id, stationId);
    const { rows } = await pool.query(
      `UPDATE inventory_locations SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${vals.length - 1} AND department_id = $${vals.length} AND deleted_at IS NULL RETURNING *`, vals);
    if (!rows.length) throw httpError(404, 'Location not found.', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'inventory_locations', rows[0].id, { fields: sets.length });
    return { data: rows[0] };
  }));

// Par min/max on the (item × location) pair (upserts the stock row).
router.post('/par', requireMechanic,
  validate({
    body: z.object({
      item_id: z.number().int().positive(),
      location_id: z.number().int().positive(),
      par_min: z.number().min(0).max(999999).nullable(),
      par_max: z.number().min(0).max(999999).nullable(),
    }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    if (b.par_min != null && b.par_max != null && b.par_max < b.par_min) {
      throw httpError(422, 'par_max cannot be below par_min.', 'BAD_PAR');
    }
    // Par is config, not movement — validate existence only (no lot requirement here).
    if (!(await fetchItem(stationId, b.item_id))) throw httpError(422, 'Item not found.', 'BAD_ITEM');
    if (!(await fetchLocation(stationId, b.location_id))) throw httpError(422, 'Location not found.', 'BAD_LOCATION');
    const { rows } = await pool.query(
      `INSERT INTO inventory_stock (department_id, item_id, location_id, qty, par_min, par_max)
       VALUES ($1, $2, $3, 0, $4, $5)
       ON CONFLICT (item_id, location_id)
       DO UPDATE SET par_min = EXCLUDED.par_min, par_max = EXCLUDED.par_max, updated_at = NOW()
       RETURNING *`,
      [stationId, b.item_id, b.location_id, b.par_min, b.par_max]);
    await audit(stationId, user, 'update', 'inventory_stock', rows[0].id,
      { action: 'par', item_id: b.item_id, location_id: b.location_id, par_min: b.par_min, par_max: b.par_max });
    return { data: rows[0] };
  }));

// ── Views ────────────────────────────────────────────────────────────────────

router.get('/stock',
  validate({
    query: z.object({
      location_id: z.string().regex(/^\d+$/).optional(),
      below_par: z.enum(['1']).optional(),
    }).partial(),
  }),
  scoped(async ({ req, stationId }) => {
    const conds = ['s.department_id = $1'];
    const vals = [stationId];
    if (req.query.location_id) { vals.push(req.query.location_id); conds.push(`s.location_id = $${vals.length}`); }
    if (req.query.below_par === '1') conds.push('s.par_min IS NOT NULL AND s.qty < s.par_min');
    const { rows } = await pool.query(
      `SELECT s.*, i.name AS item_name, i.unit, i.tracks_lots, i.category,
              l.name AS location_name, l.kind AS location_kind,
              CASE WHEN s.par_min IS NOT NULL AND s.qty < s.par_min
                   THEN COALESCE(s.par_max, s.par_min) - s.qty ELSE NULL END AS suggest
         FROM inventory_stock s
         JOIN inventory_items i ON i.id = s.item_id AND i.deleted_at IS NULL
         JOIN inventory_locations l ON l.id = s.location_id AND l.deleted_at IS NULL
        WHERE ${conds.join(' AND ')}
        ORDER BY l.name, i.category, i.name`, vals);
    return { data: rows };
  }));

router.get('/lots',
  validate({ query: z.object({ item_id: z.string().regex(/^\d+$/).optional(), location_id: z.string().regex(/^\d+$/).optional() }).partial() }),
  scoped(async ({ req, stationId }) => {
    const conds = ['lo.department_id = $1', 'lo.qty > 0'];
    const vals = [stationId];
    if (req.query.item_id) { vals.push(req.query.item_id); conds.push(`lo.item_id = $${vals.length}`); }
    if (req.query.location_id) { vals.push(req.query.location_id); conds.push(`lo.location_id = $${vals.length}`); }
    const { rows } = await pool.query(
      `SELECT lo.*, i.name AS item_name, l.name AS location_name
         FROM inventory_lots lo
         JOIN inventory_items i ON i.id = lo.item_id
         JOIN inventory_locations l ON l.id = lo.location_id
        WHERE ${conds.join(' AND ')}
        ORDER BY lo.expiration_date NULLS LAST, lo.id`, vals);
    return { data: rows };
  }));

router.get('/alerts',
  validate({ query: z.object({ days: z.string().regex(/^\d+$/).optional() }).partial() }),
  scoped(async ({ req, stationId }) => {
    const days = Math.min(Number(req.query.days || 60), 365);
    const [belowPar, expiring] = await Promise.all([
      pool.query(
        `SELECT s.item_id, s.location_id, s.qty, s.par_min, s.par_max,
                COALESCE(s.par_max, s.par_min) - s.qty AS suggest,
                i.name AS item_name, i.unit, l.name AS location_name
           FROM inventory_stock s
           JOIN inventory_items i ON i.id = s.item_id AND i.deleted_at IS NULL AND i.active = TRUE
           JOIN inventory_locations l ON l.id = s.location_id AND l.deleted_at IS NULL AND l.active = TRUE
          WHERE s.department_id = $1 AND s.par_min IS NOT NULL AND s.qty < s.par_min
          ORDER BY l.name, i.name`, [stationId]),
      pool.query(
        `SELECT lo.*, i.name AS item_name, l.name AS location_name,
                (lo.expiration_date < CURRENT_DATE) AS expired
           FROM inventory_lots lo
           JOIN inventory_items i ON i.id = lo.item_id AND i.deleted_at IS NULL
           JOIN inventory_locations l ON l.id = lo.location_id AND l.deleted_at IS NULL
          WHERE lo.department_id = $1 AND lo.qty > 0 AND lo.expiration_date IS NOT NULL
            AND lo.expiration_date <= CURRENT_DATE + $2::int
          ORDER BY lo.expiration_date`, [stationId, days]),
    ]);
    return { data: { below_par: belowPar.rows, expiring: expiring.rows, window_days: days } };
  }));

router.get('/txns',
  validate({ query: z.object({ item_id: z.string().regex(/^\d+$/).optional(), location_id: z.string().regex(/^\d+$/).optional(), limit: z.string().regex(/^\d+$/).optional() }).partial() }),
  scoped(async ({ req, stationId }) => {
    const conds = ['t.department_id = $1'];
    const vals = [stationId];
    if (req.query.item_id) { vals.push(req.query.item_id); conds.push(`t.item_id = $${vals.length}`); }
    if (req.query.location_id) { vals.push(req.query.location_id); conds.push(`t.location_id = $${vals.length}`); }
    const limit = Math.min(Number(req.query.limit || 100), 500);
    vals.push(limit);
    const { rows } = await pool.query(
      `SELECT t.*, i.name AS item_name, l.name AS location_name
         FROM inventory_txns t
         JOIN inventory_items i ON i.id = t.item_id
         JOIN inventory_locations l ON l.id = t.location_id
        WHERE ${conds.join(' AND ')}
        ORDER BY t.id DESC LIMIT $${vals.length}`, vals);
    return { data: rows };
  }));

// ── Movements ────────────────────────────────────────────────────────────────

// Crew usage — any member; optional incident reference (a reference, not a join).
router.post('/usage',
  validate({
    body: z.object({
      item_id: z.number().int().positive(),
      location_id: z.number().int().positive(),
      lot_id: z.number().int().positive().nullable().optional(),
      qty: qty,
      incident_ref: z.string().trim().max(60).optional(),
      note: z.string().trim().max(500).optional(),
    }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    await resolveTarget(stationId, b.item_id, b.location_id, b.lot_id ?? null);
    const out = await postTxn(stationId, user, {
      itemId: b.item_id, locationId: b.location_id, lotId: b.lot_id ?? null,
      verb: 'usage', delta: -b.qty, incidentRef: b.incident_ref || '', reason: b.note || '',
    });
    return { data: out, _status: 201 };
  }));

// Usage-transfer (the market's composite): use at the point-of-use location AND backfill
// it from a supply location in one act. Any member.
router.post('/usage-transfer',
  validate({
    body: z.object({
      item_id: z.number().int().positive(),
      use_location_id: z.number().int().positive(),
      from_location_id: z.number().int().positive(),
      lot_id: z.number().int().positive().nullable().optional(),        // lot at the use location
      from_lot_id: z.number().int().positive().nullable().optional(),   // lot at the supply location
      qty: qty,
      incident_ref: z.string().trim().max(60).optional(),
    }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    if (b.use_location_id === b.from_location_id) throw httpError(422, 'Use and supply locations must differ.', 'BAD_TARGET');
    const { item } = await resolveTarget(stationId, b.item_id, b.use_location_id, b.lot_id ?? null);
    await resolveTarget(stationId, b.item_id, b.from_location_id, b.from_lot_id ?? null);
    const used = await postTxn(stationId, user, {
      itemId: b.item_id, locationId: b.use_location_id, lotId: b.lot_id ?? null,
      verb: 'usage', delta: -b.qty, incidentRef: b.incident_ref || '',
    });
    // Backfill: supply → use location (two transfer rows through the same door). For
    // lot-tracked items the arriving stock is ITS OWN lot (the supply lot's identity) —
    // never re-inflating the lot that was just consumed.
    await postTxn(stationId, user, {
      itemId: b.item_id, locationId: b.from_location_id, lotId: b.from_lot_id ?? null,
      verb: 'transfer', delta: -b.qty, counterpartLocationId: b.use_location_id,
    });
    let arriveLotId = null;
    if (item.tracks_lots && b.from_lot_id) {
      const src = await pool.query('SELECT lot_number, expiration_date FROM inventory_lots WHERE id = $1', [b.from_lot_id]);
      const lot = await pool.query(
        `INSERT INTO inventory_lots (department_id, item_id, location_id, lot_number, expiration_date, qty)
         VALUES ($1, $2, $3, $4, $5, 0) RETURNING id`,
        [stationId, b.item_id, b.use_location_id, src.rows[0]?.lot_number || '', src.rows[0]?.expiration_date || null]);
      arriveLotId = lot.rows[0].id;
    }
    const filled = await postTxn(stationId, user, {
      itemId: b.item_id, locationId: b.use_location_id, lotId: arriveLotId,
      verb: 'transfer', delta: b.qty, counterpartLocationId: b.from_location_id,
    });
    return { data: { item: item.name, used: used.qty, restocked_to: filled.qty }, _status: 201 };
  }));

// Vendor restock — mints a lot row at receipt for tracked items (mechanic/officer).
router.post('/restock', requireOfficerOrMechanic,
  validate({
    body: z.object({
      item_id: z.number().int().positive(),
      location_id: z.number().int().positive(),
      qty: qty,
      lot_number: z.string().trim().max(80).optional(),
      expiration_date: z.string().nullable().optional(),
      note: z.string().trim().max(500).optional(),
    }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    if (b.expiration_date && !isIsoDay(b.expiration_date)) throw httpError(422, 'expiration_date must be YYYY-MM-DD.', 'BAD_DATE');
    const { item } = await resolveTarget(stationId, b.item_id, b.location_id, null, false); // restock MINTS the lot
    let lotId = null;
    if (item.tracks_lots) {
      const lot = await pool.query(
        `INSERT INTO inventory_lots (department_id, item_id, location_id, lot_number, expiration_date, qty)
         VALUES ($1, $2, $3, $4, $5, 0) RETURNING id`,
        [stationId, b.item_id, b.location_id, b.lot_number || '', b.expiration_date || null]);
      lotId = lot.rows[0].id;
    }
    const out = await postTxn(stationId, user, {
      itemId: b.item_id, locationId: b.location_id, lotId,
      verb: 'restock', delta: b.qty, reason: b.note || '',
    });
    return { data: out, _status: 201 };
  }));

// Transfer between locations (mechanic/officer).
router.post('/transfer', requireOfficerOrMechanic,
  validate({
    body: z.object({
      item_id: z.number().int().positive(),
      from_location_id: z.number().int().positive(),
      to_location_id: z.number().int().positive(),
      from_lot_id: z.number().int().positive().nullable().optional(),
      qty: qty,
      note: z.string().trim().max(500).optional(),
    }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    if (b.from_location_id === b.to_location_id) throw httpError(422, 'Locations must differ.', 'BAD_TARGET');
    const { item } = await resolveTarget(stationId, b.item_id, b.from_location_id, b.from_lot_id ?? null);
    if (!(await fetchLocation(stationId, b.to_location_id))) {
      throw httpError(422, 'Receiving location not found.', 'BAD_LOCATION');
    }
    await postTxn(stationId, user, {
      itemId: b.item_id, locationId: b.from_location_id, lotId: b.from_lot_id ?? null,
      verb: 'transfer', delta: -b.qty, counterpartLocationId: b.to_location_id, reason: b.note || '',
    });
    // Receiving side: for lot-tracked items the moved lot arrives as its own lot row.
    let toLotId = null;
    if (item.tracks_lots && b.from_lot_id) {
      const src = await pool.query('SELECT lot_number, expiration_date FROM inventory_lots WHERE id = $1', [b.from_lot_id]);
      const lot = await pool.query(
        `INSERT INTO inventory_lots (department_id, item_id, location_id, lot_number, expiration_date, qty)
         VALUES ($1, $2, $3, $4, $5, 0) RETURNING id`,
        [stationId, b.item_id, b.to_location_id, src.rows[0]?.lot_number || '', src.rows[0]?.expiration_date || null]);
      toLotId = lot.rows[0].id;
    }
    const inTx = await postTxn(stationId, user, {
      itemId: b.item_id, locationId: b.to_location_id, lotId: toLotId,
      verb: 'transfer', delta: b.qty, counterpartLocationId: b.from_location_id, reason: b.note || '',
    });
    return { data: inTx, _status: 201 };
  }));

// Counts — any member; variance requires a reason; delta computed SERVER-side; the
// completed count is its rows (immutable ledger).
router.post('/count',
  validate({
    body: z.object({
      location_id: z.number().int().positive(),
      lines: z.array(z.object({
        item_id: z.number().int().positive(),
        lot_id: z.number().int().positive().nullable().optional(),
        counted_qty: z.number().min(0).max(999999),
        reason: z.string().trim().max(500).optional(),
      }).strict()).min(1).max(300),
    }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const loc = await fetchLocation(stationId, b.location_id);
    if (!loc) throw httpError(422, 'Location not found.', 'BAD_LOCATION');
    const results = [];
    for (const line of b.lines) {
      const { item } = await resolveTarget(stationId, line.item_id, b.location_id, line.lot_id ?? null);
      let current;
      if (line.lot_id != null) {
        const l = await pool.query('SELECT qty FROM inventory_lots WHERE id = $1', [line.lot_id]);
        current = Number(l.rows[0].qty);
      } else {
        const s = await pool.query(
          'SELECT qty FROM inventory_stock WHERE item_id = $1 AND location_id = $2', [line.item_id, b.location_id]);
        current = s.rows.length ? Number(s.rows[0].qty) : 0;
      }
      const delta = Math.round((line.counted_qty - current) * 100) / 100;
      if (delta !== 0 && !(line.reason && line.reason.length >= 3)) {
        throw httpError(422, `A variance on ${item.name} (${current} → ${line.counted_qty}) needs a reason.`, 'VARIANCE_REASON_REQUIRED');
      }
      if (delta !== 0) {
        await postTxn(stationId, user, {
          itemId: line.item_id, locationId: b.location_id, lotId: line.lot_id ?? null,
          verb: 'count_adjust', delta, countedQty: line.counted_qty, reason: line.reason || '',
        });
        await audit(stationId, user, 'update', 'inventory_stock', line.item_id,
          { action: 'count_variance', location_id: b.location_id, delta, counted: line.counted_qty, reason: line.reason });
      }
      results.push({ item_id: line.item_id, lot_id: line.lot_id ?? null, counted: line.counted_qty, delta });
    }
    return { data: { location_id: b.location_id, lines: results }, _status: 201 };
  }));

// ── Requisitions ─────────────────────────────────────────────────────────────

router.get('/requisitions',
  validate({ query: z.object({ status: z.enum(['submitted', 'accepted', 'denied', 'fulfilled', 'cancelled']).optional() }).partial() }),
  scoped(async ({ req, stationId }) => {
    const conds = ['r.department_id = $1'];
    const vals = [stationId];
    if (req.query.status) { vals.push(req.query.status); conds.push(`r.status = $${vals.length}`); }
    const { rows } = await pool.query(
      `SELECT r.*, tl.name AS to_location_name, fl.name AS from_location_name,
              (SELECT json_agg(json_build_object('id', ln.id, 'item_id', ln.item_id,
                 'item_name', i.name, 'unit', i.unit, 'qty_requested', ln.qty_requested,
                 'qty_fulfilled', ln.qty_fulfilled) ORDER BY ln.id)
                 FROM requisition_lines ln JOIN inventory_items i ON i.id = ln.item_id
                WHERE ln.requisition_id = r.id) AS lines
         FROM requisitions r
         JOIN inventory_locations tl ON tl.id = r.to_location_id
         LEFT JOIN inventory_locations fl ON fl.id = r.from_location_id
        WHERE ${conds.join(' AND ')}
        ORDER BY CASE r.status WHEN 'submitted' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, r.created_at DESC
        LIMIT 200`, vals);
    return { data: rows };
  }));

router.post('/requisitions',
  validate({
    body: z.object({
      to_location_id: z.number().int().positive(),
      note: z.string().trim().max(1000).optional(),
      lines: z.array(z.object({
        item_id: z.number().int().positive(),
        qty_requested: qty,
      }).strict()).min(1).max(100),
    }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const loc = await fetchLocation(stationId, b.to_location_id);
    if (!loc) throw httpError(422, 'Location not found.', 'BAD_LOCATION');
    for (const line of b.lines) {
      if (!(await fetchItem(stationId, line.item_id))) throw httpError(422, 'Item not found.', 'BAD_ITEM');
    }
    const { rows } = await pool.query(
      `INSERT INTO requisitions (department_id, station_id, to_location_id, note, requested_by_user_id, requested_by_name)
       VALUES ($1, $1, $2, $3, $4, $5) RETURNING *`,
      [stationId, b.to_location_id, b.note || '', user.id, user.name || user.username || '']);
    const reqRow = rows[0];
    for (const line of b.lines) {
      await pool.query(
        `INSERT INTO requisition_lines (requisition_id, department_id, item_id, qty_requested)
         VALUES ($1, $2, $3, $4)`, [reqRow.id, stationId, line.item_id, line.qty_requested]);
    }
    return { data: reqRow, _status: 201 };
  }));

router.post('/requisitions/:id/cancel', validate({ params: idParam }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query(
      `UPDATE requisitions SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND department_id = $2 AND status = 'submitted' AND requested_by_user_id = $3
        RETURNING *`,
      [req.params.id, stationId, user.id]);
    if (!rows.length) throw httpError(404, 'Request not found, already decided, or not yours.', 'NOT_FOUND');
    return { data: rows[0] };
  }));

// Decide: accept (never moves stock) or deny (reason required). Officer/mechanic.
router.post('/requisitions/:id/decide', requireOfficerOrMechanic,
  validate({
    params: idParam,
    body: z.object({
      decision: z.enum(['accepted', 'denied']),
      from_location_id: z.number().int().positive().optional(),
      note: z.string().trim().max(500).optional(),
    }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    if (b.decision === 'denied' && !(b.note && b.note.length >= 3)) {
      throw httpError(422, 'Denying a request needs a reason the requester will see.', 'REASON_REQUIRED');
    }
    if (b.from_location_id && !(await fetchLocation(stationId, b.from_location_id))) {
      throw httpError(422, 'Fulfilling location not found.', 'BAD_LOCATION');
    }
    const { rows } = await pool.query(
      `UPDATE requisitions
          SET status = $3, from_location_id = COALESCE($4, from_location_id),
              decided_by_user_id = $5, decided_at = NOW(), decide_note = $6, updated_at = NOW()
        WHERE id = $1 AND department_id = $2 AND status = 'submitted' RETURNING *`,
      [req.params.id, stationId, b.decision, b.from_location_id ?? null, user.id, b.note || '']);
    if (!rows.length) throw httpError(409, 'Request already decided.', 'CONFLICT');
    await audit(stationId, user, b.decision === 'accepted' ? 'approve' : 'reject',
      'requisitions', rows[0].id, { note: b.note || '' });
    return { data: rows[0] };
  }));

// Fulfill: THE act that moves stock — a human records per-line quantities (partials fine).
router.post('/requisitions/:id/fulfill', requireOfficerOrMechanic,
  validate({
    params: idParam,
    body: z.object({
      from_location_id: z.number().int().positive().optional(),
      lines: z.array(z.object({
        line_id: z.number().int().positive(),
        qty_fulfilled: z.number().min(0).max(999999),
        from_lot_id: z.number().int().positive().nullable().optional(),
      }).strict()).min(1).max(100),
    }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const r = await pool.query(
      `SELECT * FROM requisitions WHERE id = $1 AND department_id = $2 AND status = 'accepted'`,
      [req.params.id, stationId]);
    if (!r.rows.length) throw httpError(409, 'Only an accepted request can be fulfilled.', 'CONFLICT');
    const reqRow = r.rows[0];
    const fromLoc = b.from_location_id ?? reqRow.from_location_id;
    if (!fromLoc) throw httpError(422, 'A fulfilling location is required.', 'BAD_LOCATION');
    if (!(await fetchLocation(stationId, fromLoc))) throw httpError(422, 'Fulfilling location not found.', 'BAD_LOCATION');
    for (const line of b.lines) {
      const ln = await pool.query(
        'SELECT * FROM requisition_lines WHERE id = $1 AND requisition_id = $2', [line.line_id, reqRow.id]);
      if (!ln.rows.length) throw httpError(422, 'Line not found on this request.', 'BAD_LINE');
      const item = await fetchItem(stationId, ln.rows[0].item_id);
      if (line.qty_fulfilled > 0) {
        await resolveTarget(stationId, item.id, fromLoc, line.from_lot_id ?? null);
        await postTxn(stationId, user, {
          itemId: item.id, locationId: fromLoc, lotId: line.from_lot_id ?? null,
          verb: 'transfer', delta: -line.qty_fulfilled,
          counterpartLocationId: reqRow.to_location_id, requisitionId: reqRow.id,
        });
        await postTxn(stationId, user, {
          itemId: item.id, locationId: reqRow.to_location_id, lotId: null,
          verb: 'transfer', delta: line.qty_fulfilled,
          counterpartLocationId: fromLoc, requisitionId: reqRow.id,
        });
      }
      await pool.query('UPDATE requisition_lines SET qty_fulfilled = $1 WHERE id = $2',
        [line.qty_fulfilled, line.line_id]);
    }
    const { rows } = await pool.query(
      `UPDATE requisitions SET status = 'fulfilled', from_location_id = $3, updated_at = NOW()
        WHERE id = $1 AND department_id = $2 RETURNING *`,
      [reqRow.id, stationId, fromLoc]);
    await audit(stationId, user, 'update', 'requisitions', reqRow.id,
      { action: 'fulfilled', lines: b.lines.length });
    return { data: rows[0] };
  }));

module.exports = router;
