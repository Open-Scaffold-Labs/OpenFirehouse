'use strict';
/**
 * tests/nerisIncidentFields.test.js — Wave 3: the NERIS incident-record axis.
 *
 * Two layers, matching the two enforcement layers (D5):
 *   1. utils/nerisValidate.js — the server-owned closed-set validation (pure,
 *      always runs). Every rejection here is a value that would otherwise land
 *      on a legal record headed for a federal API. EXACT match only — the
 *      'Passed' class of near-miss must never validate (D2).
 *   2. The DB layer (gated on TENANCY_TEST_DB, like mayday/parReplay):
 *      create+READ-BACK equality against real Postgres — a 2xx is not
 *      persistence (lesson #14) — plus proof the XOR CHECK rejects at the
 *      DB layer even if the server validation were bypassed.
 */
const test   = require('node:test');
const assert = require('node:assert');

const { validateNerisIncidentFields } = require('../utils/nerisValidate');

const VALID_BODY = {
  incidentNumber: 'T-1', date: '2026-07-16', type: 'Structure Fire',
  neris_incident_types: [
    { value: 'FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE', primary: true },
    { value: 'MEDICAL||ILLNESS||CHEST_PAIN_NON_TRAUMA', primary: false },
  ],
  neris_actions: [
    'SUPPRESSION||STRUCTURAL_FIRE_SUPPRESSION||INTERIOR',
    'VENTILATION||VERTICAL||DURING_SUPPRESSION',
  ],
  neris_fire_detail: { condition_arrival: 'SMOKE_FIRE_SHOWING' },
  neris_hazsit_detail: { disposition: 'COMPLETED_FIRE_SERVICE_ONLY', evacuated: 4 },
  neris_medical_details: [
    { patient_care_evaluation: 'PATIENT_EVALUATED_CARE_PROVIDED',
      transport_disposition: 'TRANSPORT_BY_EMS_UNIT', patient_status: 'IMPROVED' },
  ],
  neris_aids: [{ aid_direction: 'RECEIVED', aid_type: 'SUPPORT_AID' }],
};

function expectErrors(body, pattern, label) {
  const r = validateNerisIncidentFields(body);
  assert.equal(r.ok, false, `${label}: must be rejected`);
  assert.ok(r.errors.some((e) => pattern.test(e)),
    `${label}: expected an error matching ${pattern}, got: ${JSON.stringify(r.errors)}`);
}

test('a fully valid NERIS body validates', () => {
  const r = validateNerisIncidentFields(VALID_BODY);
  assert.deepEqual(r, { ok: true, errors: [] });
});

test('a body with NO NERIS fields validates — drafts stay saveable (F12)', () => {
  assert.equal(validateNerisIncidentFields({ incidentNumber: 'T-2', date: '2026-07-16', type: 'Medical / EMS' }).ok, true);
  // null = clear-the-field, also valid
  assert.equal(validateNerisIncidentFields({ neris_incident_types: null, neris_noaction: null }).ok, true);
});

test('exactly-one-primary is enforced: 2 primaries and 0 primaries both fail', () => {
  expectErrors({
    neris_incident_types: [
      { value: 'FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE', primary: true },
      { value: 'MEDICAL||ILLNESS||CHEST_PAIN_NON_TRAUMA', primary: true },
    ],
  }, /exactly one primary.*got 2/, 'two primaries');
  expectErrors({
    neris_incident_types: [
      { value: 'FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE', primary: false },
    ],
  }, /exactly one primary.*got 0/, 'zero primaries');
});

test('type count is 1-3: four types fail, an empty array fails', () => {
  const four = ['FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE', 'MEDICAL||ILLNESS||CHEST_PAIN_NON_TRAUMA',
                'HAZSIT||HAZARDOUS_MATERIALS||GAS_LEAK_ODOR', 'NOEMERG||FALSE_ALARM||ACCIDENTAL_ALARM']
    .map((value, i) => ({ value, primary: i === 0 }));
  expectErrors({ neris_incident_types: four }, /must have 1-3 entries, got 4/, 'four types');
  expectErrors({ neris_incident_types: [] }, /must have 1-3 entries, got 0/, 'empty types array');
});

