'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');

const COST_CATEGORIES = ['apparatus', 'personnel', 'materials', 'mutual_aid', 'hazmat', 'investigation', 'rehab', 'other'];
const PAYMENT_STATUSES = ['not_billed', 'billed', 'partial', 'paid', 'waived', 'collections'];

// GET /
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    let sql = 'SELECT * FROM incident_costs WHERE department_id = $1';
    const params = [stationId];
    if (req.query.status) { sql += ` AND status = $${params.length + 1}`; params.push(req.query.status); }
    if (req.query.billable === 'true') { sql += ' AND billable = TRUE'; }
    sql += ' ORDER BY incident_date DESC';
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /categories
router.get('/categories', (_req, res) => res.json(COST_CATEGORIES));

// GET /payment-statuses
router.get('/payment-statuses', (_req, res) => res.json(PAYMENT_STATUSES));

// GET /stats
router.get('/stats', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const total = await db.query('SELECT COUNT(*) as c, COALESCE(SUM(total_cost),0) as total FROM incident_costs WHERE department_id = $1', [stationId]);
    const billable = await db.query('SELECT COUNT(*) as c, COALESCE(SUM(total_cost),0) as total FROM incident_costs WHERE department_id = $1 AND billable = TRUE', [stationId]);
    const unpaid = await db.query("SELECT COUNT(*) as c, COALESCE(SUM(total_cost),0) as total FROM incident_costs WHERE department_id = $1 AND billable = TRUE AND payment_status NOT IN ('paid','waived')", [stationId]);
    const thisYear = await db.query(
      "SELECT COALESCE(SUM(total_cost),0) as total FROM incident_costs WHERE department_id = $1 AND EXTRACT(YEAR FROM incident_date) = EXTRACT(YEAR FROM NOW())",
      [stationId]
    );
    res.json({
      totalIncidents: parseInt(total.rows[0].c),
      totalCosts: parseFloat(total.rows[0].total),
      billableCount: parseInt(billable.rows[0].c),
      billableTotal: parseFloat(billable.rows[0].total),
      unpaidCount: parseInt(unpaid.rows[0].c),
      unpaidTotal: parseFloat(unpaid.rows[0].total),
      yearToDate: parseFloat(thisYear.rows[0].total),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    // W2.5 audit (2026-06-10): incident_id is client-supplied — verify it
    // references an incident in the caller's own station.
    if (b.incident_id) {
      const own = await db.query(
        'SELECT id FROM incidents WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL',
        [b.incident_id, req.user.department_id]
      );
      if (!own.rows.length) return res.status(404).json({ error: 'Incident not found' });
    }
    const totalCost = (b.apparatus_costs || []).reduce((s, c) => s + (parseFloat(c.cost) || 0), 0)
      + (b.personnel_costs || []).reduce((s, c) => s + (parseFloat(c.cost) || 0), 0)
      + (b.material_costs || []).reduce((s, c) => s + (parseFloat(c.cost) || 0), 0)
      + (b.other_costs || []).reduce((s, c) => s + (parseFloat(c.cost) || 0), 0);
    const { rows } = await db.query(
      `INSERT INTO incident_costs (station_id, incident_id, incident_number, incident_date, incident_type, location,
        apparatus_costs, personnel_costs, material_costs, other_costs, total_cost, billable, billed_to, notes, calculated_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [req.user.department_id, b.incident_id, b.incident_number, b.incident_date, b.incident_type, b.location,
       JSON.stringify(b.apparatus_costs || []), JSON.stringify(b.personnel_costs || []),
       JSON.stringify(b.material_costs || []), JSON.stringify(b.other_costs || []),
       totalCost, b.billable || false, b.billed_to, b.notes, b.calculated_by, b.status || 'draft']
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /:id
router.patch('/:id', async (req, res) => {
  try {
    const b = req.body;
    const jsonFields = ['apparatus_costs', 'personnel_costs', 'material_costs', 'other_costs'];
    const allowed = ['incident_number', 'incident_date', 'incident_type', 'location', 'apparatus_costs', 'personnel_costs',
      'material_costs', 'other_costs', 'total_cost', 'billable', 'billed_to', 'invoice_number', 'payment_status', 'notes', 'calculated_by', 'status'];
    const data = {};
    for (const k of allowed) {
      if (b[k] !== undefined) data[k] = jsonFields.includes(k) ? JSON.stringify(b[k]) : b[k];
    }
    // Recalculate total if cost arrays changed
    if (b.apparatus_costs || b.personnel_costs || b.material_costs || b.other_costs) {
      const { rows: curr } = await db.query('SELECT apparatus_costs, personnel_costs, material_costs, other_costs FROM incident_costs WHERE id = $1 AND department_id = $2', [req.params.id, req.user.department_id]);
      if (curr.length) {
        const ac = b.apparatus_costs || curr[0].apparatus_costs || [];
        const pc = b.personnel_costs || curr[0].personnel_costs || [];
        const mc = b.material_costs || curr[0].material_costs || [];
        const oc = b.other_costs || curr[0].other_costs || [];
        data.total_cost = [ac, pc, mc, oc].flat().reduce((s, c) => s + (parseFloat(c.cost) || 0), 0);
      }
    }
    const { sets, values, nextIdx } = db.buildSetClause(data, Object.keys(data), 1);
    if (!sets) return res.status(400).json({ error: 'No valid fields' });
    values.push(req.params.id, req.user.department_id);
    const { rows } = await db.query(`UPDATE incident_costs SET ${sets}, updated_at = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx + 1} RETURNING *`, values);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM incident_costs WHERE id = $1 AND department_id = $2', [req.params.id, req.user.department_id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
