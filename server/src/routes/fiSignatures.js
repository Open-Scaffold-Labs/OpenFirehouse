'use strict';
/**
 * routes/fiSignatures.js — on-screen signature capture (Prevention Core Phase 3).
 *
 * Incumbent-verified flow: the OCCUPANT signs first, under the department's
 * on-screen agreement text, with a typed who-signed name; the INSPECTOR signs
 * second. The signature is part of the LEGAL record, so the PNG bytes live IN
 * the row (BYTEA) — the fi_notices.pdf precedent: atomic with the record,
 * RLS-covered, same backup story. APPEND-ONLY: there is no update or delete
 * route; re-signing adds a row and consumers use the newest per role.
 *
 * POST /api/fi-inspections/:id/signatures — capture {role, signerName, imageDataUrl}
 * GET  /api/fi-inspections/:id/signatures — metadata list (no bytes)
 * GET  /api/fi-signatures/:sigId/image    — stream the stored PNG (auth'd, dept-scoped)
 *
 * Gate: requireInspector (crew/designation model, fiAuth). Server timestamps.
 */
const express = require('express');
const router  = express.Router({ mergeParams: true });
const { z } = require('zod');
const { pool, fiInspections } = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { loadFiContext, requireInspector } = require('../middleware/fiAuth');
const { audit } = require('../utils/auditLog');

const idParam = validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) });

// A drawn signature PNG is ~10–30 KB; 512 KB decoded is a generous ceiling.
const DATA_URL_RE = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/;
const MAX_BYTES = 512 * 1024;

// 0053 — the OUTCOME model. An absent signature row used to be ambiguous: refused?
// nobody home? inspector forgot? app crashed? Every one of those is a different
// legal fact, and ambiguity is exactly what gets attacked. Now every outcome is
// STATED. Refusal is a recorded event, not a missing row.
//   signed                  — they signed (image REQUIRED)
//   refused                 — present, declined to sign. Service still stands; the
//                             correction deadline still runs. (No image.)
//   unable_no_party_present — nobody with responsibility was there.
//   unable_other            — present but cannot sign (minor, language, medical…).
//   declined_by_policy      — the department does not collect occupant signatures.
const SIG_STATUSES = ['signed', 'refused', 'unable_no_party_present', 'unable_other', 'declined_by_policy'];

const bodySchema = z.object({
  role:         z.enum(['occupant', 'inspector']),
  status:       z.enum(SIG_STATUSES).default('signed'),
  signerName:   z.string().trim().max(200).default(''),
  signerRoleLabel: z.string().trim().max(120).default(''), // Owner / Agent / Manager / Occupant…
  imageDataUrl: z.string().min(30).max(800000).optional(), // pre-decode length cap
  refusalReason: z.string().trim().max(1000).default(''),
  // The three advisements the inspector must read aloud on a refusal (receipt is
  // not agreement; refusal does not affect the duty to correct; it is recorded).
  advisementsRead: z.boolean().default(false),
  // ESIGN §7001(e) / UETA §§9,12: a signature must be ATTRIBUTABLE and ASSOCIATED
  // with the record signed. The hash binds this signature to those exact bytes.
  documentSha256: z.string().trim().max(64).default(''),
  consentText:    z.string().trim().max(4000).default(''),
  deviceLabel:    z.string().trim().max(200).default(''),
  gpsLat: z.number().optional(), gpsLng: z.number().optional(),
  gpsAccuracyM: z.number().optional(),
});

router.post('/:id/signatures', idParam, loadFiContext, requireInspector,
  validate({ body: bodySchema }), scoped(async ({ req, stationId, user }) => {
    const id = +req.params.id;
    if (!await fiInspections.findById(id, stationId)) throw httpError(404, 'Not found', 'NOT_FOUND');
    const b = req.body;

    let image = null;
    if (b.status === 'signed') {
      if (!b.imageDataUrl) throw httpError(400, 'A signed signature needs an image.', 'BAD_SIGNATURE_IMAGE');
      const m = DATA_URL_RE.exec(b.imageDataUrl);
      if (!m) throw httpError(400, 'imageDataUrl must be a base64 PNG data URL.', 'BAD_SIGNATURE_IMAGE');
      image = Buffer.from(m[1], 'base64');
      if (!image.length) throw httpError(400, 'Signature image is empty.', 'BAD_SIGNATURE_IMAGE');
      if (image.length > MAX_BYTES) throw httpError(413, 'Signature image too large.', 'SIGNATURE_TOO_LARGE');
      if (!b.signerName) throw httpError(400, 'Who signed? A printed name is required.', 'SIGNER_NAME_REQUIRED');
    }
    // The INSPECTOR's signature is an attestation to a legal record — it can only
    // ever be 'signed'. There is no "the inspector refused to sign his own report."
    if (b.role === 'inspector' && b.status !== 'signed') {
      throw httpError(400, 'The inspector signature is an attestation and cannot be refused or skipped.',
        'INSPECTOR_MUST_SIGN');
    }

    const { rows } = await pool.query(
      `INSERT INTO fi_signatures
         (department_id, inspection_id, role, status, signer_name, signer_role_label,
          image, signed_by_user_id, refusal_reason, advisements_read,
          document_sha256, consent_text, device_label, gps_lat, gps_lng, gps_accuracy_m)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id, inspection_id, role, status, signer_name, signer_role_label,
                 signed_at, advisements_read, document_sha256`,
      [stationId, id, b.role, b.status, b.signerName, b.signerRoleLabel,
       image, user?.id ?? null, b.refusalReason, b.advisementsRead,
       b.documentSha256, b.consentText, b.deviceLabel,
       b.gpsLat ?? null, b.gpsLng ?? null, b.gpsAccuracyM ?? null]);
    await audit(stationId, user, 'create', 'fi_signatures', rows[0].id,
      { inspectionId: id, role: b.role, status: b.status, bytes: image?.length ?? 0 });
    return { data: rows[0], _status: 201 };
  }));

router.get('/:id/signatures', idParam, scoped(async ({ req, stationId }) => {
  const { rows } = await pool.query(
    `SELECT id, role, status, signer_name, signer_role_label, signed_at,
            refusal_reason, advisements_read, document_sha256,
            (image IS NOT NULL) AS has_image
     FROM fi_signatures WHERE inspection_id = $1 AND department_id = $2 ORDER BY signed_at`,
    [+req.params.id, stationId]);
  return { data: rows };
}));

module.exports = router;
// Exported for the offline batch (routes/fiSync.js, P3.6) — one schema, both
// transports. See the note in fiWorkflow.js.
module.exports.signatureSchema = bodySchema;
module.exports.DATA_URL_RE = DATA_URL_RE;
module.exports.MAX_SIGNATURE_BYTES = MAX_BYTES;

// ── The PNG stream lives on its own tiny router (mounted at /api/fi-signatures),
//    mirroring fiNotices.pdfRouter exactly. ──────────────────────────────────
const imageRouter = express.Router();
imageRouter.get('/:sigId/image',
  validate({ params: z.object({ sigId: z.string().regex(/^\d+$/) }) }),
  scoped(async ({ req, res, stationId }) => {
    const { rows } = await pool.query(
      `SELECT image FROM fi_signatures WHERE id = $1 AND department_id = $2`,
      [+req.params.sigId, stationId]);
    if (!rows.length || !rows[0].image) throw httpError(404, 'Not found', 'NOT_FOUND');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(rows[0].image);
  }));
module.exports.imageRouter = imageRouter;