test('a bad incident-type string is rejected and named in the error', () => {
  expectErrors({
    neris_incident_types: [{ value: 'FIRE||STRUCTURE_FIRE||KITCHEN_FIRE', primary: true }],
  }, /neris_incident_types\[0\]\.value.*KITCHEN_FIRE/, 'bad type string');
  // dotted legacy dialect must never validate (D2 — verbatim path format only)
  expectErrors({
    neris_incident_types: [{ value: 'FIRE.STRUCTURE_FIRE.ROOM_AND_CONTENTS_FIRE', primary: true }],
  }, /neris_incident_types\[0\]\.value/, 'dotted dialect');
});

test("the 'Passed' class of near-miss action never validates (D2)", () => {
  expectErrors({ neris_actions: ['Passed'] }, /neris_actions\[0\].*"Passed"/, 'Passed');
  // prefix of a real value is not a value
  expectErrors({ neris_actions: ['SUPPRESSION'] }, /neris_actions\[0\]/, 'bare prefix');
  // case is load-bearing
  expectErrors({ neris_actions: ['investigation'] }, /neris_actions\[0\]/, 'lowercase action');
  // duplicates are rejected
  expectErrors({ neris_actions: ['INVESTIGATION', 'INVESTIGATION'] }, /duplicate/, 'duplicate action');
});

test('lowercase noaction is rejected — case is load-bearing', () => {
  expectErrors({ neris_noaction: 'cancelled' }, /neris_noaction.*"cancelled"/, 'lowercase noaction');
  assert.equal(validateNerisIncidentFields({ neris_noaction: 'CANCELLED' }).ok, true);
});

test('actions and noaction together are a contradiction (XOR, F3)', () => {
  expectErrors({
    neris_actions: ['INVESTIGATION'],
    neris_noaction: 'CANCELLED',
  }, /mutually exclusive/, 'actions + noaction');
  // an EMPTY actions array + noaction is fine (mirrors the DB CHECK)
  assert.equal(validateNerisIncidentFields({ neris_actions: [], neris_noaction: 'CANCELLED' }).ok, true);
});

test('negative evacuated and non-integer evacuated are rejected', () => {
  expectErrors({ neris_hazsit_detail: { evacuated: -1 } }, /evacuated.*non-negative integer/, 'negative evacuated');
  expectErrors({ neris_hazsit_detail: { evacuated: 2.5 } }, /evacuated.*non-negative integer/, 'fractional evacuated');
  assert.equal(validateNerisIncidentFields({ neris_hazsit_detail: { evacuated: 0 } }).ok, true);
});

test('a bad hazard disposition is rejected', () => {
  // near-miss of RELEASED_TO_PROPERTY_OWNER
  expectErrors({ neris_hazsit_detail: { disposition: 'RELEASED_TO_OWNER' } },
    /neris_hazsit_detail\.disposition.*RELEASED_TO_OWNER/, 'bad hazard disposition');
});

test('fire condition_arrival, medical values, and aid values are exact-matched', () => {
  expectErrors({ neris_fire_detail: { condition_arrival: 'FIRE_OUT' } }, /condition_arrival/, 'fire prefix');
  expectErrors({ neris_medical_details: [{ patient_care_evaluation: 'EVALUATED' }] }, /patient_care_evaluation/, 'bad patient care');
  expectErrors({ neris_medical_details: [{ transport_disposition: 'TRANSPORTED' }] }, /transport_disposition/, 'bad transport');
  expectErrors({ neris_medical_details: [{ patient_status: 'BETTER' }] }, /patient_status/, 'bad patient status');
  expectErrors({ neris_aids: [{ aid_direction: 'given' }] }, /aid_direction/, 'lowercase aid direction');
  expectErrors({ neris_aids: [{ aid_type: 'MUTUAL_AID' }] }, /aid_type/, 'bad aid type');
});

test('shape errors: non-array / non-object fields are rejected, not coerced', () => {
  expectErrors({ neris_incident_types: 'FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE' }, /must be an array/, 'types as string');
  expectErrors({ neris_actions: 'INVESTIGATION' }, /must be an array/, 'actions as string');
  expectErrors({ neris_fire_detail: ['SMOKE_SHOWING'] }, /must be an object/, 'fire detail as array');
  expectErrors({ neris_medical_details: { patient_status: 'IMPROVED' } }, /must be an array/, 'medical as object');
});

