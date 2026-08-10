'use strict';
/**
 * routes/fiNotices.js — generate, list, stream, and (when configured) email the
 * violation notice (Prevention Core Phase 2.3, 2026-07-12).
 *
 * POST /api/fi-inspections/:id/notice  — generate a notice PDF for the inspection
 *   as it stands NOW (append-only: regenerating adds a new fi_notices row; the
 *   prior PDF is never altered — each generation is a record of what was served).
 *   Optional { emailTo } sends via Resend WHEN the platform key is configured;
 *   without it the path is dormant-safe: the notice is still generated + stored,
 *   and the response says the email was skipped (same posture as auth.js
 *   verification email). sent_to/sent_at/method recorded only on real sends.
 * GET  /api/fi-inspections/:id/notices — list (metadata only, no bytes).
 * GET  /api/fi-notices/:noticeId/pdf   — stream the stored PDF (auth'd, dept-scoped).
 *
 * Gate: requireInspector (crew/designation model, fiAuth).
 */
const express = require('express');
const router  = express.Router();
const { z } = require('zod');
const { pool, fiInspections, fiProperties } = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { loadFiContext, requireInspector } = require('../middleware/fiAuth');
const { getFiSettings } = require('../middleware/fiAuth');
const { audit } = require('../utils/auditLog');
const { normalizeViolations } = require('../constants/violationStatus');
const { buildNoticePdf, unconfiguredNoticeBlocks } = require('../utils/fiNoticePdf');

const idParam = validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) });

async function departmentName(departmentId) {
  try {
    const { rows } = await pool.query('SELECT name FROM departments WHERE id = $1', [departmentId]);
    return rows[0]?.name || '';
  } catch { return ''; }
}

// ── POST /api/fi-inspections/:id/notice ──────────────────────────────────────
const generateSchema = z.object({
  emailTo: z.string().trim().email().optional(),
});

