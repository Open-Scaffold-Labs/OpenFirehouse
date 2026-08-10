'use strict';
/**
 * routes/importRunList.js — POST /api/import/run-list
 *
 * Imports a parsed run-list roster (rows of { Unit, Position, Name, Rank }, from
 * a PDF / CSV / Excel / paste via the Data Import wizard) and produces a fully
 * staffed daily run list.
 *
 * It does three things in ONE transaction (all-or-nothing):
 *   1. Upsert apparatus by designation (infer type; never duplicate).
 *   2. Upsert members by normalized name (generate a fresh memberNumber).
 *   3. Write the run_lists snapshot for (station_id, date) — the exact
 *      { date, crew[] } shape the Run List board + TV render from.
 *
 * Safety (see audits/ + the game plan):
 *   - requireAuth is applied globally in index.js; station_id always comes from
 *     req.user.department_id, never the body (no cross-station writes).
 *   - Parameterized queries only; single DB transaction with ROLLBACK on error.
 *   - Idempotent: re-running upserts by natural key and overwrites the snapshot.
 *   - Row cap + per-field length caps + string coercion.
 */
const express = require('express');
const router = express.Router();
const { pool, runInTransaction } = require('../db');
// 0066 fix: this was CALLED at the seat-resolve step but never required — every
// import request died with a ReferenceError inside the transaction (rolled back,
// so no data harm, but the feature was dead). Same resolver the run-list board uses.
const { resolveCrewSeats } = require('../utils/resolveCrewSeats');
// 1.1b consolidation: assignments are the store of record; the snapshot is
// DERIVED from them by the same one-brain helper POST /api/run-list uses.
const { publishSnapshot, resolveRosterStation } = require('../utils/runListPublish');

const MAX_ROWS = 500;
const MAX_LEN = 120;

const s = (v) => String(v == null ? '' : v).trim().slice(0, MAX_LEN);
const normName = (v) => s(v).toLowerCase().replace(/\s+/g, ' ');
const normDesig = (v) => s(v).toLowerCase().replace(/\s+/g, ' ');

function localDateOr(today) {
  return /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today : null;
}
function serverLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Infer an apparatus `type` from its designation (free-text, best-effort).
function inferType(designation) {
  const d = (designation || '').toLowerCase();
  if (/\bengine\b|^e ?\d/.test(d)) return 'Engine';
  if (/truck|ladder|tower|quint|aerial/.test(d)) return 'Ladder';
  if (/battalion|command|\bcar\b|chief|deputy/.test(d)) return 'Command';
  if (/squad|\brescue\b/.test(d)) return 'Rescue';
  if (/tanker|tender/.test(d)) return 'Tanker';
  if (/medic|ambulance|\bems\b/.test(d)) return 'Medic';
  if (/brush|grass|wildland/.test(d)) return 'Brush';
  if (/utility|support/.test(d)) return 'Utility';
  return 'Other';
}

// Derive a member rank if the row didn't carry one.
function deriveRank(position) {
  const p = (position || '').toLowerCase();
  if (p.includes('battalion chief')) return 'Battalion Chief';
  if (p.includes('captain')) return 'Captain';
  if (p.includes('lieutenant')) return 'Lieutenant';
  if (p.includes('chief')) return 'Chief';
  if (p.includes('driver') || p.includes('engineer') || p.includes('operator')) return 'Driver/Engineer';
  return 'Firefighter';
}

// Normalize a position so the board's command-staff bucket (which keys on
// position.includes('battalion')) co-locates the BC and the BC aide.
function normalizePosition(unit, position) {
  const u = (unit || '').toLowerCase();
  const p = (position || '').trim();
  if (/battalion|command|\bcar\b/.test(u)) {
    // The BC goes to command staff (board keys command on position "battalion").
    // The aide must NOT match that — otherwise the command section (fixed
    // B/C / D/C / Chief slots) drops him; as "BC Aide" he rides the Battalion
    // unit card and stays visible.
    if (/aide/i.test(p)) return 'BC Aide';
    if (/chief|^bc$/i.test(p) || p === '') return 'Battalion Chief';
  }
  return p || 'Firefighter';
}

