'use strict';
/**
 * utils/hiringEngine.js — the ONE DOOR for hiring-event + offer lifecycle (Phase 1.5).
 * Spec: docs/PHASE1-HIRING-SPEC-2026-07-25.md §3. Migration 0081. Pure ordering math
 * lives in utils/hiringOrder.js; this module orchestrates DB state.
 *
 * Doctrine:
 *  - Every award goes THROUGH vacancyEngine.fillVacancy (the one vacancy fill door).
 *  - The list snapshot is written ONCE at event open and never updated — it is the
 *    skip-order grievance evidence (list order AT THE MOMENT of hiring).
 *  - Advancement is LAZY and event-driven (on read / on member action) — no cron,
 *    consistent with the 1.4 compute-on-view doctrine. In-app-only delivery until the
 *    1.6 telephony decision (F12); the offer rows reserve channel fields.
 *  - Charges are append-only ledger entries, guarded by hiring_offers.charged in the
 *    same transaction as the outcome transition (charge at most once).
 *  - When the engine exhausts a list it STOPS AND REPORTS — mandate is a separate,
 *    human-triggered act from a mandatory list, never an automatic fallback (market
 *    ceiling). Admin bypass (fill-by-person) is recorded, not prevented.
 */

const { pool } = require('../db');
const { audit } = require('./auditLog');
const { httpError } = require('./routeKit');
const { fillVacancy } = require('./vacancyEngine');
const { canonicalCerts } = require('../constants/certs');
const { normalizeRank } = require('./staffingRules');
const {
  resetWindowStart, classify, orderCandidates, orderMandatory,
} = require('./hiringOrder');

const parseJson = (v, fb) => {
  if (Array.isArray(v) || (v && typeof v === 'object')) return v;
  try { return JSON.parse(v); } catch (_) { return fb; }
};

/** In-window balance + mandate count per member for a list. */
async function balances(departmentId, list, memberIds) {
  if (!memberIds.length) return {};
  const since = resetWindowStart(list, new Date().toISOString());
  const { rows } = await pool.query(
    `SELECT member_id,
            COALESCE(SUM(delta_hours), 0) AS balance,
            COUNT(*) FILTER (WHERE reason = 'mandate_hold') AS mandate_count
       FROM hiring_charge_ledger
      WHERE department_id = $1 AND list_id = $2 AND member_id = ANY($3) AND created_at >= $4
      GROUP BY member_id`,
    [departmentId, list.id, memberIds, since]);
  const out = {};
  for (const r of rows) out[String(r.member_id)] = { balance: Number(r.balance), mandateCount: Number(r.mandate_count) };
  return out;
}

