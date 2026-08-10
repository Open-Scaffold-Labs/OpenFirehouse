'use strict';
/**
 * server/src/cad/ingestLog.js — the CAD ingest receipt (4C.2).
 *
 * WHY THIS EXISTS
 * ---------------
 * Per NENA-STA-024.1.1-2025 §3.3.5.3.1 the sending CAD's action on a 400 / 404 /
 * 408 / 500 / 501 is NOTHING. Only a 503 means "retry". The standard defines no
 * dead-letter queue and no redelivery, and no shipping vendor implements one.
 * So a dispatch we fail to process is not delayed — it is GONE, and the sender
 * believes it was delivered.
 *
 * Because the market does not redeliver, the RECEIVER carries the entire burden
 * of not losing the message. NENA-STA-024 §3.14 makes logging every message
 * MUST-level; NFPA 1221 §12.5.3 makes the record of the dispatch signal SHALL;
 * NENA i3 §4.12.3.7 requires an UNPARSEABLE message to be logged with its raw
 * bytes and sender IP as REQUIRED members. Keeping the bytes is the whole remedy:
 * a dispatch we could not parse can still be read by a human and worked by hand.
 *
 * THE ORDERING RULE — persist BEFORE parse, and COMMIT before parse.
 * The receipt is written and committed on its own transaction, before any parse
 * is attempted. It must NOT ride the request's transaction: under P5 a single
 * failed statement poisons the commit (lesson #14 — a MAYDAY returned 201 and
 * persisted nothing), and a rolled-back receipt is precisely the message we
 * promised to keep. runWithDepartment() opens its own client, BEGINs, sets the
 * RLS GUC, and COMMITs — so by the time we try to read the bytes, they are
 * already durable. Public webhooks carry no JWT, so the dbTransaction middleware
 * never runs for them and there is no ambient client to deadlock against
 * (lesson #12, the max:1 pool).
 *
 * WHAT IS DELIBERATELY NOT STORED
 * The presented webhook secret is the department's live CAD credential. These
 * rows are retained FOREVER, so writing it verbatim would mean a permanent
 * plaintext credential store. Headers are allowlisted and the credential-bearing
 * ones are redacted; the query string is never stored at all (a relay that can
 * only be configured with a plain URL presents its secret as ?key=). Redaction
 * is applied to the HEADERS only — the raw body is stored byte-for-byte, because
 * a redacted body is not the message that arrived and would fail the i3 purpose.
 */

const crypto = require('crypto');

/** Header names worth keeping for diagnosis. Everything else is dropped. */
const HEADER_ALLOWLIST = [
  'content-type',
  'content-length',
  'user-agent',
  'x-forwarded-for',
  'x-request-id',
  'date',
];

/** Header names that carry the credential — kept as a marker, never a value. */
const CREDENTIAL_HEADERS = ['authorization', 'x-cad-webhook-secret'];

/**
 * The parse_status values that mean "a human must look at this" (4C.4).
 * Kept in lock-step with routes/cadIngestMonitor.js FAULT_STATUSES and with the CHECK
 * constraint on cad_ingest_outcome.parse_status — a control value that lives in three places
 * and is matched EXACTLY, never pattern-matched (the fi_inspections result_code lesson).
 */
const FAULT_STATUSES = ['unparseable', 'processing_failed'];

/**
 * Allowlist + redact. Returns a plain object safe to retain indefinitely.
 * @param {object} headers
 */
function safeHeaders(headers) {
  const h = headers || {};
  const out = {};
  for (const name of HEADER_ALLOWLIST) {
    if (h[name] != null) out[name] = String(h[name]).slice(0, 512);
  }
  for (const name of CREDENTIAL_HEADERS) {
    // Record only THAT a credential was presented, never its value. The sha256
    // prefix lets an operator correlate "which key was this" against
    // cad_connections.webhook_secret_hash without storing the secret itself.
    if (h[name] != null) {
      const raw = String(h[name]).replace(/^Bearer\s+/i, '').trim();
      out[name] = raw
        ? `[redacted sha256:${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12)}]`
        : '[redacted]';
    }
  }
  return out;
}

