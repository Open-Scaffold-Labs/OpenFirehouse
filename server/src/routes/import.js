'use strict';
/**
 * POST /api/import — batch import records for the caller's department.
 *   recordType: 'members' | 'incidents' | 'training' | 'apparatus' | 'assets'
 *   rows: [...]  (already mapped client-side; the server re-coerces + inserts)
 *
 * Hardened to match routes/importRunList.js (the reference implementation):
 *   - ONE transaction (runInTransaction → a single client; deadlock-safe under
 *     the max:1 pool — we NEVER call db.*.create here, which use the shared pool
 *     and would block; Lesson #12). The whole valid set is all-or-nothing: any
 *     DB error rolls everything back, so an import is never left half-applied.
 *   - Row cap + per-field length caps + string coercion.
 *   - IDEMPOTENT: each row is matched against existing rows by a per-type
 *     natural key; an already-present row is skipped (re-importing the same file
 *     never duplicates). Newly-inserted keys join the in-txn cache so duplicates
 *     within one payload are also collapsed.
 *   - Tenancy: station_id always comes from req.user.department_id (the
 *     trg_sync_department_id trigger backfills department_id); never the body.
 *
 * Invalid rows (missing required fields) are skipped and reported in `errors`;
 * they do not abort the batch. Response: { imported, failed, errors[] } where
 * `failed` counts every row not imported (invalid + already-existing), each with
 * a reason — preserving the prior response shape for the Data Import client.
 */
const express = require('express');
const router  = express.Router();
const { runInTransaction } = require('../db');
const { requireChief } = require('../middleware/requireRole');

const MAX_ROWS = 5000;
const F = (v, max = 240) => String(v == null ? '' : v).trim().slice(0, max); // short field
const T = (v) => String(v == null ? '' : v).trim().slice(0, 5000);          // long text (notes/narrative)
const norm = (v) => F(v).toLowerCase().replace(/\s+/g, ' ');
const toInt = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const toFloat = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const today = () => new Date().toISOString().slice(0, 10);

