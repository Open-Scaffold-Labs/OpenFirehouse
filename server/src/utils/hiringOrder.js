'use strict';
/**
 * utils/hiringOrder.js — PURE ordering + eligibility math for the hiring engine (Phase 1.5).
 * Spec: docs/PHASE1-HIRING-SPEC-2026-07-25.md §3. No DB — fully unit-testable.
 *
 * Market doctrine encoded here (2026-07-25 pass, competitors generic):
 *  - Eligibility is DISTINCT from ordering, and every excluded person carries an
 *    inspectable reason, classed 'disqualified' (rule failed them) vs 'unavailable'
 *    (they exist but can't work it) — the two-color audit the incumbent ships.
 *  - Ordering is a rule family + a tie-breaker CHAIN, terminated by a stable key so the
 *    order is total and reproducible (a grievance re-derivation must get the same list).
 *  - A reset is a WINDOW BOUNDARY: balances are computed since the window start, history
 *    is never rewritten.
 *  - Fatigue is an ADVISORY flag on the candidate, never a silent filter (OF doctrine).
 */

const ORDER_METHODS = ['hours_asc', 'rotation', 'seniority', 'manual'];
const TIE_BREAKERS = ['seniority', 'hire_date', 'member_id', 'manual_order'];

/**
 * Start of the current reset window for a list, as an ISO timestamp string.
 * 'none' → epoch (all history counts). 'annual' → the most recent occurrence of the
 * MM-DD anchor on/before `now` (local-day doctrine: dates are treated as plain strings).
 */
function resetWindowStart(list, nowIso) {
  if (!list || list.reset_period === 'none') return '1970-01-01T00:00:00Z';
  const now = String(nowIso || new Date().toISOString());
  const year = Number(now.slice(0, 4));
  const anchor = /^\d{2}-\d{2}$/.test(list.reset_anchor || '') ? list.reset_anchor : '01-01';
  const thisYear = `${year}-${anchor}T00:00:00Z`;
  return now >= thisYear ? thisYear : `${year - 1}-${anchor}T00:00:00Z`;
}

/** Seniority key: hire_date ('' → null → sorts LAST among eligibles), then seniority_number. */
function seniorityKey(m) {
  const hd = typeof m.hire_date === 'string' && m.hire_date.trim() !== '' ? m.hire_date.trim() : null;
  return { hireDate: hd, seniorityNumber: Number(m.seniority_number) || 0 };
}