// ── Phase-2 Wave 3: the REAL fire-module shape (P2-D1) ───────────────────────

const STRUCTURE_LD = {
  type: 'STRUCTURE', floor_of_origin: 2, arrival_condition: 'SMOKE_FIRE_SHOWING',
  damage_type: 'MODERATE_DAMAGE', room_of_origin_type: 'BEDROOM', cause: 'COOKING',
};

test('a complete fire detail validates (STRUCTURE and OUTSIDE branches)', () => {
  assert.equal(validateNerisIncidentFields({
    neris_fire_detail: {
      location_detail: STRUCTURE_LD,
      water_supply: 'HYDRANT_GREATER_500',
      investigation_needed: 'NO',
      investigation_types: [],
      suppression_appliances: ['SMALL_DIAMETER_FIRE_HOSE'],
    },
  }).ok, true, 'STRUCTURE branch');
  assert.equal(validateNerisIncidentFields({
    neris_fire_detail: {
      location_detail: { type: 'OUTSIDE', cause: 'DEBRIS_OPEN_BURNING', acres_burned: 0.5 },
      water_supply: 'NONE',
      investigation_needed: 'NOT_APPLICABLE',
      investigation_types: [],
    },
  }).ok, true, 'OUTSIDE branch with valid cause');
  // negative floor is BELOW GRADE — legal, not an error
  assert.equal(validateNerisIncidentFields({
    neris_fire_detail: { location_detail: { ...STRUCTURE_LD, floor_of_origin: -1 } },
  }).ok, true, 'negative floor_of_origin (below grade)');
});

test('a STRUCTURE branch missing a required field is rejected', () => {
  const { room_of_origin_type: _omit, ...missingRoom } = STRUCTURE_LD;
  expectErrors({ neris_fire_detail: { location_detail: missingRoom } },
    /room_of_origin_type/, 'STRUCTURE missing room');
  const { floor_of_origin: _omit2, ...missingFloor } = STRUCTURE_LD;
  expectErrors({ neris_fire_detail: { location_detail: missingFloor } },
    /floor_of_origin must be an integer/, 'STRUCTURE missing floor');
  expectErrors({ neris_fire_detail: { location_detail: { ...STRUCTURE_LD, floor_of_origin: 1.5 } } },
    /floor_of_origin must be an integer/, 'fractional floor');
});

test('the location_detail discriminator is exact — no other spelling is a branch', () => {
  expectErrors({ neris_fire_detail: { location_detail: { ...STRUCTURE_LD, type: 'structure' } } },
    /must be exactly 'STRUCTURE' or 'OUTSIDE'/, 'lowercase branch type');
  expectErrors({ neris_fire_detail: { location_detail: { ...STRUCTURE_LD, type: undefined } } },
    /must be exactly 'STRUCTURE' or 'OUTSIDE'/, 'missing branch type');
});

test('an OUTSIDE branch requires a valid outside cause; a structure cause is not one', () => {
  // COOKING is type_fire_cause_in — valid for STRUCTURE, NOT for OUTSIDE
  expectErrors({ neris_fire_detail: { location_detail: { type: 'OUTSIDE', cause: 'COOKING' } } },
    /outside-fire cause.*"COOKING"/, 'in-cause on outside branch');
  expectErrors({ neris_fire_detail: { location_detail: { type: 'OUTSIDE', cause: 'DEBRIS_OPEN_BURNING', acres_burned: -2 } } },
    /acres_burned must be a non-negative number/, 'negative acres');
});

test('fire-module enum fields are exact-matched (water supply, investigation types)', () => {
  // near-miss: the pre-P2 UI said 'HYDRANT'; the spec says HYDRANT_GREATER_500 / _LESS_500
  expectErrors({ neris_fire_detail: { water_supply: 'HYDRANT' } },
    /water_supply.*"HYDRANT"/, 'bad water_supply');
  // near-miss of INVESTIGATED_BY_STATE_FIRE_MARSHAL
  expectErrors({ neris_fire_detail: { investigation_types: ['INVESTIGATED_BY_FIRE_MARSHAL'] } },
    /investigation_types\[0\]/, 'near-miss investigation type');
  expectErrors({ neris_fire_detail: { investigation_needed: 'MAYBE' } },
    /investigation_needed/, 'bad investigation_needed');
  expectErrors({ neris_fire_detail: { suppression_appliances: ['GARDEN_HOSE'] } },
    /suppression_appliances\[0\]/, 'bad suppression appliance');
});

