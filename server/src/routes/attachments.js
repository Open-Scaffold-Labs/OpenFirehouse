'use strict';
/**
 * routes/attachments.js — Document attachment system
 *
 * Enables any module to attach files to records.
 * Supports file metadata, extracted text, AI analysis, and access control.
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// ── file_url validation (W3.1, 2026-06-10) ───────────────────────────────────
// file_url is client-supplied and later rendered as a link / fetched by the
// client. Allow ONLY: http(s) URLs, or app-relative paths ("/..." but not
// protocol-relative "//..." and no ".." traversal). This blocks javascript:,
// data:, vbscript:, file: and friends.
function validateFileUrl(fileUrl) {
  if (typeof fileUrl !== 'string' || !fileUrl.length || fileUrl.length > 2048) return false;
  if (/[\u0000-\u001f]/.test(fileUrl)) return false; // control chars
  if (fileUrl.startsWith('/')) {
    return !fileUrl.startsWith('//') && !fileUrl.includes('..');
  }
  try {
    const u = new URL(fileUrl);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function validateAttachmentMeta(b) {
  if (typeof b.file_name !== 'string' || !b.file_name.trim() || b.file_name.length > 255
      || /[\u0000-\u001f\/\\]/.test(b.file_name)) {
    return 'file_name must be a plain filename (≤255 chars, no path separators)';
  }
  if (!validateFileUrl(b.file_url)) {
    return 'file_url must be an http(s) URL or an app-relative path';
  }
  if (b.file_type !== undefined && b.file_type !== null
      && (typeof b.file_type !== 'string' || b.file_type.length > 100)) {
    return 'file_type must be a string ≤100 chars';
  }
  if (b.file_size !== undefined && b.file_size !== null) {
    const n = Number(b.file_size);
    if (!Number.isFinite(n) || n < 0 || n > 5 * 1024 * 1024 * 1024) {
      return 'file_size must be a non-negative number (≤5GB)';
    }
  }
  return null;
}

// ── GET /api/attachments — List attachments for a record ─────────────────────
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { module, record_id } = req.query;

    // module and record_id are required
    if (!module || !record_id) {
      return res.status(400).json({
        error: 'module and record_id query parameters are required',
      });
    }

    const result = await pool.query(
      `SELECT * FROM attachments
       WHERE department_id = $1 AND module = $2 AND record_id = $3
       ORDER BY created_at DESC`,
      [stationId, module, record_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('[attachments GET]', err);
    res.status(500).json({ error: 'Failed to retrieve attachments' });
  }
});

// ── POST /api/attachments — Create a new attachment ──────────────────────────
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const {
      module,
      record_id,
      file_name,
      file_url,
      file_type,
      file_size,
      extracted_text,
      ai_extracted,
      description = '',
      uploaded_by,
      category = 'general',
      is_source = false,
      access_level = 'all',
    } = req.body;

    // Validate required fields
    if (!module || !file_name || !file_url) {
      return res.status(400).json({
        error: 'module, file_name, and file_url are required',
      });
    }
    const metaError = validateAttachmentMeta(req.body);
    if (metaError) {
      return res.status(400).json({ error: metaError });
    }

    const result = await pool.query(
      `INSERT INTO attachments
       (station_id, module, record_id, file_name, file_url, file_type, file_size,
        extracted_text, ai_extracted, description, uploaded_by, category, is_source, access_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        stationId,
        module,
        record_id,
        file_name,
        file_url,
        file_type,
        file_size,
        extracted_text,
        ai_extracted,
        description,
        uploaded_by,
        category,
        is_source,
        access_level,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[attachments POST]', err);
    res.status(500).json({ error: 'Failed to create attachment' });
  }
});

// ── DELETE /api/attachments/:id — Delete an attachment ──────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const stationId = req.user.department_id;

    await pool.query(
      'DELETE FROM attachments WHERE id = $1 AND department_id = $2',
      [id, stationId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[attachments DELETE]', err);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// ── GET /api/attachments/search — Full-text search across attachments ────────
router.get('/search', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { q, module } = req.query;

    if (!q) {
      return res.status(400).json({
        error: 'q (search term) query parameter is required',
      });
    }

    let sql = `
      SELECT * FROM attachments
      WHERE department_id = $1 AND extracted_text ILIKE $2
    `;
    const params = [stationId, `%${q}%`];

    // Optional module filter
    if (module) {
      sql += ` AND module = $${params.length + 1}`;
      params.push(module);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await pool.query(sql, params);

    res.json(result.rows);
  } catch (err) {
    console.error('[attachments search]', err);
    res.status(500).json({ error: 'Failed to search attachments' });
  }
});

// ── PATCH /api/attachments/:id — Update attachment metadata ────────────────
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { description, category, is_source, access_level } = req.body;

    // Build dynamic update clause
    const allowed = ['description', 'category', 'is_source', 'access_level'];
    const updates = {};
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (is_source !== undefined) updates.is_source = is_source;
    if (access_level !== undefined) updates.access_level = access_level;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update',
      });
    }

    // Build SET clause
    const sets = Object.keys(updates)
      .map((k, i) => `"${k}" = $${i + 1}`)
      .join(', ');
    const values = Object.values(updates);

    const stationId = req.user.department_id;
    const result = await pool.query(
      `UPDATE attachments SET ${sets} WHERE id = $${values.length + 1} AND department_id = $${values.length + 2} RETURNING *`,
      [...values, id, stationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[attachments PATCH]', err);
    res.status(500).json({ error: 'Failed to update attachment' });
  }
});

module.exports = router;
// exported for unit tests
module.exports.validateFileUrl = validateFileUrl;
module.exports.validateAttachmentMeta = validateAttachmentMeta;
