'use strict';
/**
 * sslConfig.js — TLS configuration for the Postgres pool.
 *
 * OpenFirehouse prod (Supabase, session pooler) presents a certificate that
 * chains to Supabase's private "Supabase Root 2021" CA, not a public root. The
 * secure connection PINS that CA and verifies — it never disables verification.
 * See docs/ops/prod-db-tls-ca-pinning.md.
 *
 * Behaviour:
 *   - Local / non-remote DB    → ssl: false
 *   - Remote DB + DATABASE_CA  → ssl: { ca, rejectUnauthorized: true }   (verified)
 *   - Remote DB, no DATABASE_CA→ ssl: { rejectUnauthorized: false } + one loud warn
 *
 * The last case intentionally preserves today's working (encrypted-but-unverified)
 * behaviour, so deploying this change never breaks a running prod. Setting
 * DATABASE_CA to the Supabase Root 2021 CA (PEM) completes the fix — verified TLS —
 * with no downtime and no further code change. (The Hub's operator-console pool
 * uses the same CA under the name OF_DATABASE_CA in its own env namespace.)
 */

let warned = false;

function loadCa() {
  const raw = process.env.DATABASE_CA;
  if (!raw || !raw.trim()) return null;
  // Env stores frequently encode PEM newlines as the literal two-char "\n".
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

function buildSslConfig(isRemote) {
  if (!isRemote) return false;
  const ca = loadCa();
  if (ca) return { ca, rejectUnauthorized: true };
  if (!warned) {
    warned = true;
    console.warn(
      '[db] DATABASE_CA is not set — connecting to a remote database WITHOUT TLS ' +
      'certificate verification (rejectUnauthorized:false). Set DATABASE_CA to the ' +
      'Supabase Root 2021 CA (PEM) to enable verified TLS. ' +
      'See docs/ops/prod-db-tls-ca-pinning.md.'
    );
  }
  return { rejectUnauthorized: false };
}

module.exports = { buildSslConfig };
