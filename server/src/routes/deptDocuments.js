const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const DOC_CATEGORIES = [
  'policy', 'procedure', 'sog', 'contract', 'cba', 'insurance',
  'mutual_aid', 'training', 'certification', 'inspection', 'grant',
  'budget', 'meeting_minutes', 'by_laws', 'charter', 'personnel',
  'apparatus', 'facility', 'safety', 'compliance', 'other',
];

const DOC_TYPES = [
  'policy', 'procedure', 'form', 'template', 'certificate', 'agreement',
  'report', 'manual', 'guide', 'regulation', 'memo', 'minutes', 'other',
];

// GET /
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { category, doc_type, status, search } = req.query;
    let sql = 'SELECT * FROM dept_documents WHERE department_id = $1';
    const params = [stationId];
    if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
    if (doc_type) { params.push(doc_type); sql += ` AND doc_type = $${params.length}`; }
    if (status)   { params.push(status);   sql += ` AND status = $${params.length}`; }
    if (search)   { params.push(`%${search}%`); sql += ` AND (title ILIKE $${params.length} OR description ILIKE $${params.length} OR content ILIKE $${params.length})`; }
    sql += ' ORDER BY category, title';
    const { rows } = await pool.query(sql, params);
    res.json({ data: rows });
  } catch (err) {
    console.error('GET /api/dept-documents error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /categories
router.get('/categories', (_req, res) => {
  res.json({ categories: DOC_CATEGORIES, doc_types: DOC_TYPES });
});

// GET /review-due — documents needing review
router.get('/review-due', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const days = parseInt(req.query.days) || 30;
    const { rows } = await pool.query(`
      SELECT * FROM dept_documents
      WHERE department_id = $1 AND status = 'active'
        AND review_date IS NOT NULL
        AND review_date <= CURRENT_DATE + $2::INTEGER
      ORDER BY review_date
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
    const { rows: total } = await pool.query(`SELECT COUNT(*) AS count FROM dept_documents WHERE department_id = $1`, [stationId]);
    const { rows: active } = await pool.query(`SELECT COUNT(*) AS count FROM dept_documents WHERE department_id = $1 AND status = 'active'`, [stationId]);
    const { rows: reviewDue } = await pool.query(`
      SELECT COUNT(*) AS count FROM dept_documents WHERE department_id = $1 AND status = 'active'
        AND review_date IS NOT NULL AND review_date <= CURRENT_DATE + 30
    `, [stationId]);
    const { rows: byCategory } = await pool.query(`
      SELECT category, COUNT(*) AS count FROM dept_documents WHERE department_id = $1
      GROUP BY category ORDER BY count DESC LIMIT 10
    `, [stationId]);
    res.json({
      total: parseInt(total[0].count),
      active: parseInt(active[0].count),
      reviewDue: parseInt(reviewDue[0].count),
      byCategory,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id
router.get('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { rows } = await pool.query('SELECT * FROM dept_documents WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { title, category, doc_type, description, version, effective_date,
            review_date, content, tags, uploaded_by, access_level } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO dept_documents (station_id, title, category, doc_type, description, version,
        effective_date, review_date, content, tags, uploaded_by, access_level)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      stationId,
      title || '', category || 'general', doc_type || 'policy', description || '',
      version || '1.0', effective_date || null, review_date || null,
      content || '', JSON.stringify(tags || []), uploaded_by || '', access_level || 'all',
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/dept-documents error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id
router.patch('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const allowed = ['title', 'category', 'doc_type', 'description', 'version',
      'effective_date', 'review_date', 'content', 'tags', 'status', 'access_level'];
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
      `UPDATE dept_documents SET ${sets.join(', ')} WHERE id = $${idx} AND department_id = $1 RETURNING *`, vals
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
    await pool.query('DELETE FROM dept_documents WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
