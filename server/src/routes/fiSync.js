'use strict';
/**
 * routes/fiSync.js — OFFLINE FIELD OPS, server side (Prevention Core, Phase 3.6).
 *
 *   GET  /api/fi-sync/day    — everything an inspector needs to work a full day with
 *                              NO SIGNAL, in one payload.
 *   POST /api/fi-sync/batch  — drain the device's outbox. Per-item results, never
 *                              all-or-nothing.
 *
 * ── THE PROMISE ──────────────────────────────────────────────────────────────
 * An inspector walks into a basement with no signal, works the inspection, cites
 * violations, takes the occupant's signature, hands the owner a printed notice, walks
 * back to the rig — and everything syncs. Nothing is lost. Ever. NOTHING IS DUPLICATED.
 * Ever. These are legal records; a doubled violation or a doubled service record is an
 * evidentiary defect, not a cosmetic bug.
 *
 * ── WHY BATCH INSTEAD OF REPLAYING THE ORDINARY ROUTES ───────────────────────
 * Two reasons, both about correctness:
 *   1. IDEMPOTENCY. A queued write can ARRIVE and be APPLIED while its acknowledgment
 *      dies on the way home. The client retries — correctly. fi_sync_ops (0054) makes
 *      the second arrival a no-op: UNIQUE (department_id, client_id) is the guarantee.
 *   2. PARTIAL SUCCESS. Twenty queued writes must not be lost because the third one is
 *      no longer legal. Each op stands alone: applied | duplicate | rejected. A failure
 *      NEVER aborts the ops around it. (Risk register R4/R5.)
 *
 * ── WHAT THIS FILE IS NOT ────────────────────────────────────────────────────
 * It is NOT a softer door into the same tables. Every guard the online route enforces
 * is enforced here, on the same schemas (imported, not copy-pasted — a second schema
 * would drift and quietly weaken the gate): RECORD_FINALIZED, INSPECTOR_MUST_SIGN,
 * POSTING_PROOF_REQUIRED, NOT_PERSONAL_SERVICE, department ownership of every id.
 * Offline is a transport, not an exemption.
 *
 * ── SERVER-AUTHORITATIVE TIME ────────────────────────────────────────────────
 * `clientRecordedAt` is METADATA. The device's clock is not evidence, and an inspector
 * who syncs at 6pm did not sign at 6pm. Every record timestamp (signed_at, served_at,
 * created_at, applied_at) is the server's.
 *
 * Gate: loadFiContext + requireInspector, dept-scoped via routeKit's scoped() (fails
 * CLOSED on a missing department — never a default tenant).
 */
const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { z } = require('zod');
const { pool, fiInspections, fiProperties, prePlans } = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { loadFiContext, requireInspector, getFiSettings } = require('../middleware/fiAuth');
const { audit } = require('../utils/auditLog');
const { normalizeViolations } = require('../constants/violationStatus');
const { syncViolationRows } = require('../utils/fiViolationSync');
const { postingDefects } = require('../utils/serviceOfNotice');
const { isIsoDay } = require('../utils/localDate');

// The schemas are OWNED by the online routes. Importing them means a queued write is
// validated by the exact same rules as a live one — forever, without anyone remembering
// to update two copies.
const { answersSchema, completeSchema, completeInspection } = require('./fiWorkflow');
const { signatureSchema, DATA_URL_RE, MAX_SIGNATURE_BYTES } = require('./fiSignatures');
const { serviceSchema, mailEventSchema, PHOTO_RE, MAX_PHOTO } = require('./fiService');
const { coerce } = require('./fiInspections');
// 2.6 field-logistics engines (checks 0082 / defects 0083) — same import-the-door
// pattern: the batch replays through the exact functions the online routes call.
const { completionBody, applyCheckCompletion } = require('./checks');
const { defectCreateBody, createDefect } = require('./defects');

// A hand-carried notice runs tens of KB. 12 MB is a ceiling, not a target — big enough
// that a photo-heavy notice is never refused, small enough that a runaway upload can't
// wedge the request. (The hosting platform imposes its own, lower, request-body ceiling;
// this cap is the one WE are willing to defend, and the smaller of the two wins.)
const MAX_NOTICE_BYTES = 12 * 1024 * 1024;
const MAX_OPS_PER_BATCH = 50;

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/fi-sync/day — the offline provisioning payload
// ═══════════════════════════════════════════════════════════════════════════════
//
// One request, one payload, one moment in time. The inspector leaves the firehouse
// with this and does not need the network again until they are back on the rig.
//
// It carries the DEPARTMENT'S OWN LEGAL TEXT (fi_settings) because the notice is
// rendered ON DEVICE (the wedge — see the gameplan): without those blocks the officer
// cannot hand anyone a valid instrument in a basement.
//
// `today` is CLIENT-supplied (doctrine 8 — the inspector's local day; the server never
// guesses "today" from a UTC clock, which is tomorrow after ~8pm Eastern). It only
// decides which rows are *offered* — it never becomes part of a record.
const daySchema = z.object({
  today: z.string().refine(isIsoDay, 'today must be a real YYYY-MM-DD day').optional(),
});

