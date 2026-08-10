'use strict';
/**
 * utils/runListPublish.js — Phase 1.1b run-store consolidation (ONE brain).
 *
 * apparatus_assignments is the STORE OF RECORD for who rides which seat.
 * run_lists is now a DERIVED, published snapshot of it for a date. Both the
 * POST /api/run-list publish AND the CSV/PDF importer serialize the SAME
 * assignments through the SAME functions here — the two writers can no longer
 * disagree, because only one of them actually decides the crew (this file).
 *
 * The market model this matches: a live roster (the editable, shift-keyed
 * assignment state) + a published/finalized daily roster (a dated record of what
 * was posted). Nobody ships two independently-writable stores; the bug we are
 * closing is that run_lists used to be independently WRITABLE rather than
 * DERIVED.
 *
 * Day boundary = the shift's START date (Matt, 2026-07-22, LOCKED).
 *
 * Every function takes `exec` (a pg pool OR an in-transaction client) so the
 * importer can run the whole thing inside its one atomic transaction.
 */

// NOTE (1.1c-a, 2026-07-23): resolveShiftForDate — the phantom-shift auto-creator
// — is DELETED. The market's dated unit is the daily riding board keyed on
// (department, date), not a shift, so publishing a roster for a date needs no
// shift to exist (a rotation shift is an OPTIONAL provenance link, not a parent).
// The old SHIFT_AMBIGUOUS branch is gone with it: assignments are date-keyed, so
// there is nothing to disambiguate. See docs/PHASE1-SCHEDULING-SPEC §7.

// 2.1a (0072): the roster grain is PER STATION — (department, station, date). Each
// firehouse publishes its own daily riding board; a shared department-wide roster per
// date is not the market model and clobbers the moment a department runs a 2nd station.

/**
 * Resolve the station a roster operation targets, tenant-safely:
 *  - an explicit requestedStationId wins, but MUST belong to the department;
 *  - else, a single-house department resolves to its one station;
 *  - else (multi-house, no station given, or a bad/foreign station) → null, and the
 *    caller must reject (never guess a station in a multi-house department).
 * Returns a numeric station id or null.
 */
async function resolveRosterStation(exec, deptId, requestedStationId) {
  if (requestedStationId != null && requestedStationId !== '') {
    const v = await exec.query(
      'SELECT id FROM stations WHERE id = $1 AND department_id = $2',
      [Number(requestedStationId), deptId]);
    return v.rows.length ? v.rows[0].id : null;
  }
  const s = await exec.query('SELECT id FROM stations WHERE department_id = $1 ORDER BY id', [deptId]);
  return s.rows.length === 1 ? s.rows[0].id : null;
}

/**
 * The SINGLE crew-derivation: project a (department, station, date)'s
 * apparatus_assignments into the snapshot crew[] shape the run-list board, the TV,
 * and the incident staffing baseline already read. Keyed on (dept, STATION, date) —
 * one firehouse's riding board for the day. Assignments already carry a resolved
 * position_id, so this is a straight projection — no seat guessing.
 */
async function deriveCrewFromAssignments(exec, deptId, stationId, date) {
  const r = await exec.query(
    `SELECT aa.member_id, aa.apparatus_id, aa.position_id, aa.position_name,
            m.name AS member_name, m.rank AS member_rank, m.home_station_id,
            a.designation AS apparatus_name,
            hs.name AS home_station_name
       FROM apparatus_assignments aa
       JOIN members   m ON m.id = aa.member_id
       JOIN apparatus a ON a.id = aa.apparatus_id
       LEFT JOIN stations hs ON hs.id = m.home_station_id
      WHERE aa.department_id = $1 AND aa.station_id = $2 AND aa.date = $3
      ORDER BY a.designation, aa.position_name`, [deptId, stationId, date]);
  return r.rows.map((row) => ({
    member_id:      row.member_id,
    member_name:    row.member_name,
    member_rank:    row.member_rank,
    apparatus_id:   row.apparatus_id,
    apparatus_name: row.apparatus_name,
    position_id:    row.position_id,
    position_name:  row.position_name,
    // 2.2 detail/move-up: a rider whose home station differs from the station whose board
    // they're on today is working a DETAIL (from their home house). Home unknown → not a detail.
    home_station_id:   row.home_station_id ?? null,
    home_station_name: row.home_station_name || null,
    detailed: row.home_station_id != null && Number(row.home_station_id) !== Number(stationId),
  }));
}

/**
 * Publish (upsert) the derived snapshot for (dept, station, date), stamped with its
 * provenance (published_from_shift_id + source). run_lists is written in exactly one
 * shape, by exactly this function — the "one brain" guarantee — now per station.
 */
async function publishSnapshot(exec, deptId, stationId, date, opts = {}) {
  const source = opts.source || 'published';
  const crew = await deriveCrewFromAssignments(exec, deptId, stationId, date);
  // The rotation shift is an OPTIONAL provenance link — the id of the rotation
  // that generated this on-duty list, when one exists; NULL for a roster posted
  // directly on a date (volunteer / ad-hoc / imported).
  const rotationShiftId = opts.shiftId ?? null;
  const payload = {
    date,
    station_id: stationId,
    crew,
    shift_label: opts.shiftLabel || '',
    submitted_at: new Date().toISOString(),
    source,
    published_from_shift_id: rotationShiftId,
  };
  const r = await exec.query(
    `INSERT INTO run_lists (department_id, station_id, date, payload, submitted_at, published_from_shift_id, source)
     VALUES ($1, $2, $3, $4, NOW(), $5, $6)
     ON CONFLICT (department_id, station_id, date)
       DO UPDATE SET payload = EXCLUDED.payload, submitted_at = NOW(),
                     published_from_shift_id = EXCLUDED.published_from_shift_id,
                     source = EXCLUDED.source
     RETURNING id, station_id, date, submitted_at, published_from_shift_id, source`,
    [deptId, stationId, date, JSON.stringify(payload), rotationShiftId, source]);
  return { row: r.rows[0], crew };
}

module.exports = { deriveCrewFromAssignments, publishSnapshot, resolveRosterStation };