// ── Phase-2 Wave 3: casualty/rescue entries (P2-D2) ──────────────────────────

test('valid casualty entries validate — person type and rescue performer are INDEPENDENT axes', () => {
  assert.equal(validateNerisIncidentFields({
    neris_casualty_rescues: [
      { type: 'FF', injury: 'INJURED_NONFATAL', cause: 'STRESS_OVEREXERTION' },
      { type: 'NONFF', injury: 'NONE', rescue_type: 'SELF_EVACUATION' },
      // THE common case: a civilian rescued by a firefighter (corrected 2026-07-16 —
      // the first cut wrongly rejected this by coupling the two axes)
      { type: 'NONFF', injury: 'INJURED_NONFATAL', rescue_type: 'RESCUED_BY_FIREFIGHTER', removal: 'REMOVAL_FROM_STRUCTURE' },
      // a downed FF rescued by the RIT, extricated
      { type: 'FF', injury: 'INJURED_NONFATAL', rescue_type: 'RESCUED_BY_FF_RIT', removal: 'EXTRICATION' },
      // an FF who was evac-assisted by a civilian bystander
      { type: 'FF', injury: 'NONE', rescue_type: 'RESCUED_BY_NONFIREFIGHTER' },
    ],
  }).ok, true);
});

test('casualty entry vocabulary is exact; removal rides only FF-performed rescues', () => {
  expectErrors({ neris_casualty_rescues: [{ type: 'FIREFIGHTER', injury: 'NONE' }] },
    /type must be exactly 'FF' or 'NONFF'/, 'bad person type');
  expectErrors({ neris_casualty_rescues: [{ type: 'FF', injury: 'UNINJURED' }] },
    /injury must be INJURED_NONFATAL, INJURED_FATAL, or NONE/, 'spec const is not our capture value');
  expectErrors({ neris_casualty_rescues: [{ type: 'FF', injury: 'INJURED_FATAL', cause: 'BURNED' }] },
    /cause is not a NERIS casualty cause.*"BURNED"/, 'bad cause');
  expectErrors({ neris_casualty_rescues: [{ type: 'NONFF', injury: 'NONE', rescue_type: 'WALKED_OUT' }] },
    /rescue_type is not a NERIS rescue value/, 'unknown rescue value');
  expectErrors({ neris_casualty_rescues: [{ type: 'NONFF', injury: 'NONE', rescue_type: 'RESCUED_BY_FIREFIGHTER', removal: 'CARRIED' }] },
    /removal must be one of/, 'bad removal value');
  expectErrors({ neris_casualty_rescues: [{ type: 'NONFF', injury: 'NONE', rescue_type: 'SELF_EVACUATION', removal: 'EXTRICATION' }] },
    /removal only applies to firefighter-performed rescue types/, 'removal on a non-FF-performed rescue');
  expectErrors({ neris_casualty_rescues: [{ type: 'NONFF', injury: 'NONE', removal: 'EXTRICATION' }] },
    /removal requires a rescue_type/, 'removal without a rescue');
  expectErrors({ neris_casualty_rescues: { type: 'FF', injury: 'NONE' } },
    /must be an array/, 'entries as object');
});

// ── Phase-2 Wave 3: officer-entered PSAP times (P2-D4) ───────────────────────

test('dispatch times: parseable ISO strings pass; junk is rejected', () => {
  assert.equal(validateNerisIncidentFields({
    neris_dispatch_times: { call_answered: '2026-07-16T18:04:11Z', call_arrival: '2026-07-16T18:04:40Z' },
  }).ok, true);
  assert.equal(validateNerisIncidentFields({ neris_dispatch_times: {} }).ok, true, 'empty object is a saveable draft');
  expectErrors({ neris_dispatch_times: { call_answered: 'yesterday-ish' } },
    /call_answered must be a parseable date-time string/, 'junk answered time');
  expectErrors({ neris_dispatch_times: { call_arrival: 1752690000000 } },
    /call_arrival must be a parseable date-time string/, 'epoch number (strings only)');
  expectErrors({ neris_dispatch_times: ['2026-07-16T18:04:11Z'] },
    /must be an object/, 'times as array');
});