router.get('/day', loadFiContext, requireInspector, validate({ query: daySchema }),
  scoped(async ({ req, stationId, user }) => {
    const today = req.query.today || new Date().toISOString().slice(0, 10);

    // MINE, or NOBODY'S AND ALREADY LATE. An overdue unassigned inspection is work the
    // inspector may legitimately pick up in the field; an unassigned FUTURE one is not
    // theirs to start. Completed records are history and are never handed out to edit.
    const { rows: inspections } = await pool.query(
      `SELECT * FROM fi_inspections
        WHERE department_id = $1 AND deleted_at IS NULL AND "completedDate" IS NULL
          AND (assigned_to_user_id = $2
               OR (assigned_to_user_id IS NULL AND "scheduledDate" IS NOT NULL AND "scheduledDate" < $3))
        ORDER BY "scheduledDate" NULLS LAST, id`,
      [stationId, user.id, today]);

    const inspectionIds = inspections.map((i) => i.id);
    const propertyIds   = [...new Set(inspections.map((i) => i.propertyId).filter(Boolean))];

    const [properties, history, codes, types, checklists, items, settings, signatures, service, answers] =
      await Promise.all([
        propertyIds.length
          ? pool.query(
              `SELECT * FROM fi_properties WHERE department_id = $1 AND id = ANY($2) AND deleted_at IS NULL`,
              [stationId, propertyIds]).then((r) => r.rows)
          : [],
        // The last five inspections of each property — the officer needs to know what was
        // cited here before, standing in the building, with no way to look it up.
        propertyIds.length
          ? pool.query(
              `SELECT id, "propertyId", type, "inspectorName", "scheduledDate", "completedDate",
                      result, violations, notes
                 FROM (
                   SELECT *, ROW_NUMBER() OVER (
                            PARTITION BY "propertyId"
                            ORDER BY COALESCE("completedDate", "scheduledDate") DESC NULLS LAST, id DESC
                          ) AS rn
                     FROM fi_inspections
                    WHERE department_id = $1 AND "propertyId" = ANY($2) AND deleted_at IS NULL
                 ) t
                WHERE rn <= 5`,
              [stationId, propertyIds]).then((r) => r.rows)
          : [],
        pool.query(
          `SELECT * FROM fi_code_library
            WHERE department_id = $1 AND active = TRUE AND deleted_at IS NULL
            ORDER BY sort_order, code`, [stationId]).then((r) => r.rows),
        pool.query(
          `SELECT * FROM fi_inspection_types
            WHERE department_id = $1 AND active = TRUE AND deleted_at IS NULL
            ORDER BY name`, [stationId]).then((r) => r.rows),
        pool.query(
          `SELECT * FROM fi_checklists
            WHERE department_id = $1 AND active = TRUE AND deleted_at IS NULL
            ORDER BY name`, [stationId]).then((r) => r.rows),
        pool.query(
          `SELECT i.* FROM fi_checklist_items i
             JOIN fi_checklists c ON c.id = i.checklist_id
            WHERE i.department_id = $1 AND c.active = TRUE AND c.deleted_at IS NULL
            ORDER BY i.checklist_id, i.sort_order, i.id`, [stationId]).then((r) => r.rows),
        getFiSettings(stationId),
        inspectionIds.length
          ? pool.query(
              `SELECT id, inspection_id, role, status, signer_name, signer_role_label, signed_at,
                      refusal_reason, advisements_read, document_sha256,
                      (image IS NOT NULL) AS has_image
                 FROM fi_signatures
                WHERE department_id = $1 AND inspection_id = ANY($2)
                ORDER BY signed_at, id`,
              [stationId, inspectionIds]).then((r) => r.rows)
          : [],
        inspectionIds.length
          ? pool.query(
              `SELECT id, inspection_id, notice_id, method, outcome, attempt_seq, served_at,
                      served_by, served_by_user_id, servee_name, servee_relationship,
                      address_used, address_source, posting_lat, posting_lng, posting_accuracy_m,
                      posting_location_desc, (posting_photo IS NOT NULL) AS has_posting_photo,
                      mail_class, mail_tracking_number, mail_accepted_at, mail_delivered_at,
                      mail_returned_at, delivered_address, notes, created_at, voided_at, void_reason
                 FROM fi_notice_service
                WHERE department_id = $1 AND inspection_id = ANY($2)
                ORDER BY served_at, id`,
              [stationId, inspectionIds]).then((r) => r.rows)
          : [],
        // The checklist answers already recorded — an inspection half-worked yesterday
        // must not come back blank on a device with no signal.
        inspectionIds.length
          ? pool.query(
              `SELECT inspection_id, checklist_id, item_id, prompt, code_snapshot, answer, position
                 FROM fi_inspection_answers
                WHERE department_id = $1 AND inspection_id = ANY($2)
                ORDER BY inspection_id, position`,
              [stationId, inspectionIds]).then((r) => r.rows)
          : [],
      ]);

    return {
      data: {
        // Read-path normalization (P0 doctrine): the client must see the same status
        // axis the server does, or a legacy 'Pending' renders open forever.
        inspections: inspections.map((i) => ({ ...i, violations: normalizeViolations(i.violations) })),
        properties,
        history: history.map((h) => ({ ...h, violations: normalizeViolations(h.violations) })),
        codeLibrary: codes,
        inspectionTypes: types,
        checklists,
        checklistItems: items,
        settings,
        signatures,
        service,
        answers,
        // The freshness anchor. Every cached surface on the device dates itself from
        // this — "synced N ago" must be TRUE, and the device's own clock cannot be
        // trusted to say so (risk register R10/R12).
        serverTime: new Date().toISOString(),
      },
    };
  }));

