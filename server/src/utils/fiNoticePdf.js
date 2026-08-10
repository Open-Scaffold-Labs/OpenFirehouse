'use strict';
/**
 * utils/fiNoticePdf.js — the violation-notice / inspection-report PDF
 * (Prevention Core Phase 2.3, 2026-07-12). PDFKit, following the house pattern
 * (routes/prePlanExport.js) but rendering to a Buffer — the notice is stored
 * IN the fi_notices row (BYTEA): a legal document, atomic with its record.
 *
 * Content doctrine (decision §7.3): the legal text blocks are DEPARTMENT-authored
 * settings. When a block is empty we render clearly-generic sample text marked
 * "[SAMPLE — review with your authority having jurisdiction]" — never blank
 * (broken-looking notices), never authoritative legalese (not ours to write).
 * Violation wording is the INSPECTOR's (AI never writes the record).
 */
const PDFDocument = require('pdfkit');
const { isResolvedViolationStatus } = require('../constants/violationStatus');
const { METHOD_LABELS, OUTCOME_LABELS } = require('./serviceOfNotice');

const SAMPLE_FLAG = '[SAMPLE TEXT — review with your authority having jurisdiction; replace in Prevention Settings]';
const DEFAULTS = {
  notice_header: 'NOTICE OF FIRE CODE VIOLATIONS',
  notice_body:
    'An inspection of the premises identified below found the following conditions in violation of the fire code adopted by this jurisdiction. ' +
    'You are directed to correct each violation on or before its listed reinspection date. ' + SAMPLE_FLAG,
  notice_legalese:
    'Failure to correct the violations listed on this notice within the time allowed may result in further enforcement action as provided by law. ' +
    'You may have the right to request an extension of time or to appeal this notice; contact the issuing office for the applicable procedure. ' + SAMPLE_FLAG,
  notice_passed_body:
    'An inspection of the premises identified below found no outstanding violations at the time of inspection. Thank you for helping keep your community fire-safe. ' + SAMPLE_FLAG,
  notice_footer: '',
  signature_agreement_text:
    'Signature acknowledges receipt of this notice only and does not constitute an admission of any violation. ' + SAMPLE_FLAG,
};

function block(settings, key) {
  const v = (settings?.[key] ?? '').trim();
  return v || DEFAULTS[key];
}

const GRAY = '#444444';
const RED  = '#b91c1c';

/**
 * @returns {Promise<Buffer>}
 */
