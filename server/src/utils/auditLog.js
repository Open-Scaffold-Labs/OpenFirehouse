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
const { getClient } = require('./dbContext');

/**
 * @param {number} stationId
 * @param {{id?: number, username?: string, name?: string}|null} user
 * @param {string} action   create | update | soft_delete | restore | approve | reject | export
 * @param {string} tableName
 * @param {number|null} recordId  MUST be an INTEGER (or null) — record_id is an INTEGER
 *   column. Passing a UUID (or any non-integer) makes the INSERT fail; see the SAVEPOINT
 *   note below for why that used to be catastrophic.
 * @param {object} [detail] small JSON payload (changed fields, note, etc.) — never PII bodies
 */
async function audit(departmentId, user, action, tableName, recordId, detail = {}) {
  // ── Why the SAVEPOINT (2026-07-16) ──────────────────────────────────────────
  // audit() promises to be BEST-EFFORT — "never fail the user's operation." Under
  // P5_TXN the whole request runs in ONE transaction, so a failed audit INSERT
  // (e.g. a bad record_id type) POISONS that transaction: every later statement is
  // rejected and the request's COMMIT silently becomes a ROLLBACK. That is how a
  // MAYDAY declare returned 201 yet persisted nothing on prod. A JS try/catch does
  // NOT save you — the DAMAGE is at the DB transaction level.
  //
  // Fix: when a request transaction is open, wrap the write in a SAVEPOINT. On
  // failure, ROLLBACK TO SAVEPOINT undoes ONLY the audit write and leaves the
  // caller's transaction clean, so its COMMIT still persists the real work. When
  // no transaction is active (cron/seed/pre-P5), it's a plain autocommit insert.
  const inTxn = !!getClient();
  const SP = 'of_audit_sp';
  try {
    if (inTxn) await pool.query(`SAVEPOINT ${SP}`);
    // department_id is the tenant key; station_id is kept equal for the legacy
    // column. Writing department_id explicitly satisfies the RLS WITH CHECK on prod.
    await pool.query(
      `INSERT INTO audit_log (station_id, department_id, user_id, user_name, action, table_name, record_id, detail)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7)`,
      [departmentId, user?.id ?? null, user?.username || user?.name || '',
       action, tableName, recordId ?? null, JSON.stringify(detail || {})]
    );
    if (inTxn) await pool.query(`RELEASE SAVEPOINT ${SP}`);
  } catch (e) {
    if (inTxn) {
      // Recover the caller's transaction. Best-effort — if even this fails, the
      // txn was already unrecoverable for other reasons; log and move on.
      try { await pool.query(`ROLLBACK TO SAVEPOINT ${SP}`); }
      catch (re) { console.error('[audit] savepoint rollback failed:', re.message); }
    }
    console.error(`[audit] FAILED to record ${action} on ${tableName}#${recordId}:`, e.message);
  }
}

module.exports = { audit };
