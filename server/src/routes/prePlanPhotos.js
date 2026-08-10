'use strict';
/**
 * prePlanPhotos.js — Pre-incident plan PHOTOS (first-class, DB-backed)
 *
 * T.10 (2026-07-12). Photos are NOT generic attachments: the market-leading
 * pre-plan workflow is built around mobile photo capture that responding crews
 * see at dispatch. That requires metadata a storage listing can't carry —
 * caption ("FDC — rear alley, NE corner"), category, uploader, ordering, a
 * primary photo, and a one-query count for the Size-Up Building Intel card.
 * So bytes go to the private `preplan-photos` Supabase Storage bucket (same
 * transport as prePlanAttachments.js: multer memory → service-role upload →
 * short-lived signed URLs; never client-direct) while `pre_plan_photos`
 * (migration 0043) is the source of truth for metadata.
 *
 * Files are stored at: preplan-photos/{department_id}/{plan_id}/{uuid}.{ext}
 * Clients persist the stable storage `path` / row id — signed URLs expire ≈1h
 * and are re-minted on every GET.
 *
 * Documents (PDFs, spreadsheets) stay on /api/pre-plans/:id/attachments —
 * different object, different workflow. Photos only here.
 *
 * Routes (mounted at /api/pre-plans/:id/photos):
 *   GET    /          — list photos (ordered; fresh signed URLs)
 *   POST   /          — upload (multipart `file`; fields caption, category, takenAt)
 *   PATCH  /:photoId  — update caption / category / sortOrder / isPrimary
 *   DELETE /:photoId  — delete (storage object + row)
 */

const express = require('express');
const router  = express.Router({ mergeParams: true });
const multer  = require('multer');
const crypto  = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const db = require('../db');

const BUCKET   = 'preplan-photos';
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB — phone photos run larger than docs

// Photo categories (app-validated, no CHECK constraint — UNIT_STATUS_VALUES
// convention). Mirrored by the mobile + web clients.
const CATEGORIES = [
  'general', 'fdc', 'knox_box', 'access', 'utilities', 'water_supply', 'hazard',
];

function validCategory(c) {
  return CATEGORIES.includes(String(c));
}

// ─── Supabase storage client (service role — server only) ────────────────────
function getStorage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, key).storage;
}

// ─── Multer — memory storage (buffer piped straight to Supabase) ─────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    // Photos only. HEIC/HEIF included: iOS camera default. The mobile client
    // converts to JPEG for web display (graceful), but accept both.
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

function extFor(mimetype) {
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/heic': 'heic', 'image/heif': 'heif',
  };
  return map[mimetype] || 'jpg';
}

// Map multer rejections to real statuses (415 bad type / 413 too large) instead
// of letting them fall through to the generic 500 error handler — the mobile
// client surfaces these messages to the officer.
function uploadSingle(field) {
  const mw = upload.single(field);
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `Photo too large — max ${MAX_SIZE / (1024 * 1024)} MB.` });
      }
      if (err.message?.includes('not allowed')) {
        return res.status(415).json({ error: err.message });
      }
      console.error('[prePlanPhotos upload]', err.message);
      return res.status(500).json({ error: 'Upload failed' });
    });
  };
}

// ─── Guard: the plan must belong to the caller's department ──────────────────
async function guardPlan(req, res) {
  const plan = await db.prePlans.findById(+req.params.id, req.user.department_id);
  if (!plan) { res.status(404).json({ error: 'Pre-plan not found' }); return null; }
  return plan;
}

// Shape a DB row for the client (+ signed url minted by the caller).
function toClient(row, url) {
  return {
    id:         row.id,
    planId:     row.plan_id,
    path:       row.storage_path, // ← stable; clients persist THIS, not the url
    caption:    row.caption,
    category:   row.category,
    mimetype:   row.mimetype,
    size:       row.size_bytes,
    uploadedBy: row.uploaded_by,
    takenAt:    row.taken_at,
    sortOrder:  row.sort_order,
    isPrimary:  row.is_primary,
    createdAt:  row.created_at,
    url:        url || null,
  };
}

// ─── GET /api/pre-plans/:id/photos ────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const plan = await guardPlan(req, res);
    if (!plan) return;

    const rows = await db.prePlanPhotos.listForPlan(plan.id, req.user.department_id);
    if (rows.length === 0) return res.json({ data: [] });

    // One batch mint for the whole strip (vs N round-trips).
    const storage = getStorage();
    const { data: signed, error } = await storage.from(BUCKET)
      .createSignedUrls(rows.map((r) => r.storage_path), 3600);
    if (error) throw error;
    const urlByPath = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
    res.json({ data: rows.map((r) => toClient(r, urlByPath.get(r.storage_path))) });
  } catch (e) {
    console.error('[prePlanPhotos GET]', e.message);
    res.status(500).json({ error: 'Failed to list photos' });
  }
});

