const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const AGREEMENT_TYPES = ['automatic', 'request_based', 'regional_compact', 'statewide', 'federal', 'specialty', 'other'];
const SERVICE_OPTIONS = [
  'fire_suppression', 'ems_als', 'ems_bls', 'hazmat', 'technical_rescue',
  'water_rescue', 'wildland', 'arson_investigation', 'aerial_operations',
  'tanker_shuttle', 'rehab', 'command_staff', 'dispatch', 'dive_team',
];

// GET /
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { status } = req.query;
    let sql = 'SELECT * FROM mutual_aid_agreements WHERE department_id = $1';
    const params = [stationId];
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    sql += ' ORDER BY partner_agency';
    const { rows } = await pool.query(sql, params);
    res.json({ data: rows });
  } catch (err) {
    console.error('GET /api/mutual-aid-agreements error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /types
router.get('/types', (_req, res) => {
  res.json({ agreement_types: AGREEMENT_TYPES, service_options: SERVICE_OPTIONS });
});

// GET /expiring — agreements expiring within N days
router.get('/expiring', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const days = parseInt(req.query.days) || 90;
    const { rows } = await pool.query(`
      SELECT * FROM mutual_aid_agreements
      WHERE department_id = $1 AND status = 'active'
        AND expiration_date IS NOT NULL
        AND expiration_date <= CURRENT_DATE + $2::INTEGER
        AND auto_renew = false
      ORDER BY expiration_date
    `, [stationId, days]);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stats
router.get('/stats', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { rows: active } = await pool.query(`SELECT COUNT(*) AS count FROM mutual_aid_agreements WHERE department_id = $1 AND status = 'active'`, [stationId]);
    const { rows: total } = await pool.query(`SELECT COUNT(*) AS count FROM mutual_aid_agreements WHERE department_id = $1`, [stationId]);
    const { rows: expiring } = await pool.query(`
      SELECT COUNT(*) AS count FROM mutual_aid_agreements
      WHERE department_id = $1 AND status = 'active' AND expiration_date IS NOT NULL
        AND expiration_date <= CURRENT_DATE + 90 AND auto_renew = false
    `, [stationId]);
    const { rows: avgDist } = await pool.query(`
      SELECT AVG(distance_miles) AS avg FROM mutual_aid_agreements
      WHERE department_id = $1 AND status = 'active' AND distance_miles > 0
    `, [stationId]);
    res.json({
      active: parseInt(active[0].count),
      total: parseInt(total[0].count),
      expiringSoon: parseInt(expiring[0].count),
      avgDistance: parseFloat(avgDist[0]?.avg || 0).toFixed(1),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { partner_agency, partner_fdid, partner_contact, partner_phone, partner_email,
            agreement_type, services, effective_date, expiration_date, auto_renew,
            distance_miles, response_time_min, document_ref, notes } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO mutual_aid_agreements (station_id, partner_agency, partner_fdid, partner_contact, partner_phone, partner_email,
        agreement_type, services, effective_date, expiration_date, auto_renew, distance_miles, response_time_min, document_ref, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [
      stationId,
      partner_agency || '', partner_fdid || '', partner_contact || '', partner_phone || '', partner_email || '',
      agreement_type || 'automatic', JSON.stringify(services || []),
      effective_date || null, expiration_date || null, auto_renew !== false,
      distance_miles || 0, response_time_min || 0, document_ref || '', notes || '',
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/mutual-aid-agreements error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id
router.patch('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const allowed = ['partner_agency', 'partner_fdid', 'partner_contact', 'partner_phone', 'partner_email',
      'agreement_type', 'services', 'effective_date', 'expiration_date', 'auto_renew',
      'distance_miles', 'response_time_min', 'status', 'document_ref', 'notes'];
    const sets = ['updated_at = NOW()'];
    const vals = [stationId];
    let idx = 2;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const val = Array.isArray(req.body[key]) ? JSON.stringify(req.body[key]) : req.body[key];
        sets.push(`"${key}" = $${idx++}`);
        vals.push(val);
      }
    }
    vals.push(parseInt(req.params.id));
    const { rows } = await pool.query(
      `UPDATE mutual_aid_agreements SET ${sets.join(', ')} WHERE id = $${idx} AND department_id = $1 RETURNING *`, vals
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('DELETE FROM mutual_aid_agreements WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
