/**
 * Golden-file tests for the NERIS export (client/src/utils/nerisExport.js).
 *
 * Runs under plain `node --test` — no Vite, no browser. nerisExport.js itself
 * is pure JS (the only browser API lives inside downloadNerisJson, which is
 * never called here), but it imports '../data/nerisTypes' without an
 * extension, so we register a test-only resolve hook before importing it.
 *
 * Golden objects are inline constants asserting ACTUAL current behavior of
 * the exporter. W4.1 (2026-06-10) intentionally changed behavior and updated
 * these goldens in the same commit: unit times are now REAL local→UTC
 * conversions (was: local wall-clock stamped with a fake Z), controlledTime
 * is emitted as time_fire_control (was: dropped), unparseable dates fall back
 * to now (was: 'FDID:NaN'), $0 losses are preserved (was: nulled by
 * truthiness), and the hardcoded NJ FDID/state defaults are gone (missing
 * FDID is now a validation ERROR). Unit-time expectations are computed with
 * the same Date math as the exporter so the suite passes in any timezone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./_resolveExtensions.mjs', import.meta.url));

const {
  generateNerisId,
  toNerisIncident,
  validateNerisIncident,
  exportNerisBundle,
} = await import('../nerisExport.js');

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// ─── Fixtures ────────────────────────────────────────────────────────────────

// 2026-03-15T00:00:00Z
const STRUCTURE_FIRE_EPOCH = 1773532800000;

const STRUCTURE_FIRE_NFIRS = {
  id: 77,
  fdid: 'NJ14-001',
  incidentNumber: '2026-0142',
  incidentDate: '2026-03-15',
  alarmTime: '14:32',
  arrivalTime: '14:38',
  controlledTime: '15:05',
  clearedTime: '16:10',
  narrative: 'E1 arrived to find a room and contents fire in the first-floor kitchen. Interior attack with a 1.75" line, primary and secondary searches negative, fire under control at 15:05.',
  detectorPresence: 'PRESENT',
  detectorOperation: 'OPERATED',
  sprinklerPresence: 'NONE',
  sprinklerOperation: null,
  aidDirection: 'RECEIVED',
  aidType: 'AUTOMATIC',
  aidDepartment: 'Cinnaminson Fire Department',
  structureType: 'SINGLE_FAMILY',
  storiesAbove: '2',
  storiesBelow: '1',
  fireOrigin: 'Kitchen',
  fireCause: 'Unattended cooking',
  conditionOnArrival: 'Smoke showing',
  propertyLoss: '125000',
  contentsLoss: '40000.50',
  firefighterInjuries: '1',
  civilianInjuries: 2,
  displacedNumber: 4,
  animalRescues: 1,
  impediment: 'Hydrant frozen',
};

const STRUCTURE_FIRE_INCIDENT = {
  incidentNumber: '2026-0142',
  date: '2026-03-15',
  time: '14:31',
  type: 'Structure Fire',
  neris_type: 'FIRE.STRUCTURE_FIRE.ROOM_AND_CONTENTS_FIRE',
  address: '123 Main St, Riverton, NJ 08077',
  units: ['E1', 'TL1', 'C1'],
  personnel: 12,
  actions_taken: [
    'COMMAND_AND_CONTROL.ESTABLISH_INCIDENT_COMMAND',
    'SUPPRESSION.EXTINGUISH.INTERIOR_ATTACK',
  ],
  latitude: '40.0123',
  longitude: '-74.9876',
};

const STRUCTURE_FIRE_OPTIONS = { fdid: 'NJ14-001', stationName: 'Riverton Fire Co. 1' };

// Golden constant — the full expected NERIS document for the structure fire,
// minus _meta.export_date (nondeterministic; asserted by shape separately).
const STRUCTURE_FIRE_GOLDEN = {
  incident_neris_id: `NJ14-001:${STRUCTURE_FIRE_EPOCH}`,
  incident_internal_id: '2026-0142',
  incident_final_type: [['FIRE', 'STRUCTURE_FIRE', 'ROOM_AND_CONTENTS_FIRE']],
  incident_final_type_primary: [true],
  incident_point: {
    type: 'Point',
    coordinates: [-74.9876, 40.0123],
  },
  incident_location: {
    an_number: '123',
    an_complete: '123',
    sn_street_name: 'Main St',
    csop_postal_comm: 'Riverton',
    csop_state: 'NJ',
    csop_postal_code: '08077',
    csop_country: 'US',
  },
  incident_people_present: true,
  incident_displaced_number: 4,
  incident_rescue_animal: 1,
  incident_actions_taken: [
    ['COMMAND_AND_CONTROL', 'ESTABLISH_INCIDENT_COMMAND'],
    ['SUPPRESSION', 'EXTINGUISH', 'INTERIOR_ATTACK'],
  ],
  // W4.1: real local→UTC conversion, computed with the exporter's own Date
  // math so the golden is timezone-independent; time_fire_control now present.
  unit_response: ['E1', 'TL1', 'C1'].map(unit_id_reported => ({
    unit_id_reported,
    time_dispatch: new Date('2026-03-15T14:32:00').toISOString(),
    time_on_scene: new Date('2026-03-15T14:38:00').toISOString(),
    time_fire_control: new Date('2026-03-15T15:05:00').toISOString(),
    time_unit_clear: new Date('2026-03-15T16:10:00').toISOString(),
  })),
  risk_reduction: {
    detector_present: 'PRESENT',
    detector_operation: 'OPERATED',
    sprinkler_present: 'NONE',
    sprinkler_operation: null,
  },
  incident_aid_direction: 'RECEIVED',
  incident_aid_type: 'AUTOMATIC',
  incident_aid_department_name: ['Cinnaminson Fire Department'],
  incident_narrative_outcome: STRUCTURE_FIRE_NFIRS.narrative,
  incident_narrative_impediment: 'Hydrant frozen',
  rescue_ff: [{ ff_deaths: 0, ff_injuries: 1 }],
  rescue_nonff: [{ civilian_deaths: 0, civilian_injuries: 2 }],
  fire: {
    structure_type: 'SINGLE_FAMILY',
    stories_above_grade: 2,
    stories_below_grade: 1,
    fire_origin: 'Kitchen',
    fire_cause: 'Unattended cooking',
    fire_condition_on_arrival: 'Smoke showing',
    property_loss: 125000,
    contents_loss: 40000.5,
  },
  _meta: {
    neris_version: '1.0',
    source: 'OpenFirehouse',
    fdid: 'NJ14-001',
    station_name: 'Riverton Fire Co. 1',
    original_incident_number: '2026-0142',
    original_nfirs_report_id: 77,
  },
};

// ─── Golden case 1: fully-populated structure fire ──────────────────────────

test('golden: fully-populated structure fire produces the exact NERIS document', () => {
  const neris = toNerisIncident(STRUCTURE_FIRE_NFIRS, STRUCTURE_FIRE_INCIDENT, STRUCTURE_FIRE_OPTIONS);

  // Nondeterministic field: assert shape, then strip for the golden compare.
  assert.match(neris._meta.export_date, ISO_DATE_RE, '_meta.export_date must be a full ISO timestamp');
  const actual = structuredClone(neris);
  delete actual._meta.export_date;

  assert.deepEqual(actual, STRUCTURE_FIRE_GOLDEN);
});

test('golden: fully-populated structure fire validates clean — 100% complete, no warnings', () => {
  const neris = toNerisIncident(STRUCTURE_FIRE_NFIRS, STRUCTURE_FIRE_INCIDENT, STRUCTURE_FIRE_OPTIONS);
  const result = validateNerisIncident(neris);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.completeness, 100);
});

test('structure fire: no hazsit or medical modules attached', () => {
  const neris = toNerisIncident(STRUCTURE_FIRE_NFIRS, STRUCTURE_FIRE_INCIDENT, STRUCTURE_FIRE_OPTIONS);
  assert.equal('hazsit' in neris, false);
  assert.equal('medical' in neris, false);
});

// ─── Golden case 2: minimal incident → documented warnings/errors ───────────

test('golden: minimal incident yields the documented validation errors + warnings', () => {
  const neris = toNerisIncident({}, {});
  const result = validateNerisIncident(neris);

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, [
    'Missing FDID — set your department FDID in Station Settings', // W4.1: no silent NJ default
    'Missing incident_internal_id (incident number)',
    'Missing incident_location (address)',
  ]);
  assert.deepEqual(result.warnings, [
    'Missing incident_point (GPS coordinates) — required for NERIS submission',
    'No unit_response data — add responding units with timestamps',
    'No actions_taken or noaction reason — at least one is required',
    'Missing narrative — recommended for complete NERIS report',
  ]);
  assert.equal(result.completeness, 50);
});

test('minimal incident: structural defaults', () => {
  const neris = toNerisIncident({}, {});

  // W4.1: NO default fdid (empty segment) + a generated id even with no date
  // (falls back to Date.now()).
  assert.match(neris.incident_neris_id, /^:\d{13}$/);
  assert.equal(neris.incident_internal_id, '');
  // No type info at all → the PUBSERV citizen-assist fallback.
  assert.deepEqual(neris.incident_final_type, [['PUBSERV', 'CITIZEN_ASSIST', 'CITIZEN_ASSIST_SERVICE_CALL']]);
  assert.deepEqual(neris.incident_location, {});
  assert.equal(neris.incident_point, null);
  assert.deepEqual(neris.unit_response, []);
  assert.deepEqual(neris.incident_actions_taken, []);
  assert.deepEqual(neris.rescue_ff, []);
  assert.deepEqual(neris.rescue_nonff, []);
  assert.equal(neris.incident_people_present, false);
  assert.equal('incident_noaction' in neris, false);
});

test('units present but no dispatch/on-scene times → per-unit warnings', () => {
  const neris = toNerisIncident({}, { units: ['E1', 'TL1'] });
  const result = validateNerisIncident(neris);

  assert.ok(result.warnings.includes('Unit E1: missing dispatch time'));
  assert.ok(result.warnings.includes('Unit E1: missing on-scene time'));
  assert.ok(result.warnings.includes('Unit TL1: missing dispatch time'));
  assert.ok(result.warnings.includes('Unit TL1: missing on-scene time'));
});

test('no-action reasons map from disposition when no actions taken', () => {
  const cancelled = toNerisIncident({}, { disposition: 'Cancelled En Route' });
  assert.equal(cancelled.incident_noaction, 'CANCELLED');

  const nothing = toNerisIncident({}, { disposition: 'No Action Required' });
  assert.equal(nothing.incident_noaction, 'NO_INCIDENT_FOUND');

  // With actions present the noaction field is never set.
  const acted = toNerisIncident({}, {
    disposition: 'Cancelled En Route',
    actions_taken: ['COMMAND_AND_CONTROL.ESTABLISH_INCIDENT_COMMAND'],
  });
  assert.equal('incident_noaction' in acted, false);
});

// ─── Case 3: hazmat incident → hazsit module ─────────────────────────────────

test('hazmat: HAZSIT neris_type attaches a fully-mapped hazsit module', () => {
  const neris = toNerisIncident(
    {
      incidentNumber: '2026-0187',
      incidentDate: '2026-04-02',
      hazmat_material: 'Chlorine',
      hazmat_class: '2.3',
      hazmat_quantity: '150 lb cylinder',
      hazmat_ppe_level: 'Level A',
      hazmat_decon: true,
      hazmat_erg_guide: '124',
      hazmat_operations: 'Entry team isolated the leaking valve.',
      hazmat_planning: 'Downwind isolation 800m per ERG Table 1.',
      hazmat_logistics: 'County hazmat trailer requested.',
      hazmat_finance: 'Contractor billed to responsible party.',
      hazmat_contractor: 'EnviroClean LLC',
      hazmat_cost: '12500',
    },
    {
      neris_type: 'HAZSIT.HAZARDOUS_MATERIALS.HAZMAT_RELEASE_FACILITY',
      address: '900 Industrial Way, Delran, NJ 08075',
      units: ['HM1'],
    },
  );

  assert.deepEqual(neris.incident_final_type, [['HAZSIT', 'HAZARDOUS_MATERIALS', 'HAZMAT_RELEASE_FACILITY']]);
  assert.deepEqual(neris.hazsit, {
    material: 'Chlorine',
    hazmat_class: '2.3',
    quantity: '150 lb cylinder',
    ppe_level: 'Level A',
    decon_performed: true,
    erg_guide: '124',
    operations_narrative: 'Entry team isolated the leaking valve.',
    planning_narrative: 'Downwind isolation 800m per ERG Table 1.',
    logistics_narrative: 'County hazmat trailer requested.',
    finance_narrative: 'Contractor billed to responsible party.',
    contractor: 'EnviroClean LLC',
    estimated_cost: '12500',
  });
  // HAZSIT incidents do not get the fire module.
  assert.equal('fire' in neris, false);
});

test('hazmat: hazmat_material alone attaches hazsit even on a non-HAZSIT incident', () => {
  const neris = toNerisIncident(
    { hazmat_material: 'Gasoline' },
    { neris_type: 'FIRE.TRANSPORTATION_FIRE.VEHICLE_FIRE_PASSENGER' },
  );

  assert.equal(neris.hazsit.material, 'Gasoline');
  assert.equal(neris.hazsit.decon_performed, false);
  // Still a FIRE category, so the fire module is also attached.
  assert.ok(neris.fire);
});

// ─── Case 4: narrative source — merged.narrative || merged.notes ─────────────
// DOCTRINE (Matt, 2026-06-10): incident narratives are written entirely by the
// officer — AI plays zero role in them. These tests prove the OFFICER-WRITTEN
// notes are what flow into incident_narrative_outcome on export.

test('narrative: officer-written notes flow through to incident_narrative_outcome', () => {
  const officerText = 'Engine 1 investigated an activated alarm; system reset. — Capt. Lavin';
  const neris = toNerisIncident({}, { notes: officerText });

  assert.equal(neris.incident_narrative_outcome, officerText);

  const result = validateNerisIncident(neris);
  assert.ok(!result.warnings.includes('Missing narrative — recommended for complete NERIS report'));
});

test('narrative: explicit NFIRS narrative field (also officer-written) wins over notes', () => {
  const neris = toNerisIncident(
    { narrative: 'The official officer-written narrative.' },
    { notes: 'Older scratch notes.' },
  );
  assert.equal(neris.incident_narrative_outcome, 'The official officer-written narrative.');
});

test('narrative: empty notes (officer has not written the narrative yet) → empty narrative + warning', () => {
  const neris = toNerisIncident({}, { notes: '' });

  assert.equal(neris.incident_narrative_outcome, '');
  const result = validateNerisIncident(neris);
  assert.ok(result.warnings.includes('Missing narrative — recommended for complete NERIS report'));
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

test('edge: unparseable incident date does not throw — falls back to now (W4.1, was FDID:NaN)', () => {
  let neris;
  const before = Date.now();
  assert.doesNotThrow(() => {
    neris = toNerisIncident({ incidentDate: 'not-a-date', fdid: 'FD99' }, {});
  });
  const epoch = Number(neris.incident_neris_id.split(':')[1]);
  assert.match(neris.incident_neris_id, /^FD99:\d{13}$/);
  assert.ok(epoch >= before && epoch <= Date.now());
});

test('edge: generateNerisId with no date falls back to now', () => {
  const before = Date.now();
  const id = generateNerisId('FD99');
  const after = Date.now();
  const epoch = Number(id.split(':')[1]);

  assert.match(id, /^FD99:\d+$/);
  assert.ok(epoch >= before && epoch <= after);
});

test('edge: units without any date info get bare unit_response entries (no timestamps)', () => {
  const neris = toNerisIncident({ alarmTime: '10:00', arrivalTime: '10:05' }, { units: ['E1'] });
  // alarm/arrival exist but no date → no timestamps are emitted at all.
  assert.deepEqual(neris.unit_response, [{ unit_id_reported: 'E1' }]);
});

test('edge: unknown legacy incident type maps to the PUBSERV citizen-assist default', () => {
  const neris = toNerisIncident({}, { type: 'Alien Invasion' });
  assert.deepEqual(neris.incident_final_type, [['PUBSERV', 'CITIZEN_ASSIST', 'CITIZEN_ASSIST_SERVICE_CALL']]);
});

test('edge: known legacy type maps through LEGACY_TYPE_MAP', () => {
  const neris = toNerisIncident({}, { type: 'Gas Leak' });
  assert.deepEqual(neris.incident_final_type, [['HAZSIT', 'HAZARDOUS_MATERIALS', 'GAS_LEAK_ODOR']]);
});

test('edge: address without state uses options.defaultState, never a hardcoded NJ (W4.1)', () => {
  const bare = toNerisIncident({}, { address: '456 Oak Ave' });
  assert.equal(bare.incident_location.csop_state, ''); // no silent NJ

  const withDefault = toNerisIncident({}, { address: '456 Oak Ave' }, { defaultState: 'MT' });
  assert.deepEqual(withDefault.incident_location, {
    an_number: '456',
    an_complete: '456',
    sn_street_name: 'Oak Ave',
    csop_postal_comm: '',
    csop_state: 'MT',
    csop_postal_code: '',
    csop_country: 'US',
  });

  // Missing state surfaces as a validation warning
  const result = validateNerisIncident(bare);
  assert.ok(result.warnings.some(w => w.includes('Missing state in incident address')));
});

// ─── Bundle export ───────────────────────────────────────────────────────────

test('bundle: exportNerisBundle joins reports to incidents by incident number', () => {
  const bundle = exportNerisBundle(
    [STRUCTURE_FIRE_NFIRS],
    [STRUCTURE_FIRE_INCIDENT],
    STRUCTURE_FIRE_OPTIONS,
  );

  assert.equal(bundle.neris_version, '1.0');
  assert.match(bundle.export_date, ISO_DATE_RE);
  assert.equal(bundle.source, 'OpenFirehouse');
  assert.equal(bundle.fdid, 'NJ14-001');
  assert.equal(bundle.department_name, 'Riverton Fire Co. 1');
  assert.equal(bundle.incident_count, 1);
  assert.equal(bundle.incidents.length, 1);

  // The joined incident carries the units from the incident record.
  assert.deepEqual(
    bundle.incidents[0].unit_response.map(u => u.unit_id_reported),
    ['E1', 'TL1', 'C1'],
  );
  assert.equal(bundle.incidents[0].incident_internal_id, '2026-0142');
});

// ─── W4.1 additions (2026-06-10) ─────────────────────────────────────────────

test('W4.1: legitimate $0 losses are preserved, not nulled by truthiness', () => {
  const neris = toNerisIncident(
    { propertyLoss: '0', contentsLoss: 0, storiesAbove: 0, storiesBelow: '0' },
    { neris_type: 'FIRE.STRUCTURE_FIRE.ROOM_AND_CONTENTS_FIRE' },
  );
  assert.equal(neris.fire.property_loss, 0);
  assert.equal(neris.fire.contents_loss, 0);
  assert.equal(neris.fire.stories_above_grade, 0);
  assert.equal(neris.fire.stories_below_grade, 0);
  // absence still maps to null
  const empty = toNerisIncident({}, { neris_type: 'FIRE.STRUCTURE_FIRE.ROOM_AND_CONTENTS_FIRE' });
  assert.equal(empty.fire.property_loss, null);
});

test('W4.1: controlledTime is emitted as time_fire_control (was silently dropped)', () => {
  const neris = toNerisIncident(
    { incidentDate: '2026-03-15', alarmTime: '14:32', controlledTime: '15:05' },
    { units: ['E1'] },
  );
  assert.equal(neris.unit_response[0].time_fire_control, new Date('2026-03-15T15:05:00').toISOString());
});

test('W4.1: unit times are real local→UTC conversions, no fake Z suffix', () => {
  const neris = toNerisIncident(
    { incidentDate: '2026-03-15', alarmTime: '14:32' },
    { units: ['E1'] },
  );
  assert.equal(neris.unit_response[0].time_dispatch, new Date('2026-03-15T14:32:00').toISOString());
  // a garbage time emits nothing rather than a corrupt stamp
  const bad = toNerisIncident({ incidentDate: '2026-03-15', alarmTime: 'XX:99' }, { units: ['E1'] });
  assert.equal('time_dispatch' in bad.unit_response[0], false);
});

test('W4.1: per-state rules are opt-in and pluggable', async () => {
  const { getStateRules, applyStateRules } = await import('../../data/stateNerisRules.js');

  // NJ FDID format enforced
  const nj = getStateRules('NJ');
  const badFdid = toNerisIncident({ fdid: 'TOTALLYWRONGFDID' }, { address: '1 Main St, Riverton, NJ 08077' });
  const r1 = applyStateRules(badFdid, nj);
  assert.ok(r1.errors.some(e => e.includes('does not match the New Jersey format')));

  const goodFdid = toNerisIncident({ fdid: '14-001', incidentDate: '2020-01-01' }, {});
  const r2 = applyStateRules(goodFdid, nj);
  assert.equal(r2.errors.length, 0);
  // 2020 incident is way past NJ's 30-day deadline → warning
  assert.ok(r2.warnings.some(w => w.includes('30-day submission deadline')));

  // Unknown state falls back to DEFAULT rules (no deadline)
  const mt = getStateRules('MT');
  assert.equal(mt.submissionDeadlineDays, null);
  const r3 = applyStateRules(goodFdid, mt);
  assert.equal(r3.warnings.length, 0);

  // Opt-in through validateNerisIncident
  const validated = validateNerisIncident(badFdid, { state: 'NJ' });
  assert.ok(validated.errors.some(e => e.includes('New Jersey format')));
  const notOpted = validateNerisIncident(badFdid);
  assert.equal(notOpted.errors.some(e => e.includes('New Jersey format')), false);
});

test('W4.1: NFIRS 5.0 flat-file export (roadmap 2.5)', async () => {
  const { exportNfirsFlatFile, toBasicModuleRecord } = await import('../nfirsFlatFile.js');

  const report = {
    incidentNumber: '2026-0142', incidentDate: '2026-03-15',
    alarmTime: '14:32', arrivalTime: '14:38', controlledTime: '15:05', clearedTime: '16:10',
    incidentTypeCode: '111', actionTakenCode: '11', propertyUseCode: '419',
    aidDirection: 'RECEIVED', propertyLoss: '125000', contentsLoss: '40000.50',
    firefighterInjuries: '1', civilianInjuries: 2,
    address: '123 Main St, Riverton, NJ 08077', city: 'Riverton', zip: '08077',
  };
  const rec = toBasicModuleRecord(report, { fdid: '14-001', state: 'NJ' });
  const f = rec.split('^');
  assert.equal(f[0], '1');           // basic module
  assert.equal(f[1], '14-001');      // fdid
  assert.equal(f[2], 'NJ');          // state
  assert.equal(f[3], '03152026');    // MMDDYYYY
  assert.equal(f[5], '2026-0142');   // incident number
  assert.equal(f[7], '111');         // incident type code
  assert.equal(f[8], '1432');        // alarm HHMM
  assert.equal(f[10], '1505');       // controlled HHMM
  assert.equal(f[14], '1');          // aid received
  assert.equal(f[21], '123 Main St');// street line only

  const file = exportNfirsFlatFile([report], { fdid: '14-001', state: 'NJ' });
  const lines = file.trim().split('\r\n');
  assert.equal(lines.length, 3);                    // header + 1 record + trailer
  assert.ok(lines[0].startsWith('0^14-001^NJ^'));   // header
  assert.equal(lines[2], '9^1');                    // trailer with count

  // caret injection in a field is neutralized
  const hostile = toBasicModuleRecord({ incidentNumber: 'X^Y^Z' }, {});
  assert.equal(hostile.split('^')[5], 'X Y Z');
});
