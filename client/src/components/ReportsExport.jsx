// impeccable-disable overused-font: generated export/print HTML targets email clients + paper, web-safe fonts deliberate
import { useState, useMemo, useEffect } from 'react';
import {
  FileText, FileSpreadsheet, Download, Users, Truck,
  CalendarDays, Flame, GraduationCap, Handshake,
  CheckCircle2, Filter, Clock, Printer, Contact, CalendarRange, Loader2,
  Scale, Shield, AlertTriangle, Award, ClipboardList, DollarSign, UserCheck, Baby,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../utils/api';

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${m}/${d}/${y}`;
}

function downloadCSV(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function makePDF(title, subtitle, headers, rows, filename, accentHex = '#B91C1C') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(accentHex);
  doc.rect(0, 0, pageW, 48, 'F');
  doc.setTextColor('#ffffff');
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('OpenFirehouse', 28, 20);
  doc.setFontSize(13);
  doc.text(title, 28, 36);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, pageW - 28, 30, { align: 'right' });

  autoTable(doc, {
    startY: 56,
    head: [headers],
    body: rows,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: accentHex, textColor: '#fff', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: '#F9FAFB' },
    margin: { left: 28, right: 28 },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor('#9CA3AF');
    doc.text(
      `Generated ${new Date().toLocaleDateString()} · Page ${i} of ${pageCount}`,
      pageW / 2, doc.internal.pageSize.getHeight() - 12,
      { align: 'center' }
    );
  }
  doc.save(filename);
}

function inRange(dateStr, from, to) {
  if (!from && !to) return true;
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to   && dateStr > to)   return false;
  return true;
}

// ─── bulletin board print helpers ────────────────────────────────────────────

function openPrintWindow(html) {
  const win = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups to use print preview.'); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 600);
}

const RANK_ORDER = [
  'Chief', 'Deputy Chief', 'Assistant Chief', 'Battalion Chief',
  'Captain', 'Lieutenant', 'Engineer', 'Firefighter II', 'Firefighter I',
  'Probationary Firefighter', 'Explorer',
];

function rankSort(a, b) {
  const ai = RANK_ORDER.indexOf(a.rank);
  const bi = RANK_ORDER.indexOf(b.rank);
  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
}

function printContactDirectory(members, stationName, deptName) {
  const sorted = [...members].sort(rankSort);
  const rows = sorted.map((m) => `
    <tr>
      <td>${m.name}</td>
      <td>${m.rank}</td>
      <td>${m.role}</td>
      <td>${m.memberNumber || '—'}</td>
      <td>${m.phone ? `<a href="tel:${m.phone}">${m.phone}</a>` : '—'}</td>
      <td>${m.email ? `<a href="mailto:${m.email}">${m.email}</a>` : '—'}</td>
      <td>${m.status}</td>
    </tr>`).join('');

  openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Contact Directory — ${deptName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Arial', sans-serif; font-size: 11px; color: #111; padding: 0.5in; }
    header { background: #B91C1C; color: white; padding: 14px 18px; border-radius: 6px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    header h1 { font-size: 18px; font-weight: bold; }
    header p  { font-size: 10px; opacity: 0.85; margin-top: 2px; }
    .subtitle { font-size: 10px; color: #6B7280; text-align: right; }
    .confidential { display: inline-block; background: #FEF3C7; color: #92400E; font-size: 9px; font-weight: bold; padding: 2px 8px; border-radius: 4px; border: 1px solid #FCD34D; margin-bottom: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { background: #B91C1C; color: white; text-align: left; padding: 7px 10px; font-size: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    td { padding: 6px 10px; border-bottom: 1px solid #E5E7EB; vertical-align: top; }
    tr:nth-child(even) td { background: #F9FAFB; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    a { color: #1D4ED8; text-decoration: none; }
    footer { margin-top: 20px; font-size: 9px; color: #9CA3AF; text-align: center; border-top: 1px solid #E5E7EB; padding-top: 8px; }
    @media print { body { padding: 0.4in; } }
  </style></head><body>
  <header>
    <div>
      <h1>${deptName}</h1>
      <p>${stationName} · Member Contact Directory</p>
    </div>
    <div class="subtitle" style="color:rgba(255,255,255,0.85)">Generated ${new Date().toLocaleDateString()}<br>${sorted.length} members</div>
  </header>
  <div class="confidential">⚠ CONFIDENTIAL — Internal Use Only · Officers &amp; Administrators</div>
  <table>
    <thead><tr><th>Name</th><th>Rank</th><th>Role</th><th>Badge #</th><th>Phone</th><th>Email</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <footer>${deptName} · ${stationName} · Printed ${new Date().toLocaleString()} · This document contains personal information — handle with care.</footer>
  </body></html>`);
}

