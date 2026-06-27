const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { pool } = require('../db');

const router = express.Router();

// ── File upload config ──────────────────────────────────────────────────────
// Files stored in server/uploads/correspondence/<module>/<record_id>/
// On Vercel (and any read-only FS deploy target), /var/task is not writable,
// so fall back to the writable /tmp directory. Uploads there are ephemeral
// (cleared between cold starts) — the long-term home is object storage (TODO).
const IS_SERVERLESS_RO = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const UPLOADS_DIR = IS_SERVERLESS_RO
  ? path.join('/tmp', 'uploads', 'correspondence')
  : path.join(__dirname, '..', '..', 'uploads', 'correspondence');
// Base dir that /files serves from (the parent "uploads" dir) — never the
// server root, which would expose source code.
const UPLOADS_BASE = path.dirname(UPLOADS_DIR);

// Ensure base upload directory exists — wrap in try/catch so a read-only
// filesystem at module-load time can't crash the entire function.
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[correspondence] could not create UPLOADS_DIR:', err.message);
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const mod      = req.body.module || 'general';
    const recordId = req.body.record_id || '0';
    const dir = path.join(UPLOADS_DIR, mod, String(recordId));
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    // Prefix with timestamp to avoid collisions, keep original name
    const ts   = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${ts}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
  fileFilter: (_req, file, cb) => {
    // Allow common document, image, and email types
    const allowed = [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.txt', '.csv', '.rtf',
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff',
      '.eml', '.msg',
      '.zip',
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed`));
    }
  },
});

// GET /api/correspondence?module=grievances&record_id=7
// List all correspondence entries for a specific module record
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { module, record_id } = req.query;
    if (!module || !record_id) {
      return res.status(400).json({ error: 'module and record_id are required' });
    }

    const { rows } = await pool.query(
      `SELECT * FROM correspondence
       WHERE module = $1 AND record_id = $2 AND department_id = $3
       ORDER BY created_at DESC`,
      [module, parseInt(record_id), stationId]
    );

    res.json({ data: rows });
  } catch (e) {
    console.error('GET /api/correspondence error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/correspondence
// Add a new correspondence entry (pasted email, note, or file link)
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const {
      module,
      record_id,
      entry_type = 'email',    // 'email' | 'file' | 'note'
      from_name = '',
      subject = '',
      body = '',
      file_name = '',
      file_url = '',
      file_size = 0,
      entered_by = '',
    } = req.body;

    if (!module || !record_id) {
      return res.status(400).json({ error: 'module and record_id are required' });
    }

    // Must have content: either email body or file reference
    if (!body.trim() && !file_url.trim()) {
      return res.status(400).json({ error: 'Either body text or a file URL is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO correspondence
         (station_id, module, record_id, entry_type, from_name, subject, body, file_name, file_url, file_size, entered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        stationId, module, parseInt(record_id), entry_type,
        from_name.trim(), subject.trim(), body.trim(),
        file_name.trim(), file_url.trim(), parseInt(file_size) || 0,
        entered_by.trim(),
      ]
    );

    res.json({ data: rows[0] });
  } catch (e) {
    console.error('POST /api/correspondence error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/correspondence/upload
// Upload a file and create a correspondence entry in one step
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const stationId = req.user.department_id;
    const {
      module,
      record_id,
      from_name = '',
      subject = '',
      body = '',
      entered_by = '',
    } = req.body;

    if (!module || !record_id) {
      return res.status(400).json({ error: 'module and record_id are required' });
    }

    // Build the URL path that the client can use to fetch the file
    const relPath = path.relative(UPLOADS_BASE, req.file.path);
    const file_url  = `/api/correspondence/files/${relPath.replace(/\\/g, '/')}`;
    const file_name = req.file.originalname;
    const file_size = req.file.size;

    const { rows } = await pool.query(
      `INSERT INTO correspondence
         (station_id, module, record_id, entry_type, from_name, subject, body, file_name, file_url, file_size, entered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        stationId, module, parseInt(record_id), 'file',
        from_name.trim(), subject.trim(), body.trim(),
        file_name, file_url, file_size,
        entered_by.trim(),
      ]
    );

    res.json({ data: rows[0] });
  } catch (e) {
    console.error('POST /api/correspondence/upload error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/correspondence/files/* — serve uploaded files ONLY (never the
// server root). Legacy rows stored URLs as /files/uploads/correspondence/...,
// new rows use /files/correspondence/... — both aliases map to UPLOADS_BASE.
// W2.5 audit (2026-06-10): was blanket express.static — any authed user could
// fetch another department's files by path (record ids are guessable). Now a
// file is only served if a correspondence row in the CALLER'S station points
// at it. 404 (not 403) on foreign/missing files — don't leak existence.
async function serveOwnedFile(req, res) {
  try {
    let rel = decodeURIComponent(req.params[0] || '');
    if (rel.startsWith('uploads/')) rel = rel.slice('uploads/'.length); // legacy alias
    const fullPath = path.resolve(UPLOADS_BASE, rel);
    if (!fullPath.startsWith(UPLOADS_BASE + path.sep)) return res.status(404).json({ error: 'Not found' }); // traversal guard
    const urlNew    = `/api/correspondence/files/${rel}`;
    const urlLegacy = `/api/correspondence/files/uploads/${rel}`;
    const { rows } = await pool.query(
      'SELECT 1 FROM correspondence WHERE department_id = $1 AND (file_url = $2 OR file_url = $3) LIMIT 1',
      [req.user.department_id, urlNew, urlLegacy]
    );
    if (!rows.length || !fs.existsSync(fullPath)) return res.status(404).json({ error: 'Not found' });
    res.sendFile(fullPath);
  } catch (e) {
    console.error('correspondence file serve error:', e.message);
    res.status(500).json({ error: 'Failed to serve file' });
  }
}
router.get('/files/uploads/*', serveOwnedFile);
router.get('/files/*', serveOwnedFile);

// DELETE /api/correspondence/:id
router.delete('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    // Get file path before deleting record so we can clean up the file
    const { rows } = await pool.query('SELECT file_url FROM correspondence WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);

    await pool.query('DELETE FROM correspondence WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);

    // Try to clean up the physical file if it was an upload
    if (rows[0]?.file_url?.startsWith('/api/correspondence/files/')) {
      let relPath = rows[0].file_url.replace('/api/correspondence/files/', '');
      if (relPath.startsWith('uploads/')) relPath = relPath.slice('uploads/'.length); // legacy rows
      const fullPath = path.resolve(UPLOADS_BASE, relPath);
      // Path-traversal guard: only ever delete inside the uploads dir
      if (fullPath.startsWith(UPLOADS_BASE + path.sep) && fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/correspondence error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