// ── Per-type handlers ────────────────────────────────────────────────────────
// Each: required(row)→errorString|null · load(client,deptId)→cache ·
//       existingId(cache,row)→id|null · insert(client,row,deptId,cache)→id
const TYPES = {
  members: {
    required: (r) => (F(r.firstName) || F(r.lastName) || F(r.name)) ? null
      : 'firstName, lastName, or name is required',
    async load(client, deptId) {
      const { rows } = await client.query('SELECT id, "memberNumber", name FROM members WHERE department_id = $1', [deptId]);
      const byName = new Map(); const byNum = new Map();
      for (const r of rows) {
        byName.set(norm(r.name), r.id);
        if (r.memberNumber) byNum.set(F(r.memberNumber).toLowerCase(), r.id);
      }
      // memberNumber high-water mark (it's globally unique across stations)
      const nr = await client.query(`SELECT "memberNumber" AS n FROM members WHERE "memberNumber" ~ '^M-[0-9]+$'`);
      let maxNum = 0;
      for (const row of nr.rows) { const m = /^M-(\d+)$/.exec(row.n); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); }
      return { byName, byNum, maxNum };
    },
    rowName: (r) => [F(r.firstName), F(r.lastName)].filter(Boolean).join(' ') || F(r.name),
    existingId(cache, r) {
      const mn = F(r.memberNumber).toLowerCase();
      if (mn && cache.byNum.has(mn)) return cache.byNum.get(mn);
      const nm = norm(this.rowName(r));
      return cache.byName.has(nm) ? cache.byName.get(nm) : null;
    },
    async insert(client, r, deptId, cache) {
      const name = this.rowName(r);
      let memberNumber = F(r.memberNumber);
      if (!memberNumber) { cache.maxNum += 1; memberNumber = `M-${String(cache.maxNum).padStart(3, '0')}`; }
      const ins = await client.query(
        `INSERT INTO members ("memberNumber",name,rank,role,joined,status,phone,email,address,"emergencyContactName",station_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [memberNumber, name, F(r.rank) || 'Firefighter', F(r.role) || 'member',
         F(r.hireDate) || F(r.joined) || today(), F(r.status) || 'Active',
         F(r.phone), F(r.email), F(r.address), F(r.emergencyContact || r.emergencyContactName), deptId]);
      const id = ins.rows[0].id;
      cache.byName.set(norm(name), id);
      cache.byNum.set(memberNumber.toLowerCase(), id);
      return id;
    },
  },

  incidents: {
    required: (r) => !F(r.incidentNumber) ? 'incidentNumber is required'
      : !F(r.date) ? 'date is required'
      : !F(r.type) ? 'type is required' : null,
    async load(client, deptId) {
      const { rows } = await client.query(
        'SELECT id, "incidentNumber" FROM incidents WHERE department_id = $1 AND deleted_at IS NULL', [deptId]);
      const byNumber = new Map(rows.map((r) => [F(r.incidentNumber).toLowerCase(), r.id]));
      return { byNumber };
    },
    existingId(cache, r) {
      const k = F(r.incidentNumber).toLowerCase();
      return cache.byNumber.has(k) ? cache.byNumber.get(k) : null;
    },
    async insert(client, r, deptId, cache) {
      const units = F(r.units)
        ? JSON.stringify(F(r.units).split(',').map((u) => u.trim()).filter(Boolean))
        : '[]';
      const ins = await client.query(
        `INSERT INTO incidents ("incidentNumber",date,time,type,"alarmLevel",address,units,personnel,disposition,injuries,notes,photos,station_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [F(r.incidentNumber), F(r.date), F(r.dispatchTime || r.time), F(r.type), F(r.alarmLevel) || 'Still',
         F(r.address), units, '[]', F(r.disposition), toInt(r.injuries), T(r.narrative || r.notes), '[]', deptId]);
      const id = ins.rows[0].id;
      cache.byNumber.set(F(r.incidentNumber).toLowerCase(), id);
      return id;
    },
  },

  training: {
    required: (r) => !F(r.courseName) ? 'courseName is required'
      : !F(r.completionDate || r.completedDate) ? 'completionDate is required' : null,
    rowName: (r) => [F(r.memberFirstName), F(r.memberLastName)].filter(Boolean).join(' ') || F(r.memberName),
    key(r) { return `${norm(this.rowName(r))}|${norm(r.courseName)}|${F(r.completionDate || r.completedDate)}`; },
    async load(client, deptId) {
      const { rows } = await client.query(
        'SELECT "memberName","courseName","completedDate" FROM training WHERE department_id = $1', [deptId]);
      const seen = new Set(rows.map((r) =>
        `${norm(r.memberName)}|${norm(r.courseName)}|${F(r.completedDate)}`));
      return { seen };
    },
    existingId(cache, r) { return cache.seen.has(this.key(r)) ? true : null; },
    async insert(client, r, deptId, cache) {
      const completed = F(r.completionDate || r.completedDate);
      await client.query(
        `INSERT INTO training ("memberId","memberName","courseName",type,status,"completedDate","expiresDate",hours,instructor,notes,station_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [0, this.rowName(r), F(r.courseName), F(r.type) || 'Certification', F(r.status) || 'Passed',
         completed || null, F(r.expirationDate || r.expiresDate) || null, toFloat(r.hoursCompleted || r.hours),
         F(r.provider || r.instructor), r.certNumber ? T(`Cert #: ${F(r.certNumber)}`) : T(r.notes), deptId]);
      cache.seen.add(this.key(r));
      return true;
    },
  },

  apparatus: {
    required: (r) => !F(r.unitId || r.designation) ? 'unitId is required'
      : !F(r.type) ? 'type is required' : null,
    async load(client, deptId) {
      const { rows } = await client.query('SELECT id, designation FROM apparatus WHERE department_id = $1', [deptId]);
      return { byDesig: new Map(rows.map((a) => [norm(a.designation), a.id])) };
    },
    existingId(cache, r) {
      const k = norm(r.unitId || r.designation);
      return cache.byDesig.has(k) ? cache.byDesig.get(k) : null;
    },
    async insert(client, r, deptId, cache) {
      const designation = F(r.unitId || r.designation);
      const ins = await client.query(
        `INSERT INTO apparatus (designation,type,year,make,model,status,mileage,notes,station_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [designation, F(r.type), toInt(r.year, new Date().getFullYear()), F(r.make), F(r.model),
         F(r.status) || 'In Service', toInt(r.mileage), T(r.notes), deptId]);
      const id = ins.rows[0].id;
      cache.byDesig.set(norm(designation), id);
      return id;
    },
  },

  assets: {
    required: (r) => !F(r.name) ? 'name is required' : null,
    key: (r) => `${norm(r.name)}|${F(r.serialNumber).toLowerCase()}`,
    async load(client, deptId) {
      const { rows } = await client.query('SELECT name, "serialNumber" FROM assets WHERE department_id = $1', [deptId]);
      const seen = new Set(rows.map((a) => `${norm(a.name)}|${F(a.serialNumber).toLowerCase()}`));
      return { seen };
    },
    existingId(cache, r) { return cache.seen.has(this.key(r)) ? true : null; },
    async insert(client, r, deptId, cache) {
      await client.query(
        `INSERT INTO assets (name,category,condition,"serialNumber","assignedTo",location,"purchaseDate","lastInspection","nextInspectionDue",notes,station_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [F(r.name), F(r.category), F(r.condition) || 'Serviceable', F(r.serialNumber), null,
         F(r.location), F(r.purchaseDate), '', '', T(r.notes), deptId]);
      cache.seen.add(this.key(r));
      return true;
    },
  },
};

/**
 * Core import loop, exported for testing. Runs inside a caller-provided txn
 * client; loads the natural-key cache once, then for each row: skips invalid
 * rows (reported), skips already-present rows (idempotent), else inserts.
 * @returns {{imported:number, failed:number, errors:{rowIndex:number,message:string}[]}}
 */
async function runImport(recordType, rows, deptId, client) {
  const handler = TYPES[recordType];
  if (!handler) throw new Error(`Unsupported recordType: ${recordType}`);
  const cache = await handler.load(client, deptId);
  let imported = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const invalid = handler.required(row);
    if (invalid) { errors.push({ rowIndex: i, message: invalid }); continue; }
    if (handler.existingId(cache, row)) {
      errors.push({ rowIndex: i, message: 'Already exists — skipped (idempotent)' });
      continue;
    }
    await handler.insert(client, row, deptId, cache);
    imported++;
  }
  return { imported, failed: errors.length, errors };
}

router.post('/', requireChief, async (req, res) => {
  const { recordType, rows } = req.body || {};
  const deptId = req.user.department_id;

  if (!recordType || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'recordType and rows[] are required' });
  }
  if (!TYPES[recordType]) {
    return res.status(400).json({ error: `Unsupported recordType: ${recordType}`, supported: Object.keys(TYPES) });
  }
  if (rows.length === 0) return res.status(400).json({ error: 'rows[] is empty' });
  if (rows.length > MAX_ROWS) {
    return res.status(413).json({ error: `Too many rows (max ${MAX_ROWS} per import)`, code: 'TOO_MANY_ROWS' });
  }

  try {
    // ONE transaction: all-or-nothing for the valid set (a DB error rolls back).
    const result = await runInTransaction(async (client) => runImport(recordType, rows, deptId, client));
    res.json(result);
  } catch (err) {
    console.error('[import] failed:', err && err.message);
    res.status(500).json({ error: 'Import failed', code: 'IMPORT_FAILED' });
  }
});

module.exports = router;
module.exports.runImport = runImport;
module.exports.MAX_ROWS = MAX_ROWS;
