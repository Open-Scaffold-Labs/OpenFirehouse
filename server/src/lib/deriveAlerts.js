'use strict';
/**
 * deriveAlerts — PURE alert derivation over LIVE per-department data.
 *
 * Takes already-fetched, department-scoped arrays and returns the alert list for
 * a viewer, applying rank-notification category gating + cert-oversight scope.
 * No DB, no network, no globals → fully unit-testable and identical on any caller.
 *
 * Field mappings are pinned to the live API shapes (verified by probe):
 *   apparatus: { designation, year, make, model, nextServiceDue }
 *   assets:    { name, category, condition, location, nextInspectionDue }
 *   training:  { memberId, memberName, courseName, expiresDate }
 *   shifts:    { date, shiftType, crew[] }   (NOTE: shiftType, not type; crew is an array)
 *
 * opts:
 *   thresholds  { certExpiry, apparatusService, assetInspection, shiftMinCrew }
 *   enabled     { certs, maintenance, schedule } — rank-notification gating (default all true)
 *   certScope   'own' | 'crew' | 'station' | 'all'
 *   certMemberIds  number[] | null  (allow-list for crew/station)
 *   viewerMemberId number | null    (for 'own')
 */

const DEFAULT_THRESHOLDS = { certExpiry: 30, apparatusService: 30, assetInspection: 30, shiftMinCrew: 3 };

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function daysDiff(str, today) {
  if (!str) return null;
  const t = new Date(str);
  if (isNaN(t.getTime())) return null;
  return Math.round((t - today) / 86_400_000);
}
function fmt(str) {
  if (!str) return '—';
  const m = String(str).split('-');
  return m.length === 3 ? `${m[1]}/${m[2]}/${m[0]}` : String(str);
}

