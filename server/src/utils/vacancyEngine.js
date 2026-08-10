'use strict';
/**
 * utils/vacancyEngine.js — the ONE DOOR for vacancy lifecycle transitions (Phase 1.4).
 * Spec: docs/PHASE1-VACANCY-SPEC-2026-07-25.md §3/§4. Migration 0080.
 *
 * Doctrine (the fi-suite lesson, generalized): vacancy status is engine-owned. No route
 * PATCHes `status` raw; minting, filling, cancelling, and expiring all come through here
 * so the guards (idempotent mint, atomic single-winner fill, terminal-status finality,
 * audit rows) cannot be bypassed by a second writer. The 1.5 hiring engine plugs into
 * fillVacancy() — it does not get its own door.
 *
 * Market ceilings honored: filling NEVER auto-commits a person without a human action
 * (an accept or a command assignment); cancellation requires a recorded reason; nothing
 * here hard-blocks command from running short.
 */

const { pool } = require('../db');
const { audit } = require('./auditLog');
const { httpError } = require('./routeKit');

const LIVE_STATUSES = ['open', 'offering'];

/** Per-department vacancy posture (0080 columns; fail-open to the defaults). */
async function getVacancyConfig(departmentId) {
  try {
    const r = await pool.query(
      'SELECT vacancy_auto_open, vacancy_split_allowed FROM departments WHERE id = $1',
      [departmentId]);
    const row = r.rows[0] || {};
    return {
      autoOpen: row.vacancy_auto_open !== false,        // default TRUE (high-end market norm)
      splitAllowed: row.vacancy_split_allowed === true, // default FALSE (opt-in, market norm)
    };
  } catch (_) {
    return { autoOpen: true, splitAllowed: false };
  }
}

/**
 * Mint one vacancy. Idempotent per causing record: the partial unique index
 * uq_vacancies_live_cause makes a re-mint of the same live cause a no-op (returns null),
 * race-proof at the DB rather than by check-then-write.
 */