router.post('/:id/notice', idParam, loadFiContext, requireInspector,
  validate({ body: generateSchema }), scoped(async ({ req, stationId, user }) => {
    const id = +req.params.id;
    const inspection = await fiInspections.findById(id, stationId);
    if (!inspection) throw httpError(404, 'Not found', 'NOT_FOUND');
    const [property, settings, deptName, sigs, serviceRows, codeLibrary] = await Promise.all([
      fiProperties.findById(inspection.propertyId, stationId),
      getFiSettings(stationId),
      departmentName(stationId),
      pool.query(
        `SELECT role, status, signer_name, signer_role_label, signed_at,
                refusal_reason, advisements_read
         FROM fi_signatures WHERE inspection_id = $1 AND department_id = $2 ORDER BY signed_at`,
        [id, stationId]).then((r) => r.rows),
      pool.query(
        `SELECT * FROM fi_notice_service WHERE inspection_id = $1 AND department_id = $2
         ORDER BY served_at, id`, [id, stationId]).then((r) => r.rows),
      // Decision A: the notice cites "IFC 2021 §906.1", composed from the dept's code
      // library (retired rows included — a historical citation must still resolve).
      pool.query(
        `SELECT code, section, edition FROM fi_code_library WHERE department_id = $1`,
        [stationId]).then((r) => r.rows),
    ]);

    // 0053 — the INSPECTOR's signature is the officer's attestation to a legal
    // record, and it is the one signature every serious platform makes mandatory.
    // An unsigned notice is a defective instrument. This is the gate.
    // (The OCCUPANT's signature is NEVER a gate — it is receipt-acknowledgment,
    // and refusal to give it does not invalidate anything.)
    if (settings.require_inspector_signature !== false) {
      const attested = sigs.some((s) => s.role === 'inspector' && s.status === 'signed');
      if (!attested) {
        throw httpError(409,
          'The inspector must sign before a notice can be issued — the notice is the officer\'s attestation, and an unsigned notice is a defective instrument.',
          'INSPECTOR_SIGNATURE_REQUIRED');
      }
    }

    // P1-2 (2026-07-16): a legal instrument must never print "[SAMPLE TEXT …]".
    // While the department's notice text blocks are unauthored, generation is
    // REFUSED with the exact blocks to fill in — never silently rendered with
    // placeholder legalese that could be served on a property owner.
    const missingBlocks = unconfiguredNoticeBlocks(settings, normalizeViolations(inspection.violations));
    if (missingBlocks.length) {
      throw httpError(422,
        `The department's notice text is not configured — generating now would print "[SAMPLE TEXT — review with your authority having jurisdiction]" on a legal document. Author these blocks in Prevention Center → Settings → Notices: ${missingBlocks.join(', ')}.`,
        'NOTICE_TEMPLATES_UNCONFIGURED', { missing: missingBlocks });
    }

    const violations = normalizeViolations(inspection.violations);
    const pdf = await buildNoticePdf({
      departmentName: deptName, settings, property, inspection, violations,
      signatures: sigs, service: serviceRows, codeLibrary,
    });
    const fileName = `violation-notice-${id}-${Date.now()}.pdf`;

    // Dormant-safe email: generated + stored regardless; sent only with a key.
    let emailed = false; let emailSkipped = null;
    if (req.body.emailTo) {
      if (!process.env.RESEND_API_KEY) {
        emailSkipped = 'Email is not configured on this deployment yet (RESEND_API_KEY unset) — the notice was generated and stored; download and send it manually.';
        console.log(JSON.stringify({ kind: 'fi_notice_email_skipped_no_resend', inspection: id }));
      } else {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || 'notices@openscaffoldlabs.com',
            to: req.body.emailTo,
            subject: `${deptName || 'Fire Department'} — Inspection notice for ${property?.name || 'your premises'}`,
            text: 'The attached notice documents the results of a fire inspection of your premises. Please review it in full.',
            attachments: [{ filename: fileName, content: pdf.toString('base64') }],
          }),
        });
        emailed = r.ok;
        if (!r.ok) emailSkipped = `Email send failed (${r.status}) — the notice was generated and stored.`;
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO fi_notices (department_id, inspection_id, pdf, file_name,
         generated_by_user_id, generated_by, sent_to, sent_at, method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, inspection_id, file_name, generated_by, sent_to, sent_at, method, created_at`,
      [stationId, id, pdf, fileName, user?.id ?? null, user?.name || user?.username || '',
       emailed ? req.body.emailTo : '', emailed ? new Date() : null, emailed ? 'email' : '']);
    await audit(stationId, user, 'create', 'fi_notices', rows[0].id,
      { inspectionId: id, bytes: pdf.length, emailed, ...(req.body.emailTo && !emailed ? { emailSkipped: true } : {}) });
    return { data: { ...rows[0], bytes: pdf.length, emailed, ...(emailSkipped ? { emailSkipped } : {}) }, _status: 201 };
  }));

// ── GET /api/fi-inspections/:id/notices (metadata only) ──────────────────────
router.get('/:id/notices', idParam, scoped(async ({ req, stationId }) => {
  const id = +req.params.id;
  if (!await fiInspections.findById(id, stationId)) throw httpError(404, 'Not found', 'NOT_FOUND');
  const { rows } = await pool.query(
    `SELECT id, file_name, generated_by, sent_to, sent_at, method, created_at, octet_length(pdf) AS bytes
     FROM fi_notices WHERE inspection_id = $1 AND department_id = $2 ORDER BY created_at DESC`,
    [id, stationId]);
  return { data: rows };
}));

module.exports = router;

// ── The PDF stream lives on its own tiny router (mounted at /api/fi-notices) ──
const pdfRouter = express.Router();

// GET /api/fi-notices — the end-of-day MAILROOM list (2026-07-15). Every notice the department
// has generated, newest first, with its property and whether it has been served/mailed yet (any
// non-void fi_notice_service row). This is the office view: "here's everything to get out the
// door." Metadata only (no PDF bytes); the clerk downloads each via /:noticeId/pdf.
pdfRouter.get('/', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT n.id, n.inspection_id, n.file_name, n.generated_by, n.sent_to, n.sent_at, n.method,
            n.created_at, octet_length(n.pdf) AS bytes,
            i.type AS inspection_type,
            p.name AS property_name, p.address AS property_address,
            EXISTS (SELECT 1 FROM fi_notice_service s
                    WHERE s.inspection_id = n.inspection_id AND s.voided_at IS NULL) AS served
     FROM fi_notices n
     LEFT JOIN fi_inspections i ON i.id = n.inspection_id
     LEFT JOIN fi_properties  p ON p.id = i."propertyId"
     WHERE n.department_id = $1
     ORDER BY n.created_at DESC
     LIMIT 500`, [stationId]);
  return { data: rows };
}));

pdfRouter.get('/:noticeId/pdf',
  validate({ params: z.object({ noticeId: z.string().regex(/^\d+$/) }) }),
  scoped(async ({ req, res, stationId }) => {
    const { rows } = await pool.query(
      `SELECT pdf, file_name FROM fi_notices WHERE id = $1 AND department_id = $2`,
      [+req.params.noticeId, stationId]);
    if (!rows.length || !rows[0].pdf) throw httpError(404, 'Not found', 'NOT_FOUND');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${rows[0].file_name || 'notice.pdf'}"`);
    res.end(rows[0].pdf);
  }));
module.exports.pdfRouter = pdfRouter;
