'use strict';
/**
 * prePlanAttachments.js — Pre-incident plan file/photo attachments
 *
 * All uploads go through the Express layer (never client-direct to Supabase).
 * The service-role key is used server-side; callers must present a valid JWT.
 * Files are stored at: preplan-attachments/{station_id}/{plan_id}/{uuid}.{ext}
 *
 * Routes:
 *   GET    /api/pre-plans/:id/attachments         — list attachments
 *   POST   /api/pre-plans/:id/attachments         — upload a file (multipart)
 *   DELETE /api/pre-plans/:id/attachments/:fileId — delete a file
 */

const express   = require('express');
const router    = express.Router({ mergeParams: true });
const multer    = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { prePlans: db } = require('../db');

const BUCKET = 'preplan-attachments';
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

// ─── Supabase storage client (service role — server only) ────────────────────
function getStorage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, key).storage;
}

// ─── Multer — memory storage (we pipe directly to Supabase) ─────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

// ─── Helper: verify the plan belongs to this department ──────────────────────
async function guardPlan(req, res) {
  const plan = await db.findById(+req.params.id, req.user.department_id);
  if (!plan) { res.status(404).json({ error: 'Pre-plan not found' }); return null; }
  return plan;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────
function storagePath(stationId, planId, fileId, ext) {
  return `${stationId}/${planId}/${fileId}.${ext}`;
}

function extFor(mimetype) {
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  };
  return map[mimetype] || 'bin';
}

// ─── GET /api/pre-plans/:id/attachments ──────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const plan = await guardPlan(req, res);
    if (!plan) return;

    const storage = getStorage();
    const prefix = `${req.user.department_id}/${plan.id}/`;
    const { data, error } = await storage.from(BUCKET).list(prefix, {
      limit: 100, offset: 0, sortBy: { column: 'created_at', order: 'asc' },
    });
    if (error) throw error;

    // Generate signed URLs (1 hour)
    const files = await Promise.all((data || []).map(async (f) => {
      const path = `${prefix}${f.name}`;
      const { data: signed } = await storage.from(BUCKET).createSignedUrl(path, 3600);
      return {
        id:          f.id,
        name:        f.name,
        size:        f.metadata?.size,
        mimetype:    f.metadata?.mimetype,
        createdAt:   f.created_at,
        url:         signed?.signedUrl || null,
        path,
      };
    }));

    res.json({ data: files });
  } catch (e) {
    console.error('[prePlanAttachments GET]', e.message);
    res.status(500).json({ error: 'Failed to list attachments' });
  }
});

// ─── POST /api/pre-plans/:id/attachments ─────────────────────────────────────
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const plan = await guardPlan(req, res);
    if (!plan) return;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const storage = getStorage();
    const crypto  = require('crypto');
    const fileId  = crypto.randomUUID();
    const ext     = extFor(req.file.mimetype);
    const path    = storagePath(req.user.department_id, plan.id, fileId, ext);

    const { error } = await storage.from(BUCKET).upload(path, req.file.buffer, {
      contentType:  req.file.mimetype,
      cacheControl: '3600',
      upsert:       false,
    });
    if (error) throw error;

    // Generate a signed URL to return immediately
    const { data: signed } = await storage.from(BUCKET).createSignedUrl(path, 3600);

    res.status(201).json({
      data: {
        id:        fileId,
        name:      `${fileId}.${ext}`,
        size:      req.file.size,
        mimetype:  req.file.mimetype,
        url:       signed?.signedUrl || null,
        path,
        originalName: req.file.originalname,
      },
    });
  } catch (e) {
    console.error('[prePlanAttachments POST]', e.message);
    if (e.message?.includes('not allowed')) return res.status(415).json({ error: e.message });
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ─── DELETE /api/pre-plans/:id/attachments/:fileId ───────────────────────────
router.delete('/:fileId', async (req, res) => {
  try {
    const plan = await guardPlan(req, res);
    if (!plan) return;

    // fileId from client is the UUID portion — reconstruct the path prefix
    // and list to find the exact filename (includes extension)
    const storage = getStorage();
    const prefix  = `${req.user.department_id}/${plan.id}/`;
    const { data, error: listErr } = await storage.from(BUCKET).list(prefix);
    if (listErr) throw listErr;

    const fileId  = req.params.fileId;
    const match   = (data || []).find(f => f.id === fileId || f.name.startsWith(fileId));
    if (!match) return res.status(404).json({ error: 'Attachment not found' });

    const { error } = await storage.from(BUCKET).remove([`${prefix}${match.name}`]);
    if (error) throw error;

    res.json({ message: 'Attachment deleted' });
  } catch (e) {
    console.error('[prePlanAttachments DELETE]', e.message);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
