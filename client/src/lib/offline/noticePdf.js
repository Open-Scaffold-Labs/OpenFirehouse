// lib/offline/noticePdf.js — THE WEDGE (Phase 3.6, Slice C1). The Notice of Violation,
// rendered ON DEVICE, with no signal.
//
// Every incumbent we looked at renders this server-side, which means the officer standing
// in a basement cannot hand the owner the document. We can. That is the whole point of the
// slice, and it is why this file exists.
//
// ── TRAP 1 — THESE BYTES ARE THE SERVED INSTRUMENT ──────────────────────────
// When the officer prints this and physically hands it over, THIS PDF is the document that
// was served. Its exact bytes are hashed here and uploaded verbatim (op 'notice.upload');
// the server re-hashes and REFUSES the write on a mismatch. It never re-renders. A
// server-regenerated notice could differ in any byte — a font, a timestamp, a violation
// edited afterwards — and then the filed record disagrees with the paper in the owner's
// hand. Nothing in this file may be regenerated at sync time. Render once; that is the
// record.
//
// ── CONTENT IS A MIRROR OF server/src/utils/fiNoticePdf.js ──────────────────
// Same blocks, same order, same wording, same SAMPLE_FLAG doctrine: the legal text is the
// DEPARTMENT's (fi_settings). Where a department has not written its own, we print the same
// clearly-flagged sample text the server prints — never blank (a broken-looking notice) and
// never our own authoritative-sounding legalese (it is not ours to write). The violation
// wording is the INSPECTOR's; nothing here composes prose.
//
// The only deliberate divergence is typographic: the server's PDFKit justifies its body
// paragraphs, we set them ragged-right so that a block can be split across a page boundary
// line-by-line without jsPDF re-wrapping it. Alignment is cosmetic; CONTENT and ORDER are
// the contract, and those match.
import { jsPDF } from 'jspdf';
import { isResolvedViolationStatus } from '../../data/fireInspections';
import { METHOD_LABELS, OUTCOME_LABELS } from '../shared/serviceOfNotice';

const SAMPLE_FLAG = '[SAMPLE TEXT — review with your authority having jurisdiction; replace in Prevention Settings]';

// Verbatim from the server's DEFAULTS. If one side ever changes, the two documents diverge
// and the department's own legal language is no longer the same on paper and on file.
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
  const v = String(settings?.[key] ?? '').trim();
  return v || DEFAULTS[key];
}

const BLACK = [0, 0, 0];
const GRAY = [68, 68, 68];    // #444444
const RED = [185, 28, 28];    // #b91c1c

const PAGE_W = 612;
const PAGE_H = 792;
const M = 54;                 // the server's PDFKit margins
const CW = PAGE_W - 2 * M;    // content width

const stamp = (t) => (t ? new Date(t).toLocaleString('en-US') : '');

/**
 * Render the notice.
 * @returns {Promise<{blob: Blob, bytes: Uint8Array, sha256: string, fileName: string}>}
 */
