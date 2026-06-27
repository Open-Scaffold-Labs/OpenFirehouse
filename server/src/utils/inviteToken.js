'use strict';
/**
 * utils/inviteToken.js — single-use member-invite secrets (P4.4).
 *
 * The chief issues an invite; the member redeems it to set a password. The raw
 * secret is shown to the chief exactly ONCE (handed to the member out-of-band —
 * OF has no outbound email); only its sha256 hash is stored. sha256 (not bcrypt)
 * is correct here: the secret is 192 bits of CSPRNG entropy, so there is no
 * brute-force surface, and a fixed hash allows an indexed O(1) redeem lookup.
 */
const crypto = require('crypto');

/** A URL-safe, high-entropy invite secret (the value handed to the member). */
function generateInviteToken() {
  return crypto.randomBytes(24).toString('base64url'); // 32 url-safe chars, 192 bits
}

/** At-rest hash of an invite secret (store this, never the secret). */
function hashInviteToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** A short, human-shareable department join code (8 chars, unambiguous alphabet). */
function generateJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

module.exports = { generateInviteToken, hashInviteToken, generateJoinCode };