// ── DB layer (real Postgres) — gated on TENANCY_TEST_DB like mayday/parReplay ──
const TENANCY_TEST_DB = process.env.TENANCY_TEST_DB;
if (!TENANCY_TEST_DB) {
  test('NERIS incident persistence (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  process.env.DATABASE_URL = TENANCY_TEST_DB;
  const db = require('../db');
  const DEPT = 1;
  const NUM = `NERIS-W3-${Date.now()}`;

  async function cleanup(incidentNumber) {
    // Hard delete of a TEST row in the TEST db (soft-delete retention is a
    // production doctrine; leaving test rows would break re-runs).
    await db.pool.query('DELETE FROM workflow_tasks WHERE target_module=$1 AND target_record_id IN (SELECT id FROM incidents WHERE "incidentNumber"=$2)', ['incidents', incidentNumber]).catch(() => {});
    await db.pool.query('DELETE FROM incidents WHERE "incidentNumber"=$1', [incidentNumber]);
  }

  test('create + READ-BACK: every NERIS field round-trips jsonb intact (lesson #14)', async () => {
    try {
      const created = await db.incidents.create({
        incidentNumber: NUM, date: '2026-07-16', type: 'Structure Fire',
        neris_incident_types: VALID_BODY.neris_incident_types,
        neris_actions: VALID_BODY.neris_actions,
        neris_fire_detail: VALID_BODY.neris_fire_detail,
        neris_hazsit_detail: VALID_BODY.neris_hazsit_detail,
        neris_medical_details: VALID_BODY.neris_medical_details,
        neris_aids: VALID_BODY.neris_aids,
      }, DEPT);
      assert.ok(created.id, 'create returned a row');

      // Read back through the normal read path — not the INSERT's RETURNING.
      const back = await db.incidents.findById(created.id, DEPT);
      assert.ok(back, 'row is readable after create');
      assert.deepEqual(back.neris_incident_types, VALID_BODY.neris_incident_types, 'types round-trip');
      assert.deepEqual(back.neris_actions, VALID_BODY.neris_actions, 'actions round-trip');
      assert.deepEqual(back.neris_fire_detail, VALID_BODY.neris_fire_detail, 'fire detail round-trips');
      assert.deepEqual(back.neris_hazsit_detail, VALID_BODY.neris_hazsit_detail, 'hazsit detail round-trips');
      assert.deepEqual(back.neris_medical_details, VALID_BODY.neris_medical_details, 'medical details round-trip');
      assert.deepEqual(back.neris_aids, VALID_BODY.neris_aids, 'aids round-trip');
      assert.equal(back.neris_noaction, null, 'noaction stays NULL when not set');
      // jsonb comes back as real JS values, not strings (F10)
      assert.equal(typeof back.neris_hazsit_detail.evacuated, 'number', 'evacuated is a number on read-back');

      // update path: clear actions, set noaction — must persist and read back
      await db.incidents.update(created.id, { neris_actions: [], neris_noaction: 'CANCELLED' }, DEPT);
      const after = await db.incidents.findById(created.id, DEPT);
      assert.deepEqual(after.neris_actions, [], 'actions cleared via update');
      assert.equal(after.neris_noaction, 'CANCELLED', 'noaction persisted via update');
    } finally { await cleanup(NUM); }
  });

  test('the XOR CHECK rejects at the DB LAYER even if server validation were bypassed', async () => {
    const num = `${NUM}-XOR`;
    try {
      await assert.rejects(
        db.pool.query(
          `INSERT INTO incidents ("incidentNumber",date,type,station_id,department_id,neris_actions,neris_noaction)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
          [num, '2026-07-16', 'Structure Fire', DEPT, DEPT, JSON.stringify(['INVESTIGATION']), 'CANCELLED']),
        /incidents_neris_action_xor_chk/,
        'actions + noaction must violate the XOR CHECK');
      const { rows } = await db.pool.query('SELECT count(*)::int AS n FROM incidents WHERE "incidentNumber"=$1', [num]);
      assert.equal(rows[0].n, 0, 'nothing persisted from the rejected insert');
    } finally { await cleanup(num); }
  });

  test('the noaction CHECK rejects a lowercase value at the DB layer', async () => {
    const num = `${NUM}-LC`;
    try {
      await assert.rejects(
        db.pool.query(
          `INSERT INTO incidents ("incidentNumber",date,type,station_id,department_id,neris_noaction)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [num, '2026-07-16', 'False Alarm', DEPT, DEPT, 'cancelled']),
        /incidents_neris_noaction_chk/,
        'a lowercase noaction must violate the CHECK');
    } finally { await cleanup(num); }
  });

  // ── Phase-2 Wave 3 (0061): the two new client-writable columns ─────────────
  const P2_CASUALTIES = [
    { type: 'FF', injury: 'INJURED_NONFATAL', cause: 'STRESS_OVEREXERTION' },
    { type: 'NONFF', injury: 'NONE', rescue_type: 'SELF_EVACUATION' },
  ];
  const P2_TIMES = { call_answered: '2026-07-16T18:04:11.000Z', call_arrival: '2026-07-16T18:04:40.000Z' };

  test('0061: casualty entries + dispatch times round-trip jsonb intact; status defaults to draft', async () => {
    const num = `${NUM}-P2`;
    try {
      const created = await db.incidents.create({
        incidentNumber: num, date: '2026-07-16', type: 'Structure Fire',
        neris_casualty_rescues: P2_CASUALTIES,
        neris_dispatch_times: P2_TIMES,
      }, DEPT);
      const back = await db.incidents.findById(created.id, DEPT);
      assert.deepEqual(back.neris_casualty_rescues, P2_CASUALTIES, 'casualty entries round-trip');
      assert.deepEqual(back.neris_dispatch_times, P2_TIMES, 'dispatch times round-trip');
      assert.equal(back.neris_status, 'draft', 'a new record is draft (P2-D6)');
      assert.equal(back.neris_review, null, 'review history starts NULL');

      // update path persists too
      await db.incidents.update(created.id, { neris_dispatch_times: { call_answered: '2026-07-16T18:05:00.000Z' } }, DEPT);
      const after = await db.incidents.findById(created.id, DEPT);
      assert.equal(after.neris_dispatch_times.call_answered, '2026-07-16T18:05:00.000Z');
    } finally { await cleanup(num); }
  });

  test("0061: the status CHECK rejects 'APPROVED' (case is load-bearing) at the DB layer", async () => {
    const num = `${NUM}-ST`;
    try {
      await assert.rejects(
        db.pool.query(
          `INSERT INTO incidents ("incidentNumber",date,type,station_id,department_id,neris_status)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [num, '2026-07-16', 'Structure Fire', DEPT, DEPT, 'APPROVED']),
        /incidents_neris_status_chk/,
        'uppercase APPROVED must violate the CHECK');
    } finally { await cleanup(num); }
  });

  test('0061: a non-array neris_casualty_rescues is rejected at the DB layer', async () => {
    const num = `${NUM}-CA`;
    try {
      await assert.rejects(
        db.pool.query(
          `INSERT INTO incidents ("incidentNumber",date,type,station_id,department_id,neris_casualty_rescues)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
          [num, '2026-07-16', 'Structure Fire', DEPT, DEPT, JSON.stringify({ type: 'FF' })]),
        /incidents_neris_casualty_rescues_chk/,
        'an object (non-array) must violate the CHECK');
    } finally { await cleanup(num); }
  });
}


// ─── FP (0063): neris_fire_protection — the five alarm/suppression modules ────
// Stored VERBATIM in the spec's IncidentPayload shape; validated as closed key
// sets + discriminated unions + exact-match leaf enums (D2/D5).

const FP_VALID = {
  smoke_alarm: { presence: { type: 'PRESENT', working: false,
    alarm_types: ['REPLACEABLE_BATTERY_POWERED'],
    operation: { alerted_failed_other: { type: 'FAILED_TO_OPERATE', failure_reason: 'NO_BATTERY' } } } },
  fire_alarm: { presence: { type: 'PRESENT', alarm_types: ['AUTOMATIC'], operation_type: 'OPERATED_ALERTED_OCCUPANT' } },
  other_alarm: { presence: { type: 'NOT_APPLICABLE' } },
  fire_suppression: { presence: { type: 'PRESENT',
    suppression_types: [{ type: 'WET_PIPE_SPRINKLER_SYSTEM', full_partial: 'FULL' }],
    operation_type: { effectiveness: { type: 'NO_OPERATION', failure_reason: 'SYSTEM_SHUTOFF_PRIOR_TO_INCIDENT' } } } },
  cooking_fire_suppression: { presence: { type: 'PRESENT',
    suppression_types: ['COMMERCIAL_HOOD_SUPPRESSION'], operation_type: 'OPERATED_EFFECTIVE' } },
};

test('FP: a fully-populated fire-protection object validates clean', () => {
  const r = validateNerisIncidentFields({ neris_fire_protection: FP_VALID });
  assert.deepEqual(r.errors, []);
  assert.ok(r.ok);
});

test('FP: omitted and null are both valid — save is never blocked', () => {
  assert.ok(validateNerisIncidentFields({}).ok);
  assert.ok(validateNerisIncidentFields({ neris_fire_protection: null }).ok);
});

test('FP: an unknown module key is rejected (closed set)', () => {
  const r = validateNerisIncidentFields({ neris_fire_protection: { sprinkler_alarm: { presence: { type: 'PRESENT' } } } });
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => e.includes('sprinkler_alarm is not a fire-protection module')));
});

