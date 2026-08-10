'use strict';
/**
 * Golden tests for the ONE canonical NERIS transformer (utils/nerisPayload).
 * Pins the live-API IncidentPayload shape (D4) and the honesty rules (F8/F9):
 * no silent type default, no hardcoded department id, no fake-UTC timestamps.
 * Pure — no DB required.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildNerisIncidentPayload,
  LEGACY_TYPE_MAP,
  localToUtcIso,
} = require('../utils/nerisPayload');

const DEPT = { id: 1, name: 'Demo FD', fdid: 'FD12345678' };

function fireIncident(extra = {}) {
  return {
    id: 42,
    incidentNumber: '26-0100',
    date: '2026-07-01',
    time: '14:05',
    address: '123 Main St, Riverton, NJ 08077',
    units: JSON.stringify(['E1', 'TL1']),
    notes: 'Fire knocked down, overhaul completed.',
    neris_incident_types: [
      { value: 'FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE', primary: true },
    ],
    neris_actions: [
      'SUPPRESSION||STRUCTURAL_FIRE_SUPPRESSION||INTERIOR',
      'COMMAND_AND_CONTROL||ESTABLISH_INCIDENT_COMMAND',
    ],
    neris_fire_detail: {
      location_detail: {
        type: 'STRUCTURE', floor_of_origin: 1, arrival_condition: 'SMOKE_FIRE_SHOWING',
        damage_type: 'MODERATE_DAMAGE', room_of_origin_type: 'KITCHEN', cause: 'COOKING',
      },
      water_supply: 'HYDRANT_GREATER_500',
      investigation_needed: 'NO',
      investigation_types: [],
    },
    ...extra,
  };
}

// ─── Shape: full fire incident happy path ────────────────────────────────────

test('fire incident: pins the IncidentPayload shape', () => {
  const { payload, validation, _meta } = buildNerisIncidentPayload({
    incident: fireIncident(),
    nfirsReport: { incidentDate: '2026-07-01', alarmTime: '14:05', arrivalTime: '14:11', clearedTime: '15:00' },
    department: DEPT,
  });

  // base
  assert.equal(payload.base.department_neris_id, 'FD12345678');
  assert.equal(payload.base.incident_number, '26-0100');
  assert.equal(payload.base.location.street, 'Main St');
  assert.equal(payload.base.location.complete_number, '123');
  assert.equal(payload.base.location.postal_community, 'Riverton');
  assert.equal(payload.base.location.state, 'NJ');
  assert.equal(payload.base.location.country, 'US');
  assert.equal(payload.base.outcome_narrative, 'Fire knocked down, overhaul completed.');

  // incident_types: stored {value, primary} → payload {type, primary}
  assert.deepEqual(payload.incident_types, [
    { type: 'FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE', primary: true },
  ]);
  assert.equal(_meta.type_source, 'stored');

  // actions: ACTION discriminator, verbatim pass-through
  assert.equal(payload.actions_tactics.action_noaction.type, 'ACTION');
  assert.deepEqual(payload.actions_tactics.action_noaction.actions, [
    'SUPPRESSION||STRUCTURAL_FIRE_SUPPRESSION||INTERIOR',
    'COMMAND_AND_CONTROL||ESTABLISH_INCIDENT_COMMAND',
  ]);

  // units (JSON-text array normalized)
  assert.equal(payload.unit_responses.length, 2);
  assert.equal(payload.unit_responses[0].reported_unit_id, 'E1');
  assert.ok(payload.unit_responses[0].dispatch, 'unit dispatch time present');
  assert.ok(payload.unit_responses[0].on_scene, 'unit on-scene time present');

  // fire module passes through when required fields are stored
  assert.equal(payload.fire_detail.water_supply, 'HYDRANT_GREATER_500');
  assert.equal(
    validation.errors.filter((e) => e.startsWith('Fire module')).length, 0,
    'no fire-module errors when required fields stored'
  );

  // meta
  assert.equal(_meta.payload_shape, 'IncidentPayload/v1');
  assert.ok(_meta.spec_version, 'spec version stamped');
});

// ─── No-action path ──────────────────────────────────────────────────────────

test('noaction-only record emits NOACTION discriminated union', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    incident: {
      incidentNumber: '26-0101', date: '2026-07-02', time: '09:00',
      address: '9 Oak Ave, Riverton, NJ 08077',
      neris_incident_types: [{ value: 'NOEMERG||CANCELLED', primary: true }],
      neris_noaction: 'CANCELLED',
    },
    department: DEPT,
  });
  assert.deepEqual(payload.actions_tactics, {
    action_noaction: { type: 'NOACTION', noaction_type: 'CANCELLED' },
  });
  assert.equal(validation.errors.filter((e) => e.includes('no-action')).length, 0);
});

// ─── Legacy crosswalk + the removed silent default (F8) ─────────────────────

test('legacy type crosswalk is flagged in _meta', () => {
  const { payload, _meta } = buildNerisIncidentPayload({
    incident: { incidentNumber: '26-0102', type: 'Gas Leak', address: '1 Elm St, Riverton, NJ 08077' },
    department: DEPT,
  });
  assert.equal(_meta.type_source, 'legacy_crosswalk');
  assert.deepEqual(payload.incident_types, [
    { type: 'HAZSIT||HAZARDOUS_MATERIALS||GAS_LEAK_ODOR', primary: true },
  ]);
});

test('unmappable type is an ERROR and payload carries NO default type (F8)', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    incident: { incidentNumber: '26-0103', type: 'Alien Invasion', address: '1 Elm St, Riverton, NJ 08077' },
    department: DEPT,
  });
  assert.equal(payload.incident_types.length, 0);
  assert.ok(validation.errors.some((e) => e.includes('Unmappable incident type') && e.includes('Alien Invasion')));
  const flat = JSON.stringify(payload);
  assert.ok(!flat.includes('CITIZEN_ASSIST_SERVICE_CALL'), 'the old silent default is gone');
});

// ─── Department id: never hardcoded (F8) ────────────────────────────────────

test('missing department NERIS id is an ERROR, never a literal', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    incident: fireIncident(),
    department: {},
  });
  assert.equal(payload.base.department_neris_id, '');
  assert.ok(validation.errors.some((e) => e.includes('department NERIS ID')));
  assert.ok(!JSON.stringify(payload).includes('NJ14-001'));
});

test('non-NERIS-format department id warns but exports', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    incident: fireIncident(),
    department: { name: 'Demo', fdid: '14-001' },
  });
  assert.equal(payload.base.department_neris_id, '14-001');
  assert.ok(validation.warnings.some((w) => w.includes('not NERIS format')));
});

// ─── Timestamps: real UTC conversion, never fake-UTC (F9) ───────────────────

test('localToUtcIso converts local wall-clock to true UTC (incl. DST boundary)', () => {
  for (const [date, hhmm] of [['2026-07-01', '14:05'], ['2026-03-08', '02:30'], ['2026-11-01', '01:30']]) {
    const expected = new Date(`${date}T${hhmm}:00`).toISOString();
    assert.equal(localToUtcIso(date, hhmm), expected, `${date} ${hhmm}`);
    // fake-UTC regression: the emitted instant must differ from the naive
    // Z-stamped string whenever the local zone is not UTC.
    const fake = `${date}T${hhmm}:00Z`;
    if (new Date(fake).getTime() !== new Date(`${date}T${hhmm}:00`).getTime()) {
      assert.notEqual(localToUtcIso(date, hhmm), fake, 'must not Z-stamp local time');
    }
  }
});

test('unparseable times are omitted, not corrupted', () => {
  assert.equal(localToUtcIso('2026-03-15', 'XX:99'), null);
  const { payload } = buildNerisIncidentPayload({
    incident: { incidentNumber: '26-0104', units: 'E1', date: '2026-03-15', time: 'XX:99', address: '1 Elm St, Riverton, NJ' },
    department: DEPT,
  });
  assert.equal(payload.unit_responses[0].dispatch, undefined);
});

// ─── Dispatch required fields ────────────────────────────────────────────────

test('missing PSAP call times are validation errors (API-required)', () => {
  const { validation } = buildNerisIncidentPayload({
    incident: fireIncident(),
    department: DEPT,
  });
  assert.ok(validation.errors.some((e) => e.includes('call_answered')));
  assert.ok(validation.errors.some((e) => e.includes('call_arrival')));
});

test('cad alert supplies call_create/incident_clear/disposition', () => {
  const { payload } = buildNerisIncidentPayload({
    incident: fireIncident({ neris_actions: null, neris_noaction: 'NO_INCIDENT_FOUND', neris_incident_types: [{ value: 'NOEMERG||CANCELLED', primary: true }], neris_fire_detail: null }),
    department: DEPT,
    cadAlert: {
      dispatched_at: new Date('2026-07-01T18:05:00Z'),
      cleared_at: new Date('2026-07-01T18:25:00Z'),
      disposition: 'NO_INCIDENT_FOUND',
      latitude: '40.0115', longitude: '-74.9915',
    },
  });
  assert.equal(payload.dispatch.call_create, '2026-07-01T18:05:00.000Z');
  assert.equal(payload.dispatch.incident_clear, '2026-07-01T18:25:00.000Z');
  assert.equal(payload.dispatch.disposition, 'NO_INCIDENT_FOUND');
  // pg NUMERIC strings are coerced (F10)
  assert.deepEqual(payload.base.point.geometry.coordinates, [-74.9915, 40.0115]);
  assert.equal(payload.base.point.crs, 4326);
});

// 🔴 REGRESSION FENCE (2026-08-08). `call_create` is a PSAP time: it comes from the
// CAD integration or it is a validation error. It must NEVER be derived from an
// incident's own dispatch/alarm/time columns.
//
// The hole this closes: `callCreate = cadAlert.dispatched_at || tDispatch`, where
// tDispatch = dispatchTime || alarmTime || incident.time — and the Command Board
// used to WRITE incident.time from milestones.dispatched, i.e. on a manual
// activation, the instant a dispatcher clicked "Activate Incident". That click
// became the 911 call time on a subpoenable record. It slipped past P2-D4 because
// it never touched a NERIS-named field; it rode in as a generic column and only
// became a PSAP time inside this transformer.
//
// Matt, 2026-07-26 / re-affirmed 2026-08-08: the Command Board reflects, it never
// activates — and every NERIS time comes from the CAD integration.
test('NO cad alert: call_create is NOT derived from the incident clock — it is an error', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    // Every fallback tDispatch would have reached for, all populated on purpose.
    incident: fireIncident({ time: '14:05', dispatchTime: '14:05', alarmTime: '14:05' }),
    department: DEPT,
    cadAlert: null,
  });

  assert.equal(payload.dispatch.call_create, null,
    'a time the CAD never supplied must not appear as the 911 call time');
  assert.ok(validation.errors.some((e) => e.includes('call_create')),
    'a missing call_create must surface as a validation error, never be invented');
});

// The OTHER half of the same rule: a human may state it. `call_answered` and
// `call_arrival` always had this second leg; `call_create` did not, and reached for the
// incident clock instead. That asymmetry — not the Command Board — was the defect. The
// board was just the ugliest way the generic column got filled.
test('NO cad alert: an officer-entered call_create IS honoured — CAD or a human, never us', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    incident: fireIncident({
      time: '14:05', dispatchTime: '14:05', alarmTime: '14:05',
      neris_dispatch_times: {
        call_create: '2026-07-01T17:58:00.000Z',
        call_answered: '2026-07-01T17:59:00.000Z',
        call_arrival: '2026-07-01T17:58:30.000Z',
      },
    }),
    department: DEPT,
    cadAlert: null,
  });

  assert.equal(payload.dispatch.call_create, '2026-07-01T17:58:00.000Z',
    'the officer-stated PSAP time is used verbatim');
  assert.ok(!validation.errors.some((e) => e.includes('call_create')));
  // And it is the STATED value, not the incident clock that sits right next to it.
  assert.notEqual(payload.dispatch.call_create, payload.unit_responses[0]?.dispatch);
});

test('the CAD column WINS over an officer entry for call_create — same precedence as its siblings', () => {
  const { payload } = buildNerisIncidentPayload({
    incident: fireIncident({
      neris_dispatch_times: { call_create: '2026-07-01T17:58:00.000Z' },
    }),
    department: DEPT,
    cadAlert: { dispatched_at: new Date('2026-07-01T18:05:00Z') },
  });
  assert.equal(payload.dispatch.call_create, '2026-07-01T18:05:00.000Z');
});

// ─── Module honesty ──────────────────────────────────────────────────────────

test('fire-typed incident with no fire detail gets per-field errors, no guessed module', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    incident: fireIncident({ neris_fire_detail: null }),
    department: DEPT,
  });
  assert.equal(payload.fire_detail, null);
  for (const f of ['location_detail', 'water_supply', 'investigation_needed', 'investigation_types']) {
    assert.ok(validation.errors.some((e) => e.includes(`"${f}"`)), `error for ${f}`);
  }
});

test('hazsit requireds enforced; legacy hazmat block preserved in _meta.unexported', () => {
  const { payload, validation, _meta } = buildNerisIncidentPayload({
    incident: {
      incidentNumber: '26-0105', address: '1 Elm St, Riverton, NJ',
      neris_incident_types: [{ value: 'HAZSIT||HAZARDOUS_MATERIALS||GAS_LEAK_ODOR', primary: true }],
      neris_actions: ['HAZARDOUS_SITUATION_MITIGATION||LEAK_STOP'],
      neris_hazsit_detail: {
        evacuated: 12,
        disposition: 'COMPLETED_FIRE_SERVICE_ONLY',
        material: 'Natural gas', ppe_level: 'B', decon: false,
      },
    },
    department: DEPT,
  });
  assert.equal(payload.hazsit_detail.evacuated, 12);
  assert.equal(payload.hazsit_detail.disposition, 'COMPLETED_FIRE_SERVICE_ONLY');
  assert.equal(payload.hazsit_detail.material, undefined, 'legacy fields not guessed into the payload');
  assert.equal(_meta.unexported.hazmat.material, 'Natural gas');
  assert.equal(validation.errors.filter((e) => e.startsWith('Hazsit module')).length, 0);

  const missing = buildNerisIncidentPayload({
    incident: {
      incidentNumber: '26-0106', address: '1 Elm St, Riverton, NJ',
      neris_incident_types: [{ value: 'HAZSIT||HAZARDOUS_MATERIALS||GAS_LEAK_ODOR', primary: true }],
    },
    department: DEPT,
  });
  assert.ok(missing.validation.errors.some((e) => e.includes('"evacuated"')));
  assert.ok(missing.validation.errors.some((e) => e.includes('"disposition"')));
});

test('medical entries require patient_care_evaluation', () => {
  const { validation } = buildNerisIncidentPayload({
    incident: {
      incidentNumber: '26-0107', address: '1 Elm St, Riverton, NJ',
      neris_incident_types: [{ value: 'MEDICAL||ILLNESS||CARDIAC_ARREST', primary: true }],
      neris_actions: ['EMERGENCY_MEDICAL_CARE||PROVIDE_BASIC_LIFE_SUPPORT'],
      neris_medical_details: [
        { patient_care_evaluation: 'PATIENT_EVALUATED_CARE_PROVIDED', transport_disposition: 'TRANSPORT_BY_EMS_UNIT' },
        { patient_status: 'IMPROVED' },
      ],
    },
    department: DEPT,
  });
  assert.ok(validation.errors.some((e) => e.includes('patient 2') && e.includes('patient_care_evaluation')));
});

// ─── Zero-preservation + truncation ─────────────────────────────────────────

test('$0 loss survives into _meta.unexported (zero is data)', () => {
  const { _meta } = buildNerisIncidentPayload({
    incident: fireIncident(),
    nfirsReport: { propertyLoss: 0, contentsLoss: '0' },
    department: DEPT,
  });
  assert.equal(_meta.unexported.loss.property_loss, 0);
  assert.equal(_meta.unexported.loss.contents_loss, 0);
});

test('narrative over 100k chars is truncated with a warning', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    incident: fireIncident({ notes: 'x'.repeat(100050) }),
    department: DEPT,
  });
  assert.equal(payload.base.outcome_narrative.length, 100000);
  assert.ok(validation.warnings.some((w) => w.includes('truncated')));
});

test('empty narrative becomes absent, not empty string (minLength 1)', () => {
  const { payload } = buildNerisIncidentPayload({
    incident: fireIncident({ notes: '' }),
    department: DEPT,
  });
  assert.equal(payload.base.outcome_narrative, undefined);
});

// ─── Phase 2: fire-module oneOf (P2-D1, F24) ────────────────────────────────

test('STRUCTURE branch: full FirePayload golden — the const type comes from the branch', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    incident: fireIncident({
      neris_fire_detail: {
        location_detail: {
          type: 'STRUCTURE', floor_of_origin: -1, arrival_condition: 'SMOKE_SHOWING',
          damage_type: 'MAJOR_DAMAGE', room_of_origin_type: 'BASEMENT', cause: 'ELECTRICAL',
          progression_evident: true,
        },
        water_supply: 'HYDRANT_LESS_500',
        investigation_needed: 'YES',
        investigation_types: ['INVESTIGATED_BY_STATE_FIRE_MARSHAL'],
        suppression_appliances: ['SMALL_DIAMETER_FIRE_HOSE'],
      },
    }),
    department: DEPT,
  });
  assert.deepEqual(payload.fire_detail, {
    location_detail: {
      type: 'STRUCTURE', floor_of_origin: -1, arrival_condition: 'SMOKE_SHOWING',
      damage_type: 'MAJOR_DAMAGE', room_of_origin_type: 'BASEMENT', cause: 'ELECTRICAL',
      progression_evident: true,
    },
    water_supply: 'HYDRANT_LESS_500',
    investigation_needed: 'YES',
    investigation_types: ['INVESTIGATED_BY_STATE_FIRE_MARSHAL'],
    suppression_appliances: ['SMALL_DIAMETER_FIRE_HOSE'],
  });
  assert.equal(validation.errors.filter((e) => e.startsWith('Fire module')).length, 0);
});

test('OUTSIDE branch golden — and stored junk can never ride out under the wrong const', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    incident: fireIncident({
      neris_incident_types: [{ value: 'FIRE||OUTSIDE_FIRE||WILDFIRE_WILDLAND', primary: true }],
      neris_fire_detail: {
        location_detail: { type: 'OUTSIDE', cause: 'DEBRIS_OPEN_BURNING', acres_burned: '2.5' },
        water_supply: 'TANK_WATER',
        investigation_needed: 'NOT_APPLICABLE',
        investigation_types: [],
      },
    }),
    department: DEPT,
  });
  assert.deepEqual(payload.fire_detail.location_detail,
    { type: 'OUTSIDE', cause: 'DEBRIS_OPEN_BURNING', acres_burned: 2.5 },
    'OUTSIDE const + numeric acres (pg NUMERIC strings coerced, F10)');
  assert.equal(validation.errors.filter((e) => e.startsWith('Fire module')).length, 0);

  // F24: an unknown branch type is NEVER emitted — the required-field errors name it
  const junk = buildNerisIncidentPayload({
    incident: fireIncident({
      neris_fire_detail: { ...fireIncident().neris_fire_detail, location_detail: { type: 'YARD' } },
    }),
    department: DEPT,
  });
  assert.equal(junk.payload.fire_detail.location_detail, undefined, 'unknown branch → no location_detail emitted');
  assert.ok(junk.validation.errors.some((e) => e.includes('"location_detail"')));
});

test('fire-typed with a location_detail but missing water_supply → error', () => {
  const fd = fireIncident().neris_fire_detail;
  delete fd.water_supply;
  const { validation } = buildNerisIncidentPayload({
    incident: fireIncident({ neris_fire_detail: fd }),
    department: DEPT,
  });
  assert.ok(validation.errors.some((e) => e.includes('"water_supply"')), 'water_supply named');
  assert.equal(validation.errors.filter((e) => e.includes('"location_detail"')).length, 0, 'the present branch is not re-flagged');
});

test('STRUCTURE branch with missing branch-required fields gets per-field errors', () => {
  const { validation } = buildNerisIncidentPayload({
    incident: fireIncident({
      neris_fire_detail: {
        location_detail: { type: 'STRUCTURE', floor_of_origin: 1 },
        water_supply: 'HYDRANT_GREATER_500', investigation_needed: 'NO', investigation_types: [],
      },
    }),
    department: DEPT,
  });
  for (const f of ['arrival_condition', 'damage_type', 'room_of_origin_type', 'cause']) {
    assert.ok(validation.errors.some((e) => e.includes(`"${f}"`) && e.includes('STRUCTURE')), `error for ${f}`);
  }
});

test('legacy pre-P2 fire keys are preserved in _meta.unexported, never guessed into a branch', () => {
  const { payload, _meta } = buildNerisIncidentPayload({
    incident: fireIncident({ neris_fire_detail: { condition_arrival: 'SMOKE_FIRE_SHOWING' } }),
    department: DEPT,
  });
  assert.equal(payload.fire_detail, null, 'nothing exportable → no fire_detail emitted');
  assert.equal(_meta.unexported.fire.condition_arrival, 'SMOKE_FIRE_SHOWING');
});

// ─── Phase 2: casualty/rescue mapping (P2-D2) ───────────────────────────────

test('FF fatal with cause → InjuryPayload golden', () => {
  const { payload } = buildNerisIncidentPayload({
    incident: fireIncident({
      neris_casualty_rescues: [
        { type: 'FF', injury: 'INJURED_FATAL', cause: 'CAUGHT_TRAPPED_BY_FIRE_EXPLOSION' },
      ],
    }),
    department: DEPT,
  });
  assert.deepEqual(payload.casualty_rescues, [{
    type: 'FF',
    casualty: { injury_or_noninjury: { type: 'INJURED_FATAL', cause: 'CAUGHT_TRAPPED_BY_FIRE_EXPLOSION' } },
  }]);
});

test('NONFF no-injury → the NoinjuryPayload const UNINJURED (never our capture value NONE)', () => {
  const { payload } = buildNerisIncidentPayload({
    incident: fireIncident({
      neris_casualty_rescues: [{ type: 'NONFF', injury: 'NONE', rescue_type: 'SELF_EVACUATION' }],
    }),
    department: DEPT,
  });
  assert.deepEqual(payload.casualty_rescues, [{
    type: 'NONFF',
    casualty: { injury_or_noninjury: { type: 'UNINJURED' } },
    rescue: { ffrescue_or_nonffrescue: { type: 'SELF_EVACUATION' } },
  }]);
});

test('FF-performed rescue WITHOUT removal omits the rescue sub-object + warns (never invented)', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    incident: fireIncident({
      neris_casualty_rescues: [{ type: 'FF', injury: 'NONE', rescue_type: 'RESCUED_BY_FF_RIT' }],
    }),
    department: DEPT,
  });
  assert.equal(payload.casualty_rescues[0].rescue, undefined, 'no invented removal_or_nonremoval');
  assert.ok(validation.warnings.some((w) => w.includes('RESCUED_BY_FF_RIT') && w.includes('removal')),
    'the warning names the gap');
});

test('civilian rescued by a firefighter WITH removal → full FfRescuePayload union (the common case)', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    incident: fireIncident({
      neris_casualty_rescues: [
        { type: 'NONFF', injury: 'INJURED_NONFATAL', cause: 'CAUGHT_TRAPPED_BY_FIRE_EXPLOSION', rescue_type: 'RESCUED_BY_FIREFIGHTER', removal: 'REMOVAL_FROM_STRUCTURE' },
        { type: 'FF', injury: 'INJURED_NONFATAL', rescue_type: 'RESCUED_BY_FF_RIT', removal: 'EXTRICATION' },
      ],
    }),
    department: DEPT,
  });
  assert.deepEqual(payload.casualty_rescues[0], {
    type: 'NONFF',
    casualty: { injury_or_noninjury: { type: 'INJURED_NONFATAL', cause: 'CAUGHT_TRAPPED_BY_FIRE_EXPLOSION' } },
    rescue: { ffrescue_or_nonffrescue: { type: 'RESCUED_BY_FIREFIGHTER', removal_or_nonremoval: { type: 'REMOVAL_FROM_STRUCTURE' } } },
  });
  assert.deepEqual(payload.casualty_rescues[1].rescue, {
    ffrescue_or_nonffrescue: { type: 'RESCUED_BY_FF_RIT', removal_or_nonremoval: { type: 'EXTRICATION' } },
  });
  assert.equal(validation.warnings.filter((w) => w.includes('removal')).length, 0,
    'no removal-gap warning when removal is captured');
});

test('structured entries supersede the legacy counts path; counts-only still preserves', () => {
  const withEntries = buildNerisIncidentPayload({
    incident: fireIncident({ neris_casualty_rescues: [{ type: 'NONFF', injury: 'INJURED_NONFATAL' }] }),
    nfirsReport: { civilianInjuries: 1 },
    department: DEPT,
  });
  assert.equal(withEntries._meta.unexported, null, 'no unexported counts when structured entries exist');

  const countsOnly = buildNerisIncidentPayload({
    incident: fireIncident(),
    nfirsReport: { civilianInjuries: 1 },
    department: DEPT,
  });
  assert.equal(countsOnly._meta.unexported.casualty_counts.civilian_injuries, 1, 'legacy counts still preserved without entries');
});

// ─── Phase 2: PSAP call-time precedence (P2-D4/F28) ─────────────────────────

test('PSAP precedence: CAD column beats officer-entered beats error', () => {
  const officerTimes = { call_answered: '2026-07-01T18:03:00.000Z', call_arrival: '2026-07-01T18:03:40.000Z' };

  // CAD carries the times → CAD wins even when officer-entered exists
  const cadWins = buildNerisIncidentPayload({
    incident: fireIncident({ neris_dispatch_times: officerTimes }),
    department: DEPT,
    cadAlert: {
      dispatched_at: new Date('2026-07-01T18:05:00Z'),
      call_answered_at: new Date('2026-07-01T18:02:00Z'),
      call_arrival_at: new Date('2026-07-01T18:02:30Z'),
    },
  });
  assert.equal(cadWins.payload.dispatch.call_answered, '2026-07-01T18:02:00.000Z');
  assert.equal(cadWins.payload.dispatch.call_arrival, '2026-07-01T18:02:30.000Z');

  // no CAD times → officer-entered fallback, and the errors clear
  const officerWins = buildNerisIncidentPayload({
    incident: fireIncident({ neris_dispatch_times: officerTimes }),
    department: DEPT,
  });
  assert.equal(officerWins.payload.dispatch.call_answered, officerTimes.call_answered);
  assert.equal(officerWins.payload.dispatch.call_arrival, officerTimes.call_arrival);
  assert.equal(officerWins.validation.errors.filter((e) => e.includes('call_answered') || e.includes('call_arrival')).length, 0);

  // nobody recorded them → still an error, never invented (covered above too)
  const nobody = buildNerisIncidentPayload({ incident: fireIncident(), department: DEPT });
  assert.equal(nobody.payload.dispatch.call_answered, null);
  assert.ok(nobody.validation.errors.some((e) => e.includes('call_answered')));
});

// ─── Phase 2: completeness is now 14 checks ─────────────────────────────────

test('completeness: a fully-complete fire incident scores 100 (15/15 checks)', () => {
  // FP (0063): a structure fire is only "complete" WITH its fire-protection
  // modules — the fixture carries them, exactly as the live API requires.
  const { validation } = buildNerisIncidentPayload({
    incident: fireIncident({ neris_fire_protection: {
      smoke_alarm: { presence: { type: 'PRESENT', working: true } },
      fire_alarm: { presence: { type: 'NOT_PRESENT' } },
      other_alarm: { presence: { type: 'NOT_PRESENT' } },
      fire_suppression: { presence: { type: 'NOT_PRESENT' } },
    } }),
    nfirsReport: { incidentDate: '2026-07-01', alarmTime: '14:05', clearedTime: '15:00' },
    department: DEPT,
    cadAlert: {
      dispatched_at: new Date('2026-07-01T18:05:00Z'),
      cleared_at: new Date('2026-07-01T19:00:00Z'),
      call_answered_at: new Date('2026-07-01T18:02:00Z'),
      call_arrival_at: new Date('2026-07-01T18:02:30Z'),
      latitude: '40.0115', longitude: '-74.9915',
    },
  });
  assert.equal(validation.completeness, 100, '15/15 — fire-module, call-times, and fire-protection checks count');
});

test('completeness: a fire-typed incident with no fire module scores below one with it', () => {
  const withModule = buildNerisIncidentPayload({ incident: fireIncident(), department: DEPT });
  const withoutModule = buildNerisIncidentPayload({ incident: fireIncident({ neris_fire_detail: null }), department: DEPT });
  assert.ok(withoutModule.validation.completeness < withModule.validation.completeness,
    'the fire-module check moves the score');
});

// ─── Crosswalk map values are valid live-spec paths ─────────────────────────

test('every LEGACY_TYPE_MAP target is a valid live-spec incident type', () => {
  const { isValidIncidentType } = require('../constants/neris');
  for (const [legacy, dotted] of Object.entries(LEGACY_TYPE_MAP)) {
    const path = dotted.split('.').join('||');
    assert.ok(isValidIncidentType(path), `${legacy} → ${path}`);
  }
});


// ─── FP: Fire Protection modules (0063) ──────────────────────────────────────
// The five IncidentPayload alarm/suppression modules: emitted VERBATIM as
// top-level payload keys; required on structure fires unless ALL aids are
// SUPPORT_AID GIVEN (the live-422 rule, proven 2026-07-20).

const FP_FULL = {
  smoke_alarm: { presence: { type: 'PRESENT', working: true,
    alarm_types: ['HARDWIRED', 'INTERCONNECTED'],
    operation: { alerted_failed_other: { type: 'OPERATED_ALERTED_OCCUPANT', occupant_action: 'EVACUATED' } } } },
  fire_alarm: { presence: { type: 'NOT_PRESENT' } },
  other_alarm: { presence: { type: 'PRESENT', alarm_types: ['CARBON_MONOXIDE'] } },
  fire_suppression: { presence: { type: 'PRESENT',
    suppression_types: [{ type: 'WET_PIPE_SPRINKLER_SYSTEM', full_partial: 'PARTIAL' }],
    operation_type: { effectiveness: { type: 'OPERATED_EFFECTIVE', sprinklers_activated: 2 } } } },
};

const fpErrors = (v) => v.errors.filter((e) => e.startsWith('Fire protection'));

test('FP: structure fire with NO modules → all four named as required', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    incident: fireIncident(), nfirsReport: {}, department: DEPT,
  });
  const errs = fpErrors(validation);
  for (const k of ['smoke_alarm', 'fire_alarm', 'other_alarm', 'fire_suppression']) {
    assert.ok(errs.some((e) => e.includes(`"${k}"`)), `required error names ${k}`);
    assert.equal(payload[k], null, `${k} emitted null when uncaptured`);
  }
  // Not confined-cooking → cooking module NOT required
  assert.ok(!errs.some((e) => e.includes('cooking_fire_suppression')));
});

test('FP: modules captured → emitted VERBATIM top-level, zero FP errors', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    incident: fireIncident({ neris_fire_protection: FP_FULL }),
    nfirsReport: {}, department: DEPT,
  });
  assert.equal(fpErrors(validation).length, 0);
  // Verbatim — the stored spec shape IS the emitted shape (D2), nested unions intact
  assert.deepEqual(payload.smoke_alarm, FP_FULL.smoke_alarm);
  assert.deepEqual(payload.fire_suppression, FP_FULL.fire_suppression);
  assert.deepEqual(payload.fire_alarm, { presence: { type: 'NOT_PRESENT' } });
  assert.equal(payload.cooking_fire_suppression, null);
});

test('FP: confined cooking fire additionally requires cooking_fire_suppression', () => {
  const base = fireIncident({
    neris_incident_types: [{ value: 'FIRE||STRUCTURE_FIRE||CONFINED_COOKING_APPLIANCE_FIRE', primary: true }],
    neris_fire_protection: FP_FULL,
  });
  const { validation } = buildNerisIncidentPayload({ incident: base, nfirsReport: {}, department: DEPT });
  const errs = fpErrors(validation);
  assert.equal(errs.length, 1);
  assert.ok(errs[0].includes('cooking_fire_suppression'));

  const withCooking = { ...FP_FULL, cooking_fire_suppression: { presence: {
    type: 'PRESENT', suppression_types: ['RESIDENTIAL_HOOD_MOUNTED'], operation_type: 'OPERATED_EFFECTIVE' } } };
  const ok = buildNerisIncidentPayload({
    incident: fireIncident({ neris_incident_types: base.neris_incident_types, neris_fire_protection: withCooking }),
    nfirsReport: {}, department: DEPT,
  });
  assert.equal(fpErrors(ok.validation).length, 0);
  assert.deepEqual(ok.payload.cooking_fire_suppression, withCooking.cooking_fire_suppression);
});

test('FP: the aids exception — ALL SUPPORT_AID GIVEN waives the modules', () => {
  const { validation } = buildNerisIncidentPayload({
    incident: fireIncident({ neris_aids: [
      { department_neris_id: 'FD99999999', aid_type: 'SUPPORT_AID', aid_direction: 'GIVEN' },
    ] }),
    nfirsReport: {}, department: DEPT,
  });
  assert.equal(fpErrors(validation).length, 0, 'no FP requirement when all aids SUPPORT_AID GIVEN');
});

test('FP: a non-qualifying aid does NOT waive the modules', () => {
  for (const aid of [
    { department_neris_id: 'FD99999999', aid_type: 'SUPPORT_AID', aid_direction: 'RECEIVED' },
    { department_neris_id: 'FD99999999', aid_type: 'ACTING_AS_AID', aid_direction: 'GIVEN' },
  ]) {
    const { validation } = buildNerisIncidentPayload({
      incident: fireIncident({ neris_aids: [
        { department_neris_id: 'FD11111111', aid_type: 'SUPPORT_AID', aid_direction: 'GIVEN' }, aid,
      ] }),
      nfirsReport: {}, department: DEPT,
    });
    assert.equal(fpErrors(validation).length, 4, `mixed aids (${aid.aid_type}/${aid.aid_direction}) still require modules`);
  }
});

test('FP: NO aids recorded = primary department = modules required (empty ≠ exception)', () => {
  const { validation } = buildNerisIncidentPayload({
    incident: fireIncident({ neris_aids: [] }), nfirsReport: {}, department: DEPT,
  });
  assert.equal(fpErrors(validation).length, 4);
});

test('FP: non-structure fire types have no FP requirement', () => {
  const { validation } = buildNerisIncidentPayload({
    incident: fireIncident({
      neris_incident_types: [{ value: 'FIRE||OUTSIDE_FIRE||DUMPSTER_OUTDOOR_CONTAINER_FIRE', primary: true }],
      neris_fire_detail: { location_detail: { type: 'OUTSIDE', cause: 'DEBRIS_OPEN_BURNING' },
        water_supply: 'HYDRANT_GREATER_500', investigation_needed: 'NO', investigation_types: [] },
    }),
    nfirsReport: {}, department: DEPT,
  });
  assert.equal(fpErrors(validation).length, 0);
});

test('FP: a module without a presence answer is malformed, never silently emitted', () => {
  const { payload, validation } = buildNerisIncidentPayload({
    incident: fireIncident({ neris_fire_protection: { ...FP_FULL, smoke_alarm: { working: true } } }),
    nfirsReport: {}, department: DEPT,
  });
  assert.ok(fpErrors(validation).some((e) => e.includes('"smoke_alarm" is malformed')));
  assert.equal(payload.smoke_alarm, null, 'malformed block is not exported');
});

test('FP: legacy detector labels are preserved-not-crosswalked, and superseded by structured capture', () => {
  // No structured capture → legacy labels preserved in _meta.unexported + warned
  const legacy = buildNerisIncidentPayload({
    incident: fireIncident(), nfirsReport: { detectorPresence: 'Present - Operated' }, department: DEPT,
  });
  assert.ok(legacy._meta.unexported && legacy._meta.unexported.risk_reduction);
  assert.equal(legacy.payload.smoke_alarm, null, 'legacy label NEVER auto-mapped into a module');
  // Structured capture present → legacy path silent (structured supersedes)
  const structured = buildNerisIncidentPayload({
    incident: fireIncident({ neris_fire_protection: FP_FULL }),
    nfirsReport: { detectorPresence: 'Present - Operated' }, department: DEPT,
  });
  assert.ok(!structured._meta.unexported || !structured._meta.unexported.risk_reduction);
});


test('rule 17 (parity sweep): an aid entry naming our OWN department is an error', () => {
  const { validation } = buildNerisIncidentPayload({
    incident: fireIncident({ neris_aids: [
      { department_neris_id: 'FD12345678', aid_type: 'SUPPORT_AID', aid_direction: 'GIVEN' },
    ] }),
    nfirsReport: {}, department: DEPT,   // DEPT.fdid === FD12345678
  });
  assert.ok(validation.errors.some((e) => e.includes('cannot be your own department')));
});


test('SR-D5: registered-unit linkage — EXACT designation match attaches unit_neris_id, verbatim reported_unit_id kept', () => {
  const { payload } = buildNerisIncidentPayload({
    incident: fireIncident({ units: JSON.stringify(['E1', 'TL1', 'MUTUAL-9']) }),
    nfirsReport: {}, department: DEPT,
    options: { registeredUnits: { E1: 'FD12345678S000U000', TL1: 'FD12345678S000U001' } },
  });
  const byId = Object.fromEntries(payload.unit_responses.map((r) => [r.reported_unit_id, r]));
  assert.equal(byId.E1.unit_neris_id, 'FD12345678S000U000');
  assert.equal(byId.TL1.unit_neris_id, 'FD12345678S000U001');
  assert.equal(byId['MUTUAL-9'].unit_neris_id, undefined, 'unmatched designation exports WITHOUT the link — never fuzzy');
  assert.equal(byId.E1.reported_unit_id, 'E1', 'the as-dispatched designation stays verbatim');
});

test('SR-D5: no registered-unit map → shape unchanged (backward compatible)', () => {
  const { payload } = buildNerisIncidentPayload({ incident: fireIncident(), nfirsReport: {}, department: DEPT });
  for (const r of payload.unit_responses) assert.ok(!('unit_neris_id' in r));
});
