'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');

const ITEM_TYPES = [
  'radio', 'portable_radio', 'pager', 'keys', 'access_card', 'laptop',
  'tablet', 'camera', 'thermal_imager', 'gas_meter', 'aed',
  'ppe_set', 'scba_pack', 'hand_tool', 'power_tool', 'vehicle', 'other'
];

const CONDITIONS = ['new', 'excellent', 'good', 'fair', 'poor', 'damaged'];

// GET / — list checkouts (optional ?status=checked_out|returned)
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    let sql = `SELECT ec.*, m.name as member_name FROM equipment_checkout ec
               LEFT JOIN members m ON ec.checked_out_by = m.id
               WHERE ec.department_id = $1`;
    const params = [stationId];
    if (req.query.status) { sql += ` AND ec.status = $${params.length + 1}`; params.push(req.query.status); }
    sql += ' ORDER BY ec.checked_out_at DESC';
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /types
router.get('/types', (_req, res) => res.json(ITEM_TYPES));

// GET /conditions
router.get('/conditions', (_req, res) => res.json(CONDITIONS));

// GET /active — currently checked out items
router.get('/active', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { rows } = await db.query(
      `SELECT ec.*, m.name as member_name FROM equipment_checkout ec
       LEFT JOIN members m ON ec.checked_out_by = m.id
       WHERE ec.department_id = $1 AND ec.status = 'checked_out'
       ORDER BY ec.checked_out_at DESC`,
      [stationId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /overdue — items past expected return
router.get('/overdue', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { rows } = await db.query(
      `SELECT ec.*, m.name as member_name FROM equipment_checkout ec
       LEFT JOIN members m ON ec.checked_out_by = m.id
       WHERE ec.department_id = $1 AND ec.status = 'checked_out' AND ec.expected_return < NOW()
       ORDER BY ec.expected_return ASC`,
      [stationId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /stats
router.get('/stats', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const out = await db.query("SELECT COUNT(*) as c FROM equipment_checkout WHERE department_id = $1 AND status = 'checked_out'", [stationId]);
    const overdue = await db.query("SELECT COUNT(*) as c FROM equipment_checkout WHERE department_id = $1 AND status = 'checked_out' AND expected_return < NOW()", [stationId]);
    const total = await db.query('SELECT COUNT(*) as c FROM equipment_checkout WHERE department_id = $1', [stationId]);
    res.json({
      checkedOut: parseInt(out.rows[0].c),
      overdue: parseInt(overdue.rows[0].c),
      totalRecords: parseInt(total.rows[0].c),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await db.query(
      `INSERT INTO equipment_checkout (station_id, item_name, item_type, serial_number, asset_tag, checked_out_by, expected_return, condition_out, purpose, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.department_id, b.item_name, b.item_type || 'radio', b.serial_number, b.asset_tag,
       b.checked_out_by, b.expected_return, b.condition_out || 'good', b.purpose, b.notes, 'checked_out']
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /:id — update or return item
router.patch('/:id', async (req, res) => {
  try {
    const b = req.body;
    // Return flow
    if (b.return_item) {
      const { rows } = await db.query(
        `UPDATE equipment_checkout SET status = 'returned', returned_at = NOW(), returned_to = $1, condition_in = $2, notes = COALESCE($3, notes), updated_at = NOW() WHERE id = $4 AND department_id = $5 RETURNING *`,
        [b.returned_to, b.condition_in || 'good', b.notes, req.params.id, req.user.department_id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      return res.json(rows[0]);
    }
    const allowed = ['item_name', 'item_type', 'serial_number', 'asset_tag', 'expected_return', 'condition_out', 'purpose', 'notes', 'status'];
    const data = {};
    for (const k of allowed) { if (b[k] !== undefined) data[k] = b[k]; }
    const { sets, values, nextIdx } = db.buildSetClause(data, Object.keys(data), 1);
    if (!sets) return res.status(400).json({ error: 'No valid fields' });
    values.push(req.params.id, req.user.department_id);
    const { rows } = await db.query(`UPDATE equipment_checkout SET ${sets}, updated_at = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx + 1} RETURNING *`, values);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM equipment_checkout WHERE id = $1 AND department_id = $2', [req.params.id, req.user.department_id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