router.post('/', require('../middleware/requireRole').requireChief, async (req, res) => {
  const stationId = req.user.department_id;                       // from token, never body
  const date = localDateOr(req.body && req.body.date) || serverLocalDate();
  const shiftLabel = s((req.body && req.body.shiftLabel) || '');

  const rawRows = Array.isArray(req.body && req.body.rows) ? req.body.rows : null;
  if (!rawRows) return res.status(400).json({ error: 'rows[] is required' });

  // Sanitize + keep only rows with a unit and a name.
  const rows = rawRows.slice(0, MAX_ROWS).map((r) => ({
    unit: s(r.Unit ?? r.unit),
    position: s(r.Position ?? r.position),
    name: s(r.Name ?? r.name),
    rank: s(r.Rank ?? r.rank),
  })).filter((r) => r.unit && r.name);

  if (rows.length === 0) {
    return res.status(400).json({ error: 'No valid rows — each row needs a Unit and a Name.' });
  }

  try {
    const summary = await runInTransaction(async (client) => {

    // ── apparatus cache (designation→id), upsert missing ──────────────────────
    const appRes = await client.query(
      'SELECT id, designation FROM apparatus WHERE department_id = $1', [stationId]);
    const appByDesig = new Map(appRes.rows.map((a) => [normDesig(a.designation), a.id]));
    let apparatusCreated = 0;

    async function upsertApparatus(unit) {
      const key = normDesig(unit);
      if (appByDesig.has(key)) return appByDesig.get(key);
      // 0066: department_id written EXPLICITLY. Relying on the sync trigger to
      // derive it from station_id is the cross-tenant corruption path (the value
      // in stationId here is the DEPARTMENT id, not a station id).
      // station_id is written as explicit NULL — the column DEFAULTs to 1, which
      // would tag every imported rig with another department's house.
      const ins = await client.query(
        `INSERT INTO apparatus (designation, type, year, department_id, station_id)
         VALUES ($1, $2, $3, $4, NULL) RETURNING id`,
        [unit, inferType(unit), new Date().getFullYear(), stationId]);
      const id = ins.rows[0].id;
      appByDesig.set(key, id);
      apparatusCreated++;
      return id;
    }

    // ── member cache (normName→id), upsert missing ────────────────────────────
    const memRes = await client.query(
      'SELECT id, name FROM members WHERE department_id = $1', [stationId]);
    const memByName = new Map(memRes.rows.map((m) => [normName(m.name), m.id]));

    // next memberNumber after the current max M-### (across all stations, since
    // "memberNumber" is globally UNIQUE)
    const numRes = await client.query(
      `SELECT "memberNumber" AS n FROM members WHERE "memberNumber" ~ '^M-[0-9]+$'`);
    let maxNum = 0;
    for (const row of numRes.rows) {
      const m = /^M-(\d+)$/.exec(row.n);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
    let membersCreated = 0;

    async function upsertMember(name, rank, position) {
      const key = normName(name);
      if (memByName.has(key)) return memByName.get(key);
      maxNum += 1;
      const memberNumber = `M-${String(maxNum).padStart(3, '0')}`;
      const finalRank = rank || deriveRank(position);
      const role = position || 'Firefighter';
      const ins = await client.query(
        `INSERT INTO members ("memberNumber", name, rank, role, joined, status, department_id, station_id)
         VALUES ($1, $2, $3, $4, $5, 'Active', $6, NULL) RETURNING id`,
        [memberNumber, name, finalRank, role, date, stationId]);
      const id = ins.rows[0].id;
      memByName.set(key, id);
      membersCreated++;
      return id;
    }

    // ── build crew[] (the exact shape the board/TV render) ────────────────────
    const crew = [];
    for (const r of rows) {
      const apparatusId = await upsertApparatus(r.unit);
      const memberId = await upsertMember(r.name, r.rank, r.position);
      const position = normalizePosition(r.unit, r.position);
      crew.push({
        member_id: memberId,
        member_name: r.name,
        member_rank: r.rank || deriveRank(r.position),
        apparatus_id: apparatusId,
        apparatus_name: r.unit,
        // position_id is resolved below — NOT hardcoded null any more.
        position_name: position,
      });
    }

    // ── RESOLVE EACH RIDER TO A REAL SEAT ────────────────────────────────────
    // This used to be `position_id: null`, hardcoded, on every row. The career
    // run-list overlay therefore filled ZERO seats while reporting mode:'career'.
    //
    // Same resolver the web run-list board uses (utils/resolveCrewSeats.js), so
    // both writers behave identically. A rider we cannot place keeps a NULL seat
    // and is REPORTED back to the importer — never guessed. A spreadsheet that
    // says "Firefighter" is telling us a RANK, not a seat, and we do not decide
    // which of three firefighters was on the nozzle.
    const seatRows = await client.query(
      'SELECT id, apparatus_id, position_name FROM apparatus_positions WHERE department_id = $1',
      [stationId]
    );
    const seatResult = resolveCrewSeats(crew, seatRows.rows);
    crew.length = 0;
    crew.push(...seatResult.crew);

    // ── consolidation (1.1b → 1.1c-a): assignments are the STORE OF RECORD ───
    // An import IS one day's riding board, keyed on (department, date). REPLACE
    // the (dept, date) board (so a re-import is idempotent — same rows in, same
    // board out), then PUBLISH the snapshot FROM those assignments: the exact
    // derivation POST /api/run-list uses (utils/runListPublish, one brain). No
    // phantom shift, no ambiguity — assignments carry the date directly. A
    // rotation link is not applicable to a date-based import, so shift_id is NULL.
    // 1.1c-b (0070): the board now also carries PAYROLL HOURS rows (daily_staffing was
    // folded in). A roster import restates SEAT assignments only — it must NEVER erase or
    // reattribute recorded tour hours. So delete only pure seat rows (hours IS NULL), and
    // guard the upsert so it can't overwrite the member on an hours-bearing seat.
    // 0072: an import IS one STATION's daily riding board. Resolve which station —
    // single-house → its one station; multi-house must name station_id (never guess).
    // The imported seat rows are stamped with that station so they land on the right
    // per-station board (and the published snapshot is keyed to it).
    const rosterStationId = await resolveRosterStation(client, stationId, req.body && req.body.station_id);
    if (rosterStationId == null) {
      const e = new Error('This department has multiple stations — specify station_id for the import');
      e.status = 400; e.code = 'STATION_REQUIRED';
      throw e;
    }
    await client.query(
      'DELETE FROM apparatus_assignments WHERE department_id = $1 AND station_id = $2 AND date = $3 AND hours IS NULL',
      [stationId, rosterStationId, date]);
    for (const c of crew) {
      // ON CONFLICT: the seat is unique per (dept, date, apparatus, position_name);
      // if the sheet lists the same seat twice, last rider wins (never a 500). The
      // WHERE guard leaves any hours-bearing row's member intact (no payroll reattribution).
      await client.query(
        `INSERT INTO apparatus_assignments (apparatus_id, position_id, member_id, department_id, station_id, position_name, date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (department_id, date, apparatus_id, position_name)
           DO UPDATE SET member_id = EXCLUDED.member_id, position_id = EXCLUDED.position_id, station_id = EXCLUDED.station_id
           WHERE apparatus_assignments.hours IS NULL`,
        [c.apparatus_id, c.position_id || null, c.member_id, stationId, rosterStationId, c.position_name || '', date]);
    }
    const published = await publishSnapshot(client, stationId, rosterStationId, date, { source: 'import', shiftLabel });

      return {
        date,
        crew: published.crew.length,
        apparatusCreated,
        membersCreated,
        units: [...new Set(rows.map((r) => r.unit))].length,
        // HOW MANY RIDERS ACTUALLY GOT A SEAT, and why the rest didn't.
        // The import used to report "35 crew imported ✓" while writing 35 NULL
        // seats. It looked like a success and delivered an empty run list to the
        // staffing board. The user is now told the truth.
        seating: {
          seated:   seatResult.seated,
          unseated: seatResult.unseated,
          issues:   seatResult.issues.slice(0, 50),
        },
      };
    });
    res.json({ data: summary });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[import/run-list] failed:', err && err.message);
    res.status(500).json({ error: 'Run list import failed' });
  }
});

module.exports = router;
