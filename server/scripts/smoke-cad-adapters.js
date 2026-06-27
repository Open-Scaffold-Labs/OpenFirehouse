#!/usr/bin/env node
'use strict';
/**
 * scripts/smoke-cad-adapters.js
 *
 * Smoke verification for the CAD adapter framework. Run with:
 *   node server/scripts/smoke-cad-adapters.js
 *
 * Exits 0 on success, non-zero on failure.
 *
 * What this validates:
 *   1. The registry exports the expected adapters with required shape.
 *   2. active911.parse() against a representative payload produces the
 *      CadIncident the legacy inline parser would have produced. This is
 *      the regression gate — if this passes, the existing customer
 *      webhook URLs keep working after the refactor.
 *   3. The generic adapter parses a representative custom payload.
 *   4. Scaffold adapters (iamresponding, firstdue, zuercher) refuse to
 *      run by returning ok:false with status 501.
 *   5. pipeline.resolveStationId honors CAD_DEFAULT_STATION_ID and
 *      CAD_STATION_MAP env config.
 *
 * This script intentionally does NOT exercise the persistence pipeline —
 * it stays in-process and avoids touching the database so it can run in
 * CI or against a developer laptop without a live Postgres.
 */

const { ADAPTERS, REGISTRY } = require('../src/cad');

let passed = 0;
let failed = 0;

function ok(name) { passed++; console.log(`  ✓ ${name}`); }
function fail(name, reason) {
  failed++;
  console.log(`  ✗ ${name}`);
  console.log(`      ${reason}`);
}
function check(name, cond, reason) {
  if (cond) ok(name);
  else fail(name, reason || 'condition was false');
}

(async () => {
  console.log('CAD adapter framework smoke test');
  console.log('-'.repeat(40));

  // 1. Registry shape
  console.log('\nRegistry:');
  check('5 adapters registered', ADAPTERS.length === 5,
    `expected 5, got ${ADAPTERS.length}`);
  for (const a of ADAPTERS) {
    check(`adapter "${a.name}" has displayName`, typeof a.displayName === 'string',
      `displayName missing on ${a.name}`);
    check(`adapter "${a.name}" has parse()`, typeof a.parse === 'function',
      `parse() missing on ${a.name}`);
  }

  // 2. Active911 parse against representative payload
  console.log('\nactive911 adapter:');
  const a911Payload = {
    id: 555,
    agency_id: 'ABC123',
    description: 'STRUCTURE FIRE',
    address: '123 Main St',
    city: 'Springfield',
    state: 'NJ',
    latitude: 40.71,
    longitude: -74.17,
    unit: 'E41,L23',
    details: 'PD on scene, smoke visible',
    timestamp: 1717000000,
  };
  const a911 = REGISTRY.get('active911');
  const a911Auth = await a911.authenticate({ body: a911Payload });
  check('authenticate() with no env config returns ok', a911Auth.ok === true);
  const a911Parse = await a911.parse({ body: a911Payload });
  check('parse() returns ok', a911Parse.ok === true);
  if (a911Parse.ok) {
    const i = a911Parse.incident;
    check('alertId is "555"', i.alertId === '555', `got ${i.alertId}`);
    check('address composed from address+city+state',
      i.address === '123 Main St, Springfield, NJ',
      `got "${i.address}"`);
    check('units mapped from "unit"', i.units === 'E41,L23', `got "${i.units}"`);
    check('description mapped', i.description === 'STRUCTURE FIRE',
      `got "${i.description}"`);
    check('latitude parsed', i.latitude === 40.71, `got ${i.latitude}`);
    check('longitude parsed', i.longitude === -74.17, `got ${i.longitude}`);
    check('dispatchedAt is ISO from unix epoch',
      i.dispatchedAt === '2024-05-29T16:26:40.000Z',
      `got "${i.dispatchedAt}"`);
    check('source is active911', i.source === 'active911');
    check('stationId defaults to 1', i.stationId === 1, `got ${i.stationId}`);
    check('raw payload preserved', i.raw && i.raw.id === 555);
  }

  // 3. Active911 agency-id mismatch handling
  console.log('\nactive911 agency_id verification:');
  process.env.ACTIVE911_AGENCY_ID = 'EXPECTED';
  const wrongAgencyAuth = await a911.authenticate({
    body: { agency_id: 'WRONG' },
  });
  check('agency_id mismatch rejected (403)',
    wrongAgencyAuth.ok === false && wrongAgencyAuth.status === 403);
  const rightAgencyAuth = await a911.authenticate({
    body: { agency_id: 'EXPECTED' },
  });
  check('agency_id match accepted', rightAgencyAuth.ok === true);
  delete process.env.ACTIVE911_AGENCY_ID;

  // 4. Generic adapter
  console.log('\ngeneric adapter:');
  const generic = REGISTRY.get('generic');
  const genPayload = {
    incident_number: 'INC-2026-0042',
    call_type: 'Medical',
    location: '789 Oak Ave',
    units: 'M1',
    narrative: 'Chest pain, conscious',
    lat: 40.5,
    lon: -74.5,
    timestamp: 1717000000,
    source: 'TestVendor',
  };
  const genParse = await generic.parse({ body: genPayload });
  check('generic parse ok', genParse.ok === true);
  if (genParse.ok) {
    const i = genParse.incident;
    check('alertId from incident_number', i.alertId === 'INC-2026-0042');
    check('description from call_type', i.description === 'Medical');
    check('source preserved from payload', i.source === 'TestVendor');
    check('lat/lon parsed from aliases',
      i.latitude === 40.5 && i.longitude === -74.5);
  }

  // 5. Scaffold adapters refuse to run
  console.log('\nscaffold adapters (should refuse):');
  for (const vendor of ['iamresponding', 'firstdue', 'zuercher']) {
    const adapter = REGISTRY.get(vendor);
    const auth = await adapter.authenticate({ body: {}, headers: {} });
    check(`${vendor} authenticate returns 501`,
      auth.ok === false && auth.status === 501,
      `got ok=${auth.ok} status=${auth.status}`);
    const parse = await adapter.parse({ body: {}, headers: {} });
    check(`${vendor} parse returns 501`,
      parse.ok === false && parse.status === 501,
      `got ok=${parse.ok} status=${parse.status}`);
  }

  // 6. CAD_STATION_MAP resolution
  console.log('\nstation resolution:');
  const { resolveStationId } = require('../src/cad/pipeline');
  check('default stationId is 1', resolveStationId('active911', null) === 1);
  process.env.CAD_DEFAULT_STATION_ID = '7';
  check('CAD_DEFAULT_STATION_ID env respected',
    resolveStationId('active911', null) === 7);
  process.env.CAD_STATION_MAP = JSON.stringify({ 'active911:42': 3 });
  check('CAD_STATION_MAP per-agency override',
    resolveStationId('active911', '42') === 3);
  delete process.env.CAD_STATION_MAP;
  delete process.env.CAD_DEFAULT_STATION_ID;

  // Summary
  console.log('\n' + '-'.repeat(40));
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(err => {
  console.error('smoke test crashed:', err);
  process.exit(2);
});
