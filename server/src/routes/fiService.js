'use strict';
/**
 * routes/fiService.js — SERVICE OF NOTICE (Prevention Core, Phase 3.5 — 0053).
 *
 * The object no incumbent has. The most fully-documented code-enforcement suite
 * models notice delivery as carrier + tracking_number + sent_date — a SHIPPING
 * abstraction. Nothing in it records HOW service was legally effected, WHO effected
 * it, whether it was REFUSED, or whether it CAME BACK. Those are the only facts
 * that make a notice stick.
 *
 *   GET   /api/fi-inspections/:id/service        — the ladder + derived status
 *   POST  /api/fi-inspections/:id/service        — record a rung (append-only)
 *   POST  /api/fi-service/:sid/mail-event        — accepted | delivered | returned
 *                                                  (a human records it today; a mail
 *                                                   vendor's webhook lands here later
 *                                                   with NO schema change)
 *   POST  /api/fi-service/:sid/void              — retire a mistaken entry (never delete)
 *   GET   /api/fi-service/:sid/posting-photo     — the proof-of-posting image
 *
 * Doctrine enforced here:
 *   · Refusal is SERVICE. It does not invalidate the notice or toll the deadline.
 *   · Posting requires PROOF (photo + GPS); a fix worse than 100 m is not a fix.
 *   · Jones v. Flowers: once we ingest a returned/unclaimed event we KNOW the
 *     notice failed, and the department may not simply proceed. serviceStatus()
 *     returns action_required until a blessed cure is recorded.
 *   · Server-authoritative served_at. The compliance clock runs from SERVICE.
 */
const express = require('express');
const router  = express.Router({ mergeParams: true });
const { z } = require('zod');
const { pool, fiInspections } = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { loadFiContext, requireInspector } = require('../middleware/fiAuth');
const { audit } = require('../utils/auditLog');
const { serviceStatus, postingDefects, METHOD_LABELS } = require('../utils/serviceOfNotice');

const idParam  = validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) });
const sidParam = validate({ params: z.object({ sid: z.string().regex(/^\d+$/) }) });

const PHOTO_RE = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/;
const MAX_PHOTO = 6 * 1024 * 1024;

const COLS = `id, inspection_id, notice_id, method, outcome, attempt_seq, served_at,
              served_by, served_by_user_id, servee_name, servee_relationship,
              address_used, address_source,
              posting_lat, posting_lng, posting_accuracy_m, posting_location_desc,
              (posting_photo IS NOT NULL) AS has_posting_photo,
              mail_class, mail_tracking_number, mail_accepted_at, mail_delivered_at,
              mail_returned_at, delivered_address, notes, created_at, voided_at, void_reason`;