test('FP: presence has NO unknown at presence level — and case is load-bearing', () => {
  for (const bad of ['UNKNOWN', 'present', 'Present', 'YES', '']) {
    const r = validateNerisIncidentFields({ neris_fire_protection: { smoke_alarm: { presence: { type: bad } } } });
    assert.ok(!r.ok, `presence.type ${JSON.stringify(bad)} must be rejected`);
  }
  for (const good of ['PRESENT', 'NOT_PRESENT', 'NOT_APPLICABLE']) {
    const r = validateNerisIncidentFields({ neris_fire_protection: { smoke_alarm: { presence: { type: good } } } });
    assert.ok(r.ok, `presence.type ${good} is valid alone`);
  }
});

test('FP: a NOT_PRESENT payload carries ONLY the type const (additionalProperties:false)', () => {
  const r = validateNerisIncidentFields({ neris_fire_protection: {
    fire_alarm: { presence: { type: 'NOT_PRESENT', alarm_types: ['AUTOMATIC'] } } } });
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => e.includes('alarm_types is not a spec field')));
});

test('FP: smoke-alarm operation branches are closed — a failure_reason cannot ride an ALERTED branch', () => {
  const r = validateNerisIncidentFields({ neris_fire_protection: { smoke_alarm: { presence: {
    type: 'PRESENT',
    operation: { alerted_failed_other: { type: 'OPERATED_ALERTED_OCCUPANT', failure_reason: 'NO_BATTERY' } } } } } });
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => e.includes('failure_reason is not a spec field')));
});