// ═══════════════════════════════════════════════════════════════════════════════
// The op appliers — one per outbox op. Each MIRRORS its online route exactly.
// ═══════════════════════════════════════════════════════════════════════════════
//
// Contract: return the server row id the op produced (or the inspection id for the
// full-replace ops, which produce no new row). Throw an httpError with one of the
// client's terminal codes for a BUSINESS-RULE refusal — the client will stop and show
// the human, because retrying can never fix it.

/** The department must own every id a client hands us. Never trust a client id. */
async function ownInspection(id, stationId) {
  const insp = await fiInspections.findById(id, stationId);
  if (!insp) throw httpError(404, 'That inspection is not on this department\'s books.', 'NOT_FOUND');
  return insp;
}

/** Mirrors fiInspections.assertOwnAssignee (0051 assignment-identity doctrine). */
async function assertOwnAssignee(userId, stationId) {
  if (userId == null) return true;
  const { rows } = await pool.query(
    `SELECT 1 FROM users u
      WHERE u.id = $1 AND (u.station_id = $2
        OR EXISTS (SELECT 1 FROM of_user_departments m WHERE m.user_id = u.id AND m.department_id = $2))`,
    [userId, stationId]);
  return !!rows.length;
}

/** Per-op payload validation. A malformed payload is the OP's failure, not the batch's. */
function parsePayload(schema, payload) {
  const r = schema.safeParse(payload ?? {});
  if (!r.success) {
    throw httpError(400,
      r.error.issues.map((i) => `${i.path.join('.') || 'payload'}: ${i.message}`).join('; '),
      'INVALID_PAYLOAD');
  }
  return r.data;
}

// ── answers.put — mirrors PUT /api/fi-inspections/:id/answers ────────────────
async function applyAnswersPut({ inspectionId, payload, stationId, user }) {
  const insp = await ownInspection(inspectionId, stationId);
  // The answers ARE the walkthrough of record. Once the inspection is completed and
  // served they are finalized — a later edit would silently rewrite what the inspector
  // attested to. The office may have completed this record while the device was in a
  // basement; that is exactly the case this guard exists for.
  if (insp.completedDate) {
    throw httpError(409,
      'This inspection is completed — the checklist is a finalized legal record and cannot be edited.',
      'RECORD_FINALIZED');
  }
  const b = parsePayload(answersSchema, payload);
  if (b.checklistId != null) {
    const chk = await pool.query(
      'SELECT 1 FROM fi_checklists WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL',
      [b.checklistId, stationId]);
    if (!chk.rows.length) throw httpError(404, 'Checklist not found', 'CHECKLIST_NOT_FOUND');
  }
  const rows = b.answers.map((a, i) => ({
    item_id: a.itemId, prompt: a.prompt, code_snapshot: a.code, answer: a.answer, position: i,
  }));
  await pool.query(
    `WITH del AS (DELETE FROM fi_inspection_answers WHERE inspection_id = $1 AND department_id = $2)
     INSERT INTO fi_inspection_answers (department_id, inspection_id, checklist_id, item_id, prompt, code_snapshot, answer, position)
     SELECT $2, $1, $4, (r->>'item_id')::int, r->>'prompt', r->>'code_snapshot', r->>'answer', (r->>'position')::int
     FROM jsonb_array_elements($3::jsonb) AS r`,
    [inspectionId, stationId, JSON.stringify(rows), b.checklistId]);
  await audit(stationId, user, 'update', 'fi_inspection_answers', inspectionId,
    { answers: rows.length, no: rows.filter((a) => a.answer === 'no').length, offline: true });
  return inspectionId;
}

// ── inspection.patch — mirrors PATCH /api/fi-inspections/:id ─────────────────
async function applyInspectionPatch({ inspectionId, payload, stationId, user }) {
  const before = await ownInspection(inspectionId, stationId);
  const body = payload ?? {};

  // ── THE OFFLINE DOOR GETS THE SAME LOCKS AS THE ONLINE ONE (2026-07-14) ─────────────
  // This function is a faithful mirror of PATCH /api/fi-inspections/:id — which is exactly
  // the problem: it mirrored the WEAK version. It too could stamp completedDate + result,
  // bypassing the completion engine's pass-with-open-violations guard and minting no
  // reinspection. The web client never DID that (it queues 'inspection.complete'), but
  // nothing on the server stopped it — a back door is a back door whether or not anyone
  // has walked through it yet.
  //
  // NO BACK DOOR. Not online, not offline, not for a retry, not for a device.
  for (const f of ['result', 'result_code', 'completedDate']) {
    if (body[f] !== undefined) {
      throw httpError(409,
        `\`${f}\` cannot be set by an inspection.patch — completion mints legal records and must go through the completion engine. Queue the 'inspection.complete' op instead.`,
        'COMPLETION_VIA_ENGINE');
    }
  }
  // A COMPLETED inspection is a finalized legal record: its findings are what was signed
  // and what was served. They cannot be rewritten afterwards, or the stored record and
  // the paper in the owner's hand disagree with nobody noticing. Abatement belongs on
  // the REINSPECTION that carries the violation forward.
  //
  // UNCONDITIONAL as of 2026-07-14 (was: only when `violations` was present — which left
  // result / notes / type / inspectorName / followUpDate rewritable on a SERVED record).
  if (before.completedDate) {
    throw httpError(409,
      'This inspection is completed — it is a finalized legal record and cannot be edited. Record abatement on the reinspection that carries the violation.',
      'RECORD_FINALIZED');
  }
  if (body.propertyId !== undefined && !(await fiProperties.findById(+body.propertyId, stationId))) {
    throw httpError(404, 'Property not found', 'NOT_FOUND');
  }
  const patch = coerce(body);
  if (patch.assigned_to_user_id !== undefined && !(await assertOwnAssignee(patch.assigned_to_user_id, stationId))) {
    throw httpError(404, 'Assignee not found in this department', 'NOT_FOUND');
  }
  const updated = await fiInspections.update(inspectionId, patch, stationId);
  const beforeById = new Map(normalizeViolations(before.violations).map((v, i) => [String(v.id ?? i), v.status]));
  const statusChanges = (updated.violations || []).flatMap((v, i) => {
    const key = String(v.id ?? i);
    const from = beforeById.get(key);
    return from !== undefined && from !== v.status ? [{ violationId: key, from, to: v.status }] : [];
  });
  await audit(stationId, user, 'update', 'fi_inspections', inspectionId,
    { fields: Object.keys(body), ...(statusChanges.length ? { statusChanges } : {}), offline: true });
  await syncViolationRows(pool, updated, stationId); // the queryable mirror rows
  return inspectionId;
}

