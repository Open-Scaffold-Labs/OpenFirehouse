'use strict';
/**
 * prePlanExport.js — NFPA 1620 Pre-Incident Plan PDF Export
 *
 * GET /api/pre-plans/:id/export.pdf
 *
 * Generates a professional multi-section PDF:
 *   Page 1 — Cover / Occupancy Summary
 *   Page 2 — Hazards + Access
 *   Page 3 — Water Supply + Suppression + Utilities
 *   Page 4 — Evacuation Routes + Review / Approval
 *
 * Uses PDFKit (server-side). No AI touches this document.
 */

const express = require('express');
const router  = express.Router();
const PDFDocument = require('pdfkit');
const { prePlans: db } = require('../db');

// ─── Colour palette ──────────────────────────────────────────────────────────
const C = {
  brand:      '#1e3a5f',   // deep fire-department navy
  accent:     '#c0392b',   // fire red
  accentLight:'#e74c3c',
  gold:       '#f39c12',
  white:      '#ffffff',
  lightGray:  '#f4f6f9',
  midGray:    '#7f8c8d',
  darkGray:   '#2c3e50',
  border:     '#d5dce3',
  riskHigh:   '#c0392b',
  riskMod:    '#e67e22',
  riskLow:    '#27ae60',
};

// ─── Risk colour helper ───────────────────────────────────────────────────────
function riskColor(level) {
  if (!level) return C.midGray;
  const l = level.toLowerCase();
  if (l === 'high')    return C.riskHigh;
  if (l === 'low')     return C.riskLow;
  return C.riskMod;
}

// ─── Safe JSON parse helper ───────────────────────────────────────────────────
function safeJson(val, fallback) {
  if (!val) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

// ─── Text helpers ─────────────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return String(d); }
}

function wrap(doc, text, opts = {}) {
  const safeText = (text == null || text === '') ? '—' : String(text);
  doc.text(safeText, opts);
}

// ─── Drawing primitives ───────────────────────────────────────────────────────
const MARGIN = 50;
const PAGE_W = 612;
const PAGE_H = 792;
const CONTENT_W = PAGE_W - MARGIN * 2;

function sectionHeader(doc, title, y) {
  doc.rect(MARGIN, y, CONTENT_W, 22).fill(C.brand);
  doc.fontSize(11).fillColor(C.white).font('Helvetica-Bold')
     .text(title.toUpperCase(), MARGIN + 8, y + 5, { width: CONTENT_W - 16 });
  return y + 26;
}

function fieldRow(doc, label, value, x, y, colW) {
  doc.fontSize(8).fillColor(C.midGray).font('Helvetica-Bold')
     .text(label.toUpperCase(), x, y, { width: colW });
  doc.fontSize(9.5).fillColor(C.darkGray).font('Helvetica')
     .text(value || '—', x, y + 10, { width: colW, lineGap: 1 });
}

function divider(doc, y) {
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(0.5).strokeColor(C.border).stroke();
  return y + 6;
}

function tag(doc, text, x, y, bgColor) {
  const padX = 6, padY = 3;
  const w = doc.widthOfString(text, { fontSize: 8 }) + padX * 2;
  doc.rect(x, y, w, 16).fill(bgColor || C.brand);
  doc.fontSize(8).fillColor(C.white).font('Helvetica-Bold').text(text, x + padX, y + padY, { width: w });
  return x + w + 6;
}

// ─── Page header (runs on every page after cover) ────────────────────────────
function pageHeader(doc, plan, pageNum) {
  doc.rect(0, 0, PAGE_W, 38).fill(C.brand);
  doc.fontSize(10).fillColor(C.white).font('Helvetica-Bold')
     .text('PRE-INCIDENT PLAN', MARGIN, 12, { continued: true })
     .font('Helvetica').text(`  |  ${plan.occupancyName || ''}`, { continued: true })
     .text(`  |  Page ${pageNum}`, { align: 'right', width: CONTENT_W });
  return 52;
}