function printMonthlySchedule(shifts, stationName, deptName, year, month) {
  const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const todayStr = new Date().toISOString().slice(0, 10);

  const SHIFT_COLORS = {
    'Day':     { bg: '#FEF9C3', border: '#FDE047', text: '#713F12' },
    'Night':   { bg: '#EDE9FE', border: '#A78BFA', text: '#4C1D95' },
    'Standby': { bg: '#DCFCE7', border: '#86EFAC', text: '#14532D' },
    'default': { bg: '#F3F4F6', border: '#D1D5DB', text: '#374151' },
  };

  // Build day→shifts map
  const dayShifts = {};
  shifts.filter((s) => {
    const d = new Date(s.date + 'T00:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  }).forEach((s) => {
    const d = new Date(s.date + 'T00:00:00').getDate();
    if (!dayShifts[d]) dayShifts[d] = [];
    dayShifts[d].push(s);
  });

  // Build calendar cells
  let cells = '';
  let dayCount = 0;
  // Leading empty cells
  for (let i = 0; i < firstDow; i++) {
    cells += '<td class="empty"></td>';
    dayCount++;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const dayS = dayShifts[d] || [];
    const shiftCells = dayS.map((s) => {
      const c = SHIFT_COLORS[s.type] || SHIFT_COLORS.default;
      const crew = (s.crew || []).slice(0, 3).map((n) => n.split(' ').pop()).join(', ');
      const more = (s.crew || []).length > 3 ? ` +${(s.crew || []).length - 3}` : '';
      return `<div class="shift-pill" style="background:${c.bg};border:1px solid ${c.border};color:${c.text};-webkit-print-color-adjust:exact;print-color-adjust:exact;">
        <strong>${s.type}</strong>${crew ? `<br><span style="font-size:8px">${crew}${more}</span>` : ''}
      </div>`;
    }).join('');
    cells += `<td class="${isToday ? 'today' : ''}">
      <div class="day-num${isToday ? ' today-num' : ''}">${d}</div>
      ${shiftCells}
    </td>`;
    dayCount++;
    if (dayCount % 7 === 0 && d < daysInMonth) cells += '</tr><tr>';
  }
  // Trailing empty cells
  const trailing = 7 - (dayCount % 7);
  if (trailing < 7) for (let i = 0; i < trailing; i++) cells += '<td class="empty"></td>';

  openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Duty Schedule — ${monthName} ${year}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 0.4in; }
    header { background: #1E3A5F; color: white; padding: 12px 18px; border-radius: 6px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    header h1 { font-size: 18px; font-weight: bold; }
    header p  { font-size: 10px; opacity: 0.8; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: #1E3A5F; color: white; text-align: center; padding: 8px 4px; font-size: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    td { border: 1px solid #E5E7EB; vertical-align: top; padding: 4px; height: 80px; width: 14.28%; }
    td.empty { background: #F9FAFB; }
    td.today { background: #FFF7ED; border: 2px solid #F97316; }
    .day-num { font-size: 11px; font-weight: bold; color: #374151; margin-bottom: 3px; }
    .today-num { color: #EA580C; }
    .shift-pill { border-radius: 4px; padding: 3px 5px; margin-bottom: 2px; font-size: 9px; line-height: 1.3; }
    footer { margin-top: 14px; font-size: 9px; color: #9CA3AF; text-align: center; border-top: 1px solid #E5E7EB; padding-top: 8px; }
    @page { size: landscape; margin: 0.4in; }
  </style></head><body>
  <header>
    <div>
      <h1>${deptName} — Duty Schedule</h1>
      <p>${stationName} · ${monthName} ${year}</p>
    </div>
    <div style="color:rgba(255,255,255,0.8);text-align:right;font-size:10px;">Generated ${new Date().toLocaleDateString()}</div>
  </header>
  <table>
    <thead><tr><th>Sunday</th><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th><th>Saturday</th></tr></thead>
    <tbody><tr>${cells}</tr></tbody>
  </table>
  <footer>${deptName} · ${stationName} · ${monthName} ${year} · Printed ${new Date().toLocaleString()}</footer>
  </body></html>`);
}

function printEventsCalendar(events, stationName, deptName) {
  const now = new Date();
  const sixWeeks = new Date(now); sixWeeks.setDate(now.getDate() + 42);
  const todayStr = now.toISOString().slice(0, 10);
  const endStr   = sixWeeks.toISOString().slice(0, 10);

  const upcoming = events
    .filter((e) => e.date >= todayStr && e.date <= endStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const TYPE_COLORS = {
    'Drill':           '#EA580C',
    'Meeting':         '#64748B',
    'Training':        '#4F46E5',
    'Fundraiser':      '#DB2777',
    'Community Event': '#16A34A',
    'Special Detail':  '#D97706',
    'Inspection':      '#DC2626',
    'Other':           '#6B7280',
  };

  const rows = upcoming.map((e) => {
    const c = TYPE_COLORS[e.type] || '#6B7280';
    const d = new Date(e.date + 'T00:00:00');
    const dayLabel = d.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
    return `<tr>
      <td style="white-space:nowrap;font-weight:600;">${dayLabel}</td>
      <td>${e.startTime || '—'}</td>
      <td><span style="background:${c};color:white;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${e.type}</span></td>
      <td style="font-weight:600;">${e.title}</td>
      <td>${e.location || '—'}</td>
      <td>${e.description ? e.description.slice(0, 60) + (e.description.length > 60 ? '…' : '') : '—'}</td>
    </tr>`;
  }).join('');

  const empty = upcoming.length === 0
    ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:#9CA3AF;">No events scheduled in the next 6 weeks.</td></tr>`
    : '';

  // Legend
  const legend = Object.entries(TYPE_COLORS).map(([type, color]) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};-webkit-print-color-adjust:exact;print-color-adjust:exact;"></span>
      <span style="font-size:9px;color:#374151;">${type}</span>
    </span>`
  ).join('');

  openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Community Calendar — ${deptName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 0.5in; }
    header { background: #16A34A; color: white; padding: 12px 18px; border-radius: 6px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    header h1 { font-size: 18px; font-weight: bold; }
    header p  { font-size: 10px; opacity: 0.8; margin-top: 2px; }
    .legend { display: flex; flex-wrap: wrap; margin-bottom: 12px; padding: 8px 12px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #15803D; color: white; text-align: left; padding: 7px 10px; font-size: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    td { padding: 7px 10px; border-bottom: 1px solid #E5E7EB; vertical-align: top; }
    tr:nth-child(even) td { background: #F9FAFB; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    footer { margin-top: 20px; font-size: 9px; color: #9CA3AF; text-align: center; border-top: 1px solid #E5E7EB; padding-top: 8px; }
  </style></head><body>
  <header>
    <div>
      <h1>${deptName} — Upcoming Events</h1>
      <p>${stationName} · Next 6 Weeks · ${new Date().toLocaleDateString()} – ${sixWeeks.toLocaleDateString()}</p>
    </div>
    <div style="color:rgba(255,255,255,0.85);text-align:right;font-size:10px;">${upcoming.length} events<br>Generated ${new Date().toLocaleDateString()}</div>
  </header>
  <div class="legend">${legend}</div>
  <table>
    <thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Event</th><th>Location</th><th>Details</th></tr></thead>
    <tbody>${rows}${empty}</tbody>
  </table>
  <footer>${deptName} · ${stationName} · Post on community bulletin board · Printed ${new Date().toLocaleString()}</footer>
  </body></html>`);
}

function printApparatusStatus(apparatus, stationName, deptName) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const STATUS_COLORS = {
    'In Service':       { bg: '#DCFCE7', text: '#166534', border: '#86EFAC' },
    'Out of Service':   { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
    'Reserve':          { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
    'Under Repair':     { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
    'Training Only':    { bg: '#EDE9FE', text: '#5B21B6', border: '#C4B5FD' },
  };

  const rows = apparatus.map((a) => {
    const sc = STATUS_COLORS[a.status] || { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' };
    const overdue = a.nextServiceDue && a.nextServiceDue < todayStr;
    return `<tr>
      <td style="font-weight:700;">${a.designation}</td>
      <td>${a.year} ${a.make} ${a.model}</td>
      <td>${a.type}</td>
      <td><span style="background:${sc.bg};color:${sc.text};border:1px solid ${sc.border};padding:2px 8px;border-radius:10px;font-size:9px;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${a.status}</span></td>
      <td>${a.mileage != null ? a.mileage.toLocaleString() : '—'}</td>
      <td>${fmt(a.lastService)}</td>
      <td style="${overdue ? 'color:#DC2626;font-weight:700;' : ''}">${fmt(a.nextServiceDue)}${overdue ? ' ⚠' : ''}</td>
      <td>${a.assignedOperator || '—'}</td>
    </tr>`;
  }).join('');

  openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Apparatus Status — ${deptName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 0.4in; }
    header { background: #1E3A5F; color: white; padding: 12px 18px; border-radius: 6px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    header h1 { font-size: 18px; font-weight: bold; }
    header p  { font-size: 10px; opacity: 0.8; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1E3A5F; color: white; text-align: left; padding: 7px 10px; font-size: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    td { padding: 7px 10px; border-bottom: 1px solid #E5E7EB; vertical-align: middle; }
    tr:nth-child(even) td { background: #F9FAFB; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    footer { margin-top: 16px; font-size: 9px; color: #9CA3AF; text-align: center; border-top: 1px solid #E5E7EB; padding-top: 8px; }
    @page { size: landscape; margin: 0.4in; }
  </style></head><body>
  <header>
    <div>
      <h1>${deptName} — Apparatus Status Board</h1>
      <p>${stationName} · Fleet Overview · ${new Date().toLocaleDateString()}</p>
    </div>
    <div style="color:rgba(255,255,255,0.85);text-align:right;font-size:10px;">${apparatus.length} units<br>Generated ${new Date().toLocaleDateString()}</div>
  </header>
  <table>
    <thead><tr><th>Unit</th><th>Description</th><th>Type</th><th>Status</th><th>Miles/Hours</th><th>Last Service</th><th>Next Due</th><th>Operator</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <footer>${deptName} · ${stationName} · Post at station entrance · Printed ${new Date().toLocaleString()} · ⚠ = Service Overdue</footer>
  </body></html>`);
}

// ─── report hooks ─────────────────────────────────────────────────────────────

function useMemberReport(from, to, members = []) {
  return useMemo(() => {
    const rows = members.filter((m) =>
      !from && !to ? true : inRange(m.joined, from, to)
    );
    const csvHeaders = ['Name', 'Rank', 'Role', 'Status', 'Joined', 'Badge #', 'Phone', 'Email', 'Certifications'];
    const csvRows    = rows.map((m) => [m.name, m.rank, m.role, m.status, fmt(m.joined), m.memberNumber || '', m.phone || '', m.email || '', safeJoin(m.certifications)]);
    return { count: rows.length, csvHeaders, csvRows, pdfHeaders: csvHeaders, pdfRows: csvRows };
  }, [from, to, members]);
}

function useApparatusReport(apparatus = []) {
  return useMemo(() => {
    const rows = apparatus;
    const csvHeaders = ['Designation', 'Type', 'Year', 'Make', 'Model', 'Status', 'Mileage', 'Last Service', 'Next Service Due', 'Operator'];
    const csvRows    = rows.map((a) => [a.designation, a.type, a.year, a.make, a.model, a.status, a.mileage ?? '', fmt(a.lastService), fmt(a.nextServiceDue), a.assignedOperator ?? '']);
    return { count: rows.length, csvHeaders, csvRows, pdfHeaders: csvHeaders, pdfRows: csvRows };
  }, [apparatus]);
}

function safeJoin(val) {
  if (Array.isArray(val)) return val.join('; ');
  if (val == null) return '';
  return String(val);
}

function useIncidentReport(from, to, incidents = []) {
  return useMemo(() => {
    const rows = incidents.filter((i) => inRange(i.date, from, to));
    const csvHeaders = ['Incident #', 'Date', 'Time', 'Type', 'Alarm', 'Address', 'Disposition', 'Injuries', 'Units', 'Personnel'];
    const csvRows    = rows.map((i) => [
      i.incidentNumber, fmt(i.date), i.time ?? '', i.type, i.alarmLevel ?? '',
      i.address, i.disposition ?? '', i.injuries ?? 0,
      safeJoin(i.units), safeJoin(i.personnel),
    ]);
    return { count: rows.length, csvHeaders, csvRows, pdfHeaders: csvHeaders, pdfRows: csvRows };
  }, [from, to, incidents]);
}

function useTrainingReport(from, to, training = []) {
  return useMemo(() => {
    const rows = training.filter((r) => inRange(r.completedDate, from, to));
    const csvHeaders = ['Member', 'Course', 'Type', 'Status', 'Completed', 'Expires', 'Hours', 'Instructor', 'Location'];
    const csvRows    = rows.map((r) => [
      r.memberName, r.courseName, r.type, r.status,
      fmt(r.completedDate), fmt(r.expiresDate), r.hours ?? '',
      r.instructor ?? '', r.location ?? '',
    ]);
    return { count: rows.length, csvHeaders, csvRows, pdfHeaders: csvHeaders, pdfRows: csvRows };
  }, [from, to, training]);
}

function useMutualAidReport(from, to, mutualAid = []) {
  return useMemo(() => {
    const rows = mutualAid.filter((r) => inRange(r.date, from, to));
    const csvHeaders = ['Date', 'Direction', 'Partner Department', 'Type', 'Status', 'Personnel', 'Units', 'Address', 'Incident #'];
    const csvRows    = rows.map((r) => [
      fmt(r.date), r.direction, r.partnerDepartment, r.incidentType, r.status,
      r.personnelCount ?? 0, safeJoin(r.unitsDeployed),
      r.address ?? '', r.incidentNumber ?? '',
    ]);
    return { count: rows.length, csvHeaders, csvRows, pdfHeaders: csvHeaders, pdfRows: csvRows };
  }, [from, to, mutualAid]);
}

function useScheduleReport(from, to, shifts = []) {
  return useMemo(() => {
    const rows = shifts.filter((s) => inRange(s.date, from, to));
    const csvHeaders = ['Date', 'Type', 'Start', 'End', 'Crew Count', 'Crew Members'];
    const csvRows    = rows.map((s) => [
      fmt(s.date), s.type, s.startTime ?? '', s.endTime ?? '',
      Array.isArray(s.crew) ? s.crew.length : 0, safeJoin(s.crew),
    ]);
    return { count: rows.length, csvHeaders, csvRows, pdfHeaders: csvHeaders, pdfRows: csvRows };
  }, [from, to, shifts]);
}

// ─── new career / full-service report hooks ─────────────────────────────────

function useOTReport(from, to, records = []) {
  return useMemo(() => {
    const rows = records.filter((r) => inRange(r.ot_date, from, to));
    const csvHeaders = ['Member', 'Date', 'Hours', 'Type', 'Reason'];
    const csvRows = rows.map((r) => [r.member_name || `Member #${r.member_id}`, fmt(r.ot_date), r.ot_hours, r.ot_type || '', r.reason || '']);
    return { count: rows.length, csvHeaders, csvRows, pdfHeaders: csvHeaders, pdfRows: csvRows };
  }, [from, to, records]);
}

function usePersonnelReport(from, to, records = []) {
  return useMemo(() => {
    const rows = records.filter((r) => inRange(r.action_date, from, to));
    const csvHeaders = ['Member', 'Action Type', 'Date', 'Description', 'Issued By', 'Status'];
    const csvRows = rows.map((r) => [r.member_name || `Member #${r.member_id}`, r.action_type, fmt(r.action_date), r.description || '', r.issued_by || '', r.status || '']);
    return { count: rows.length, csvHeaders, csvRows, pdfHeaders: csvHeaders, pdfRows: csvRows };
  }, [from, to, records]);
}

function useExposureReport(from, to, records = []) {
  return useMemo(() => {
    const rows = records.filter((r) => inRange(r.exposure_date, from, to));
    const csvHeaders = ['Member', 'Date', 'Type', 'Incident #', 'Duration', 'PPE Used', 'Follow-up Notes'];
    const csvRows = rows.map((r) => [r.member_name || `Member #${r.member_id}`, fmt(r.exposure_date), r.exposure_type || '', r.incident_number || '', r.duration || '', r.ppe_used || '', r.followup_notes || '']);
    return { count: rows.length, csvHeaders, csvRows, pdfHeaders: csvHeaders, pdfRows: csvRows };
  }, [from, to, records]);
}

function useGrievanceReport(records = []) {
  return useMemo(() => {
    const csvHeaders = ['Grievance #', 'Filed Date', 'Filed By', 'Type', 'Subject', 'CBA Article', 'Step', 'Status', 'Union Rep'];
    const csvRows = records.map((r) => [r.grievance_number || '', fmt(r.filed_date), r.filed_by_name || '', r.type || '', r.subject || '', r.cba_article || '', r.current_step || '', r.status || '', r.union_rep || '']);
    return { count: records.length, csvHeaders, csvRows, pdfHeaders: csvHeaders, pdfRows: csvRows };
  }, [records]);
}

function useQualificationsReport(records = []) {
  return useMemo(() => {
    const csvHeaders = ['Member', 'Certification', 'Type', 'Issued', 'Expires', 'Issuing Authority', 'Cert #', 'Status'];
    const csvRows = records.map((r) => [r.member_name || `Member #${r.member_id}`, r.cert_name || '', r.cert_type || '', fmt(r.issued_date), fmt(r.expiry_date), r.issuing_authority || '', r.cert_number || '', r.status || '']);
    return { count: records.length, csvHeaders, csvRows, pdfHeaders: csvHeaders, pdfRows: csvRows };
  }, [records]);
}

function useCadetReport(records = []) {
  return useMemo(() => {
    const csvHeaders = ['Name', 'DOB', 'School', 'Parent/Guardian', 'Phone', 'Email', 'Enrolled', 'Status', 'Rank', 'Training Hours'];
    const csvRows = records.map((r) => [r.name, fmt(r.date_of_birth), r.school || '', r.parent_guardian || '', r.parent_phone || '', r.parent_email || '', fmt(r.enrolled_date), r.status || '', r.rank || '', r.training_hours || 0]);
    return { count: records.length, csvHeaders, csvRows, pdfHeaders: csvHeaders, pdfRows: csvRows };
  }, [records]);
}

function useAfterActionReport(from, to, records = []) {
  return useMemo(() => {
    const rows = records.filter((r) => inRange(r.incident_date || r.conducted_date, from, to));
    const csvHeaders = ['Title', 'Incident Date', 'Type', 'Location', 'Conducted By', 'Date', 'Status', 'Summary'];
    const csvRows = rows.map((r) => [r.title || '', fmt(r.incident_date), r.incident_type || '', r.location || '', r.conducted_by || '', fmt(r.conducted_date), r.status || '', (r.summary || '').slice(0, 100)]);
    return { count: rows.length, csvHeaders, csvRows, pdfHeaders: csvHeaders, pdfRows: csvRows };
  }, [from, to, records]);
}

function useDailyStaffingReport(from, to, records = []) {
  return useMemo(() => {
    const rows = records.filter((r) => inRange(r.date, from, to));
    const csvHeaders = ['Date', 'Member', 'Apparatus', 'Position', 'Status', 'Hours'];
    const csvRows = rows.map((r) => [fmt(r.date), r.member_name || `Member #${r.member_id}`, r.apparatus_name || '', r.position || '', r.status || '', r.hours || '']);
    return { count: rows.length, csvHeaders, csvRows, pdfHeaders: csvHeaders, pdfRows: csvRows };
  }, [from, to, records]);
}

// ─── bulletin board card ──────────────────────────────────────────────────────

function BulletinCard({ icon: Icon, color, title, description, badge, children, onPrint }) {
  const [printing, setPrinting] = useState(false);

  async function handle() {
    setPrinting(true);
    await new Promise((r) => setTimeout(r, 80));
    onPrint();
    setPrinting(false);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-lg ${color} shrink-0`}>
          <Icon size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        </div>
        {badge && (
          <div className="text-right shrink-0">
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{badge.count}</p>
            <p className="text-xs text-gray-400">{badge.unit}</p>
          </div>
        )}
      </div>

      {children}

      <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={handle}
          disabled={printing}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {printing
            ? <Clock size={14} className="animate-spin" />
            : <Printer size={14} />}
          Print / Preview
        </button>
      </div>
    </div>
  );
}

// ─── report card ─────────────────────────────────────────────────────────────

function ReportCard({ icon: Icon, color, title, description, count, unit, onCSV, onPDF, hasDateFilter }) {
  const [exporting, setExporting] = useState(null);

  async function handle(type, fn) {
    setExporting(type);
    await new Promise((r) => setTimeout(r, 80));
    fn();
    setExporting(null);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-lg ${color} shrink-0`}>
          <Icon size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{count}</p>
          <p className="text-xs text-gray-400">{unit}</p>
        </div>
      </div>

      {hasDateFilter && (
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Filter size={11} /> Filtered by date range above
        </div>
      )}

      <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={() => handle('csv', onCSV)}
          disabled={exporting !== null || count === 0}
          className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-700 dark:text-gray-300"
        >
          {exporting === 'csv'
            ? <Clock size={14} className="animate-spin" />
            : <FileSpreadsheet size={14} className="text-emerald-600 dark:text-emerald-400" />}
          CSV
        </button>
        <button
          onClick={() => handle('pdf', onPDF)}
          disabled={exporting !== null || count === 0}
          className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-700 dark:text-gray-300"
        >
          {exporting === 'pdf'
            ? <Clock size={14} className="animate-spin" />
            : <FileText size={14} className="text-red-600 dark:text-red-400" />}
          PDF
        </button>
      </div>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function ReportsExport({ settings }) {
  const stationName = settings?.stationName    || 'Station 14';
  const deptName    = settings?.departmentName || 'Maplewood VFD';
  const subtitle    = `${stationName} · ${deptName} · ${new Date().toLocaleDateString()}`;

  const now = new Date();
  const [from, setFrom]           = useState('');
  const [to,   setTo]             = useState('');
  const [lastExport, setLastExport] = useState(null);
  const [schedYear,  setSchedYear]  = useState(now.getFullYear());
  const [schedMonth, setSchedMonth] = useState(now.getMonth());
  const [memberData, setMemberData] = useState([]);
  const [apparatusData, setApparatusData] = useState([]);
  const [shiftsData, setShiftsData] = useState([]);
  const [incidentsData, setIncidentsData] = useState([]);
  const [trainingData, setTrainingData] = useState([]);
  const [mutualAidData, setMutualAidData] = useState([]);
  const [eventsData, setEventsData] = useState([]);
  const [otData, setOtData] = useState([]);
  const [personnelData, setPersonnelData] = useState([]);
  const [exposureData, setExposureData] = useState([]);
  const [grievanceData, setGrievanceData] = useState([]);
  const [qualData, setQualData] = useState([]);
  const [cadetData, setCadetData] = useState([]);
  const [afterActionData, setAfterActionData] = useState([]);
  const [dailyStaffingData, setDailyStaffingData] = useState([]);
  const [loading, setLoading] = useState(true);

  const safe = (res) => Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];

  // Fetch all data on mount
  useEffect(() => {
    async function fetch() {
      try {
        const [memRes, appRes, shiftsRes, incRes, trainRes, aidRes, eventRes,
               otRes, persRes, expRes, grvRes, qualRes, cadRes, aarRes, dsRes] = await Promise.all([
          api.get('/api/members'),
          api.get('/api/apparatus'),
          api.get('/api/shifts'),
          api.get('/api/incidents'),
          api.get('/api/training'),
          api.get('/api/mutual-aid'),
          api.get('/api/events'),
          api.get('/api/ot-equalization/board').catch(() => []),
          api.get('/api/personnel-actions').catch(() => []),
          api.get('/api/exposure-tracking').catch(() => []),
          api.get('/api/grievances').catch(() => []),
          api.get('/api/qualifications').catch(() => []),
          api.get('/api/cadets').catch(() => []),
          api.get('/api/after-action').catch(() => []),
          api.get('/api/daily-staffing').catch(() => []),
        ]);
        setMemberData(safe(memRes));
        setApparatusData(safe(appRes));
        setShiftsData(safe(shiftsRes));
        setIncidentsData(safe(incRes));
        setTrainingData(safe(trainRes));
        setMutualAidData(safe(aidRes));
        setEventsData(safe(eventRes));
        setOtData(safe(otRes));
        setPersonnelData(safe(persRes));
        setExposureData(safe(expRes));
        setGrievanceData(safe(grvRes));
        setQualData(safe(qualRes));
        setCadetData(safe(cadRes));
        setAfterActionData(safe(aarRes));
        setDailyStaffingData(safe(dsRes));
      } catch (err) {
        console.error('Failed to fetch reports data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const members       = useMemberReport(from, to, memberData);
  const apparatus     = useApparatusReport(apparatusData);
  const incidents     = useIncidentReport(from, to, incidentsData);
  const training      = useTrainingReport(from, to, trainingData);
  const mutualAid     = useMutualAidReport(from, to, mutualAidData);
  const schedule      = useScheduleReport(from, to, shiftsData);
  const otRecords     = useOTReport(from, to, otData);
  const personnel     = usePersonnelReport(from, to, personnelData);
  const exposures     = useExposureReport(from, to, exposureData);
  const grievances    = useGrievanceReport(grievanceData);
  const quals         = useQualificationsReport(qualData);
  const cadets        = useCadetReport(cadetData);
  const afterActions  = useAfterActionReport(from, to, afterActionData);
  const dailyStaffing = useDailyStaffingReport(from, to, dailyStaffingData);

  function exported(name) {
    setLastExport({ name, time: new Date().toLocaleTimeString() });
  }

  // Month navigation for schedule print
  function prevMonth() {
    if (schedMonth === 0) { setSchedMonth(11); setSchedYear((y) => y - 1); }
    else setSchedMonth((m) => m - 1);
  }
  function nextMonth() {
    if (schedMonth === 11) { setSchedMonth(0); setSchedYear((y) => y + 1); }
    else setSchedMonth((m) => m + 1);
  }
  const schedMonthLabel = new Date(schedYear, schedMonth, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  const reports = [
    {
      icon: Users, color: 'bg-blue-500',
      title: 'Member Roster',
      description: 'All personnel with ranks, roles, statuses, join dates, contact info, and certifications.',
      data: members, hasDate: true,
      csv: () => { downloadCSV('OpenFirehouse_Members.csv', members.csvHeaders, members.csvRows); exported('Member Roster CSV'); },
      pdf: () => { makePDF('Member Roster', subtitle, members.pdfHeaders, members.pdfRows, 'OpenFirehouse_Members.pdf'); exported('Member Roster PDF'); },
    },
    {
      icon: Truck, color: 'bg-emerald-500',
      title: 'Apparatus Status',
      description: 'Full fleet inventory with service history, mileage, and operational status.',
      data: apparatus, hasDate: false,
      csv: () => { downloadCSV('OpenFirehouse_Apparatus.csv', apparatus.csvHeaders, apparatus.csvRows); exported('Apparatus CSV'); },
      pdf: () => { makePDF('Apparatus Status', subtitle, apparatus.pdfHeaders, apparatus.pdfRows, 'OpenFirehouse_Apparatus.pdf'); exported('Apparatus PDF'); },
    },
    {
      icon: Flame, color: 'bg-red-500',
      title: 'Incident Log',
      description: 'All incident records with units, personnel, alarm levels, and dispositions.',
      data: incidents, hasDate: true,
      csv: () => { downloadCSV('OpenFirehouse_Incidents.csv', incidents.csvHeaders, incidents.csvRows); exported('Incident Log CSV'); },
      pdf: () => { makePDF('Incident Log', subtitle, incidents.pdfHeaders, incidents.pdfRows, 'OpenFirehouse_Incidents.pdf'); exported('Incident Log PDF'); },
    },
    {
      icon: GraduationCap, color: 'bg-indigo-500',
      title: 'Training Management',
      description: 'All training completions, certifications, expiry dates, and hours logged.',
      data: training, hasDate: true,
      csv: () => { downloadCSV('OpenFirehouse_Training.csv', training.csvHeaders, training.csvRows); exported('Training Management CSV'); },
      pdf: () => { makePDF('Training Management', subtitle, training.pdfHeaders, training.pdfRows, 'OpenFirehouse_Training.pdf'); exported('Training Management PDF'); },
    },
    {
      icon: Handshake, color: 'bg-violet-500',
      title: 'Mutual Aid Log',
      description: 'All mutual aid events given and received, with partner departments and personnel.',
      data: mutualAid, hasDate: true,
      csv: () => { downloadCSV('OpenFirehouse_MutualAid.csv', mutualAid.csvHeaders, mutualAid.csvRows); exported('Mutual Aid CSV'); },
      pdf: () => { makePDF('Mutual Aid Log', subtitle, mutualAid.pdfHeaders, mutualAid.pdfRows, 'OpenFirehouse_MutualAid.pdf'); exported('Mutual Aid PDF'); },
    },
    {
      icon: CalendarDays, color: 'bg-amber-500',
      title: 'Duty Schedule',
      description: 'All scheduled shifts with crew assignments and coverage status.',
      data: schedule, hasDate: true,
      csv: () => { downloadCSV('OpenFirehouse_Schedule.csv', schedule.csvHeaders, schedule.csvRows); exported('Schedule CSV'); },
      pdf: () => { makePDF('Duty Schedule', subtitle, schedule.pdfHeaders, schedule.pdfRows, 'OpenFirehouse_Schedule.pdf'); exported('Duty Schedule PDF'); },
    },
    {
      icon: Scale, color: 'bg-orange-500',
      title: 'Overtime Records',
      description: 'All OT records with type (mandatory/voluntary/holdover), hours, and reason.',
      data: otRecords, hasDate: true,
      csv: () => { downloadCSV('OpenFirehouse_OT_Records.csv', otRecords.csvHeaders, otRecords.csvRows); exported('OT Records CSV'); },
      pdf: () => { makePDF('Overtime Records', subtitle, otRecords.pdfHeaders, otRecords.pdfRows, 'OpenFirehouse_OT_Records.pdf', '#EA580C'); exported('OT Records PDF'); },
    },
    {
      icon: UserCheck, color: 'bg-cyan-500',
      title: 'Personnel Actions',
      description: 'Promotions, disciplinary actions, commendations, and performance reviews.',
      data: personnel, hasDate: true,
      csv: () => { downloadCSV('OpenFirehouse_Personnel_Actions.csv', personnel.csvHeaders, personnel.csvRows); exported('Personnel Actions CSV'); },
      pdf: () => { makePDF('Personnel Actions', subtitle, personnel.pdfHeaders, personnel.pdfRows, 'OpenFirehouse_Personnel_Actions.pdf', '#0891B2'); exported('Personnel Actions PDF'); },
    },
    {
      icon: AlertTriangle, color: 'bg-yellow-600',
      title: 'Exposure Records',
      description: 'OSHA exposure tracking with type, duration, PPE, and medical follow-up.',
      data: exposures, hasDate: true,
      csv: () => { downloadCSV('OpenFirehouse_Exposures.csv', exposures.csvHeaders, exposures.csvRows); exported('Exposure Records CSV'); },
      pdf: () => { makePDF('Exposure Records', subtitle, exposures.pdfHeaders, exposures.pdfRows, 'OpenFirehouse_Exposures.pdf', '#CA8A04'); exported('Exposure Records PDF'); },
    },
    {
      icon: Shield, color: 'bg-rose-600',
      title: 'Grievance Log',
      description: 'Union grievances with CBA article, escalation step, status, and representatives.',
      data: grievances, hasDate: false,
      csv: () => { downloadCSV('OpenFirehouse_Grievances.csv', grievances.csvHeaders, grievances.csvRows); exported('Grievance Log CSV'); },
      pdf: () => { makePDF('Grievance Log', subtitle, grievances.pdfHeaders, grievances.pdfRows, 'OpenFirehouse_Grievances.pdf', '#E11D48'); exported('Grievance Log PDF'); },
    },
    {
      icon: Award, color: 'bg-teal-500',
      title: 'Qualifications & Certifications',
      description: 'All member certifications with expiry dates, issuing authority, and status.',
      data: quals, hasDate: false,
      csv: () => { downloadCSV('OpenFirehouse_Qualifications.csv', quals.csvHeaders, quals.csvRows); exported('Qualifications CSV'); },
      pdf: () => { makePDF('Qualifications & Certifications', subtitle, quals.pdfHeaders, quals.pdfRows, 'OpenFirehouse_Qualifications.pdf', '#0D9488'); exported('Qualifications PDF'); },
    },
    {
      icon: ClipboardList, color: 'bg-sky-500',
      title: 'After-Action Reports',
      description: 'Post-incident reviews with findings, lessons learned, and action items.',
      data: afterActions, hasDate: true,
      csv: () => { downloadCSV('OpenFirehouse_AfterAction.csv', afterActions.csvHeaders, afterActions.csvRows); exported('After-Action CSV'); },
      pdf: () => { makePDF('After-Action Reports', subtitle, afterActions.pdfHeaders, afterActions.pdfRows, 'OpenFirehouse_AfterAction.pdf', '#0284C7'); exported('After-Action PDF'); },
    },
    {
      icon: DollarSign, color: 'bg-green-600',
      title: 'Daily Staffing Log',
      description: 'Daily duty assignments by apparatus and position with hours worked.',
      data: dailyStaffing, hasDate: true,
      csv: () => { downloadCSV('OpenFirehouse_DailyStaffing.csv', dailyStaffing.csvHeaders, dailyStaffing.csvRows); exported('Daily Staffing CSV'); },
      pdf: () => { makePDF('Daily Staffing Log', subtitle, dailyStaffing.pdfHeaders, dailyStaffing.pdfRows, 'OpenFirehouse_DailyStaffing.pdf', '#16A34A'); exported('Daily Staffing PDF'); },
    },
    {
      icon: Baby, color: 'bg-purple-500',
      title: 'Cadet Program Roster',
      description: 'All cadets with guardian info, enrollment date, training hours, and status.',
      data: cadets, hasDate: false,
      csv: () => { downloadCSV('OpenFirehouse_Cadets.csv', cadets.csvHeaders, cadets.csvRows); exported('Cadet Roster CSV'); },
      pdf: () => { makePDF('Cadet Program Roster', subtitle, cadets.pdfHeaders, cadets.pdfRows, 'OpenFirehouse_Cadets.pdf', '#9333EA'); exported('Cadet Roster PDF'); },
    },
  ];

  return (
    <div className="space-y-8">

      {/* header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Reports &amp; Export</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Print bulletin board documents or export data as CSV / PDF.</p>
      </div>

      {/* ── SECTION: Bulletin Board Prints ──────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-800 shrink-0">
            <Printer size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Bulletin Board &amp; Station Prints</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Print-ready documents formatted for posting at the station. Opens a print preview in a new tab.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">

          {/* Contact Directory */}
          <BulletinCard
            icon={Contact}
            color="bg-red-700"
            title="Member Contact Directory"
            description="Portrait format. Sorted by rank. Phone &amp; email. Marked confidential."
            badge={{ count: memberData.length, unit: 'members' }}
            onPrint={() => printContactDirectory(memberData, stationName, deptName)}
          />

          {/* Monthly Duty Schedule */}
          <BulletinCard
            icon={CalendarDays}
            color="bg-blue-700"
            title="Monthly Duty Schedule"
            description="Landscape calendar grid with shift type, crew names, and today highlighted."
            badge={{ count: shiftsData.filter((s) => {
              const d = new Date(s.date + 'T00:00:00');
              return d.getFullYear() === schedYear && d.getMonth() === schedMonth;
            }).length, unit: 'shifts' }}
            onPrint={() => printMonthlySchedule(shiftsData, stationName, deptName, schedYear, schedMonth)}
          >
            {/* month picker */}
            <div className="flex items-center justify-between px-2 py-1.5 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">
              <button onClick={prevMonth} aria-label="Previous month" className="px-2 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">‹</button>
              <span className="font-medium text-gray-700 dark:text-gray-300 text-xs">{schedMonthLabel}</span>
              <button onClick={nextMonth} aria-label="Next month" className="px-2 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">›</button>
            </div>
          </BulletinCard>

          {/* Community Events Calendar */}
          <BulletinCard
            icon={CalendarRange}
            color="bg-green-700"
            title="Community Events Calendar"
            description="Portrait format. Next 6 weeks of events with type, time, and location."
            badge={{ count: (() => {
              const t = new Date().toISOString().slice(0, 10);
              const e = new Date(); e.setDate(e.getDate() + 42);
              return eventsData.filter((ev) => ev.date >= t && ev.date <= e.toISOString().slice(0, 10)).length;
            })(), unit: 'upcoming' }}
            onPrint={() => printEventsCalendar(eventsData, stationName, deptName)}
          />

          {/* Apparatus Status Board */}
          <BulletinCard
            icon={Truck}
            color="bg-slate-700"
            title="Apparatus Status Board"
            description="Landscape format. All units with status, mileage, last &amp; next service. Overdue flagged."
            badge={{ count: apparatusData.length, unit: 'units' }}
            onPrint={() => printApparatusStatus(apparatusData, stationName, deptName)}
          />

        </div>
      </div>

      {/* ── SECTION: Data Reports & Exports ─────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-800 shrink-0">
            <Download size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Data Reports &amp; Exports</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Export data as CSV (for spreadsheets) or PDF (formatted reports for county coordinators, grant reviewers, or state agencies).</p>
          </div>
        </div>

        {/* date range filter */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Date Range — From</label>
              <input
                type="date" value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">To</label>
              <input
                type="date" value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            {(from || to) && (
              <button
                onClick={() => { setFrom(''); setTo(''); }}
                className="text-sm text-red-600 dark:text-red-400 hover:underline pb-2"
              >
                Clear filter
              </button>
            )}
            {!from && !to && (
              <p className="text-xs text-gray-400 pb-2.5">No filter — all records will be included.</p>
            )}
            {(from || to) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 pb-2.5">
                <Filter size={11} className="inline mr-1" />
                Filtering {from ? `from ${fmt(from)}` : ''}{from && to ? ' ' : ''}{to ? `to ${fmt(to)}` : ''}
              </p>
            )}
          </div>
        </div>

        {/* success toast */}
        {lastExport && (
          <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-lg text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={15} className="shrink-0" />
            <span><strong>{lastExport.name}</strong> exported at {lastExport.time} — check your Downloads folder.</span>
            <button onClick={() => setLastExport(null)} aria-label="Dismiss notification" className="ml-auto text-emerald-500 hover:text-emerald-700 text-lg leading-none">×</button>
          </div>
        )}

        {/* report cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {reports.map((r) => (
            <ReportCard
              key={r.title}
              icon={r.icon}
              color={r.color}
              title={r.title}
              description={r.description}
              count={r.data.count}
              unit="records"
              hasDateFilter={r.hasDate && (!!from || !!to)}
              onCSV={r.csv}
              onPDF={r.pdf}
            />
          ))}
        </div>

        {/* export tips */}
        <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl p-5 text-sm text-gray-600 dark:text-gray-300 space-y-2">
          <p className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2"><Download size={14} /> Export Tips</p>
          <p><strong>CSV</strong> files open directly in Excel, Google Sheets, or Numbers — ideal for further analysis, sorting, or importing into other systems.</p>
          <p><strong>PDF</strong> files are formatted reports with your station name and date — ready to print or email to county coordinators, state agencies, or grant reviewers.</p>
          <p>Use the <strong>date range filter</strong> above to scope any time-sensitive report (incidents, training, mutual aid, schedule) to a specific period — such as a fiscal year or grant reporting window.</p>
        </div>
      </div>

    </div>
  );
}
