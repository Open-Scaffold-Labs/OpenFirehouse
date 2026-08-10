// tests/resolveCrewSeats.test.js — the run-list seat resolver.
//
// THE BUG: run_lists.payload.crew[].position_id was NULL on 0 of 315 prod rows,
// so the career run-list overlay filled ZERO seats while still reporting
// mode:'career'. A feature that reported success and delivered nothing.
//
// THE REAL CAUSE (found by looking at the DATA, not the code): the two vocabularies
// do not overlap.
//
//   apparatus_positions.position_name : Driver/Engineer · Officer · Nozzle ·
//                                       Backup/Utility · Roof/Search · Rescue Tech
//   run_lists crew[].position_name    : Captain · Firefighter · Battalion Chief
//
// The template records SEATS. The run list records RANKS. Most rows cannot be
// matched by name because THE SOURCE DATA HAS NO SEAT IN IT.
//
// THE LINE THESE TESTS DEFEND: we resolve a seat only when the department's own
// template really has it. We NEVER guess. Three firefighters ride Engine 1 — which
// one was on the nozzle? The run list doesn't say, and a machine that decides is
// inventing an accountability record. "We think Smith was on the nozzle" is worse
// than "we don't know", because the first one gets believed.

const test   = require('node:test');
const assert = require('node:assert');

const { resolveCrewSeats, seatKey, UNSEATED } = require('../utils/resolveCrewSeats');

// A realistic template, in the shape prod actually has.
const SEATS = [
  { id: 1, apparatus_id: 10, position_name: 'Driver/Engineer' },
  { id: 2, apparatus_id: 10, position_name: 'Officer' },
  { id: 3, apparatus_id: 10, position_name: 'Nozzle' },
  { id: 4, apparatus_id: 10, position_name: 'Backup/Utility' },
  { id: 8, apparatus_id: 20, position_name: 'Driver/Engineer' },
  { id: 9, apparatus_id: 20, position_name: 'Officer' },
];

test('a REAL seat name resolves to the right seat id', () => {
  const r = resolveCrewSeats(
    [{ member_name: 'Ruiz', apparatus_id: 10, position_name: 'Nozzle' }],
    SEATS,
  );
  assert.equal(r.crew[0].position_id, 3);
  assert.equal(r.seated, 1);
  assert.equal(r.unseated, 0);
});

test('house SYNONYMS for the SAME seat resolve — that is not a guess', () => {
  // "Captain" and "Lieutenant" are what a department calls the person in the
  // officer's seat. It is one seat with several names, not a rank→seat inference.
  for (const label of ['Officer', 'Captain', 'Lieutenant', 'Lt', 'OIC']) {
    const r = resolveCrewSeats([{ apparatus_id: 10, position_name: label }], SEATS);
    assert.equal(r.crew[0].position_id, 2, `${label} must resolve to the Officer seat`);
  }
  for (const label of ['Driver/Engineer', 'Chauffeur', 'MPO', 'Engineer', 'Driver']) {
    const r = resolveCrewSeats([{ apparatus_id: 10, position_name: label }], SEATS);
    assert.equal(r.crew[0].position_id, 1, `${label} must resolve to the Driver seat`);
  }
});

test('🛑 A RANK IS NOT A SEAT — "Firefighter" must NEVER be assigned one', () => {
  // This is the whole point of the module. THREE firefighters ride Engine 1. The
  // template has Nozzle and Backup/Utility. Which firefighter was on the nozzle?
  // The run list does not say. If we guess, we have invented an accountability
  // record — and on a fireground the invented one gets believed.
  const r = resolveCrewSeats([
    { member_name: 'Alvarez', apparatus_id: 10, position_name: 'Firefighter' },
    { member_name: 'Boone',   apparatus_id: 10, position_name: 'Firefighter' },
    { member_name: 'Cruz',    apparatus_id: 10, position_name: 'Firefighter' },
  ], SEATS);

  assert.equal(r.seated, 0, 'no firefighter may be handed a seat we were not given');
  assert.equal(r.unseated, 3);
  for (const c of r.crew) {
    assert.equal(c.position_id, null, 'position_id must be NULL, not a guess');
  }
  assert.deepEqual([...new Set(r.issues.map(i => i.reason))], [UNSEATED.NOT_A_SEAT]);
  assert.equal(seatKey('Firefighter'), null, 'a rank maps to no seat, by design');
  assert.equal(seatKey('Captain'), 'officer', '...but an officer TITLE names a real seat');
});