function buildNoticePdf({ departmentName, settings, property, inspection, violations,
                         signatures = [], service = [], codeLibrary = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 54, bottom: 54, left: 54, right: 54 } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const open = violations.filter((v) => !isResolvedViolationStatus(v.status));
    const passed = open.length === 0;

    // Decision A follow-up (2026-07-16): a served notice cites the code the way an
    // inspector does — "IFC 2021 §906.1", never a bare number. The violation row keeps
    // the code VERBATIM (the historical record); the department's code library supplies
    // edition + section for display only. A code with no library row (custom/legacy)
    // prints verbatim. Mirrored in client/src/lib/offline/noticePdf.js — the on-device
    // and office documents must render identical content.
    const libByCode = new Map((codeLibrary || []).map((c) => [String(c.code), c]));
    const citationFor = (v) => {
      const c = v.code ? libByCode.get(String(v.code)) : null;
      return c?.section ? `${c.edition ? `${c.edition} ` : ''}§${c.section}` : (v.code || '—');
    };

    // ── Letterhead ────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(15).text(departmentName || 'Fire Department', { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(passed ? GRAY : RED)
      .text(passed ? 'INSPECTION REPORT' : block(settings, 'notice_header'), { align: 'center' });
    doc.fillColor('black').moveDown(0.8);

    // ── Premises + inspection meta ────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(10).text('PREMISES');
    doc.font('Helvetica').fontSize(10)
      .text(property?.name || `Property #${inspection.propertyId}`)
      .text(property?.address || '');
    if (property?.ownerName) doc.text(`Owner/Contact: ${property.ownerName}${property.ownerPhone ? ` · ${property.ownerPhone}` : ''}`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('INSPECTION');
    doc.font('Helvetica')
      .text(`Type: ${inspection.type || 'Inspection'}   ·   Inspector: ${inspection.inspectorName || '—'}`)
      .text(`Date: ${String(inspection.completedDate || inspection.scheduledDate || '').slice(0, 10) || '—'}   ·   Result: ${inspection.result || '—'}   ·   Record #${inspection.id}`);
    doc.moveDown(0.8);

    // ── Body ──────────────────────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(9.5)
      .text(block(settings, passed ? 'notice_passed_body' : 'notice_body'), { align: 'justify' });
    doc.moveDown(0.8);

    // ── Violations table ──────────────────────────────────────────────────────
    if (!passed) {
      doc.font('Helvetica-Bold').fontSize(10).text(`VIOLATIONS (${open.length} open of ${violations.length} cited)`);
      doc.moveDown(0.3);
      for (const v of violations) {
        const resolved = isResolvedViolationStatus(v.status);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(resolved ? GRAY : 'black')
          .text(`${citationFor(v)}  ${v.description || ''}`, { continued: false });
        const bits = [];
        bits.push(`Status: ${v.status}${v.status_raw ? ` (recorded as "${v.status_raw}")` : ''}`);
        // RETIRED 2026-07-14 (Matt, a working fire inspector): there is no severity
        // button or label in fire inspection. Violations are not graded Low/Moderate/High —
        // a condition is either an IMMINENT HAZARD or an ordinary violation with a
        // correct-by date. The field was invented, it gated nothing, and it DEFAULTED to
        // 'Moderate' — so a notice served on an owner could carry a grading the inspector
        // never made. That is the record saying something the officer didn't say.
        // The DB column is retained (retire, don't delete); it is simply never authored
        // or printed. imminentHazard is the real, code-grounded flag and does this job.
        if (v.imminentHazard === true) bits.push('IMMINENT HAZARD');
        if (!resolved && v.followUpDate) bits.push(`Correct by / reinspection: ${String(v.followUpDate).slice(0, 10)}`);
        if (resolved && v.correctedDate) bits.push(`Corrected: ${String(v.correctedDate).slice(0, 10)}`);
        doc.font('Helvetica').fontSize(8.5).fillColor(v.imminentHazard === true && !resolved ? RED : GRAY).text(bits.join('   ·   '));
        if (v.notes) doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(GRAY).text(v.notes);
        doc.fillColor('black').moveDown(0.35);
      }
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(8.5).fillColor(GRAY)
        .text(block(settings, 'notice_legalese'), { align: 'justify' });
      doc.fillColor('black');
    }

    // ── ACKNOWLEDGMENT OF RECEIPT ─────────────────────────────────────────────
    // An occupant signature acknowledges RECEIPT ONLY. It is not agreement with the
    // findings, and refusing it does not invalidate this notice nor extend any
    // deadline. So the block must state, on the served document, WHAT ACTUALLY
    // HAPPENED — signed, refused, or nobody there. A blank line says none of that,
    // and "no signature" is precisely the ambiguity that gets attacked at a hearing.
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black').text('ACKNOWLEDGMENT OF RECEIPT');
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(block(settings, 'signature_agreement_text'));
    doc.moveDown(0.4);

    const occ = [...signatures].reverse().find((s) => s.role === 'occupant');
    const insp = [...signatures].reverse().find((s) => s.role === 'inspector' && s.status === 'signed');
    const stamp = (t) => (t ? new Date(t).toLocaleString('en-US') : '');
    const who = occ?.signer_name
      ? `${occ.signer_name}${occ.signer_role_label ? ` (${occ.signer_role_label})` : ''}`
      : 'The person present';

    doc.font('Helvetica').fontSize(9).fillColor('black');
    if (occ?.status === 'signed') {
      doc.text(`Received by: ${who} on ${stamp(occ.signed_at)}.`);
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(GRAY).text(
        'Signature acknowledges receipt of this notice only. It is not an agreement with the findings and does not waive any right of appeal.');
    } else if (occ?.status === 'refused') {
      doc.font('Helvetica-Bold').text('REFUSED.');
      doc.font('Helvetica').text(
        `${who} was offered a copy of this notice and declined to sign an acknowledgment of receipt on ${stamp(occ.signed_at)}.` +
        (occ.advisements_read
          ? ' The person was advised that an acknowledgment of receipt is not an agreement with the findings, that refusal to sign does not affect the obligation to correct the violations within the times specified, and that the refusal is recorded in this report.'
          : '') +
        (occ.refusal_reason ? ` Reason given: ${occ.refusal_reason}.` : ''),
        { align: 'justify' });
      doc.font('Helvetica-Bold').fontSize(8.5).text(
        'Refusal to sign does not invalidate this notice and does not extend any compliance deadline.');
    } else if (occ?.status === 'unable_no_party_present') {
      doc.font('Helvetica-Bold').text('NOT OBTAINED — no responsible party present.');
      doc.font('Helvetica').text(
        `No owner, agent, operator, occupant, or other responsible party was present at the premises on ${stamp(occ.signed_at)}. Service was effected as stated in the Certificate of Service below.`,
        { align: 'justify' });
    } else if (occ) {
      doc.font('Helvetica-Bold').text('NOT OBTAINED.');
      doc.font('Helvetica').text(
        `An acknowledgment signature was not obtained on ${stamp(occ.signed_at)}.` +
        (occ.refusal_reason ? ` Reason: ${occ.refusal_reason}.` : '') +
        ' Service was effected as stated in the Certificate of Service below.', { align: 'justify' });
    } else {
      doc.text('Received by: ________________________________   Date: ______________');
    }

    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(9).fillColor('black')
      .text(`Inspector: ${insp?.signer_name || inspection.inspectorName || '________________________________'}`);
    if (insp?.signed_at) {
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(GRAY)
        .text(`Electronically signed ${stamp(insp.signed_at)}${insp.document_sha256 ? ` · document integrity SHA-256 ${String(insp.document_sha256).slice(0, 16)}…` : ''}`);
      doc.fillColor('black');
    }

    // ── CERTIFICATE OF SERVICE ────────────────────────────────────────────────
    // THIS is what makes the notice stick. Validity rests on SERVICE (IFC §109.3.1,
    // NFPA 1 §1.16, IPMC §107.3) — not on a signature. Today this is typed by hand
    // on a court form, notarized, and scanned back into the case; here it is
    // generated from the service records themselves.
    if (service.length) {
      const live = service.filter((s) => !s.voided_at);
      if (live.length) {
        doc.moveDown(0.9);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('black').text('CERTIFICATE OF SERVICE');
        doc.moveDown(0.25);
        doc.font('Helvetica').fontSize(8.5).fillColor('black');
        for (const s of live) {
          const m = METHOD_LABELS[s.method] || s.method;
          const o = OUTCOME_LABELS[s.outcome] || s.outcome;
          const bits = [`• ${m} — ${o}, on ${stamp(s.served_at)}`];
          if (s.servee_name) bits.push(`to ${s.servee_name}${s.servee_relationship ? ` (${s.servee_relationship})` : ''}`);
          if (s.address_used) bits.push(`at ${s.address_used}`);
          if (s.mail_tracking_number) bits.push(`tracking ${s.mail_tracking_number}`);
          if (s.posting_location_desc) bits.push(`posted at ${s.posting_location_desc}`);
          if (s.method === 'posted_premises') bits.push('(photograph of the posting on file)');
          if (s.served_by) bits.push(`by ${s.served_by}`);
          doc.text(bits.join('; ') + '.', { align: 'justify' });
        }
        const cert = block(settings, 'certificate_of_service_text');
        if (cert) { doc.moveDown(0.4); doc.fontSize(8).fillColor(GRAY).text(cert, { align: 'justify' }); doc.fillColor('black'); }
      }
    }

    const footer = block(settings, 'notice_footer');
    if (footer) { doc.moveDown(0.6); doc.fontSize(8).fillColor(GRAY).text(footer, { align: 'center' }); }

    doc.end();
  });
}

/**
 * P1-2 (2026-07-16): the text blocks whose EMPTY state would print the SAMPLE
 * placeholder on THIS notice (which blocks apply depends on pass/fail).
 * notice_header and notice_footer never print the flag (real/blank defaults).
 * Notice generation GATES on this — a legal instrument must never say
 * "[SAMPLE TEXT …]". Mirrored verbatim in client/src/lib/offline/noticePdf.js.
 */
function unconfiguredNoticeBlocks(settings, violations) {
  const open = (violations || []).filter((v) => !isResolvedViolationStatus(v.status));
  const relevant = open.length === 0
    ? ['notice_passed_body', 'signature_agreement_text']
    : ['notice_body', 'notice_legalese', 'signature_agreement_text'];
  return relevant.filter((k) => !String(settings?.[k] ?? '').trim());
}

module.exports = { buildNoticePdf, DEFAULTS, SAMPLE_FLAG, unconfiguredNoticeBlocks };