// ─── Page footer ──────────────────────────────────────────────────────────────
function pageFooter(doc, plan) {
  const y = PAGE_H - 28;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(0.5).strokeColor(C.border).stroke();
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  doc.fontSize(7.5).fillColor(C.midGray).font('Helvetica')
     .text(`Generated ${generated}  |  ${plan.address || ''}  |  FOR OFFICIAL USE ONLY`,
           MARGIN, y + 6, { width: CONTENT_W });
}

// ─── NFPA 1620 completeness score ────────────────────────────────────────────
function nfpa1620Score(plan) {
  const checks = [
    !!plan.occupancyName,
    !!plan.address,
    !!plan.constructionType,
    (safeJson(plan.hazards, []).length > 0),
    (Object.keys(safeJson(plan.access, {})).some(k => safeJson(plan.access, {})[k])),
    (safeJson(plan.waterSupply, []).length > 0),
    (Object.keys(safeJson(plan.suppression, {})).some(k => safeJson(plan.suppression, {})[k])),
    !!plan.evacuationRoutes,
  ];
  return { filled: checks.filter(Boolean).length, total: checks.length };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Route handler
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:id/export.pdf', async (req, res) => {
  try {
    const id   = +req.params.id;
    const plan = await db.findById(id, req.user.department_id);
    if (!plan) return res.status(404).json({ error: 'Pre-plan not found' });

    // Parse JSON columns
    const contacts    = safeJson(plan.contacts,    []);
    const hazards     = safeJson(plan.hazards,     []);
    const access      = safeJson(plan.access,      {});
    const waterSupply = safeJson(plan.waterSupply, []);
    const suppression = safeJson(plan.suppression, {});
    const utilities   = safeJson(plan.utilities,   {});
    const score       = nfpa1620Score(plan);

    // Set response headers
    const safeName = (plan.occupancyName || 'preplan')
      .replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-preplan.pdf"`);

    const doc = new PDFDocument({ size: 'LETTER', margin: 0, bufferPages: true });
    doc.pipe(res);

    // ──────────────────────────────────────────────────────────────────────────
    // PAGE 1 — Cover / Occupancy Summary
    // ──────────────────────────────────────────────────────────────────────────
    // Full-bleed header band
    doc.rect(0, 0, PAGE_W, 110).fill(C.brand);

    // Hazard diamond (simple coloured rect as a visual anchor)
    const dX = PAGE_W - MARGIN - 52, dY = 18;
    doc.rect(dX, dY, 52, 52).fill(riskColor(plan.riskLevel)).opacity(0.9);
    doc.rect(dX, dY, 52, 52).lineWidth(1.5).strokeColor(C.white).stroke().opacity(1);
    doc.fontSize(8).fillColor(C.white).font('Helvetica-Bold')
       .text('RISK', dX, dY + 5, { width: 52, align: 'center' });
    doc.fontSize(11).fillColor(C.white).font('Helvetica-Bold')
       .text((plan.riskLevel || 'N/A').toUpperCase(), dX, dY + 18, { width: 52, align: 'center' });

    // Title block
    doc.fontSize(22).fillColor(C.white).font('Helvetica-Bold')
       .text(plan.occupancyName || 'Unnamed Occupancy', MARGIN, 20, { width: PAGE_W - MARGIN * 2 - 70 });
    doc.fontSize(11).fillColor('#aec6df').font('Helvetica')
       .text(plan.address || '', MARGIN, 52, { width: PAGE_W - MARGIN * 2 - 70 });
    doc.fontSize(9).fillColor('#7fa8cc').font('Helvetica')
       .text(`${plan.occupancyType || ''}  |  Updated ${formatDate(plan.lastUpdated)}`, MARGIN, 70);

    // NFPA 1620 completeness badge
    const pct = Math.round((score.filled / score.total) * 100);
    const badgeColor = pct >= 75 ? '#27ae60' : pct >= 50 ? '#e67e22' : '#c0392b';
    doc.rect(MARGIN, 86, 160, 16).fill(badgeColor).opacity(0.85);
    doc.opacity(1).fontSize(8).fillColor(C.white).font('Helvetica-Bold')
       .text(`NFPA 1620 COMPLETENESS: ${pct}%  (${score.filled}/${score.total} sections)`,
             MARGIN + 6, 90, { width: 148 });

    let y = 128;

    // Key facts grid
    y = sectionHeader(doc, 'Occupancy Profile', y);
    y += 8;

    const col1 = MARGIN, col2 = MARGIN + CONTENT_W / 2;
    const colW = CONTENT_W / 2 - 12;

    fieldRow(doc, 'Occupancy Type',    plan.occupancyType    || '—', col1, y, colW);
    fieldRow(doc, 'Construction Type', plan.constructionType || '—', col2, y, colW);
    y += 34;

    fieldRow(doc, 'Stories',    plan.stories    ? String(plan.stories)    : '—', col1, y, colW);
    fieldRow(doc, 'Year Built', plan.yearBuilt  ? String(plan.yearBuilt)  : '—', col2, y, colW);
    y += 34;

    fieldRow(doc, 'Sq. Footage',       plan.sqFootage ? `${plan.sqFootage.toLocaleString()} sq ft` : '—', col1, y, colW);
    fieldRow(doc, 'Last Inspection',   formatDate(plan.lastInspection), col2, y, colW);
    y += 34;

    fieldRow(doc, 'Last Updated By',   plan.lastUpdatedBy || '—', col1, y, colW);
    fieldRow(doc, 'Last Updated',      formatDate(plan.lastUpdated),    col2, y, colW);
    y += 34;

    y = divider(doc, y);

    // Notes
    if (plan.notes) {
      y = sectionHeader(doc, 'General Notes', y);
      y += 8;
      doc.fontSize(9.5).fillColor(C.darkGray).font('Helvetica')
         .text(plan.notes, MARGIN, y, { width: CONTENT_W, lineGap: 2 });
      y += doc.heightOfString(plan.notes, { width: CONTENT_W, lineGap: 2 }) + 12;
    }

    // Contacts
    if (contacts.length > 0) {
      y = sectionHeader(doc, 'Key Contacts', y);
      y += 6;
      contacts.forEach((c, i) => {
        if (y > PAGE_H - 80) { doc.addPage(); y = pageHeader(doc, plan, 2); }
        doc.rect(MARGIN, y, CONTENT_W, 26).fill(i % 2 === 0 ? C.lightGray : C.white);
        doc.fontSize(9.5).fillColor(C.darkGray).font('Helvetica-Bold')
           .text(c.name || '—', MARGIN + 8, y + 4, { width: CONTENT_W / 3 - 8, continued: false });
        doc.fontSize(8.5).fillColor(C.midGray).font('Helvetica')
           .text(c.role  || '',   MARGIN + CONTENT_W / 3,     y + 4, { width: CONTENT_W / 3, continued: false });
        doc.text(c.phone || c.email || '', MARGIN + CONTENT_W * 2/3, y + 4, { width: CONTENT_W / 3 });
        y += 28;
      });
    }

    pageFooter(doc, plan);

    // ──────────────────────────────────────────────────────────────────────────
    // PAGE 2 — Hazards + Access
    // ──────────────────────────────────────────────────────────────────────────
    doc.addPage();
    y = pageHeader(doc, plan, 2);

    // Hazards
    y = sectionHeader(doc, 'Hazards & Special Considerations', y);
    y += 8;

    if (hazards.length === 0) {
      doc.fontSize(9.5).fillColor(C.midGray).font('Helvetica').text('No hazards recorded.', MARGIN, y);
      y += 20;
    } else {
      hazards.forEach((h, i) => {
        if (y > PAGE_H - 80) { doc.addPage(); y = pageHeader(doc, plan, 2); }
        const bg = i % 2 === 0 ? C.lightGray : C.white;
        // Estimate row height
        const descH = h.description
          ? doc.heightOfString(h.description, { width: CONTENT_W - 130, lineGap: 1 }) : 0;
        const rowH = Math.max(30, descH + 18);
        doc.rect(MARGIN, y, CONTENT_W, rowH).fill(bg);
        // Severity badge
        const sevColor = h.severity === 'High' ? C.riskHigh : h.severity === 'Medium' ? C.riskMod : C.midGray;
        doc.rect(MARGIN, y, 4, rowH).fill(sevColor);
        // Content
        doc.fontSize(9.5).fillColor(C.darkGray).font('Helvetica-Bold')
           .text(h.type || '—', MARGIN + 10, y + 6, { width: 100 });
        if (h.severity) {
          doc.fontSize(7.5).fillColor(C.white).font('Helvetica-Bold');
          tag(doc, h.severity.toUpperCase(), MARGIN + 10, y + rowH - 16, sevColor);
        }
        if (h.description) {
          doc.fontSize(8.5).fillColor(C.midGray).font('Helvetica')
             .text(h.description, MARGIN + 120, y + 6, { width: CONTENT_W - 130, lineGap: 1 });
        }
        if (h.location) {
          doc.fontSize(7.5).fillColor(C.midGray).font('Helvetica')
             .text(`📍 ${h.location}`, MARGIN + 120, y + rowH - 14, { width: CONTENT_W - 130 });
        }
        y += rowH + 4;
      });
    }

    y += 4;
    y = divider(doc, y);

    // Access
    y = sectionHeader(doc, 'Access Information', y);
    y += 8;

    const accessFields = [
      ['Primary Entrance',   access.primaryEntrance],
      ['Secondary Entrance', access.secondaryEntrance],
      ['Gate / Lock Code',   access.gateCode],
      ['Staging Area',       access.stagingArea],
      ['Aerial Access',      access.aerialAccess],
      ['Roof Access',        access.roofAccess],
      ['Key Box Location',   access.keyBox],
    ].filter(([, v]) => v);

    if (accessFields.length === 0) {
      doc.fontSize(9.5).fillColor(C.midGray).font('Helvetica').text('No access information recorded.', MARGIN, y);
      y += 20;
    } else {
      accessFields.forEach(([label, value], i) => {
        if (y > PAGE_H - 80) { doc.addPage(); y = pageHeader(doc, plan, 2); }
        doc.rect(MARGIN, y, CONTENT_W, 26).fill(i % 2 === 0 ? C.lightGray : C.white);
        doc.fontSize(8).fillColor(C.midGray).font('Helvetica-Bold')
           .text(label, MARGIN + 8, y + 4, { width: 150 });
        doc.fontSize(9.5).fillColor(C.darkGray).font('Helvetica')
           .text(value, MARGIN + 162, y + 4, { width: CONTENT_W - 170 });
        y += 28;
      });
    }

    pageFooter(doc, plan);

    // ──────────────────────────────────────────────────────────────────────────
    // PAGE 3 — Water Supply + Suppression + Utilities
    // ──────────────────────────────────────────────────────────────────────────
    doc.addPage();
    y = pageHeader(doc, plan, 3);

    // Water Supply
    y = sectionHeader(doc, 'Water Supply', y);
    y += 8;

    if (waterSupply.length === 0) {
      doc.fontSize(9.5).fillColor(C.midGray).font('Helvetica').text('No water supply recorded.', MARGIN, y);
      y += 20;
    } else {
      // Table header
      doc.rect(MARGIN, y, CONTENT_W, 18).fill('#d9e4f0');
      ['Type', 'Location', 'Flow (GPM)', 'Size', 'Notes'].forEach((h, i) => {
        const colW2 = [80, 150, 80, 80, CONTENT_W - 394];
        const colX = [MARGIN + 8, MARGIN + 92, MARGIN + 246, MARGIN + 330, MARGIN + 414];
        doc.fontSize(7.5).fillColor(C.brand).font('Helvetica-Bold')
           .text(h.toUpperCase(), colX[i], y + 4, { width: colW2[i] });
      });
      y += 20;
      waterSupply.forEach((ws, i) => {
        if (y > PAGE_H - 80) { doc.addPage(); y = pageHeader(doc, plan, 3); }
        doc.rect(MARGIN, y, CONTENT_W, 24).fill(i % 2 === 0 ? C.lightGray : C.white);
        const vals = [ws.type, ws.location, ws.flowRate ? `${ws.flowRate} GPM` : '—', ws.size || '—', ws.notes || ''];
        const colW2 = [80, 150, 80, 80, CONTENT_W - 394];
        const colX = [MARGIN + 8, MARGIN + 92, MARGIN + 246, MARGIN + 330, MARGIN + 414];
        vals.forEach((v, j) => {
          doc.fontSize(8.5).fillColor(C.darkGray).font('Helvetica')
             .text(v || '—', colX[j], y + 6, { width: colW2[j] });
        });
        y += 26;
      });
    }

    y += 6;
    y = divider(doc, y);

    // Suppression
    y = sectionHeader(doc, 'Suppression Systems', y);
    y += 8;

    const suppFields = [
      ['Sprinkler System',    suppression.sprinkler],
      ['Sprinkler Type',      suppression.sprinklerType],
      ['FDC Location',        suppression.fdcLocation],
      ['Standpipe System',    suppression.standpipe ? 'Yes' : null],
      ['Standpipe Location',  suppression.standpipeLocation],
      ['Alarm Panel',         suppression.alarmPanel],
      ['Suppression Notes',   suppression.notes],
    ].filter(([, v]) => v);

    if (suppFields.length === 0) {
      doc.fontSize(9.5).fillColor(C.midGray).font('Helvetica').text('No suppression systems recorded.', MARGIN, y);
      y += 20;
    } else {
      suppFields.forEach(([label, value], i) => {
        if (y > PAGE_H - 80) { doc.addPage(); y = pageHeader(doc, plan, 3); }
        doc.rect(MARGIN, y, CONTENT_W, 24).fill(i % 2 === 0 ? C.lightGray : C.white);
        doc.fontSize(8).fillColor(C.midGray).font('Helvetica-Bold')
           .text(label, MARGIN + 8, y + 5, { width: 160 });
        doc.fontSize(9.5).fillColor(C.darkGray).font('Helvetica')
           .text(String(value), MARGIN + 172, y + 5, { width: CONTENT_W - 180 });
        y += 26;
      });
    }

    y += 6;
    y = divider(doc, y);

    // Utilities
    y = sectionHeader(doc, 'Utilities', y);
    y += 8;

    const utilFields = [
      ['Gas Shut-off',        utilities.gasShutoff],
      ['Electric Shut-off',   utilities.electricShutoff],
      ['Water Shut-off',      utilities.waterShutoff],
      ['HVAC Location',       utilities.hvac],
      ['Utility Notes',       utilities.notes],
    ].filter(([, v]) => v);

    if (utilFields.length === 0) {
      doc.fontSize(9.5).fillColor(C.midGray).font('Helvetica').text('No utility information recorded.', MARGIN, y);
      y += 20;
    } else {
      utilFields.forEach(([label, value], i) => {
        if (y > PAGE_H - 80) { doc.addPage(); y = pageHeader(doc, plan, 3); }
        doc.rect(MARGIN, y, CONTENT_W, 24).fill(i % 2 === 0 ? C.lightGray : C.white);
        doc.fontSize(8).fillColor(C.midGray).font('Helvetica-Bold')
           .text(label, MARGIN + 8, y + 5, { width: 160 });
        doc.fontSize(9.5).fillColor(C.darkGray).font('Helvetica')
           .text(String(value), MARGIN + 172, y + 5, { width: CONTENT_W - 180 });
        y += 26;
      });
    }

    pageFooter(doc, plan);

    // ──────────────────────────────────────────────────────────────────────────
    // PAGE 4 — Evacuation + Review / Approval
    // ──────────────────────────────────────────────────────────────────────────
    doc.addPage();
    y = pageHeader(doc, plan, 4);

    // Evacuation Routes
    y = sectionHeader(doc, 'Evacuation Routes & Procedures', y);
    y += 8;

    if (plan.evacuationRoutes) {
      doc.rect(MARGIN, y, CONTENT_W, doc.heightOfString(plan.evacuationRoutes, { width: CONTENT_W - 16, lineGap: 2 }) + 16)
         .fill(C.lightGray);
      doc.fontSize(9.5).fillColor(C.darkGray).font('Helvetica')
         .text(plan.evacuationRoutes, MARGIN + 8, y + 8, { width: CONTENT_W - 16, lineGap: 2 });
      y += doc.heightOfString(plan.evacuationRoutes, { width: CONTENT_W - 16, lineGap: 2 }) + 24;
    } else {
      doc.fontSize(9.5).fillColor(C.midGray).font('Helvetica').text('No evacuation routes recorded.', MARGIN, y);
      y += 20;
    }

    y = divider(doc, y);

    // Review & Approval
    y = sectionHeader(doc, 'Review & Approval', y);
    y += 8;

    fieldRow(doc, 'Reviewed By',   plan.reviewedBy  || '—', col1, y, colW);
    fieldRow(doc, 'Review Date',   formatDate(plan.reviewedAt),  col2, y, colW);
    y += 36;

    if (plan.reviewNotes) {
      doc.fontSize(8).fillColor(C.midGray).font('Helvetica-Bold').text('REVIEW NOTES', MARGIN, y);
      y += 12;
      doc.rect(MARGIN, y, CONTENT_W, doc.heightOfString(plan.reviewNotes, { width: CONTENT_W - 16, lineGap: 2 }) + 16)
         .fill(C.lightGray);
      doc.fontSize(9.5).fillColor(C.darkGray).font('Helvetica')
         .text(plan.reviewNotes, MARGIN + 8, y + 8, { width: CONTENT_W - 16, lineGap: 2 });
      y += doc.heightOfString(plan.reviewNotes, { width: CONTENT_W - 16, lineGap: 2 }) + 24;
    }

    y = divider(doc, y);

    // NFPA 1620 Completeness Summary
    y = sectionHeader(doc, 'NFPA 1620 Plan Completeness', y);
    y += 10;

    const components = [
      ['Occupancy identification',          !!plan.occupancyName],
      ['Location / address',                !!plan.address],
      ['Construction & building profile',   !!plan.constructionType],
      ['Hazards & special considerations',  hazards.length > 0],
      ['Access information',                Object.keys(access).some(k => access[k])],
      ['Water supply',                      waterSupply.length > 0],
      ['Suppression / detection systems',   Object.keys(suppression).some(k => suppression[k])],
      ['Evacuation routes',                 !!plan.evacuationRoutes],
    ];

    components.forEach(([label, complete], i) => {
      if (y > PAGE_H - 80) { doc.addPage(); y = pageHeader(doc, plan, 4); }
      doc.rect(MARGIN, y, CONTENT_W, 22).fill(i % 2 === 0 ? C.lightGray : C.white);
      // Status dot
      doc.circle(MARGIN + 14, y + 11, 6).fill(complete ? '#27ae60' : '#e0e0e0');
      doc.fontSize(8.5).fillColor(complete ? '#27ae60' : C.midGray).font('Helvetica-Bold')
         .text(complete ? '✓' : '○', MARGIN + 10, y + 6, { width: 12, align: 'center' });
      doc.fontSize(9.5).fillColor(complete ? C.darkGray : C.midGray).font(complete ? 'Helvetica-Bold' : 'Helvetica')
         .text(label, MARGIN + 28, y + 5, { width: CONTENT_W - 36 });
      y += 24;
    });

    y += 12;

    // Summary badge
    const sumColor = pct >= 75 ? '#27ae60' : pct >= 50 ? '#e67e22' : '#c0392b';
    doc.rect(MARGIN, y, CONTENT_W, 36).fill(sumColor);
    doc.fontSize(13).fillColor(C.white).font('Helvetica-Bold')
       .text(`${pct}% Complete — ${score.filled} of ${score.total} NFPA 1620 sections populated`,
             MARGIN, y + 10, { width: CONTENT_W, align: 'center' });

    pageFooter(doc, plan);

    doc.end();
  } catch (e) {
    console.error('[prePlanExport] Error:', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

module.exports = router;
