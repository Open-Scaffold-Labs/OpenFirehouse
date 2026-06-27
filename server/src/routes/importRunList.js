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
      const ins = await client.query(
        `INSERT INTO apparatus (designation, type, year, station_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
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
        `INSERT INTO members ("memberNumber", name, rank, role, joined, status, station_id)
         VALUES ($1, $2, $3, $4, $5, 'Active', $6) RETURNING id`,
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
        position_id: null,
        position_name: position,
      });
    }

    // ── write the run_lists snapshot (upsert by station+date) ─────────────────
    const payload = {
      date,
      crew,
      shift_label: shiftLabel,
      submitted_at: new Date().toISOString(),
      source: 'import',
    };
    await client.query(
      `INSERT INTO run_lists (station_id, date, payload, submitted_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (station_id, date)
         DO UPDATE SET payload = EXCLUDED.payload, submitted_at = NOW()`,
      [stationId, date, JSON.stringify(payload)]);

      return {
        date,
        crew: crew.length,
        apparatusCreated,
        membersCreated,
        units: [...new Set(rows.map((r) => r.unit))].length,
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
