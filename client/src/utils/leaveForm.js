/**
 * utils/leaveForm.js — PURE helpers for the member "My Leave" request form (Phase 1.2e).
 * No React, no DOM — unit-tested under `node --test`. Encodes the market-bar behaviors:
 *   - projected-after balance shown live,
 *   - insufficient balance is a SOFT WARNING, never a hard block (accruals / an approved
 *     negative may cover it — the mature pattern),
 *   - status is conveyed by LABEL + ICON, never color alone (WCAG 1.4.1).
 */

/** Balance remaining after a proposed request, from the member's available_to_request. */
export function projectedAfter(available, hours) {
  const a = Number(available) || 0;
  const h = Number(hours) || 0;
  return Math.round((a - h) * 100) / 100;
}

/**
 * A soft warning (NOT a block) when a request exceeds the current available balance.
 * Returns null when the request fits (or hours not yet entered).
 */
export function requestWarning(available, hours, bankLabel = 'this bank') {
  const a = Number(available) || 0;
  const h = Number(hours) || 0;
  if (!(h > 0)) return null;
  if (h > a) {
    const over = Math.round((h - a) * 100) / 100;
    return {
      level: 'warning',
      message: `This is ${over}h more than your current ${bankLabel} balance (${a}h). You can still submit — it may need approval or accrue by then.`,
    };
  }
  return null;
}

/**
 * Accessible status metadata: a semantic key (the component maps it to a lucide icon), a
 * text label, and a tone. Status is carried by the label + icon, never by color alone.
 */
export function statusMeta(status) {
  switch (String(status || '').toLowerCase()) {
    case 'approved':  return { key: 'approved',  label: 'Approved',  tone: 'green' };
    case 'denied':    return { key: 'denied',    label: 'Denied',    tone: 'red' };
    case 'cancelled': return { key: 'cancelled', label: 'Cancelled', tone: 'gray' };
    default:          return { key: 'pending',   label: 'Pending',   tone: 'amber' };
  }
}

/**
 * Whether the request is complete enough to submit. Insufficient balance is a WARNING, not a
 * block, so it deliberately does NOT gate submission — only the required fields do.
 */
export function canSubmitRequest({ leaveTypeId, startDate, endDate, hours } = {}) {
  return Boolean(leaveTypeId) && Boolean(startDate) && Boolean(endDate) && Number(hours) > 0;
}