export async function buildNoticePdf({
  departmentName, settings, property, inspection, violations,
  signatures = [], service = [], codeLibrary = [],
}) {
  // Decision A follow-up (2026-07-16): the notice cites "IFC 2021 §906.1", composed
  // from the department's code library — verbatim mirror of the server renderer
  // (utils/fiNoticePdf.js). A code with no library row prints verbatim.
  const libByCode = new Map((codeLibrary || []).map((c) => [String(c.code), c]));
  const citationFor = (v) => {
    const c = v.code ? libByCode.get(String(v.code)) : null;
    return c?.section ? `${c.edition ? `${c.edition} ` : ''}§${c.section}` : (v.code || '—');
  };
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  let y = M;

  const need = (h) => { if (y + h > PAGE_H - M) { doc.addPage(); y = M; } };
  const setStyle = (style, size, color) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };
  /** One text block, wrapped, paginated line-by-line so a long body never overflows a page. */
  const para = (text, { style = 'normal', size = 10, color = BLACK, align = 'left' } = {}) => {
    const str = String(text ?? '');
    if (!str) return;
    setStyle(style, size, color);
    const lh = size * 1.25;
    for (const line of doc.splitTextToSize(str, CW)) {
      need(lh);
      doc.text(line, align === 'center' ? PAGE_W / 2 : M, y + size, align === 'center' ? { align: 'center' } : undefined);
      y += lh;
    }
  };
  const gap = (pts) => { y += pts; };

  const open = violations.filter((v) => !isResolvedViolationStatus(v.status));
  const passed = open.length === 0;

  // ── Letterhead ──────────────────────────────────────────────────────────────
  para(departmentName || 'Fire Department', { style: 'bold', size: 15, align: 'center' });
  gap(3);
  para(passed ? 'INSPECTION REPORT' : block(settings, 'notice_header'),
    { style: 'bold', size: 12, color: passed ? GRAY : RED, align: 'center' });
  gap(10);

  // ── Premises + inspection meta ──────────────────────────────────────────────
  para('PREMISES', { style: 'bold', size: 10 });
  para(property?.name || `Property #${inspection.propertyId}`, { size: 10 });
  para(property?.address || '', { size: 10 });
  if (property?.ownerName) {
    para(`Owner/Contact: ${property.ownerName}${property.ownerPhone ? ` · ${property.ownerPhone}` : ''}`, { size: 10 });
  }
  gap(6);
  para('INSPECTION', { style: 'bold', size: 10 });
  para(`Type: ${inspection.type || 'Inspection'}   ·   Inspector: ${inspection.inspectorName || '—'}`, { size: 10 });
  para(`Date: ${String(inspection.completedDate || inspection.scheduledDate || '').slice(0, 10) || '—'}   ·   Result: ${inspection.result || '—'}   ·   Record #${inspection.id}`, { size: 10 });
  gap(10);

  // ── Body ────────────────────────────────────────────────────────────────────
  para(block(settings, passed ? 'notice_passed_body' : 'notice_body'), { size: 9.5 });
  gap(10);

  // ── Violations table ────────────────────────────────────────────────────────
  if (!passed) {
    para(`VIOLATIONS (${open.length} open of ${violations.length} cited)`, { style: 'bold', size: 10 });
    gap(4);
    for (const v of violations) {
      const resolved = isResolvedViolationStatus(v.status);
      para(`${citationFor(v)}  ${v.description || ''}`, { style: 'bold', size: 9.5, color: resolved ? GRAY : BLACK });
      const bits = [];
      bits.push(`Status: ${v.status}${v.status_raw ? ` (recorded as "${v.status_raw}")` : ''}`);
      // Severity RETIRED 2026-07-14 — see fiNoticePdf.js. The on-device notice must be
      // byte-for-byte the same instrument as the server's; never let these two diverge.
      if (v.imminentHazard === true) bits.push('IMMINENT HAZARD');
      if (!resolved && v.followUpDate) bits.push(`Correct by / reinspection: ${String(v.followUpDate).slice(0, 10)}`);
      if (resolved && v.correctedDate) bits.push(`Corrected: ${String(v.correctedDate).slice(0, 10)}`);
      para(bits.join('   ·   '), { size: 8.5, color: v.imminentHazard === true && !resolved ? RED : GRAY });
      if (v.notes) para(v.notes, { style: 'italic', size: 8.5, color: GRAY });
      gap(4);
    }
    gap(6);
    para(block(settings, 'notice_legalese'), { size: 8.5, color: GRAY });
  }

  // ── ACKNOWLEDGMENT OF RECEIPT ───────────────────────────────────────────────
  // A signature acknowledges RECEIPT ONLY. It is not agreement with the findings, and
  // refusing it invalidates nothing and extends no deadline. So the served document must
  // state WHAT ACTUALLY HAPPENED — signed, refused, or nobody there. A blank line says
  // none of that, and "no signature" is exactly the ambiguity that gets attacked.
  gap(12);
  para('ACKNOWLEDGMENT OF RECEIPT', { style: 'bold', size: 9.5 });
  gap(3);
  para(block(settings, 'signature_agreement_text'), { size: 8, color: GRAY });
  gap(5);

  const occ = [...signatures].reverse().find((s) => s.role === 'occupant');
  const insp = [...signatures].reverse().find((s) => s.role === 'inspector' && s.status === 'signed');
  const who = occ?.signer_name
    ? `${occ.signer_name}${occ.signer_role_label ? ` (${occ.signer_role_label})` : ''}`
    : 'The person present';

  if (occ?.status === 'signed') {
    para(`Received by: ${who} on ${stamp(occ.signed_at)}.`, { size: 9 });
    para('Signature acknowledges receipt of this notice only. It is not an agreement with the findings and does not waive any right of appeal.',
      { style: 'italic', size: 8, color: GRAY });
  } else if (occ?.status === 'refused') {
    para('REFUSED.', { style: 'bold', size: 9 });
    para(
      `${who} was offered a copy of this notice and declined to sign an acknowledgment of receipt on ${stamp(occ.signed_at)}.`
      + (occ.advisements_read
        ? ' The person was advised that an acknowledgment of receipt is not an agreement with the findings, that refusal to sign does not affect the obligation to correct the violations within the times specified, and that the refusal is recorded in this report.'
        : '')
      + (occ.refusal_reason ? ` Reason given: ${occ.refusal_reason}.` : ''),
      { size: 9 });
    para('Refusal to sign does not invalidate this notice and does not extend any compliance deadline.',
      { style: 'bold', size: 8.5 });
  } else if (occ?.status === 'unable_no_party_present') {
    para('NOT OBTAINED — no responsible party present.', { style: 'bold', size: 9 });
    para(`No owner, agent, operator, occupant, or other responsible party was present at the premises on ${stamp(occ.signed_at)}. Service was effected as stated in the Certificate of Service below.`,
      { size: 9 });
  } else if (occ) {
    para('NOT OBTAINED.', { style: 'bold', size: 9 });
    para(
      `An acknowledgment signature was not obtained on ${stamp(occ.signed_at)}.`
      + (occ.refusal_reason ? ` Reason: ${occ.refusal_reason}.` : '')
      + ' Service was effected as stated in the Certificate of Service below.',
      { size: 9 });
  } else {
    para('Received by: ________________________________   Date: ______________', { size: 9 });
  }

  gap(8);
  para(`Inspector: ${insp?.signer_name || inspection.inspectorName || '________________________________'}`, { size: 9 });
  if (insp?.signed_at) {
    para(`Electronically signed ${stamp(insp.signed_at)}${insp.document_sha256 ? ` · document integrity SHA-256 ${String(insp.document_sha256).slice(0, 16)}…` : ''}`,
      { style: 'italic', size: 7.5, color: GRAY });
  }

  // ── CERTIFICATE OF SERVICE ──────────────────────────────────────────────────
  // THIS is what makes the notice stick — validity rests on SERVICE (IFC §109.3.1, NFPA 1
  // §1.16, IPMC §107.3), not on a signature. Generated from the service records themselves,
  // through the SAME shared label maps the server uses.
  if (service.length) {
    const live = service.filter((s) => !s.voided_at);
    if (live.length) {
      gap(11);
      para('CERTIFICATE OF SERVICE', { style: 'bold', size: 9.5 });
      gap(3);
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
        para(`${bits.join('; ')}.`, { size: 8.5 });
      }
      const cert = block(settings, 'certificate_of_service_text');
      if (cert) { gap(5); para(cert, { size: 8, color: GRAY }); }
    }
  }

  const footer = block(settings, 'notice_footer');
  if (footer) { gap(8); para(footer, { size: 8, color: GRAY, align: 'center' }); }

  // ── the bytes, and the hash OF THOSE BYTES (TRAP 1) ─────────────────────────
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  const sha256 = await sha256Hex(bytes);
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    bytes,
    sha256,
    fileName: `violation-notice-${inspection.id}-served.pdf`,
  };
}

/** SHA-256 of the exact bytes served. The server re-hashes and refuses a mismatch. */
export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** base64 of the served bytes, for the 'notice.upload' payload. Chunked — a 5 MB spread would blow the stack. */
export function bytesToBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * P1-2 (2026-07-16): the text blocks whose EMPTY state would print the SAMPLE
 * placeholder on THIS notice. Verbatim mirror of the server's
 * utils/fiNoticePdf.js#unconfiguredNoticeBlocks — if one side changes, the two
 * documents diverge. Rendering GATES on this — a legal instrument must never
 * say "[SAMPLE TEXT …]".
 */
export function unconfiguredNoticeBlocks(settings, violations) {
  const open = (violations || []).filter((v) => !isResolvedViolationStatus(v.status));
  const relevant = open.length === 0
    ? ['notice_passed_body', 'signature_agreement_text']
    : ['notice_body', 'notice_legalese', 'signature_agreement_text'];
  return relevant.filter((k) => !String(settings?.[k] ?? '').trim());
}

export { DEFAULTS, SAMPLE_FLAG };