// ── signature.add — mirrors POST /api/fi-inspections/:id/signatures ──────────
async function applySignature({ inspectionId, payload, stationId, user }) {
  await ownInspection(inspectionId, stationId);
  const b = parsePayload(signatureSchema, payload);

  let image = null;
  if (b.status === 'signed') {
    if (!b.imageDataUrl) throw httpError(400, 'A signed signature needs an image.', 'BAD_SIGNATURE_IMAGE');
    const m = DATA_URL_RE.exec(b.imageDataUrl);
    if (!m) throw httpError(400, 'imageDataUrl must be a base64 PNG data URL.', 'BAD_SIGNATURE_IMAGE');
    image = Buffer.from(m[1], 'base64');
    if (!image.length) throw httpError(400, 'Signature image is empty.', 'BAD_SIGNATURE_IMAGE');
    if (image.length > MAX_SIGNATURE_BYTES) throw httpError(413, 'Signature image too large.', 'SIGNATURE_TOO_LARGE');
    if (!b.signerName) throw httpError(400, 'Who signed? A printed name is required.', 'SIGNER_NAME_REQUIRED');
  }
  // The INSPECTOR's signature is an attestation to a legal record. There is no
  // "the inspector refused to sign his own report" — offline changes nothing about that.
  if (b.role === 'inspector' && b.status !== 'signed') {
    throw httpError(400, 'The inspector signature is an attestation and cannot be refused or skipped.',
      'INSPECTOR_MUST_SIGN');
  }

  // signed_at is the SERVER's. The occupant signed in a basement at 10:14; the device
  // syncs at 18:02. Neither clock is the record — ours is, and the device's
  // clientRecordedAt rides along as metadata only (recorded in the audit trail).
  const { rows } = await pool.query(
    `INSERT INTO fi_signatures
       (department_id, inspection_id, role, status, signer_name, signer_role_label,
        image, signed_by_user_id, refusal_reason, advisements_read,
        document_sha256, consent_text, device_label, gps_lat, gps_lng, gps_accuracy_m)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id`,
    [stationId, inspectionId, b.role, b.status, b.signerName, b.signerRoleLabel,
     image, user?.id ?? null, b.refusalReason, b.advisementsRead,
     b.documentSha256, b.consentText, b.deviceLabel,
     b.gpsLat ?? null, b.gpsLng ?? null, b.gpsAccuracyM ?? null]);
  await audit(stationId, user, 'create', 'fi_signatures', rows[0].id,
    { inspectionId, role: b.role, status: b.status, bytes: image?.length ?? 0, offline: true });
  return rows[0].id;
}

// ── service.add — mirrors POST /api/fi-inspections/:id/service ───────────────
async function applyServiceAdd({ inspectionId, payload, stationId, user }) {
  await ownInspection(inspectionId, stationId);
  const b = parsePayload(serviceSchema, payload);

  let photo = null;
  if (b.postingPhotoDataUrl) {
    const m = PHOTO_RE.exec(b.postingPhotoDataUrl);
    if (!m) throw httpError(400, 'The posting photo must be a base64 PNG/JPEG data URL.', 'BAD_PHOTO');
    photo = Buffer.from(m[2], 'base64');
    if (photo.length > MAX_PHOTO) throw httpError(413, 'Posting photo too large.', 'PHOTO_TOO_LARGE');
  }
  // Posting is EVIDENCE, not a checkbox. A coarse GPS fix is a warning (the officer may
  // be inside a steel building); a MISSING photo or location is a hard stop — that record
  // would prove nothing at a hearing, and we refuse to pretend otherwise.
  if (b.method === 'posted_premises') {
    const hard = postingDefects({
      posting_photo_present: !!photo,
      posting_lat: b.postingLat ?? null, posting_lng: b.postingLng ?? null,
      posting_accuracy_m: b.postingAccuracyM ?? null,
    }).filter((d) => !/too coarse/i.test(d));
    if (hard.length) throw httpError(400, hard.join(' '), 'POSTING_PROOF_REQUIRED');
  }
  if (b.outcome === 'no_party_present' && b.method === 'personal_service') {
    throw httpError(400,
      'If no responsible party was present, the notice was not personally served — post the premises and mail it.',
      'NOT_PERSONAL_SERVICE');
  }
  if (b.noticeId != null) {
    const { rows: n } = await pool.query(
      'SELECT 1 FROM fi_notices WHERE id = $1 AND department_id = $2 AND inspection_id = $3',
      [b.noticeId, stationId, inspectionId]);
    if (!n.length) throw httpError(404, 'That notice is not on this inspection.', 'NOT_FOUND');
  }

  const { rows: existing } = await pool.query(
    `SELECT id FROM fi_notice_service
      WHERE inspection_id = $1 AND department_id = $2 AND voided_at IS NULL`,
    [inspectionId, stationId]);
  const seq = existing.length + 1;

  // served_at defaults to NOW() — SERVER-AUTHORITATIVE, by design. Every clock that
  // matters (the correction deadline, the appeal window, the hearing-notice window)
  // runs from service, and a device clock is not evidence.
  const { rows } = await pool.query(
    `INSERT INTO fi_notice_service
       (department_id, inspection_id, notice_id, method, outcome, attempt_seq,
        served_by, served_by_user_id, servee_name, servee_relationship,
        address_used, address_source,
        posting_photo, posting_lat, posting_lng, posting_accuracy_m, posting_location_desc,
        mail_class, mail_tracking_number, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING id`,
    [stationId, inspectionId, b.noticeId ?? null, b.method, b.outcome, seq,
     user?.name || user?.username || '', user?.id ?? null, b.serveeName, b.serveeRelationship,
     b.addressUsed, b.addressSource,
     photo, b.postingLat ?? null, b.postingLng ?? null, b.postingAccuracyM ?? null, b.postingLocationDesc,
     b.mailClass ?? '', b.mailTrackingNumber, b.notes]);
  await audit(stationId, user, 'create', 'fi_notice_service', rows[0].id,
    { inspectionId, method: b.method, outcome: b.outcome, offline: true });
  return rows[0].id;
}