test('🛑 THE FAILURE IS REPORTED, NOT SWALLOWED', () => {
  // The old code wrote NULL and returned 200. That is how this survived 315 rows.
  // Every unseated rider now comes back with a name and a reason.
  const r = resolveCrewSeats([
    { member_name: 'Alvarez', apparatus_name: 'Truck 1', apparatus_id: 99, position_name: 'Firefighter' },
    { member_name: 'Boone',   apparatus_name: 'Engine 1', apparatus_id: 10, position_name: 'Firefighter' },
  ], SEATS);

  assert.equal(r.unseated, 2);
  assert.equal(r.issues.length, 2);
  // Truck 1 has no seat template at all — an actionable, specific message.
  assert.equal(r.issues[0].reason, UNSEATED.NO_TEMPLATE);
  assert.equal(r.issues[0].member_name, 'Alvarez');
  assert.equal(r.issues[0].apparatus_name, 'Truck 1');
  // Boone's rig HAS a template; his label just isn't a seat.
  assert.equal(r.issues[1].reason, UNSEATED.NOT_A_SEAT);
});

test('one body per seat — a double-booked seat is flagged, not overwritten', () => {
  const r = resolveCrewSeats([
    { member_name: 'Ruiz',  apparatus_id: 10, position_name: 'Officer' },
    { member_name: 'Novak', apparatus_id: 10, position_name: 'Captain' },  // same seat
  ], SEATS);
  assert.equal(r.crew[0].position_id, 2, 'first claimant gets the seat');
  assert.equal(r.crew[1].position_id, null, 'the second does NOT silently take it');
  assert.equal(r.issues[0].reason, UNSEATED.SEAT_TAKEN);
});

test('a rider with no rig is not seated', () => {
  const r = resolveCrewSeats([{ member_name: 'Vega', position_name: 'Officer' }], SEATS);
  assert.equal(r.crew[0].position_id, null);
  assert.equal(r.issues[0].reason, UNSEATED.NO_APPARATUS);
});

test('a real seat name that THIS rig does not have is flagged', () => {
  // Engine 2 (id 20) has only Driver + Officer. "Nozzle" is a real seat name, but
  // not on this rig.
  const r = resolveCrewSeats([{ apparatus_id: 20, position_name: 'Nozzle' }], SEATS);
  assert.equal(r.crew[0].position_id, null);
  assert.equal(r.issues[0].reason, UNSEATED.NO_MATCHING_SEAT);
});

test('a resolved seat is renamed to the TEMPLATE\'s canonical label', () => {
  // The run list may say "Chauffeur"; the department's board says "Driver/Engineer".
  // The template wins, so every surface shows one name for one seat.
  const r = resolveCrewSeats([{ apparatus_id: 10, position_name: 'Chauffeur' }], SEATS);
  assert.equal(r.crew[0].position_id, 1);
  assert.equal(r.crew[0].position_name, 'Driver/Engineer');
});

test('THE PROD SHAPE: today\'s data seats ZERO riders — and says so', () => {
  // Verbatim from prod (2026-07-14): every crew row is a RANK on a rig with no
  // template. The honest answer is 0 seated, and the honest behaviour is to SAY it.
  const prodLike = [
    { member_name: 'A', apparatus_name: 'Truck 1',     apparatus_id: 77, position_name: 'Captain' },
    { member_name: 'B', apparatus_name: 'Truck 1',     apparatus_id: 77, position_name: 'Firefighter' },
    { member_name: 'C', apparatus_name: 'Battalion 1', apparatus_id: 78, position_name: 'Battalion Chief' },
    { member_name: 'D', apparatus_name: 'Battalion 1', apparatus_id: 78, position_name: 'BC Aide' },
  ];
  const r = resolveCrewSeats(prodLike, SEATS);   // none of these rigs are in the template
  assert.equal(r.seated, 0);
  assert.equal(r.unseated, 4);
  assert.equal(r.issues.length, 4);
  assert.ok(r.issues.every(i => i.reason === UNSEATED.NO_TEMPLATE),
    'every one of them is blocked on a MISSING SEAT TEMPLATE — that is the real ' +
    'blocker for Phase 2, and it is a data-capture gap, not a code bug');
});