test('FP: leaf enums are EXACT match — near-misses and lowercase rejected', () => {
  const cases = [
    { smoke_alarm: { presence: { type: 'PRESENT', alarm_types: ['HARDWIRE'] } } },
    { smoke_alarm: { presence: { type: 'PRESENT', alarm_types: ['hardwired'] } } },
    { fire_alarm: { presence: { type: 'PRESENT', operation_type: 'OPERATED' } } },
    { fire_suppression: { presence: { type: 'PRESENT', suppression_types: [{ type: 'SPRINKLER' }] } } },
    { cooking_fire_suppression: { presence: { type: 'PRESENT', suppression_types: ['HOOD'] } } },
  ];
  for (const fp of cases) {
    const r = validateNerisIncidentFields({ neris_fire_protection: fp });
    assert.ok(!r.ok, `${JSON.stringify(fp).slice(0, 60)}… must be rejected`);
  }
});

test('FP: fire_suppression suppression_types entries are OBJECTS {type, full_partial?}, not bare strings', () => {
  const r = validateNerisIncidentFields({ neris_fire_protection: { fire_suppression: { presence: {
    type: 'PRESENT', suppression_types: ['WET_PIPE_SPRINKLER_SYSTEM'] } } } });
  assert.ok(!r.ok);
});