// ── service.mailEvent — mirrors POST /api/fi-service/:sid/mail-event ─────────
// The payload carries the serviceId (the row this event lands on). A returned/unclaimed
// event is the JONES TRIGGER: the moment we ingest it the department has knowledge, and
// serviceStatus() will hold the record at action_required until a blessed cure is recorded.
const mailEventOpSchema = mailEventSchema.extend({
  serviceId: z.number().int().positive(),
});

async function applyMailEvent({ payload, stationId, user }) {
  const b = parsePayload(mailEventOpSchema, payload);
  const { rows: found } = await pool.query(
    `SELECT id, inspection_id FROM fi_notice_service WHERE id = $1 AND department_id = $2`,
    [b.serviceId, stationId]);
  if (!found.length) throw httpError(404, 'That service record is not on this department\'s books.', 'NOT_FOUND');

  const when = b.at ? new Date(b.at) : new Date();
  const col = { accepted: 'mail_accepted_at', delivered: 'mail_delivered_at',
                returned_undelivered: 'mail_returned_at', unclaimed: 'mail_returned_at' }[b.event];
  await pool.query(
    `UPDATE fi_notice_service
        SET outcome = $1, ${col} = $2,
            delivered_address = COALESCE(NULLIF($3, ''), delivered_address),
            mail_tracking_number = COALESCE(NULLIF($4, ''), mail_tracking_number)
      WHERE id = $5 AND department_id = $6`,
    [b.event === 'accepted' ? 'accepted' : b.event, when, b.deliveredAddress, b.trackingNumber,
     b.serviceId, stationId]);
  await audit(stationId, user, 'update', 'fi_notice_service', b.serviceId,
    { mailEvent: b.event, offline: true });
  return b.serviceId;
}

// ── notice.upload — TRAP 1. The most important op in this file. ──────────────
//
// When the officer renders the notice ON DEVICE and hands the paper to the owner, THAT
// PDF is the document that was legally SERVED. We store THOSE EXACT BYTES.
//
// We do NOT re-render it here. A server-regenerated PDF could differ in any byte — a
// font, a timestamp, a violation edited in the interim — and then the record disagrees
// with the paper in the owner's hand. That desynchronization is the precise thing the
// finalized-record lock exists to prevent, and it would be introduced BY US.
//
// The device hashes the bytes it served (and that the occupant signed, per ESIGN
// §7001(e) / UETA §§9,12 — a signature must be ASSOCIATED with the record signed). We
// re-hash what arrived and REFUSE the write if it disagrees: a document that did not
// survive transit intact is not the document that was served, and we will not file it
// as though it were.
const noticeUploadSchema = z.object({
  pdfBase64: z.string().min(1),
  fileName:  z.string().trim().max(200).default(''),
  sha256:    z.string().trim().regex(/^[a-fA-F0-9]{64}$/, 'sha256 must be 64 hex characters'),
});

