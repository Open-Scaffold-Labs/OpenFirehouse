'use strict';
/**
 * fiInspectionPhotos.js — Fire-inspection VIOLATION photos
 *
 * Mirrors prePlanAttachments.js (the serverless-correct pattern): multer
 * memoryStorage → private Supabase Storage bucket → short-lived signed URLs.
 * All uploads go through the Express layer (never client-direct to Supabase);
 * the service-role key is used server-side and callers must present a valid JWT.
 *
 * WHY: before this, a violation photo captured on the apparatus iPad was kept
 * DEVICE-LOCAL only (OpenFirehouseMobile violationPhotos.ts) — never archived,
 * not visible to the web app or another device, lost if the device was wiped.
 * Departments need this evidence archived + accessible.
 *
 * Files are stored at: inspection-photos/{department_id}/{inspectionId}/{violationId}/{uuid}.{ext}
 * The mobile app stores the returned storage `path` (NOT a signed URL — those
 * expire) into the violation JSON; clients fetch fresh signed URLs via GET.
 *
 * Routes (mounted at /api/fi-inspections/:id/photos):
 *   GET    /            — list photos for the inspection (optional ?violationId=)
 *   POST   /            — upload a photo (multipart `file`, body `violationId`)
 *   DELETE /:fileId     — delete a photo (body/query `violationId`)
 */

const express = require('express');
const router  = express.Router({ mergeParams: true });
const multer  = require('multer');
const crypto  = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const db = require('../db');

const BUCKET   = 'inspection-photos';
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB (phone photos run larger than docs)

// ─── Supabase storage client (service role — server only) ────────────────────
function getStorage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, key).storage;
}

// ─── Multer — memory storage (we pipe the buffer straight to Supabase) ───────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    // Photos only. HEIC/HEIF included because that is the iOS camera default;
    // the mobile client converts to JPEG for web display, but accept both.
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

// A violation id is a client-supplied sub-path key (violations are free-form
// JSON on the inspection, so they carry their own id/index). Sanitize it to a
// safe storage segment — never trust it into a path raw.
function safeSeg(v) {
  return String(v == null ? 'unassigned' : v).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'unassigned';
}

// ─── Guard: the inspection must belong to the caller's department ────────────
async function guardInspection(req, res) {
  const insp = await db.fiInspections.findById(+req.params.id, req.user.department_id);
  if (!insp) { res.status(404).json({ error: 'Inspection not found' }); return null; }
  return insp;
}

function prefixFor(deptId, inspectionId, violationId) {
  return `${deptId}/${inspectionId}/${safeSeg(violationId)}/`;
}

// ─── GET /api/fi-inspections/:id/photos[?violationId=] ───────────────────────
router.get('/', async (req, res) => {
  try {
    const insp = await guardInspection(req, res);
    if (!insp) return;

    const storage = getStorage();
    const dept    = req.user.department_id;
    const vId     = req.query.violationId;

    // If a violation is specified, list just its folder; otherwise enumerate
    // every violation folder under this inspection. Surface a Storage list error
    // (don't let a failure masquerade as "no photos" — that would hide evidence).
    let violationFolders;
    if (vId != null) {
      violationFolders = [safeSeg(vId)];
    } else {
      const { data: folders, error: folderErr } = await storage
        .from(BUCKET).list(`${dept}/${insp.id}`, { limit: 1000 });
      if (folderErr) throw folderErr;
      violationFolders = (folders || []).filter((e) => e.id === null).map((e) => e.name);
    }

    const out = [];
    for (const folder of violationFolders) {
      const prefix = `${dept}/${insp.id}/${folder}/`;
      const { data, error } = await storage.from(BUCKET).list(prefix, {
        limit: 200, offset: 0, sortBy: { column: 'created_at', order: 'asc' },
      });
      if (error) throw error;
      for (const f of data || []) {
        if (f.id === null) continue; // skip nested folders
        const path = `${prefix}${f.name}`;
        const { data: signed } = await storage.from(BUCKET).createSignedUrl(path, 3600);
        out.push({
          id:          f.id,
          name:        f.name,
          violationId: folder,
          size:        f.metadata?.size,
          mimetype:    f.metadata?.mimetype,
          createdAt:   f.created_at,
          url:         signed?.signedUrl || null,
          path,
        });
      }
    }
    res.json({ data: out });
  } catch (e) {
    console.error('[fiInspectionPhotos GET]', e.message);
    res.status(500).json({ error: 'Failed to list photos' });
  }
});

// ─── POST /api/fi-inspections/:id/photos ─────────────────────────────────────
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const insp = await guardInspection(req, res);
    if (!insp) return;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const storage = getStorage();
    const dept    = req.user.department_id;
    const fileId  = crypto.randomUUID();
    const ext     = extFor(req.file.mimetype);
    const path    = `${prefixFor(dept, insp.id, req.body.violationId)}${fileId}.${ext}`;

    const { error } = await storage.from(BUCKET).upload(path, req.file.buffer, {
      contentType:  req.file.mimetype,
      cacheControl: '3600',
      upsert:       false,
    });
    if (error) throw error;

    const { data: signed } = await storage.from(BUCKET).createSignedUrl(path, 3600);

    res.status(201).json({
      data: {
        id:          fileId,
        name:        `${fileId}.${ext}`,
        violationId: safeSeg(req.body.violationId),
        size:        req.file.size,
        mimetype:    req.file.mimetype,
        url:         signed?.signedUrl || null,
        path, // ← the mobile app stores THIS on the violation (stable, not expiring)
        originalName: req.file.originalname,
      },
    });
  } catch (e) {
    console.error('[fiInspectionPhotos POST]', e.message);
    if (e.message?.includes('not allowed')) return res.status(415).json({ error: e.message });
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ─── DELETE /api/fi-inspections/:id/photos/:fileId ───────────────────────────
router.delete('/:fileId', async (req, res) => {
  try {
    const insp = await guardInspection(req, res);
    if (!insp) return;

    const storage = getStorage();
    const dept    = req.user.department_id;
    const vId     = req.body?.violationId ?? req.query.violationId;
    const prefix  = prefixFor(dept, insp.id, vId);

    const { data, error: listErr } = await storage.from(BUCKET).list(prefix);
    if (listErr) throw listErr;

    const fileId = req.params.fileId;
    const match  = (data || []).find((f) => f.id === fileId || f.name.startsWith(fileId));
    if (!match) return res.status(404).json({ error: 'Photo not found' });

    const { error } = await storage.from(BUCKET).remove([`${prefix}${match.name}`]);
    if (error) throw error;

    res.json({ message: 'Photo deleted' });
  } catch (e) {
    console.error('[fiInspectionPhotos DELETE]', e.message);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
