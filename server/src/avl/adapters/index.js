'use strict';
/**
 * server/src/avl/adapters/index.js — AVL adapter registry (ADR-0003).
 *
 * Maps a connection's vendorId to the adapter that turns that vendor's raw feed
 * into canonical fixes. Mirrors server/src/cad/adapters. Day-1 universal
 * adapters: 'generic' (OF JSON contract) and 'nmea' (NMEA-0183). Verified
 * vendor adapters are added here, one line each, against a confirmed spec.
 */

const generic = require('./generic');
const nmea = require('./nmea');

const ADAPTERS = {
  generic,
  nmea,
  // <vendor>: require('./<vendor>'),  // added per verified vendor spec
};

/** Resolve an adapter by vendorId; falls back to the generic JSON contract. */
function getAdapter(vendorId) {
  const key = String(vendorId || 'generic').toLowerCase();
  return ADAPTERS[key] || generic;
}

module.exports = { getAdapter, ADAPTERS };
