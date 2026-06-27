/**
 * examCertificate.js — Generate a printable PDF certification document
 * for a passed exam, using jsPDF (already installed).
 *
 * Usage:
 *   import { generateCertificate } from '../utils/examCertificate';
 *   generateCertificate({ memberName, examTitle, score, date, departmentName });
 */

import { jsPDF } from 'jspdf';

export function generateCertificate({
  memberName = 'Firefighter',
  examTitle   = 'Certification Exam',
  score       = 100,
  date        = new Date().toLocaleDateString(),
  departmentName = 'Maplewood Volunteer Fire Department',
  proctorName = 'OpenFirehouse Exam System',
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();   // 792
  const H = doc.internal.pageSize.getHeight();  // 612

  // ── decorative border ──────────────────────────────────────────────────
  const m = 28;
  doc.setDrawColor(185, 28, 28); // red-700
  doc.setLineWidth(3);
  doc.rect(m, m, W - 2 * m, H - 2 * m);
  doc.setLineWidth(1);
  doc.rect(m + 6, m + 6, W - 2 * (m + 6), H - 2 * (m + 6));

  // ── inner decorative corners ───────────────────────────────────────────
  const c = 20;
  const inner = m + 12;
  doc.setLineWidth(1.5);
  // top-left
  doc.line(inner, inner + c, inner, inner);
  doc.line(inner, inner, inner + c, inner);
  // top-right
  doc.line(W - inner - c, inner, W - inner, inner);
  doc.line(W - inner, inner, W - inner, inner + c);
  // bottom-left
  doc.line(inner, H - inner - c, inner, H - inner);
  doc.line(inner, H - inner, inner + c, H - inner);
  // bottom-right
  doc.line(W - inner - c, H - inner, W - inner, H - inner);
  doc.line(W - inner, H - inner - c, W - inner, H - inner);

  // ── shield / seal icon (simple drawn seal) ─────────────────────────────
  const cx = W / 2;
  const sealY = 95;
  const sealR = 30;
  doc.setFillColor(185, 28, 28);
  doc.circle(cx, sealY, sealR, 'F');
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, sealY, sealR - 4, 'F');
  doc.setFillColor(185, 28, 28);
  doc.circle(cx, sealY, sealR - 8, 'F');
  // FD text in seal
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('FD', cx, sealY + 6, { align: 'center' });

  // ── department name ────────────────────────────────────────────────────
  doc.setTextColor(185, 28, 28);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(departmentName.toUpperCase(), cx, sealY + sealR + 28, { align: 'center' });

  // ── "Certificate of Achievement" ──────────────────────────────────────
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(32);
  doc.setFont('times', 'bolditalic');
  doc.text('Certificate of Achievement', cx, 195, { align: 'center' });

  // ── divider line ──────────────────────────────────────────────────────
  doc.setDrawColor(185, 28, 28);
  doc.setLineWidth(1.5);
  doc.line(cx - 180, 210, cx + 180, 210);

  // ── "This certifies that" ─────────────────────────────────────────────
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text('This is to certify that', cx, 245, { align: 'center' });

  // ── member name (large) ───────────────────────────────────────────────
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(28);
  doc.setFont('times', 'bolditalic');
  doc.text(memberName, cx, 290, { align: 'center' });

  // ── underline under name ──────────────────────────────────────────────
  const nameWidth = doc.getTextWidth(memberName);
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.5);
  doc.line(cx - nameWidth / 2 - 10, 298, cx + nameWidth / 2 + 10, 298);

  // ── "has successfully completed" ──────────────────────────────────────
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text('has successfully completed the certification examination', cx, 330, { align: 'center' });

  // ── exam title ────────────────────────────────────────────────────────
  doc.setTextColor(185, 28, 28);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(examTitle, cx, 370, { align: 'center' });

  // ── score line ────────────────────────────────────────────────────────
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text(`with a score of ${score}%`, cx, 405, { align: 'center' });

  // ── date ──────────────────────────────────────────────────────────────
  doc.text(`Date: ${date}`, cx, 435, { align: 'center' });

  // ── signature lines ───────────────────────────────────────────────────
  const sigY = 505;
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.5);

  // Left signature: Proctor
  const leftX = cx - 180;
  doc.line(leftX - 80, sigY, leftX + 80, sigY);
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(proctorName, leftX, sigY + 16, { align: 'center' });
  doc.text('Proctor / System', leftX, sigY + 28, { align: 'center' });

  // Right signature: Department
  const rightX = cx + 180;
  doc.line(rightX - 80, sigY, rightX + 80, sigY);
  doc.text('Fire Chief', rightX, sigY + 16, { align: 'center' });
  doc.text(departmentName, rightX, sigY + 28, { align: 'center' });

  // ── footer ────────────────────────────────────────────────────────────
  doc.setTextColor(160, 160, 160);
  doc.setFontSize(8);
  doc.text(
    `Generated by OpenFirehouse — ${new Date().toISOString().split('T')[0]}`,
    cx,
    H - 42,
    { align: 'center' }
  );

  // ── save ──────────────────────────────────────────────────────────────
  const safeName = examTitle.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);
  doc.save(`Certificate_${safeName}_${memberName.replace(/\s+/g, '_')}.pdf`);
}