async function ladder(inspectionId, stationId) {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM fi_notice_service
     WHERE inspection_id = $1 AND department_id = $2 ORDER BY served_at, id`,
    [inspectionId, stationId]);
  return rows;
}

const serviceSchema = z.object({
  noticeId: z.number().int().positive().optional(),
  method:  z.enum(['personal_service', 'left_with_responsible_person', 'posted_premises',
                   'certified_mail', 'first_class_mail', 'certificate_of_mailing', 'email']),
  outcome: z.enum(['served', 'refused_signature', 'refused_acceptance', 'no_party_present',
                   'mailed', 'accepted', 'delivered', 'returned_undelivered', 'unclaimed', 'posted']),
  serveeName:         z.string().trim().max(200).default(''),
  serveeRelationship: z.string().trim().max(120).default(''),
  addressUsed:   z.string().trim().max(400).default(''),
  addressSource: z.string().trim().max(200).default(''),
  postingPhotoDataUrl:  z.string().max(9000000).optional(),
  postingLat: z.number().optional(), postingLng: z.number().optional(),
  postingAccuracyM: z.number().optional(),
  postingLocationDesc: z.string().trim().max(300).default(''),
  mailClass:           z.enum(['certified_rrr', 'cert_of_mailing', 'first_class']).optional(),
  mailTrackingNumber:  z.string().trim().max(120).default(''),
  notes: z.string().trim().max(2000).default(''),
});

router.get('/:id/service', idParam, scoped(async ({ req, stationId }) => {
  const rows = await ladder(+req.params.id, stationId);
  return { data: rows, status: serviceStatus(rows) };
}));

router.post('/:id/service', idParam, loadFiContext, requireInspector,
  validate({ body: serviceSchema }), scoped(async ({ req, stationId, user }) => {
    const id = +req.params.id;
    if (!await fiInspections.findById(id, stationId)) throw httpError(404, 'Not found', 'NOT_FOUND');
    const b = req.body;

    // Posting is EVIDENCE, not a checkbox. Without a photo and a location, a
    // posting record proves nothing at a hearing — so we refuse to pretend.
    let photo = null;
    if (b.postingPhotoDataUrl) {
      const m = PHOTO_RE.exec(b.postingPhotoDataUrl);
      if (!m) throw httpError(400, 'The posting photo must be a base64 PNG/JPEG data URL.', 'BAD_PHOTO');
      photo = Buffer.from(m[2], 'base64');
      if (photo.length > MAX_PHOTO) throw httpError(413, 'Posting photo too large.', 'PHOTO_TOO_LARGE');
    }
    if (b.method === 'posted_premises') {
      const defects = postingDefects({
        posting_photo_present: !!photo,
        posting_lat: b.postingLat ?? null, posting_lng: b.postingLng ?? null,
        posting_accuracy_m: b.postingAccuracyM ?? null,
      });
      // A coarse GPS fix is a warning, not a hard block — the officer may be inside
      // a steel building. But a MISSING photo or MISSING location is a hard stop:
      // that record would be worthless as proof.
      const hard = defects.filter((d) => !/too coarse/i.test(d));
      if (hard.length) throw httpError(400, hard.join(' '), 'POSTING_PROOF_REQUIRED');
    }
    // Nobody-present is not a personal-service outcome you can claim you "served".
    if (b.outcome === 'no_party_present' && b.method === 'personal_service') {
      throw httpError(400,
        'If no responsible party was present, the notice was not personally served — post the premises and mail it.',
        'NOT_PERSONAL_SERVICE');
    }

    const seq = (await ladder(id, stationId)).filter((r) => !r.voided_at).length + 1;
    const { rows } = await pool.query(
      `INSERT INTO fi_notice_service
         (department_id, inspection_id, notice_id, method, outcome, attempt_seq,
          served_by, served_by_user_id, servee_name, servee_relationship,
          address_used, address_source,
          posting_photo, posting_lat, posting_lng, posting_accuracy_m, posting_location_desc,
          mail_class, mail_tracking_number, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING ${COLS}`,
      [stationId, id, b.noticeId ?? null, b.method, b.outcome, seq,
       user?.name || user?.username || '', user?.id ?? null, b.serveeName, b.serveeRelationship,
       b.addressUsed, b.addressSource,
       photo, b.postingLat ?? null, b.postingLng ?? null, b.postingAccuracyM ?? null, b.postingLocationDesc,
       b.mailClass ?? '', b.mailTrackingNumber, b.notes]);

    await audit(stationId, user, 'create', 'fi_notice_service', rows[0].id,
      { inspectionId: id, method: b.method, outcome: b.outcome });
    const all = await ladder(id, stationId);
    return { data: rows[0], status: serviceStatus(all), _status: 201 };
  }));

// The mail event. TODAY: the officer records what the Postal Service told them.
// LATER: a certified-mail vendor's webhook POSTs here with the same body and NO
// schema change. Either way, the moment a 'returned_undelivered'/'unclaimed' lands,
// the department has KNOWLEDGE — and the Jones gate closes.
const mailEventSchema = z.object({
  event: z.enum(['accepted', 'delivered', 'returned_undelivered', 'unclaimed']),
  at: z.string().datetime().optional(),
  deliveredAddress: z.string().trim().max(400).default(''),
  trackingNumber:   z.string().trim().max(120).default(''),
});

const eventRouter = express.Router();
eventRouter.post('/:sid/mail-event', sidParam, loadFiContext, requireInspector,
  validate({ body: mailEventSchema }), scoped(async ({ req, stationId, user }) => {
    const sid = +req.params.sid;
    const { rows: found } = await pool.query(
      `SELECT id, inspection_id, method FROM fi_notice_service WHERE id = $1 AND department_id = $2`,
      [sid, stationId]);
    if (!found.length) throw httpError(404, 'Not found', 'NOT_FOUND');
    const b = req.body;
    const when = b.at ? new Date(b.at) : new Date();
    const col = { accepted: 'mail_accepted_at', delivered: 'mail_delivered_at',
                  returned_undelivered: 'mail_returned_at', unclaimed: 'mail_returned_at' }[b.event];

    const { rows } = await pool.query(
      `UPDATE fi_notice_service
         SET outcome = $1, ${col} = $2,
             delivered_address = COALESCE(NULLIF($3, ''), delivered_address),
             mail_tracking_number = COALESCE(NULLIF($4, ''), mail_tracking_number)
       WHERE id = $5 AND department_id = $6
       RETURNING ${COLS}`,
      [b.event === 'accepted' ? 'accepted' : b.event, when, b.deliveredAddress, b.trackingNumber, sid, stationId]);

    await audit(stationId, user, 'update', 'fi_notice_service', sid, { mailEvent: b.event });
    const all = await ladder(found[0].inspection_id, stationId);
    return { data: rows[0], status: serviceStatus(all) };
  }));

// Retire, never delete — these are subpoenable.
eventRouter.post('/:sid/void', sidParam, loadFiContext, requireInspector,
  validate({ body: z.object({ reason: z.string().trim().min(3).max(500) }) }),
  scoped(async ({ req, stationId, user }) => {
    const sid = +req.params.sid;
    const { rows } = await pool.query(
      `UPDATE fi_notice_service SET voided_at = NOW(), void_reason = $1
       WHERE id = $2 AND department_id = $3 AND voided_at IS NULL
       RETURNING ${COLS}`,
      [req.body.reason, sid, stationId]);
    if (!rows.length) throw httpError(404, 'Not found, or already voided.', 'NOT_FOUND');
    await audit(stationId, user, 'update', 'fi_notice_service', sid, { voided: true, reason: req.body.reason });
    return { data: rows[0] };
  }));

eventRouter.get('/:sid/posting-photo', sidParam, scoped(async ({ req, res, stationId }) => {
  const { rows } = await pool.query(
    `SELECT posting_photo FROM fi_notice_service WHERE id = $1 AND department_id = $2`,
    [+req.params.sid, stationId]);
  if (!rows.length || !rows[0].posting_photo) throw httpError(404, 'Not found', 'NOT_FOUND');
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.end(rows[0].posting_photo);
}));

module.exports = router;
module.exports.eventRouter = eventRouter;
module.exports.METHOD_LABELS = METHOD_LABELS;
// Exported for the offline batch (routes/fiSync.js, P3.6) — one schema, both
// transports. See the note in fiWorkflow.js.
module.exports.serviceSchema   = serviceSchema;
module.exports.mailEventSchema = mailEventSchema;
module.exports.PHOTO_RE        = PHOTO_RE;
module.exports.MAX_PHOTO       = MAX_PHOTO;
