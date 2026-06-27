'use strict';
/**
 * routes/exportAll.js — "Export all my data" (W4.5, roadmap 5.3, 2026-06-10).
 *
 * GET /api/export/all — chief-only. Returns ONE JSON document containing
 * every row this department owns, across every station-scoped table. This is
 * the AGPL trust signal and the disaster-recovery story: a department can
 * walk away with its data at any time, no ticket required.
 *
 * How tables are selected: anything in the public schema with a station_id
 * column (the tenancy marker) is exported WHERE station_id = caller's,
 * plus the department's own stations row. Globals (licenses,
 * push_subscriptions, hazmat reference data without station_id, other
 * tenants' rows) are excluded by construction. Shared `users` rows for this
 * station are included WITHOUT password hashes.
 *
 * Soft-deleted rows ARE included (deleted_at is part of the legal record).
 * Every export is written to the audit log.
 *
 * Built on routeKit (W3.7) — the canonical new-route shape.
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { scoped, httpError } = require('../utils/routeKit');
const { audit } = require('../utils/auditLog');

// Tables that carry station_id but should NOT ship in a department export.
const EXCLUDE = new Set([
  'ai_usage',            // operational metering, available via /api/ai/action/usage
]);

// Sensitive columns stripped per-table.
const STRIP_COLUMNS = {
  users: ['passwordHash', 'password_hash'],
  stations: ['tv_pin'],
};

router.get('/all', scoped(async ({ req, stationId }) => {
  if (req.user.role !== 'chief') {
    throw httpError(403, 'Chief role required to export department data', 'CHIEF_ONLY');
  }

  // Find every station-scoped table in the public schema.
  const { rows: tableRows } = await pool.query(`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'station_id'
    GROUP BY table_name ORDER BY table_name
  `);

  const data = {};
  const counts = {};
  for (const { table_name: table } of tableRows) {
    if (EXCLUDE.has(table)) continue;
    // Identifier safety: table names come from information_schema, but only
    // plain snake_case identifiers are eligible anyway — skip anything else.
    if (!/^[a-z0-9_]+$/.test(table)) continue;
    try {
      const { rows } = await pool.query(
        `SELECT * FROM "${table}" WHERE department_id = $1`,
        [stationId]
      );
      const strip = STRIP_COLUMNS[table];
      data[table] = strip
        ? rows.map(r => { const c = { ...r }; for (const k of strip) delete c[k]; return c; })
        : rows;
      counts[table] = rows.length;
    } catch (e) {
      // A table readable in information_schema but not selectable shouldn't
      // sink the whole export — note it and move on.
      data[table] = { _error: `not exportable: ${e.message}` };
      counts[table] = null;
    }
  }

  // The department's own stations row (stations has no station_id column —
  // its id IS the tenant key).
  const { rows: stationRows } = await pool.query('SELECT * FROM stations WHERE id = $1', [stationId]);
  const stationRow = stationRows[0] ? { ...stationRows[0] } : null;
  if (stationRow) for (const k of STRIP_COLUMNS.stations) delete stationRow[k];

  audit(stationId, req.user, 'export', 'ALL_TABLES', null, {
    tables: Object.keys(counts).length,
    rows: Object.values(counts).reduce((s, n) => s + (n || 0), 0),
  });

  return {
    export_format: 'openfirehouse-full-export',
    version: 1,
    exported_at: new Date().toISOString(),
    station: stationRow,
    station_id: stationId,
    table_counts: counts,
    tables: data,
  };
}));

module.exports = router;
