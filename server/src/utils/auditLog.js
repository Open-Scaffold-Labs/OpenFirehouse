'use strict';
/**
 * utils/auditLog.js — append-only audit writer (Phase 2.2).
 *
 * One call per legally-relevant event on incidents, exposure records,
 * grievances, and narrative reviews. Best-effort by design: an audit-write
 * failure is logged loudly but must never fail the user's operation —
 * the operation itself is the legal act; the trail is the record of it.
 *
 * There is intentionally NO update or delete function in this module.
 */

const { pool } = require('../db');

/**
 * @param {number} stationId
 * @param {{id?: number, username?: string, name?: string}|null} user
 * @param {string} action   create | update | soft_delete | restore | approve | reject | export
 * @param {string} tableName
 * @param {number|null} recordId
 * @param {object} [detail] small JSON payload (changed fields, note, etc.) — never PII bodies
 */
async function audit(departmentId, user, action, tableName, recordId, detail = {}) {
  try {
    // department_id is the tenant key; station_id is kept equal for the legacy
    // column (== department_id during the transition; harmless after). Writing
    // department_id explicitly means this no longer depends on the 0005 sync
    // trigger — and satisfies the RLS WITH CHECK on prod.
    await pool.query(
      `INSERT INTO audit_log (station_id, department_id, user_id, user_name, action, table_name, record_id, detail)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7)`,
      [departmentId, user?.id ?? null, user?.username || user?.name || '',
       action, tableName, recordId ?? null, JSON.stringify(detail || {})]
    );
  } catch (e) {
    console.error(`[audit] FAILED to record ${action} on ${tableName}#${recordId}:`, e.message);
  }
}

module.exports = { audit };