/**
 * Write the receipt and COMMIT it, before any parse is attempted.
 *
 * Throws on failure — deliberately. A receipt we could not store is the one
 * case where the caller must answer 503, because 503 is the ONLY status the
 * NENA state machine treats as "retry". Answering 200 here would tell the CAD
 * the dispatch was delivered while we hold no copy of it.
 *
 * @param {object} a
 * @param {number} a.departmentId  resolved from the credential, never the body
 * @param {number|null} a.stationId
 * @param {number|null} a.connectionId
 * @param {string} a.vendor
 * @param {string|null} a.sourceIp
 * @param {string} a.rawBody       the bytes exactly as received
 * @param {object} a.headers
 * @returns {Promise<string>} log_event_id (uuid)
 */
async function persistReceipt({ departmentId, stationId, connectionId, vendor, sourceIp, rawBody, headers }) {
  const db = require('../db');
  return db.runWithDepartment(departmentId, null, async () => {
    const r = await db.pool.query(
      `INSERT INTO cad_ingest_log
         (department_id, station_id, connection_id, vendor, source_ip, raw_body, headers)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING log_event_id`,
      [
        departmentId,
        stationId ?? null,
        connectionId ?? null,
        String(vendor || 'unknown').slice(0, 64),
        sourceIp || null,
        rawBody == null ? '' : String(rawBody),
        JSON.stringify(safeHeaders(headers)),
      ]
    );
    return r.rows[0].log_event_id;
  });
}

/**
 * Append what became of a receipt. Best-effort by design: the bytes are already
 * safe, so a failure to record the OUTCOME must never turn a dispatch we
 * successfully stored into a 503 that makes the CAD retry. Logged loudly.
 *
 * @returns {Promise<boolean>} true if the outcome row landed
 */
async function recordOutcome({ logEventId, departmentId, parseStatus, parseError, alertId, respondedStatus }) {
  if (!logEventId) return false;
  try {
    const db = require('../db');
    await db.runWithDepartment(departmentId, null, async () => {
      await db.pool.query(
        `INSERT INTO cad_ingest_outcome
           (log_event_id, department_id, parse_status, parse_error, alert_id, responded_status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          logEventId,
          departmentId,
          parseStatus,
          parseError == null ? null : String(parseError).slice(0, 2000),
          alertId == null ? null : String(alertId),
          respondedStatus,
        ]
      );
    });
    // 4C.4 — ANNUNCIATE. A durable receipt nobody is told about is not a remedy: the sending
    // CAD will never resend (NENA-STA-024 §3.3.5.3.1) and believes we have the call, so the
    // department's only path back to it is a human being told, now. 09 NCAC 06C .0213(a)(4)
    // requires "visual and audible indications to personnel designated by the PSAP" on an
    // interface fault; the client turns this ping into both.
    //
    // Placed HERE, after the row is committed, and only for fault statuses: a 'parsed' outcome
    // is the normal path and already has its own dispatch ping. Await it so it flushes before
    // the serverless function returns (the same reason processDispatch awaits its ping), but
    // never let it change the answer — the bytes are already safe, and a broadcast failure
    // must not turn a stored dispatch into a 503 that makes the CAD retry.
    if (FAULT_STATUSES.includes(parseStatus)) {
      try {
        const { broadcastIngestFaultPing } = require('../config/supabaseRealtime');
        await broadcastIngestFaultPing(departmentId, null);
      } catch (e) {
        console.error('[cad/ingestLog] trouble-signal broadcast failed (outcome is stored):', e.message);
      }
    }
    return true;
  } catch (e) {
    console.error('[cad/ingestLog] outcome write failed (receipt is still stored):', e.message);
    return false;
  }
}

module.exports = { persistReceipt, recordOutcome, safeHeaders, HEADER_ALLOWLIST, CREDENTIAL_HEADERS, FAULT_STATUSES };