async function applyNoticeUpload({ inspectionId, payload, stationId, user, fi }) {
  await ownInspection(inspectionId, stationId);
  const b = parsePayload(noticeUploadSchema, payload);

  // The inspector's signature is the officer's attestation; an unsigned notice is a
  // defective instrument. Same gate as the online generator.
  // NOTE: ops are applied IN ORDER, so a signature.add earlier in THIS SAME batch has
  // already landed and satisfies this — the offline sequence (sign, then hand over the
  // notice) syncs exactly as it happened.
  const settings = fi?.settings ?? await getFiSettings(stationId);
  if (settings.require_inspector_signature !== false) {
    const { rows: sigs } = await pool.query(
      `SELECT 1 FROM fi_signatures
        WHERE department_id = $1 AND inspection_id = $2 AND role = 'inspector' AND status = 'signed'
        LIMIT 1`,
      [stationId, inspectionId]);
    if (!sigs.length) {
      throw httpError(409,
        'The inspector must sign before a notice can be issued — the notice is the officer\'s attestation, and an unsigned notice is a defective instrument.',
        'INSPECTOR_SIGNATURE_REQUIRED');
    }
  }

  const pdf = Buffer.from(b.pdfBase64, 'base64');
  if (!pdf.length) throw httpError(400, 'The uploaded notice is empty.', 'NOTICE_EMPTY');
  if (pdf.length > MAX_NOTICE_BYTES) {
    throw httpError(413, 'That notice is too large to store (12 MB limit).', 'NOTICE_TOO_LARGE');
  }
  const actual = crypto.createHash('sha256').update(pdf).digest('hex');
  if (actual !== b.sha256.toLowerCase()) {
    throw httpError(422,
      'The served document did not survive transit intact — its hash does not match the one taken on the device. It has NOT been filed. Re-upload the original from the device.',
      'NOTICE_HASH_MISMATCH');
  }

  // APPEND-ONLY: a new row, always. An earlier notice is never altered — each row is a
  // record of what was served, and the served bytes of yesterday are not editable today.
  const { rows } = await pool.query(
    `INSERT INTO fi_notices
       (department_id, inspection_id, pdf, file_name, generated_by_user_id, generated_by,
        source, sha256)
     VALUES ($1, $2, $3, $4, $5, $6, 'device', $7)
     RETURNING id`,
    [stationId, inspectionId, pdf,
     b.fileName || `violation-notice-${inspectionId}-served.pdf`,
     user?.id ?? null, user?.name || user?.username || '', actual]);
  await audit(stationId, user, 'create', 'fi_notices', rows[0].id,
    { inspectionId, bytes: pdf.length, source: 'device', sha256: actual, offline: true });
  return rows[0].id;
}

/**
 * 'inspection.complete' — THE OFFLINE COMPLETION (P3.6, 2026-07-14).
 *
 * Completion MINTS legal records: the reinspection carrying every open violation, and
 * the next cycle. A device must never fabricate those — a client-minted reinspection is
 * a legal record no human authored, with an id the server never issued.
 *
 * So the device queues the INTENT. The SERVER mints the records, right here, by calling
 * the SAME engine the online route calls (fiWorkflow.completeInspection). One engine,
 * two doors — because if this were a copy, the two would drift, and an inspection would
 * complete differently depending on whether the officer had signal.
 *
 * Every guard therefore still fires on the offline path, unchanged: the record cannot
 * PASS with unabated violations, completion is check-then-write (nothing is stamped
 * unless the whole operation is legal), and a completed record refuses to be completed
 * twice (ALREADY_COMPLETED — which, because the outbox is idempotent, also means a
 * replayed completion is answered `duplicate`, never applied twice).
 *
 * The one thing the officer gives up offline: they do not see the reinspection DATE
 * until it syncs. The UI says exactly that rather than inventing one.
 */
async function applyComplete({ inspectionId, payload, stationId, user }) {
  const parsed = completeSchema.safeParse(payload);
  if (!parsed.success) {
    throw httpError(400, `Invalid completion: ${parsed.error.issues[0]?.message || 'bad payload'}`, 'INVALID_PAYLOAD');
  }
  const out = await completeInspection({ id: inspectionId, body: parsed.data, stationId, user });
  // The batch contract wants a single id; hand back the completed inspection's, and
  // carry the minted records so the client can show what the server actually created.
  return {
    id: out.data.id,
    reinspection: out.reinspection ? { id: out.reinspection.id, scheduledDate: out.reinspection.scheduledDate } : null,
    nextCycle: out.nextCycle ?? null,
  };
}

// ── preplan.patch — mirrors PATCH /api/pre-plans/:id (2026-07-21) ────────────
//
// A pre-plan is NOT a legal record — it is tactical building intel — so this op
// deliberately carries none of the finalization machinery above. It mirrors the
// online door exactly: dept-ownership check, then a field-whitelisted update
// (db.prePlans.update owns the whitelist — the same one the online PATCH uses),
// LAST-WRITE-WINS at field level. LWW is the settled call (Matt, 2026-07-21):
// pre-plans have one author at a time in practice, and the documented
// market-wide behavior for field-authored pre-plans is the same — single-owner
// or last-write-wins; nobody merges.
//
// The pre-plan id rides the PAYLOAD (prePlanId). The batch item's inspectionId
// stays null — a pre-plan id must never be stored in the ledger's
// inspection_id column, where it would read as a link to an inspection row.
// Scoping: DEPARTMENT (like the online pre-plan routes and the pre_plans
// table), not station — the fi appliers' stationId is the same value for a
// single-house department but diverges for a multi-house one.
const preplanPatchSchema = z.object({
  prePlanId: z.number().int().positive(),
}).passthrough();

// A sketch is vector strokes, not photos — 2 MB of JSON is an enormous sketch.
// Cap it so a runaway payload cannot wedge the batch for the ops queued behind it.
const MAX_PREPLAN_PATCH_BYTES = 2 * 1024 * 1024;

async function applyPrePlanPatch({ payload, departmentId }) {
  if (JSON.stringify(payload ?? {}).length > MAX_PREPLAN_PATCH_BYTES) {
    throw httpError(413, 'That pre-plan update is too large to sync (2 MB limit).', 'PREPLAN_PATCH_TOO_LARGE');
  }
  const b = parsePayload(preplanPatchSchema, payload);
  const { prePlanId, ...fields } = b;
  if (!(await prePlans.findById(prePlanId, departmentId))) {
    throw httpError(404, 'That pre-plan is not on this department\'s books.', 'NOT_FOUND');
  }
  await prePlans.update(prePlanId, fields, departmentId);
  return prePlanId;
}

