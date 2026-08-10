// Tests for the response-route origin guard.
//
// Regression: on 2026-07-09 the Live Dispatch map drew a 2,914-mile route from
// San Francisco to a structure fire in Newark, NJ. The device GPS (a VPN/Wi-Fi
// geolocation miss) was trusted as the rig's position. A rig is never 2,900
// miles from its own station — resolveRouteOrigin now rejects such a fix and
// routes from the station instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { milesBetween, resolveRouteOrigin, MAX_GPS_ORIGIN_MI } from '../mapkit.js';

// Maplewood / Essex County NJ — the VITE_STATION_LAT/LNG defaults.
const STATION = { lat: 40.7282, lng: -74.2090 };
const SAN_FRANCISCO = { lat: 37.7749, lng: -122.4194 };
const DOWN_THE_STREET = { lat: 40.7335, lng: -74.2695 }; // 742 Evergreen Terrace

test('milesBetween: known long distance', () => {
  const mi = milesBetween(STATION.lat, STATION.lng, SAN_FRANCISCO.lat, SAN_FRANCISCO.lng);
  // ~2,550 mi great-circle (the 2,914 mi in the screenshot was driving distance).
  assert.ok(mi > 2400 && mi < 2700, `expected ~2550 mi, got ${mi}`);
});

test('milesBetween: zero distance to itself', () => {
  assert.equal(milesBetween(STATION.lat, STATION.lng, STATION.lat, STATION.lng), 0);
});

test('milesBetween: is symmetric', () => {
  const a = milesBetween(STATION.lat, STATION.lng, DOWN_THE_STREET.lat, DOWN_THE_STREET.lng);
  const b = milesBetween(DOWN_THE_STREET.lat, DOWN_THE_STREET.lng, STATION.lat, STATION.lng);
  assert.equal(a, b);
});

test('a nearby GPS fix is used as the origin', () => {
  const o = resolveRouteOrigin(DOWN_THE_STREET, STATION.lat, STATION.lng);
  assert.equal(o.source, 'gps');
  assert.equal(o.lat, DOWN_THE_STREET.lat);
  assert.equal(o.lng, DOWN_THE_STREET.lng);
  assert.ok(o.deviceMiles < 5);
});

test('THE REGRESSION: a San Francisco fix for a New Jersey station is rejected', () => {
  const o = resolveRouteOrigin(SAN_FRANCISCO, STATION.lat, STATION.lng);
  assert.equal(o.source, 'station');
  assert.equal(o.lat, STATION.lat);
  assert.equal(o.lng, STATION.lng);
  assert.ok(o.deviceMiles > 2400, 'distance is reported so the warning can name it');
});

test('no fix at all falls back to the station, with no distance to report', () => {
  const o = resolveRouteOrigin(null, STATION.lat, STATION.lng);
  assert.equal(o.source, 'station');
  assert.equal(o.deviceMiles, null);
});

test('a malformed fix is treated as no fix', () => {
  for (const bad of [{}, { lat: 1 }, { lat: '40.7', lng: '-74.2' }, undefined]) {
    const o = resolveRouteOrigin(bad, STATION.lat, STATION.lng);
    assert.equal(o.source, 'station', `expected station for ${JSON.stringify(bad)}`);
    assert.equal(o.deviceMiles, null);
  }
});

test('the threshold is inclusive-ish: just inside is gps, just outside is station', () => {
  // Walk due north from the station until we cross the limit.
  const degPerMile = 1 / 69.0;
  const inside = { lat: STATION.lat + (MAX_GPS_ORIGIN_MI - 5) * degPerMile, lng: STATION.lng };
  const outside = { lat: STATION.lat + (MAX_GPS_ORIGIN_MI + 5) * degPerMile, lng: STATION.lng };
  assert.equal(resolveRouteOrigin(inside, STATION.lat, STATION.lng).source, 'gps');
  assert.equal(resolveRouteOrigin(outside, STATION.lat, STATION.lng).source, 'station');
});

test('the threshold is configurable per department', () => {
  // A rural district whose rigs legitimately run 120 miles out.
  const far = { lat: STATION.lat + 100 / 69.0, lng: STATION.lng };
  assert.equal(resolveRouteOrigin(far, STATION.lat, STATION.lng).source, 'station');
  assert.equal(resolveRouteOrigin(far, STATION.lat, STATION.lng, 150).source, 'gps');
});

test('default threshold is a sane response distance', () => {
  assert.ok(MAX_GPS_ORIGIN_MI > 0 && MAX_GPS_ORIGIN_MI < 500, `got ${MAX_GPS_ORIGIN_MI}`);
});