function deriveAlerts(data = {}, opts = {}) {
  const apparatus = Array.isArray(data.apparatus) ? data.apparatus : [];
  const assets    = Array.isArray(data.assets)    ? data.assets    : [];
  const shifts    = Array.isArray(data.shifts)    ? data.shifts    : [];
  const training  = Array.isArray(data.training)  ? data.training  : [];

  const thresholds = { ...DEFAULT_THRESHOLDS, ...(opts.thresholds || {}) };
  const enabled = opts.enabled || { certs: true, maintenance: true, schedule: true };
  const on = (k) => enabled[k] !== false;

  const certScope  = opts.certScope || 'all';
  const certIds    = Array.isArray(opts.certMemberIds) ? opts.certMemberIds : null;
  const viewerId   = opts.viewerMemberId ?? null;

  const today = startOfToday();
  const alerts = [];

  // ── Certifications (Training) — scoped by rank ───────────────────────────
  // own → the viewer's member id; crew/station → the id allow-list; all → no filter.
  // Never hide-all: if a list can't be resolved, fall through to no filter.
  if (on('certs')) training.forEach((r) => {
    if (!r || !r.expiresDate) return;
    if (certScope === 'own') {
      if (viewerId != null && r.memberId !== viewerId) return;
    } else if (certIds) {
      if (!certIds.includes(r.memberId)) return;
    }
    const diff = daysDiff(r.expiresDate, today);
    if (diff == null) return;
    if (diff < 0) {
      alerts.push({ id: `cert-expired-${r.id}`, severity: 'critical', category: 'Training',
        title: `Expired Certification: ${r.courseName}`,
        detail: `${r.memberName} — expired ${fmt(r.expiresDate)} (${Math.abs(diff)} days ago)`,
        module: 'training', date: r.expiresDate, memberId: r.memberId, memberName: r.memberName });
    } else if (diff <= thresholds.certExpiry) {
      alerts.push({ id: `cert-soon-${r.id}`, severity: 'warning', category: 'Training',
        title: `Certification Expiring Soon: ${r.courseName}`,
        detail: `${r.memberName} — expires ${fmt(r.expiresDate)} (${diff} day${diff !== 1 ? 's' : ''})`,
        module: 'training', date: r.expiresDate, memberId: r.memberId, memberName: r.memberName });
    }
  });

  // ── Apparatus service (maintenance) ──────────────────────────────────────
  if (on('maintenance')) apparatus.forEach((a) => {
    if (!a || !a.nextServiceDue) return;
    const diff = daysDiff(a.nextServiceDue, today);
    if (diff == null) return;
    const label = `${a.year || ''} ${a.make || ''} ${a.model || ''}`.trim();
    if (diff < 0) {
      alerts.push({ id: `app-overdue-${a.id}`, severity: 'critical', category: 'Apparatus',
        title: `Overdue Service: ${a.designation}`,
        detail: `${label} — service due ${fmt(a.nextServiceDue)} (${Math.abs(diff)} days overdue)`,
        module: 'apparatus', date: a.nextServiceDue });
    } else if (diff <= thresholds.apparatusService) {
      alerts.push({ id: `app-soon-${a.id}`, severity: 'warning', category: 'Apparatus',
        title: `Service Due Soon: ${a.designation}`,
        detail: `${label} — service due ${fmt(a.nextServiceDue)} (${diff} day${diff !== 1 ? 's' : ''})`,
        module: 'apparatus', date: a.nextServiceDue });
    }
  });

  // ── Assets / equipment (maintenance) ─────────────────────────────────────
  if (on('maintenance')) assets.forEach((a) => {
    if (!a) return;
    if (a.nextInspectionDue) {
      const diff = daysDiff(a.nextInspectionDue, today);
      if (diff != null && diff < 0) {
        alerts.push({ id: `asset-overdue-${a.id}`, severity: a.condition === 'Out of Service' ? 'info' : 'critical',
          category: 'Assets', title: `Overdue Inspection: ${a.name}`,
          detail: `${a.category} — inspection due ${fmt(a.nextInspectionDue)} (${Math.abs(diff)} days overdue)${a.location ? ` · ${a.location}` : ''}`,
          module: 'assets', date: a.nextInspectionDue });
      } else if (diff != null && diff <= thresholds.assetInspection) {
        alerts.push({ id: `asset-soon-${a.id}`, severity: 'warning', category: 'Assets',
          title: `Inspection Due Soon: ${a.name}`,
          detail: `${a.category} — inspection due ${fmt(a.nextInspectionDue)} (${diff === 0 ? 'today' : `${diff} day${diff !== 1 ? 's' : ''}`})${a.location ? ` · ${a.location}` : ''}`,
          module: 'assets', date: a.nextInspectionDue });
      }
    }
    if (a.condition === 'Needs Maintenance') {
      alerts.push({ id: `asset-maint-${a.id}`, severity: 'warning', category: 'Assets',
        title: `Maintenance Required: ${a.name}`,
        detail: `Marked "Needs Maintenance"${a.notes ? ` — ${String(a.notes).slice(0, 80)}` : ''}`,
        module: 'assets', date: null });
    }
    if (a.condition === 'Out of Service') {
      alerts.push({ id: `asset-oos-${a.id}`, severity: 'critical', category: 'Assets',
        title: `Out of Service: ${a.name}`,
        detail: `${a.category}${a.location ? ` · ${a.location}` : ''}${a.notes ? ` — ${String(a.notes).slice(0, 80)}` : ''}`,
        module: 'assets', date: null });
    }
  });

  // ── Schedule understaffing (next 14 days) ────────────────────────────────
  if (on('schedule')) {
    const cutoff = new Date(today); cutoff.setDate(today.getDate() + 14);
    shifts.forEach((s) => {
      if (!s || !s.date) return;
      const sd = new Date(s.date);
      if (isNaN(sd.getTime()) || sd < today || sd > cutoff) return;
      const crew = Array.isArray(s.crew) ? s.crew.length : 0;
      if (crew < thresholds.shiftMinCrew) {
        const label = s.type || s.shiftType || 'Shift'; // live data uses shiftType
        alerts.push({ id: `shift-under-${s.id}`, severity: crew === 0 ? 'critical' : 'warning',
          category: 'Schedule', title: `Understaffed Shift: ${label}`,
          detail: `${fmt(s.date)} — ${crew} of ${thresholds.shiftMinCrew} required crew assigned`,
          module: 'schedule', date: s.date });
      }
    });
  }

  alerts.sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    const sd = (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3);
    if (sd !== 0) return sd;
    return (a.date ?? '9999') > (b.date ?? '9999') ? 1 : -1;
  });
  return alerts;
}

module.exports = { deriveAlerts, DEFAULT_THRESHOLDS };