// ── 2.6 FIELD LOGISTICS OPS (crew vocabulary; Phase 2.6) ─────────────────────
// Spec: docs/PHASE2-OFM-FIELD-SPEC-2026-07-26.md. Both appliers call the SAME
// engine functions the online routes use (imported, not copy-pasted — the rule
// at the top of this file), validated by the SAME strict schemas: a queued
// check's result_code is still server-derived; a client-supplied one is
// rejected. inspectionId stays null for both (the preplan.patch precedent).

async function applyCheckComplete({ payload, stationId, user }) {
  const b = parsePayload(completionBody, payload);
  const created = await applyCheckCompletion({ stationId, user, body: b });
  // Hand back what the server derived, so the device shows the REAL result.
  return { id: created.id, result_code: created.result_code };
}

async function applyDefectCreate({ payload, stationId, user }) {
  // The device cannot know the server check id at queue time — it sends the
  // clientId of its queued check.complete instead, and we resolve it through
  // the idempotency ledger. FIFO queue + sequential batch means the check
  // landed first in the normal case. If it was rejected (or unresolved), the
  // defect DEGRADES to check_id null and still lands: the problem on the rig
  // is real regardless of whether the check record survived, and the
  // apparatus+item_key dedupe key doesn't involve check_id.
  const { check_client_id, ...rest } = payload ?? {};
  const b = parsePayload(defectCreateBody, rest);
  if (!b.check_id && typeof check_client_id === 'string'
      && check_client_id.length >= 8 && check_client_id.length <= 64) {
    const { rows } = await pool.query(
      `SELECT result_id FROM fi_sync_ops WHERE department_id = $1 AND client_id = $2`,
      [stationId, check_client_id]);
    if (rows.length && rows[0].result_id != null) b.check_id = Number(rows[0].result_id);
  }
  const { row, created } = await createDefect({ stationId, user, body: b });
  return { id: row.id, deduped: !created };
}

