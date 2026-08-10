'use strict';
/**
 * incidentNumber.js — server-side incident-number minting.
 *
 * 4.1a-R.4b. Until now OF had NO server-side minter: `IncidentLog.jsx` computes
 * `YY-NNNN` in the browser as max+1 over the incidents it has loaded, and the
 * officer submits it. The only server-side minter that ever existed lived in
 * utils/cadPipeline.js — 414 lines of dead code deleted this session — so an
 * auto-created incident had nowhere to get a number from.
 *
 * ─── FORMAT: MATCH THE CLIENT EXACTLY, INCLUDING ITS QUIRK ──────────────────
 * The client takes the max SEQUENCE across ALL non-deleted incidents in the
 * department — not just this year's — and prefixes the CURRENT two-digit year.
 * So the first call of January follows 25-0347 as 26-0348, not 26-0001.
 *
 * That is arguably not what a department wants, but it IS what OF does today,
 * and an auto-created incident must not silently number itself on a different
 * scheme than the one an officer sees suggested. Changing the scheme is a
 * product decision for Matt, not a side effect of adding auto-create. (Every
 * changed line should trace to the request; this one traces to "don't diverge".)
 *
 * ─── RACE SAFETY ────────────────────────────────────────────────────────────
 * max+1 is inherently racy — two writers reading the same max propose the same
 * number. The partial unique index `(station_id, "incidentNumber") WHERE
 * deleted_at IS NULL` is the real guard, so the mint RETRIES on 23505 rather
 * than pretending the read was atomic. The client has always had this race and
 * simply surfaced a 409; here there is no human to retry, so we do.
 */

const { pool } = require('../db');

const MAX_ATTEMPTS = 5;

/** The department's next number, matching the client's scheme. */
async function peekNextIncidentNumber(departmentId, offset = 0) {
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(NULLIF(split_part("incidentNumber", '-', 2), '')::int), 0) AS seq
       FROM incidents
      WHERE department_id = $1
        AND deleted_at IS NULL
        AND "incidentNumber" ~ '^[0-9]{2}-[0-9]+$'`,
    [departmentId]
  );
  const seq = (rows[0]?.seq ?? 0) + 1 + offset;
  const yy = String(new Date().getFullYear()).slice(-2);
  return `${yy}-${String(seq).padStart(4, '0')}`;
}

/**
 * Mint a number and hand it to `create(number)`, retrying on a unique collision.
 *
 * The caller does the INSERT so the number and the row are decided together —
 * returning a "reserved" number to a caller that then fails would burn it, and
 * a gap in an incident-number sequence is a thing auditors ask about.
 *
 * @returns whatever create() returns, or throws the last error.
 */
async function withMintedIncidentNumber(departmentId, create) {
  let lastErr = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const number = await peekNextIncidentNumber(departmentId, attempt);
    try {
      return await create(number);
    } catch (e) {
      // 23505 = another writer took this number between our read and our write.
      // Anything else is a real failure and must not be retried into a loop.
      if (e && e.code === '23505') { lastErr = e; continue; }
      throw e;
    }
  }
  throw lastErr || new Error('could not mint an incident number');
}

module.exports = { peekNextIncidentNumber, withMintedIncidentNumber, MAX_ATTEMPTS };
