'use strict';
// TV PIN hashing — the PIN was previously stored and compared in plaintext.
//
// Scheme: keyed HMAC-SHA256 ('hmac$' + hex). A keyed hash (rather than bcrypt)
// keeps the single-query lookup-by-PIN the TV display flow needs, while making
// a DB dump useless without the server-side key.
//
// Legacy plaintext rows keep working: findStationByPin matches either form and
// transparently upgrades a plaintext row to the hashed form on first use, so
// no manual prod migration is required.
//
// Key: TV_PIN_SECRET if set, else derived from the JWT secret. NOTE: rotating
// the key invalidates stored hashes (users just regenerate the PIN in
// Station Settings).
const crypto = require('crypto');
const { ACCESS_SECRET } = require('./jwtSecret');

const KEY = process.env.TV_PIN_SECRET || `${ACCESS_SECRET}:tv-pin`;
const PREFIX = 'hmac$';

function normalize(pin) {
  return String(pin || '').trim().toUpperCase();
}

function hashTvPin(pin) {
  return PREFIX + crypto.createHmac('sha256', KEY).update(normalize(pin)).digest('hex');
}

function isHashed(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

// Look up a station by TV PIN (hashed or legacy plaintext). Upgrades legacy
// plaintext rows to the hashed form on successful match.
async function findStationByPin(pool, pin, columns = '*') {
  const plain = normalize(pin);
  if (!plain) return null;
  const hashed = hashTvPin(plain);
  const { rows } = await pool.query(
    `SELECT ${columns}, tv_pin FROM stations WHERE tv_pin = $1 OR tv_pin = $2 LIMIT 1`,
    [plain, hashed]
  );
  if (!rows.length) return null;
  const station = rows[0];
  if (!isHashed(station.tv_pin)) {
    // Legacy plaintext row — upgrade in place (best-effort).
    try {
      await pool.query('UPDATE stations SET tv_pin = $1 WHERE id = $2', [hashed, station.id]);
    } catch (e) {
      console.warn('[tvPin] could not upgrade legacy PIN row:', e.message);
    }
  }
  delete station.tv_pin; // never hand the stored credential back to callers
  return station;
}

module.exports = { hashTvPin, isHashed, normalize, findStationByPin };