test('FP: sprinklers_activated must be a non-negative integer', () => {
  for (const bad of [-1, 2.5, '3']) {
    const r = validateNerisIncidentFields({ neris_fire_protection: { fire_suppression: { presence: {
      type: 'PRESENT', operation_type: { effectiveness: { type: 'OPERATED_EFFECTIVE', sprinklers_activated: bad } } } } } });
    assert.ok(!r.ok, `sprinklers_activated ${JSON.stringify(bad)} must be rejected`);
  }
});

test('FP: cooking operation_type is the FLAT enum — an effectiveness object is rejected', () => {
  const r = validateNerisIncidentFields({ neris_fire_protection: { cooking_fire_suppression: { presence: {
    type: 'PRESENT', operation_type: { effectiveness: { type: 'OPERATED_EFFECTIVE' } } } } } });
  assert.ok(!r.ok);
});

// DB read-back for the 0063 column (gated like the block above)
if (!TENANCY_TEST_DB) {
  test('FP: neris_fire_protection persistence (live DB)', { skip: 'TENANCY_TEST_DB not set' }, () => {});
} else {
  const db = require('../db');
  test('FP: neris_fire_protection round-trips jsonb intact + object CHECK holds at the DB layer', async () => {
    const num = `NERIS-FP-${Date.now()}`;
    try {
      const created = await db.incidents.create({
        incidentNumber: num, date: '2026-07-20', type: 'Structure Fire',
        neris_fire_protection: FP_VALID,
      }, 1);
      const back = await db.incidents.findById(created.id, 1);
      assert.deepEqual(back.neris_fire_protection, FP_VALID, 'fire protection round-trips');
      assert.equal(typeof back.neris_fire_protection.smoke_alarm.presence.working, 'boolean', 'boolean survives (F10)');
      // The 0063 CHECK rejects a non-object even if server validation were bypassed
      await assert.rejects(
        db.pool.query('UPDATE incidents SET neris_fire_protection = $1::jsonb WHERE id = $2', ['[]', created.id]),
        /incidents_neris_fire_protection_chk/,
        'array must violate the 0063 CHECK');
    } finally {
      await db.pool.query('DELETE FROM incidents WHERE "incidentNumber"=$1', [num]);
    }
  });
}


// ─── Rule-parity sweep additions (FP-W7): NERIS cross-field rules 7/12/13/18 ──

test('rule 7: duplicate incident types are rejected', () => {
  const r = validateNerisIncidentFields({ neris_incident_types: [
    { value: 'FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE', primary: true },
    { value: 'FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE', primary: false },
  ] });
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => e.includes('duplicate type')));
});

test('rule 12: investigation_types NONE must be the only item', () => {
  const bad = validateNerisIncidentFields({ neris_fire_detail: {
    investigation_types: ['NONE', 'INVESTIGATED_ON_SCENE_RESOURCE'] } });
  assert.ok(!bad.ok);
  assert.ok(bad.errors.some((e) => e.includes('NONE must be the only item')));
  const ok = validateNerisIncidentFields({ neris_fire_detail: { investigation_types: ['NONE'] } });
  assert.ok(ok.ok);
});

test('rule 13: suppression_appliances NONE must be the only item', () => {
  const bad = validateNerisIncidentFields({ neris_fire_detail: {
    suppression_appliances: ['NONE', 'MASTER_STREAM'] } });
  assert.ok(!bad.ok);
  assert.ok(bad.errors.some((e) => e.includes('NONE must be the only item')));
});

test('rule 18: duplicate aid department NERIS IDs are rejected', () => {
  const r = validateNerisIncidentFields({ neris_aids: [
    { department_neris_id: 'FD22222222', aid_type: 'SUPPORT_AID', aid_direction: 'GIVEN' },
    { department_neris_id: 'FD22222222', aid_type: 'ACTING_AS_AID', aid_direction: 'GIVEN' },
  ] });
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => e.includes('duplicate')));
});