// ─── POST /api/pre-plans/:id/photos ───────────────────────────────────────────
router.post('/', uploadSingle('file'), async (req, res) => {
  try {
    const plan = await guardPlan(req, res);
    if (!plan) return;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const category = req.body.category ?? 'general';
    if (!validCategory(category)) {
      return res.status(400).json({ error: `Invalid category. Allowed: ${CATEGORIES.join(', ')}` });
    }
    const caption = String(req.body.caption ?? '').slice(0, 500);
    const takenAt = req.body.takenAt ? new Date(req.body.takenAt) : null;

    const dept    = req.user.department_id;
    const storage = getStorage();
    const fileId  = crypto.randomUUID();
    const ext     = extFor(req.file.mimetype);
    const path    = `${dept}/${plan.id}/${fileId}.${ext}`;

    const { error } = await storage.from(BUCKET).upload(path, req.file.buffer, {
      contentType:  req.file.mimetype,
      cacheControl: '3600',
      upsert:       false,
    });
    if (error) throw error;

    let row;
    try {
      row = await db.prePlanPhotos.insert({
        planId:      plan.id,
        stationId:   req.user.stationId ?? plan.station_id,
        departmentId: dept,
        storagePath: path,
        caption,
        category,
        mimetype:    req.file.mimetype,
        sizeBytes:   req.file.size,
        uploadedBy:  req.user.name || req.user.username || '',
        takenAt:     takenAt && !isNaN(takenAt) ? takenAt.toISOString() : null,
      });
    } catch (dbErr) {
      // The metadata row is the source of truth — if it fails, remove the just-
      // uploaded object so no orphan bytes accumulate (best-effort), then rethrow.
      try { await storage.from(BUCKET).remove([path]); } catch { /* logged below via dbErr */ }
      throw dbErr;
    }

    const { data: signed } = await storage.from(BUCKET).createSignedUrl(path, 3600);
    res.status(201).json({ data: toClient(row, signed?.signedUrl) });
  } catch (e) {
    console.error('[prePlanPhotos POST]', e.message);
    if (e.message?.includes('not allowed')) return res.status(415).json({ error: e.message });
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ─── PATCH /api/pre-plans/:id/photos/:photoId ─────────────────────────────────
router.patch('/:photoId', async (req, res) => {
  try {
    const plan = await guardPlan(req, res);
    if (!plan) return;

    const fields = {};
    if (req.body.caption   !== undefined) fields.caption = String(req.body.caption).slice(0, 500);
    if (req.body.category  !== undefined) {
      if (!validCategory(req.body.category)) {
        return res.status(400).json({ error: `Invalid category. Allowed: ${CATEGORIES.join(', ')}` });
      }
      fields.category = req.body.category;
    }
    if (req.body.sortOrder !== undefined) {
      const n = Number(req.body.sortOrder);
      if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'sortOrder must be a non-negative integer' });
      fields.sortOrder = n;
    }
    if (req.body.isPrimary === false) fields.isPrimary = false; // unset THIS photo only
    if (Object.keys(fields).length === 0 && req.body.isPrimary !== true) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    let row = null;
    if (Object.keys(fields).length > 0) {
      row = await db.prePlanPhotos.update(+req.params.photoId, plan.id, req.user.department_id, fields);
      if (!row) return res.status(404).json({ error: 'Photo not found' });
    }
    if (req.body.isPrimary === true) {
      // Single-statement primary flip (clears siblings) — atomic, no
      // BEGIN/COMMIT needed on the max:1 serverless pool (CLAUDE.md lesson #12).
      row = await db.prePlanPhotos.setPrimary(+req.params.photoId, plan.id, req.user.department_id);
      if (!row) return res.status(404).json({ error: 'Photo not found' });
    }
    res.json({ data: toClient(row) });
  } catch (e) {
    console.error('[prePlanPhotos PATCH]', e.message);
    res.status(500).json({ error: 'Update failed' });
  }
});

// ─── DELETE /api/pre-plans/:id/photos/:photoId ────────────────────────────────
router.delete('/:photoId', async (req, res) => {
  try {
    const plan = await guardPlan(req, res);
    if (!plan) return;

    const row = await db.prePlanPhotos.findById(+req.params.photoId, plan.id, req.user.department_id);
    if (!row) return res.status(404).json({ error: 'Photo not found' });

    // Storage remove is best-effort: a failure orphans bytes (invisible, private
    // bucket) but must not strand a deleted-looking row the client still renders.
    try {
      const { error } = await getStorage().from(BUCKET).remove([row.storage_path]);
      if (error) console.error('[prePlanPhotos DELETE] storage remove failed:', error.message);
    } catch (se) {
      console.error('[prePlanPhotos DELETE] storage remove threw:', se.message);
    }

    await db.prePlanPhotos.remove(row.id, plan.id, req.user.department_id);
    res.json({ message: 'Photo deleted' });
  } catch (e) {
    console.error('[prePlanPhotos DELETE]', e.message);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
// Exported for unit tests (prePlanPhotos.test.js) + potential client-list reuse.
module.exports.CATEGORIES    = CATEGORIES;
module.exports.validCategory = validCategory;
module.exports.extFor        = extFor;