/** Append a charge (append-only; the ledger physically refuses UPDATE/DELETE). */
async function charge(departmentId, listId, memberId, deltaHours, reason, sourceKind, sourceId, note, user) {
  const { rows } = await pool.query(
    `INSERT INTO hiring_charge_ledger
       (department_id, list_id, member_id, delta_hours, reason, source_kind, source_id, note, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [departmentId, listId, memberId, deltaHours, reason, sourceKind ?? null, sourceId ?? null, note ?? null, user?.id ?? null]);
  await audit(departmentId, user, 'create', 'hiring_charge_ledger', rows[0].id,
    { list_id: listId, member_id: memberId, delta_hours: deltaHours, reason });
  return rows[0];
}

/**
 * Build the at-the-moment snapshot for a list × vacancy: classify every list member
 * (eligible / disqualified / unavailable with reasons), order the eligibles, attach
 * factors + the fatigue ADVISORY flag (rode the board the previous local day).
 */
async function buildSnapshot(departmentId, list, vacancy) {
  const dateStr = typeof vacancy.shift_date === 'string'
    ? vacancy.shift_date.slice(0, 10)
    : new Date(vacancy.shift_date).toISOString().slice(0, 10);
  const prevDay = new Date(`${dateStr}T12:00:00Z`); prevDay.setUTCDate(prevDay.getUTCDate() - 1);
  const prevStr = prevDay.toISOString().slice(0, 10);

  const { rows: lm } = await pool.query(
    `SELECT hlm.member_id, hlm.manual_order, hlm.last_awarded_at,
            m.name, m.rank, m.status, m."hire_date", m.seniority_number
       FROM hiring_list_members hlm JOIN members m ON m.id = hlm.member_id
      WHERE hlm.department_id = $1 AND hlm.list_id = $2 AND m.department_id = $1`,
    [departmentId, list.id]);
  const ids = lm.map((r) => r.member_id);
  if (!ids.length) return { date: dateStr, candidates: [], excluded: [] };

  const [quals, leave, board, prevBoard, bal] = await Promise.all([
    pool.query(
      `SELECT member_id, cert_type FROM member_qualifications
        WHERE department_id = $1 AND member_id = ANY($2) AND status = 'active'
          AND (expiry_date IS NULL OR expiry_date = '' OR expiry_date >= $3)`,
      [departmentId, ids, dateStr]),
    pool.query(
      `SELECT "memberId" FROM leave_requests
        WHERE department_id = $1 AND status = 'Approved'
          AND "startDate" <= $2 AND "endDate" >= $2 AND "memberId" = ANY($3)`,
      [departmentId, dateStr, ids]),
    pool.query(
      `SELECT DISTINCT member_id FROM apparatus_assignments
        WHERE department_id = $1 AND date = $2 AND member_id = ANY($3)`,
      [departmentId, dateStr, ids]),
    pool.query(
      `SELECT DISTINCT member_id FROM apparatus_assignments
        WHERE department_id = $1 AND date = $2 AND member_id = ANY($3)`,
      [departmentId, prevStr, ids]),
    balances(departmentId, list, ids),
  ]);

  const certsBy = {};
  for (const q of quals.rows) (certsBy[String(q.member_id)] = certsBy[String(q.member_id)] || []).push(q.cert_type);
  const onLeave = new Set(leave.rows.map((r) => String(r.memberId)));
  const onBoard = new Set(board.rows.map((r) => String(r.member_id)));
  const prevSet = new Set(prevBoard.rows.map((r) => String(r.member_id)));

  const req = {
    targetRank: list.target_rank || '',
    requiredCerts: canonicalCerts(parseJson(list.required_certs, [])),
    vacancyCerts: canonicalCerts(parseJson(vacancy.required_certs, [])),
  };

  const eligible = []; const excluded = [];
  for (const m of lm) {
    const k = String(m.member_id);
    const verdict = classify(
      { active: m.status === 'Active', rank: m.rank, certs: certsBy[k] || [],
        onLeave: onLeave.has(k), onBoard: onBoard.has(k) },
      req, normalizeRank);
    if (verdict) { excluded.push({ memberId: m.member_id, name: m.name, ...verdict }); continue; }
    eligible.push({
      member_id: m.member_id, name: m.name, rank: m.rank,
      hire_date: m.hire_date, seniority_number: m.seniority_number,
      manual_order: m.manual_order, last_awarded_at: m.last_awarded_at,
      balance: (bal[k] || {}).balance || 0,
      mandateCount: (bal[k] || {}).mandateCount || 0,
      fatigueAdvisory: prevSet.has(k),        // advisory flag, never a filter (OF doctrine)
    });
  }

  const ordered = list.list_type === 'mandatory' ? orderMandatory(eligible) : orderCandidates(eligible, list);
  return { date: dateStr, candidates: ordered, excluded };
}

/** Best-effort in-app inbox note for an offered member (skipped silently if unlinked). */
async function notifyMember(departmentId, memberId, subject, body) {
  try {
    const u = await pool.query(
      `SELECT u.username FROM members m JOIN users u ON u.id = m.user_id
        WHERE m.id = $1 AND m.department_id = $2 LIMIT 1`, [memberId, departmentId]);
    if (!u.rows.length) return;
    await pool.query(
      `INSERT INTO messages (station_id, from_id, from_name, from_username, to_username, subject, body)
       VALUES ($1, NULL, 'OpenFirehouse', 'system', $2, $3, $4)`,
      [departmentId, u.rows[0].username, subject, body]);
  } catch (_) { /* notification is best-effort; the offer row is the record */ }
}

async function mintOffer(departmentId, event, list, candidate) {
  const expiresAt = new Date(Date.now() + (list.offer_window_minutes || 30) * 60000).toISOString();
  const { rows } = await pool.query(
    `INSERT INTO hiring_offers
       (department_id, event_id, member_id, position_in_list, expires_at, channel)
     VALUES ($1,$2,$3,$4,$5,'in_app')
     ON CONFLICT (event_id, member_id) DO NOTHING RETURNING *`,
    [departmentId, event.id, candidate.member_id, candidate.position, expiresAt]);
  if (rows.length) {
    await notifyMember(departmentId, candidate.member_id, 'Overtime offer',
      `You have an open overtime offer (vacancy #${event.vacancy_id}). Respond from My Portal → OT Offers before it expires.`);
  }
  return rows[0] || null;
}

/** Open a hiring event on a live vacancy. The unique index makes a second live event 409. */
async function openEvent(departmentId, vacancyId, listId, mode, user) {
  const vac = await pool.query(
    `SELECT * FROM vacancies WHERE id = $1 AND department_id = $2 AND status IN ('open','offering')`,
    [vacancyId, departmentId]);
  if (!vac.rows.length) throw httpError(409, 'Vacancy is not open.', 'VACANCY_NOT_OPEN');
  const list = await pool.query(
    `SELECT * FROM hiring_lists WHERE id = $1 AND department_id = $2 AND active = TRUE`,
    [listId, departmentId]);
  if (!list.rows.length) throw httpError(404, 'Hiring list not found or inactive.', 'LIST_NOT_FOUND');

  const snapshot = await buildSnapshot(departmentId, list.rows[0], vac.rows[0]);
  if (!snapshot.candidates.length && !snapshot.excluded.length) {
    throw httpError(422, 'The list has no members — add members before hiring from it.', 'EMPTY_LIST');
  }

  let event;
  try {
    const { rows } = await pool.query(
      `INSERT INTO hiring_events
         (department_id, vacancy_id, list_id, mode, list_snapshot, started_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [departmentId, vacancyId, listId, mode, JSON.stringify(snapshot), user?.id ?? null]);
    event = rows[0];
  } catch (e) {
    if (e.code === '23505') throw httpError(409, 'A hiring run is already open for this vacancy.', 'EVENT_ALREADY_OPEN');
    throw e;
  }
  await pool.query(`UPDATE vacancies SET status = 'offering', updated_at = NOW()
                     WHERE id = $1 AND department_id = $2 AND status = 'open'`, [vacancyId, departmentId]);
  await audit(departmentId, user, 'create', 'hiring_events', event.id,
    { vacancy_id: vacancyId, list_id: listId, mode, candidates: snapshot.candidates.length, excluded: snapshot.excluded.length });

  // Mandatory lists take NO offers — the mandate act is explicit (human-triggered).
  if (list.rows[0].list_type === 'voluntary' && snapshot.candidates.length) {
    if (mode === 'blast') {
      for (const c of snapshot.candidates) await mintOffer(departmentId, event, list.rows[0], c);
    } else {
      await mintOffer(departmentId, event, list.rows[0], snapshot.candidates[0]);
    }
  }
  return event;
}

/**
 * Lazy advance: expire overdue pending offers (charging if configured) and, in sequential
 * mode, mint the next offer. Runs on event reads and member actions — no cron. An expired
 * offer remains acceptable while the event is open (the documented late-accept rule); its
 * 'expired' outcome records that the window lapsed.
 */
async function advanceEvent(departmentId, eventId, user = null) {
  const ev = await pool.query(
    `SELECT e.*, l.list_type, l.offer_window_minutes, l.charge_expired, l.charge_refused, l.charge_worked
       FROM hiring_events e JOIN hiring_lists l ON l.id = e.list_id
      WHERE e.id = $1 AND e.department_id = $2`, [eventId, departmentId]);
  if (!ev.rows.length) throw httpError(404, 'Hiring event not found.', 'EVENT_NOT_FOUND');
  const event = ev.rows[0];
  if (event.status !== 'open') return event;

  const vacHours = await pool.query(
    `SELECT COALESCE(hours, 24) AS hours FROM vacancies WHERE id = $1 AND department_id = $2`,
    [event.vacancy_id, departmentId]);
  const hours = Number(vacHours.rows[0]?.hours ?? 24);

  // Expire overdue pending offers (charge-once via the charged flag in the same UPDATE).
  const { rows: expired } = await pool.query(
    `UPDATE hiring_offers SET outcome = 'expired', outcome_at = NOW(),
            charged = CASE WHEN $3 THEN TRUE ELSE charged END
      WHERE event_id = $1 AND department_id = $2 AND outcome = 'pending'
        AND expires_at IS NOT NULL AND expires_at < NOW() AND charged = FALSE
      RETURNING id, member_id`,
    [eventId, departmentId, event.charge_expired === true]);
  if (event.charge_expired) {
    for (const o of expired) {
      await charge(departmentId, event.list_id, o.member_id, hours, 'expired', 'hiring_offer', o.id, null, user);
    }
  }

  // Sequential: mint the next un-offered candidate when nothing is pending.
  if (event.mode === 'sequential' && event.list_type === 'voluntary') {
    const pending = await pool.query(
      `SELECT 1 FROM hiring_offers WHERE event_id = $1 AND outcome = 'pending' LIMIT 1`, [eventId]);
    if (!pending.rows.length) {
      const snapshot = parseJson(event.list_snapshot, { candidates: [] });
      const offeredRes = await pool.query(
        `SELECT member_id FROM hiring_offers WHERE event_id = $1`, [eventId]);
      const offered = new Set(offeredRes.rows.map((r) => String(r.member_id)));
      const next = (snapshot.candidates || []).find((c) => !offered.has(String(c.member_id)));
      if (next) {
        const list = await pool.query(`SELECT * FROM hiring_lists WHERE id = $1`, [event.list_id]);
        await mintOffer(departmentId, event, list.rows[0], next);
      } else {
        // List exhausted with no accept: STOP AND REPORT (never auto-mandate).
        const { rows } = await pool.query(
          `UPDATE hiring_events SET status = 'exhausted', closed_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND department_id = $2 AND status = 'open' RETURNING *`,
          [eventId, departmentId]);
        if (rows.length) {
          await audit(departmentId, user, 'update', 'hiring_events', eventId, { action: 'exhausted' });
          return rows[0];
        }
      }
    }
  }
  const fresh = await pool.query(
    `SELECT * FROM hiring_events WHERE id = $1 AND department_id = $2`, [eventId, departmentId]);
  return fresh.rows[0];
}

/**
 * Member accepts their own offer. The EVENT-status guarded UPDATE is the atomic
 * single-winner gate (the 1.3/1.4 claim pattern); the award then goes through the ONE
 * vacancy fill door. Late accept on an expired offer is allowed while the event is open.
 */
async function acceptOffer(departmentId, offerId, memberId, user) {
  const o = await pool.query(
    `SELECT ho.*, e.status AS event_status, e.vacancy_id, e.list_id,
            l.charge_worked
       FROM hiring_offers ho
       JOIN hiring_events e ON e.id = ho.event_id
       JOIN hiring_lists l ON l.id = e.list_id
      WHERE ho.id = $1 AND ho.department_id = $2`, [offerId, departmentId]);
  if (!o.rows.length) throw httpError(404, 'Offer not found.', 'OFFER_NOT_FOUND');
  const offer = o.rows[0];
  if (String(offer.member_id) !== String(memberId)) {
    throw httpError(403, 'You can only respond to your own offer.', 'NOT_YOUR_OFFER');
  }
  if (!['pending', 'expired'].includes(offer.outcome) || offer.event_status !== 'open') {
    throw httpError(409, 'This offer is no longer open.', 'OFFER_CLOSED');
  }

  // Atomic single-winner: exactly one accept flips the event.
  const won = await pool.query(
    `UPDATE hiring_events SET status = 'awarded', award_method = 'accepted',
            awarded_member_id = $1, closed_at = NOW(), updated_at = NOW()
      WHERE id = $2 AND department_id = $3 AND status = 'open' RETURNING *`,
    [memberId, offer.event_id, departmentId]);
  if (!won.rows.length) throw httpError(409, 'The vacancy was already awarded.', 'ALREADY_AWARDED');

  await pool.query(
    `UPDATE hiring_offers SET outcome = 'accepted', outcome_at = NOW() WHERE id = $1`, [offerId]);
  await pool.query(
    `UPDATE hiring_offers SET outcome = 'superseded', outcome_at = NOW()
      WHERE event_id = $1 AND id != $2 AND outcome IN ('pending','expired')`,
    [offer.event_id, offerId]);

  // THE fill door (writes the riding board in the same request txn + audits the vacancy).
  const vac = await fillVacancy(departmentId, offer.vacancy_id,
    { memberId, method: 'accepted_offer' }, user);

  if (offer.charge_worked) {
    const hours = Number(vac.hours ?? 24);
    const upd = await pool.query(
      `UPDATE hiring_offers SET charged = TRUE WHERE id = $1 AND charged = FALSE RETURNING id`, [offerId]);
    if (upd.rows.length) {
      await charge(departmentId, offer.list_id, memberId, hours, 'worked', 'hiring_offer', offerId, null, user);
    }
  }
  await pool.query(
    `UPDATE hiring_list_members SET last_awarded_at = NOW()
      WHERE list_id = $1 AND member_id = $2`, [offer.list_id, memberId]);
  await audit(departmentId, user, 'update', 'hiring_events', offer.event_id,
    { action: 'accepted', member_id: memberId, offer_id: offerId });
  return { event: won.rows[0], vacancy: vac };
}

/** Member declines their own offer. Charged only if the list says refusals charge. */
async function declineOffer(departmentId, offerId, memberId, user) {
  const o = await pool.query(
    `SELECT ho.*, e.status AS event_status, e.list_id AS event_list_id, e.vacancy_id,
            l.charge_refused
       FROM hiring_offers ho
       JOIN hiring_events e ON e.id = ho.event_id
       JOIN hiring_lists l ON l.id = e.list_id
      WHERE ho.id = $1 AND ho.department_id = $2`, [offerId, departmentId]);
  if (!o.rows.length) throw httpError(404, 'Offer not found.', 'OFFER_NOT_FOUND');
  const offer = o.rows[0];
  if (String(offer.member_id) !== String(memberId)) {
    throw httpError(403, 'You can only respond to your own offer.', 'NOT_YOUR_OFFER');
  }
  if (offer.outcome !== 'pending' || offer.event_status !== 'open') {
    throw httpError(409, 'This offer is no longer open.', 'OFFER_CLOSED');
  }
  // Charge-once: the charged flag flips in the SAME statement as the outcome transition,
  // and the ledger entry only posts when this UPDATE actually claimed the row.
  const upd = await pool.query(
    `UPDATE hiring_offers SET outcome = 'declined', outcome_at = NOW(),
            charged = CASE WHEN $2 THEN TRUE ELSE charged END
      WHERE id = $1 AND outcome = 'pending' RETURNING *`,
    [offerId, offer.charge_refused === true]);
  if (!upd.rows.length) throw httpError(409, 'This offer is no longer open.', 'OFFER_CLOSED');
  if (offer.charge_refused && offer.charged !== true) {
    const vacHours = await pool.query(
      `SELECT COALESCE(hours, 24) AS hours FROM vacancies WHERE id = $1 AND department_id = $2`,
      [offer.vacancy_id, departmentId]);
    await charge(departmentId, offer.event_list_id, offer.member_id,
      Number(vacHours.rows[0]?.hours ?? 24), 'refused', 'hiring_offer', offer.id, null, user);
  }
  await audit(departmentId, user, 'update', 'hiring_offers', offer.id, { action: 'declined' });
  await advanceEvent(departmentId, offer.event_id, user);
  return upd.rows[0];
}

/** Officer skips the current offer with a recorded reason; sequential advances. */
async function skipOffer(departmentId, offerId, reason, user) {
  const { rows } = await pool.query(
    `UPDATE hiring_offers SET outcome = 'skipped', outcome_at = NOW(), outcome_note = $1
      WHERE id = $2 AND department_id = $3 AND outcome = 'pending' RETURNING *`,
    [reason, offerId, departmentId]);
  if (!rows.length) throw httpError(409, 'Offer is not pending.', 'OFFER_CLOSED');
  await audit(departmentId, user, 'update', 'hiring_offers', rows[0].id,
    { action: 'skipped', reason, member_id: rows[0].member_id });
  await advanceEvent(departmentId, rows[0].event_id, user);
  return rows[0];
}

/**
 * Mandate (human-triggered, mandatory lists only, qualification-checked — matching quals
 * on the mandatory path exceeds the documented mid-tier gap and no ceiling). Awards via
 * the fill door with award_method 'mandate'; charges mandate_hold + worked hours.
 */
async function mandate(departmentId, eventId, memberId, user) {
  const ev = await pool.query(
    `SELECT e.*, l.list_type, l.charge_worked FROM hiring_events e
       JOIN hiring_lists l ON l.id = e.list_id
      WHERE e.id = $1 AND e.department_id = $2`, [eventId, departmentId]);
  if (!ev.rows.length) throw httpError(404, 'Hiring event not found.', 'EVENT_NOT_FOUND');
  const event = ev.rows[0];
  if (event.list_type !== 'mandatory') {
    throw httpError(422, 'Mandate is only available on a mandatory list.', 'NOT_MANDATORY_LIST');
  }
  const snapshot = parseJson(event.list_snapshot, { candidates: [] });
  const cand = (snapshot.candidates || []).find((c) => String(c.member_id) === String(memberId));
  if (!cand) {
    throw httpError(422, 'Member is not an eligible candidate in this mandate list snapshot.', 'NOT_ELIGIBLE');
  }

  const won = await pool.query(
    `UPDATE hiring_events SET status = 'awarded', award_method = 'mandate',
            awarded_member_id = $1, closed_at = NOW(), updated_at = NOW()
      WHERE id = $2 AND department_id = $3 AND status = 'open' RETURNING *`,
    [memberId, eventId, departmentId]);
  if (!won.rows.length) throw httpError(409, 'The vacancy was already awarded.', 'ALREADY_AWARDED');

  const vac = await fillVacancy(departmentId, event.vacancy_id, { memberId, method: 'assigned' }, user);
  const hours = Number(vac.hours ?? 24);
  await charge(departmentId, event.list_id, memberId, hours, 'mandate_hold', 'hiring_event', eventId,
    'mandatory hold', user);
  if (event.charge_worked) {
    await charge(departmentId, event.list_id, memberId, hours, 'worked', 'hiring_event', eventId, null, user);
  }
  await pool.query(
    `UPDATE hiring_list_members SET last_awarded_at = NOW() WHERE list_id = $1 AND member_id = $2`,
    [event.list_id, memberId]);
  await audit(departmentId, user, 'update', 'hiring_events', eventId,
    { action: 'mandate', member_id: memberId });
  return { event: won.rows[0], vacancy: vac };
}

/** Cancel an open event with a recorded reason. Open offers become superseded. */
async function cancelEvent(departmentId, eventId, reason, user) {
  const { rows } = await pool.query(
    `UPDATE hiring_events SET status = 'cancelled', cancelled_reason = $1, closed_at = NOW(), updated_at = NOW()
      WHERE id = $2 AND department_id = $3 AND status = 'open' RETURNING *`,
    [reason, eventId, departmentId]);
  if (!rows.length) throw httpError(409, 'Event is not open.', 'EVENT_CLOSED');
  await pool.query(
    `UPDATE hiring_offers SET outcome = 'superseded', outcome_at = NOW()
      WHERE event_id = $1 AND outcome IN ('pending','expired')`, [eventId]);
  await pool.query(
    `UPDATE vacancies SET status = 'open', updated_at = NOW()
      WHERE id = $1 AND department_id = $2 AND status = 'offering'`, [rows[0].vacancy_id, departmentId]);
  await audit(departmentId, user, 'update', 'hiring_events', eventId, { action: 'cancelled', reason });
  return rows[0];
}

/**
 * Bypass hook — called by the vacancies fill route AFTER a by-person fill succeeds:
 * any still-open hiring event for that vacancy closes as 'assigned_bypass' (recorded,
 * not prevented — the market ceiling). The accept path's own event is already 'awarded'.
 */
async function closeOpenEventsAsBypass(departmentId, vacancyId, memberId, user) {
  const { rows } = await pool.query(
    `UPDATE hiring_events SET status = 'awarded', award_method = 'assigned_bypass',
            awarded_member_id = $1, closed_at = NOW(), updated_at = NOW()
      WHERE department_id = $2 AND vacancy_id = $3 AND status = 'open' RETURNING id`,
    [memberId, departmentId, vacancyId]);
  for (const r of rows) {
    await pool.query(
      `UPDATE hiring_offers SET outcome = 'superseded', outcome_at = NOW()
        WHERE event_id = $1 AND outcome IN ('pending','expired')`, [r.id]);
    await audit(departmentId, user, 'update', 'hiring_events', r.id,
      { action: 'assigned_bypass', member_id: memberId });
  }
  return rows.length;
}

module.exports = {
  balances, charge, buildSnapshot, openEvent, advanceEvent,
  acceptOffer, declineOffer, skipOffer, mandate, cancelEvent, closeOpenEventsAsBypass,
};
