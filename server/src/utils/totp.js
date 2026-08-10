'use strict';
/**
 * totp.js — RFC 6238 Time-Based One-Time Passwords, and the RFC 4648 base32
 * codec the enrolment URI needs. Phase 5 / migration 0111.
 *
 * WHY THIS IS HAND-WRITTEN RATHER THAN A DEPENDENCY
 * -------------------------------------------------
 * Normally the answer for auth primitives is "use the library" — that is exactly
 * the conclusion we reached for SAML, where nineteen years of signature-bypass
 * CVEs prove that XML canonicalisation is not something to hand-roll.
 *
 * TOTP is a different risk class and the distinction is the whole justification:
 *   - There is no parsing. No XML, no ASN.1, no attacker-controlled document
 *     structure. The input is a 6-digit string and a clock.
 *   - The entire algorithm is HMAC-SHA1 over a big-endian counter, plus the
 *     dynamic-truncation step. It is ~40 lines and it is fully specified.
 *   - RFC 6238 Appendix B publishes OFFICIAL TEST VECTORS, so correctness is
 *     provable against the standard itself rather than asserted. See
 *     tests/totp.test.js — every published vector is exercised.
 * Adding a dependency here would buy no safety we cannot demonstrate, while
 * adding a supply-chain surface on the authentication path.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * No WebAuthn/passkeys, no push approval, no SMS. The competitor-shipping
 * inventory (12 fire/EMS RMS products, 2026-07-26) found ZERO of 12 shipping
 * any of the first two, and SMS is restricted by NIST SP 800-63B (one competitor
 * refuses it outright). TOTP is what this market ships; TOTP is what we ship.
 */

const crypto = require('crypto');

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 encode (no padding — what authenticator apps expect). */
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** RFC 4648 base32 decode. Tolerates padding, whitespace and lower case. */
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random shared secret, base32-encoded. 20 bytes = 160 bits, per RFC 4226 §4. */
function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

/**
 * RFC 4226 HOTP. Exported because RFC 6238 is defined in terms of it and the
 * test vectors are clearer this way.
 * @param {Buffer} key
 * @param {number} counter
 * @param {number} digits
 * @param {string} algorithm  'sha1' | 'sha256' | 'sha512'
 */
function hotp(key, counter, digits = 6, algorithm = 'sha1') {
  const buf = Buffer.alloc(8);
  // Counter is a 64-bit big-endian integer. writeBigUInt64BE keeps this exact
  // above 2^32, which a naive two-word write would silently get wrong.
  buf.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac(algorithm, key).update(buf).digest();
  // Dynamic truncation, RFC 4226 §5.3: the low nibble of the last byte selects
  // the offset; the high bit of the selected word is masked off.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The RFC 6238 time step for a given moment. */
function timeStep(seconds = Math.floor(Date.now() / 1000), period = 30) {
  return Math.floor(seconds / period);
}

/**
 * Generate a TOTP.
 * @param {string} secretB32
 * @param {{ seconds?: number, period?: number, digits?: number, algorithm?: string }} [opts]
 */
function generate(secretB32, opts = {}) {
  const { seconds, period = 30, digits = 6, algorithm = 'sha1' } = opts;
  return hotp(base32Decode(secretB32), timeStep(seconds, period), digits, algorithm);
}

/**
 * Verify a submitted code, allowing for clock drift.
 *
 * Returns the matched STEP (not just true) so the caller can persist it and
 * refuse a replay. A TOTP is valid for its whole window, so without recording
 * the consumed step, an intercepted code can be reused for up to a minute —
 * that is the single most common TOTP implementation bug.
 *
 * Comparison is constant-time. `window` = 1 permits one step either side
 * (±30s), the conventional tolerance.
 *
 * @returns {{ valid: boolean, step: number|null }}
 */
function verify(secretB32, token, opts = {}) {
  const { seconds, period = 30, digits = 6, algorithm = 'sha1', window = 1 } = opts;

  const submitted = String(token ?? '').replace(/\s+/g, '');
  // Reject shape BEFORE any crypto so a malformed token can't reach the loop.
  if (!new RegExp(`^\\d{${digits}}$`).test(submitted)) return { valid: false, step: null };

  let key;
  try { key = base32Decode(secretB32); } catch { return { valid: false, step: null }; }

  const current = timeStep(seconds, period);
  for (let drift = -window; drift <= window; drift++) {
    const step = current + drift;
    const expected = hotp(key, step, digits, algorithm);
    const a = Buffer.from(expected);
    const b = Buffer.from(submitted);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { valid: true, step };
    }
  }
  return { valid: false, step: null };
}

/**
 * The otpauth:// URI an authenticator app scans.
 * `issuer` and `label` are percent-encoded; a colon in either would otherwise
 * corrupt the label grammar.
 */
function otpauthURI({ secret, accountName, issuer = 'OpenFirehouse', period = 30, digits = 6, algorithm = 'SHA1' }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret, issuer, algorithm, digits: String(digits), period: String(period),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ── Recovery codes ───────────────────────────────────────────────────────────

/**
 * Recovery codes are the ONLY way back in when a phone is lost. One competitor
 * in the inventory ships MFA with no recovery path at all — a locked-out captain
 * has to phone a state employee. We are not doing that.
 *
 * Codes are shown ONCE and stored only as SHA-256 hashes. SHA-256 (not bcrypt)
 * is correct here precisely because these are high-entropy random values, not
 * user-chosen passwords: there is nothing to brute-force, and a fast hash keeps
 * verification cheap.
 */
function generateRecoveryCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // 5 bytes → 8 base32 chars. Grouped 4-4 for legibility when written down.
    const raw = base32Encode(crypto.randomBytes(5)).slice(0, 8);
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

/** Normalize then hash. Normalizing means case and dashes don't matter to a tired user. */
function hashRecoveryCode(code) {
  const normalized = String(code ?? '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

module.exports = {
  base32Encode, base32Decode,
  generateSecret, hotp, timeStep, generate, verify, otpauthURI,
  generateRecoveryCodes, hashRecoveryCode,
};