const APPLIERS = {
  'answers.put':        applyAnswersPut,
  'inspection.patch':   applyInspectionPatch,
  'signature.add':      applySignature,
  'service.add':        applyServiceAdd,
  'service.mailEvent':  applyMailEvent,
  'notice.upload':      applyNoticeUpload,
  'inspection.complete': applyComplete,
  'preplan.patch':      applyPrePlanPatch,
  'check.complete':     applyCheckComplete,
  'defect.create':      applyDefectCreate,
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/fi-sync/batch — drain the outbox
// ═══════════════════════════════════════════════════════════════════════════════
const batchSchema = z.object({
  ops: z.array(z.object({
    clientId: z.string().trim().min(8).max(64),   // the device's UUID — the idempotency key
    // Deliberately NOT a z.enum: an unrecognized op must be rejected as ONE ITEM, not
    // 400 the whole envelope and take nineteen good writes down with it. (The client's
    // outbox also knows 'photo.upload', which does not travel this JSON transport — it
    // goes to the multipart /api/fi-inspections/:id/photos endpoint.)
    op:       z.string().trim().min(1).max(40),
    inspectionId: z.number().int().positive().nullable().default(null),
    payload:  z.record(z.any()).default({}),
    // METADATA ONLY. Never a record timestamp. Kept so the audit trail can show the gap
    // between when the officer acted and when the write reached us.
    clientRecordedAt: z.string().datetime().optional(),
  })).min(1).max(MAX_OPS_PER_BATCH),
});

// ── PER-OP AUTHORIZATION (2026-07-21) ────────────────────────────────────────
// The batch used to be requireInspector at the route door — right when every op
// was an inspection op, wrong the moment preplan.patch joined: pre-plan authoring
// is a CREW capability (the online pre-plan routes have no role gate — any
// department member; the market's field-capture tools put pre-plan authoring on
// line personnel, not inspectors). So the inspector check moved INSIDE the loop,
// per op: fi ops still demand the designation; preplan ops need only department
// membership. A designation the user does not hold is not something a retry can
// fix — it is refused ALONE and TERMINALLY, instead of a 403 envelope that would
// strand every good write behind it in endless transport-retry.
// 2.6 extended the crew set: check completions and defect flags are CREW work
// online (any member, incl. unit sessions — routes/checks.js, routes/defects.js),
// so they are crew work offline too. Offline is a transport, not a role change.
const CREW_OP_PREFIXES = ['preplan.', 'check.', 'defect.'];
const INSPECTOR_ONLY = (op) => !CREW_OP_PREFIXES.some((p) => op.startsWith(p));

router.post('/batch', loadFiContext, validate({ body: batchSchema }),
  scoped(async ({ req, stationId, user }) => {
    const results = [];
    // The DEPARTMENT id, exactly as the online pre-plan routes resolve it
    // (req.user.department_id; equal to stationId for a single-house department).
    // The fi appliers keep their stationId; preplan.patch scopes by department
    // because pre_plans does.
    const departmentId = req.user?.department_id ?? stationId;

    // SEQUENTIAL, IN THE ORDER THE OFFICER DID THE WORK. Not a performance choice — an
    // ordering one: notice.upload's signature gate is satisfied by the signature.add
    // queued before it in the same batch. Parallelism would race that (and the pool is
    // max:1 in production anyway).
    for (const item of req.body.ops) {
      // An op this server doesn't know is refused ALONE, and NOTHING is recorded — so a
      // client that later learns the right transport can still land the work.
      if (!Object.prototype.hasOwnProperty.call(APPLIERS, item.op)) {
        results.push({ clientId: item.clientId, status: 'rejected', code: 'UNSUPPORTED_OP',
                       message: `This server does not accept '${item.op}' on the sync batch.` });
        continue;
      }

      // Inspector-only ops from a non-inspector are refused per-op (see the
      // authorization note above the route). Terminal: retrying cannot mint a
      // designation, and the officer must be TOLD rather than silently retried.
      if (INSPECTOR_ONLY(item.op) && !req.fi.isInspector) {
        results.push({ clientId: item.clientId, status: 'rejected', code: 'FORBIDDEN',
                       message: 'This change needs an inspector designation (or crew inspections enabled). It was not applied.' });
        continue;
      }

      // ── The claim. This IS the dedupe guarantee (0054). ──────────────────────
      // We claim the key BEFORE applying, not after. If we applied first and recorded
      // second, a retry that arrived while the first attempt was still running would
      // find no ledger row and apply the write a SECOND time — a doubled violation on a
      // legal record, which is exactly the failure this whole file exists to prevent.
      // ON CONFLICT DO NOTHING makes the claim atomic: the loser of that race gets no
      // row back and is answered `duplicate` (which the client's syncCore treats as
      // success — precisely what an idempotency key is for).
      let claimId;
      try {
        const { rows: claim } = await pool.query(
          `INSERT INTO fi_sync_ops (department_id, client_id, op, inspection_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (department_id, client_id) DO NOTHING
           RETURNING id`,
          [stationId, item.clientId, item.op, item.inspectionId]);

        if (!claim.length) {
          // Already claimed → this write ALREADY landed (or is landing right now).
          // Apply NOTHING. Hand back the id the first attempt produced, so the client
          // can reconcile its cache. (result_id is null only while the original is
          // still in flight; the client's contract makes the id optional.)
          const { rows: prior } = await pool.query(
            `SELECT result_id FROM fi_sync_ops WHERE department_id = $1 AND client_id = $2`,
            [stationId, item.clientId]);
          results.push({ clientId: item.clientId, status: 'duplicate', id: prior[0]?.result_id ?? null });
          continue;
        }
        claimId = claim[0].id;
      } catch (e) {
        // Couldn't even claim → we cannot prove this write is safe to apply, so we do
        // NOT apply it. Retryable (the client keeps the work).
        console.error(`[fi-sync] claim failed for ${item.op}:`, e.message);
        results.push({ clientId: item.clientId, status: 'rejected', code: 'SYNC_UNAVAILABLE',
                       message: 'Could not sync this change — it is still saved on your device.' });
        continue;
      }

      try {
        const applier = APPLIERS[item.op];
        const out = await applier({
          inspectionId: item.inspectionId,
          payload: item.payload,
          stationId, departmentId, user, fi: req.fi,
        });
        // Most appliers return the new row's id. `inspection.complete` also needs to
        // hand back what the SERVER minted (the reinspection, the next cycle) so the
        // device can show the officer the real dates instead of inventing them — so an
        // applier may return { id, ...extras }. The ledger only ever stores the id.
        const isObj = out && typeof out === 'object';
        const id = isObj ? out.id : out;
        const extras = isObj ? (({ id: _drop, ...rest }) => rest)(out) : {};
        await pool.query('UPDATE fi_sync_ops SET result_id = $1 WHERE id = $2', [id ?? null, claimId]);
        results.push({ clientId: item.clientId, status: 'applied', id: id ?? null, ...extras });
      } catch (err) {
        // ── The claim is RELEASED on failure. ────────────────────────────────────
        // Nothing was written, so nothing must be remembered: leaving the claim behind
        // would answer a corrected retry with `duplicate` and the officer's work would
        // vanish into a row that never existed. A rejection records NOTHING.
        // (Correctness note: every applier's write is a single statement, so a thrown
        //  error means it did not land.)
        try {
          await pool.query('DELETE FROM fi_sync_ops WHERE id = $1', [claimId]);
        } catch (e2) {
          console.error('[fi-sync] failed to release claim — a retry of this op will read as duplicate:', e2.message);
        }

        const isBusinessRule = Number.isInteger(err.status) && err.status >= 400 && err.status < 500;
        if (!isBusinessRule) console.error(`[fi-sync] ${item.op} failed:`, err.message);

        // ONE OP FAILING NEVER TOUCHES THE OTHERS. This is R4: an all-or-nothing batch
        // would throw away a day of good work because the office completed one record.
        results.push({
          clientId: item.clientId,
          status: 'rejected',
          code: isBusinessRule ? (err.code || 'REJECTED') : 'SERVER_ERROR',
          message: isBusinessRule
            ? err.message
            : 'The server could not apply this change — it is still saved on your device.',
        });
      }
    }

    // The drain itself is a legally interesting event: it is the moment a day of field
    // work entered the system of record.
    await audit(stationId, user, 'update', 'fi_sync_ops', null, {
      ops: results.length,
      applied:   results.filter((r) => r.status === 'applied').length,
      duplicate: results.filter((r) => r.status === 'duplicate').length,
      rejected:  results.filter((r) => r.status === 'rejected').length,
    });

    return { results, serverTime: new Date().toISOString() };
  }));

module.exports = router;
