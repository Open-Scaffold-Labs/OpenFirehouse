'use strict';
/**
 * AVL adapter + fix-gate unit tests (ADR-0003). Pure — no DB/network.
 * Uses canonical NMEA-0183 decode vectors with known answers.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const nmea = require('../avl/adapters/nmea');
const generic = require('../avl/adapters/generic');
const { getAdapter } = require('../avl/adapters');
const { isValidFix, normalizeFixes } = require('../avl/fix');

const approx = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

test('nmea RMC: canonical vector decodes to known lat/lng/speed/heading', () => {
  const out = nmea.parse('$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A');
  assert.equal(out.length, 1);
  assert.ok(approx(out[0].lat, 48.1173), `lat ${out[0].lat}`);
  assert.ok(approx(out[0].lng, 11.51667), `lng ${out[0].lng}`);
  assert.ok(approx(out[0].speed, 22.4 * 0.514444, 1e-2), `speed ${out[0].speed}`);
  assert.equal(out[0].heading, 84.4);
});

test('nmea GGA: decodes lat/lng + HDOP-based accuracy', () => {
  const out = nmea.parse('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47');
  assert.equal(out.length, 1);
  assert.ok(approx(out[0].lat, 48.1173));
  assert.ok(approx(out[0].accuracy, 0.9 * 5));
});

test('nmea RMC+GGA in one batch dedupe to a single enriched fix', () => {
  const out = nmea.parse(
    '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A\n' +
    '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47',
  );
  assert.equal(out.length, 1);
  assert.ok(approx(out[0].accuracy, 4.5)); // RMC fix enriched with GGA accuracy
  assert.ok(out[0].speed > 0);
});

test('nmea void (status V) yields no fix', () => {
  const out = nmea.parse('$GPRMC,123519,V,4807.038,N,01131.000,E,000.0,000.0,230394,,');
  assert.equal(out.length, 0);
});

test('nmea southern/western hemispheres are negative', () => {
  const out = nmea.parse('$GPRMC,000000,A,3345.000,S,15112.000,E,000.0,000.0,010101,,');
  assert.ok(out[0].lat < 0, 'S hemisphere negative');
  assert.ok(out[0].lng > 0, 'E hemisphere positive');
});

test('generic JSON: single object + mph speed + alias fields', () => {
  const out = generic.parse({ deviceRef: 'E1', lat: 40.1, lng: -74.2, heading: 90, speed_mph: 30 });
  assert.equal(out.length, 1);
  assert.equal(out[0].deviceRef, 'E1');
  assert.ok(approx(out[0].speed, 30 * 0.44704, 1e-2));
});

test('generic JSON: array + {latitude/longitude/unit} aliases + JSON string', () => {
  const arr = generic.parse([{ unit: 'L1', latitude: 41, longitude: -73 }]);
  assert.equal(arr[0].deviceRef, 'L1');
  assert.ok(approx(arr[0].lat, 41));
  const str = generic.parse('{"fixes":[{"id":7,"lat":42,"lon":-71}]}');
  assert.equal(str[0].deviceRef, '7');
  assert.ok(approx(str[0].lng, -71));
});

test('registry: unknown vendor falls back to generic; nmea resolves', () => {
  assert.equal(getAdapter('definitely-not-a-vendor'), generic);
  assert.equal(typeof getAdapter('nmea').parse, 'function');
});

test('fix gate: drops >100m accuracy, null-island, out-of-range; keeps good', () => {
  assert.equal(isValidFix({ lat: 40, lng: -74, accuracy: 50 }), true);
  assert.equal(isValidFix({ lat: 40, lng: -74, accuracy: 150 }), false);
  assert.equal(isValidFix({ lat: 0, lng: 0 }), false);
  assert.equal(isValidFix({ lat: 999, lng: -74 }), false);
  assert.equal(isValidFix({ lat: 40, lng: -74 }), true); // null accuracy allowed
});

test('normalizeFixes stamps the transport device ref onto NMEA fixes', () => {
  const raw = nmea.parse('$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A');
  const out = normalizeFixes(raw, 'ENGINE-1');
  assert.equal(out.length, 1);
  assert.equal(out[0].deviceRef, 'ENGINE-1');
});