async function mintVacancy(departmentId, v, user = null) {
  const { rows } = await pool.query(
    `INSERT INTO vacancies
       (department_id, station_id, shift_date, shift_id, apparatus_id, position_id,
        position_name, required_rank, required_certs, start_ts, end_ts, hours,
        cause, cause_kind, cause_id, priority, status, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'open',$17)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [departmentId, v.station_id ?? null, v.shift_date, v.shift_id ?? null,
     v.apparatus_id ?? null, v.position_id ?? null, v.position_name || '',
     v.required_rank || '', JSON.stringify(Array.isArray(v.required_certs) ? v.required_certs : []),
     v.start_ts ?? null, v.end_ts ?? null, v.hours ?? null,
     v.cause, v.cause_kind ?? null, v.cause_id ?? null,
     v.priority ?? 2, user?.id ?? null]
  );
  const row = rows[0] || null;
  if (row) {
    await audit(departmentId, user, 'create', 'vacancies', row.id,
      { cause: row.cause, cause_kind: row.cause_kind, cause_id: row.cause_id,
        shift_date: row.shift_date, position: row.position_name, priority: row.priority });
  }
  return row;
}

/**
 * Auto-mint vacancies for the coverage gaps an absence created (the leave-approval path).
 * `impact.shifts` is analyzeCoverageImpact output; only shifts flagged needsCoverage mint.
 * Honors the per-dept vacancy_auto_open posture (both market postures exist: auto-mint is
 * the high-end default; a dept that wants officer-decides-only turns it off and the
 * coverage view still shows the shortfall — detection and minting are decoupled there).
 */
async function mintForCoverageGaps(departmentId, cause, causeKind, causeId, impact, shiftsById = {}, user = null) {
  const cfg = await getVacancyConfig(departmentId);
  if (!cfg.autoOpen) return { minted: 0, skipped: 'auto_open_off' };
  let minted = 0;
  for (const s of (impact?.shifts || [])) {
    if (!s.needsCoverage) continue;
    const shift = shiftsById[String(s.shiftId)] || {};
    const row = await mintVacancy(departmentId, {
      shift_date: s.date,
      shift_id: s.shiftId ?? null,
      position_name: '',                       // shift-level hole; seat-level context is manual/1.5
      hours: shift.__tourHours ?? null,
      cause, cause_kind: causeKind, cause_id: causeId,
      priority: s.critical ? 1 : 2,
    }, user);
    if (row) minted++;
  }
  return { minted };
}

/**
 * Atomic single-winner fill. Guarded UPDATE — the second concurrent fill loses at the DB
 * (0 rows) and surfaces as 409, never a double award (the 1.3 claim pattern). Writes the
 * riding-board assignment in the SAME request transaction (P5) so a fill is board-visible
 * or not-at-all, then audits.
 */
async function fillVacancy(departmentId, vacancyId, { memberId, method = 'assigned' } = {}, user = null) {
  const { rows } = await pool.query(
    `UPDATE vacancies
        SET status = 'filled', filled_by_member_id = $1, filled_at = NOW(),
            fill_method = $2, updated_at = NOW()
      WHERE id = $3 AND department_id = $4 AND status = ANY($5)
      RETURNING *`,
    [memberId, method, vacancyId, departmentId, LIVE_STATUSES]
  );
  if (!rows.length) {
    throw httpError(409, 'Vacancy is not open (already filled, cancelled, or expired).', 'VACANCY_NOT_OPEN');
  }
  const vac = rows[0];

  // Board write: a filled vacancy IS an on-duty assignment. Seat-context vacancies land on
  // the seat (race-proof seat upsert, uq_apparatus_assignments_seat); shift-level ones land
  // as a seatless-but-on-duty row (apparatus_id NULL always inserts — the 0070 model).
  const dateStr = typeof vac.shift_date === 'string'
    ? vac.shift_date.slice(0, 10)
    : new Date(vac.shift_date).toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO apparatus_assignments
       (department_id, station_id, date, member_id, position_name, apparatus_id, position_id,
        status, start_time, end_time, hours, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'on_duty',$8,$9,$10,$11)
     ON CONFLICT (department_id, date, apparatus_id, position_name)
     DO UPDATE SET member_id = EXCLUDED.member_id, status = EXCLUDED.status,
                   start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
                   hours = EXCLUDED.hours, notes = EXCLUDED.notes`,
    [departmentId, vac.station_id ?? null, dateStr, memberId,
     vac.position_name || '', vac.apparatus_id ?? null, vac.position_id ?? null,
     vac.start_ts ? new Date(vac.start_ts).toISOString().slice(11, 16) : '08:00',
     vac.end_ts ? new Date(vac.end_ts).toISOString().slice(11, 16) : '08:00',
     vac.hours != null ? vac.hours : 24,
     `Vacancy #${vac.id} fill (${method})`]
  );

  await audit(departmentId, user, 'update', 'vacancies', vac.id,
    { action: 'fill', member_id: memberId, method });
  return vac;
}

/** Cancel (terminal). Requires a recorded reason — a withdrawn hiring event is still a record. */
async function cancelVacancy(departmentId, vacancyId, reason, user = null) {
  const { rows } = await pool.query(
    `UPDATE vacancies
        SET status = 'cancelled', cancelled_reason = $1, updated_at = NOW()
      WHERE id = $2 AND department_id = $3 AND status = ANY($4)
      RETURNING *`,
    [reason, vacancyId, departmentId, LIVE_STATUSES]
  );
  if (!rows.length) {
    throw httpError(409, 'Vacancy is not open (already filled, cancelled, or expired).', 'VACANCY_NOT_OPEN');
  }
  await audit(departmentId, user, 'update', 'vacancies', rows[0].id,
    { action: 'cancel', reason });
  return rows[0];
}

module.exports = {
  LIVE_STATUSES, getVacancyConfig, mintVacancy, mintForCoverageGaps, fillVacancy, cancelVacancy,
};