function cmpNullableAsc(a, b, nullsLast = true) {
  if (a == null && b == null) return 0;
  if (a == null) return nullsLast ? 1 : -1;
  if (b == null) return nullsLast ? -1 : 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Classify one candidate. Returns null when eligible, else { reason, kind }.
 * `ctx` per member: { active, rank, certs:[], onLeave, onBoard }.
 * `req`: { targetRank, requiredCerts:[], vacancyCerts:[] } (canonical codes; rank compare
 * uses the same normalized-exact rule as staffingRules — passed in pre-normalized).
 */
function classify(memberCtx, req, normalizeRank) {
  if (!memberCtx.active) return { reason: 'inactive member', kind: 'disqualified' };
  if (req.targetRank && normalizeRank(memberCtx.rank) !== normalizeRank(req.targetRank)) {
    return { reason: `rank mismatch (needs ${req.targetRank})`, kind: 'disqualified' };
  }
  const need = [...new Set([...(req.requiredCerts || []), ...(req.vacancyCerts || [])])];
  const have = new Set(memberCtx.certs || []);
  const missing = need.filter((c) => !have.has(c));
  if (missing.length) return { reason: `missing certs: ${missing.join(', ')}`, kind: 'disqualified' };
  if (memberCtx.onLeave) return { reason: 'on approved leave', kind: 'unavailable' };
  if (memberCtx.onBoard) return { reason: 'already scheduled that date', kind: 'unavailable' };
  return null;
}

/**
 * Order eligible candidates. PURE and TOTAL (String-coerced member_id is the terminal key —
 * two runs over the same inputs always produce the same order).
 *
 * @param {Array} candidates [{ member_id, name, rank, hire_date, seniority_number,
 *                              manual_order, last_awarded_at, balance }]
 * @param {object} list { order_method, tie_breakers (JSON string or array) }
 * @returns ordered array with per-candidate `factors`
 */
function orderCandidates(candidates, list) {
  let ties = list.tie_breakers;
  if (typeof ties === 'string') { try { ties = JSON.parse(ties); } catch (_) { ties = []; } }
  if (!Array.isArray(ties)) ties = [];
  const chain = [...ties.filter((t) => TIE_BREAKERS.includes(t))];
  if (!chain.includes('member_id')) chain.push('member_id');   // total order guarantee

  function cmpBy(key, a, b) {
    switch (key) {
      case 'seniority': {
        const sa = seniorityKey(a), sb = seniorityKey(b);
        return cmpNullableAsc(sa.hireDate, sb.hireDate) || (sa.seniorityNumber - sb.seniorityNumber);
      }
      case 'hire_date':
        return cmpNullableAsc(seniorityKey(a).hireDate, seniorityKey(b).hireDate);
      case 'manual_order':
        return (Number(a.manual_order) || 0) - (Number(b.manual_order) || 0);
      case 'member_id':
      default:
        return String(a.member_id) < String(b.member_id) ? -1 : String(a.member_id) > String(b.member_id) ? 1 : 0;
    }
  }

  const primary = (a, b) => {
    switch (list.order_method) {
      case 'hours_asc': return (Number(a.balance) || 0) - (Number(b.balance) || 0);
      case 'rotation':  return cmpNullableAsc(a.last_awarded_at || null, b.last_awarded_at || null, /* nullsLast */ false);
      case 'seniority': return cmpBy('seniority', a, b);
      case 'manual':    return cmpBy('manual_order', a, b);
      default:          return 0;
    }
  };

  return [...candidates]
    .sort((a, b) => {
      let c = primary(a, b);
      for (const key of chain) { if (c !== 0) break; c = cmpBy(key, a, b); }
      return c;
    })
    .map((m, i) => ({
      ...m,
      position: i + 1,
      factors: {
        method: list.order_method,
        balance: Number(m.balance) || 0,
        lastAwardedAt: m.last_awarded_at || null,
        hireDate: seniorityKey(m).hireDate,
        seniorityNumber: seniorityKey(m).seniorityNumber,
        manualOrder: Number(m.manual_order) || 0,
      },
    }));
}

/**
 * Mandatory-list ordering: mandate-count ASCENDING, tie-broken by REVERSE seniority
 * (the least-senior eligible member is held first — the documented CBA convention),
 * terminal stable key. `candidates` carry `mandateCount`.
 */
function orderMandatory(candidates) {
  return [...candidates]
    .sort((a, b) => {
      const c = (Number(a.mandateCount) || 0) - (Number(b.mandateCount) || 0);
      if (c !== 0) return c;
      const sa = seniorityKey(a), sb = seniorityKey(b);
      // Reverse seniority: LATER hire date first; null hire dates go last either way.
      const r = cmpNullableAsc(sb.hireDate, sa.hireDate);
      if (r !== 0) return r;
      const s = (sb.seniorityNumber - sa.seniorityNumber);
      if (s !== 0) return s;
      return String(a.member_id) < String(b.member_id) ? -1 : 1;
    })
    .map((m, i) => ({
      ...m, position: i + 1,
      factors: {
        method: 'mandate_rotation',
        mandateCount: Number(m.mandateCount) || 0,
        hireDate: seniorityKey(m).hireDate,
        seniorityNumber: seniorityKey(m).seniorityNumber,
      },
    }));
}

module.exports = {
  ORDER_METHODS, TIE_BREAKERS,
  resetWindowStart, seniorityKey, classify, orderCandidates, orderMandatory,
};
