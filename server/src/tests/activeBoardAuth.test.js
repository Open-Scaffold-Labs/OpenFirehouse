// tests/activeBoardAuth.test.js — Phase 0 accountability hardening.
//
// These are the regression fence for three defects found 2026-07-14 by reading
// the two sides of the /api/active-board contract against each other:
//
//   0.1  PUT had no ROLE gate. Any authed member of the department — a
//        probationary FF, or an in-cab rig terminal — could overwrite the
//        department's live command board.
//   0.2  The client's snake_case wire shape never matched the server's camelCase
//        destructure. Only `address` lined up. `dispatched_at` silently defaulted
//        to NOW() at board-activation, so the PAR countdown has been running from
//        the wrong basis.
//   0.5  Board mutations wrote no audit_log row.
//
// House idiom (parPersistence.test.js): the pure rule lives at module level in
// the router and is hung off the router object, so it unit-tests with zero setup.
// The DB-backed half is gated on TENANCY_TEST_DB and registers an explicit skip
// so CI stays green without a database.

const test   = require('node:test');
const assert = require('node:assert');

const activeBoard = require('../routes/activeBoard');
const { CLEAR_ROLES } = require('../middleware/requireDispatch');
const { boardPutSchema } = activeBoard;

test('0.1 — the board write is gated to dispatch/command only', () => {
  // The gate is requireDispatch. Assert its role set is exactly the command
  // ladder — if someone widens this, the board write widens with it silently.
  assert.ok(CLEAR_ROLES.has('dispatch'), 'dispatch may write the board');
  assert.ok(CLEAR_ROLES.has('chief'), 'chief may write the board');
  assert.ok(CLEAR_ROLES.has('deputy_chief'), 'deputy chief may write the board');
  assert.ok(CLEAR_ROLES.has('battalion_chief'), 'battalion chief may write the board');

  // The whole point of 0.1: these must NOT be able to overwrite a live board.
  assert.ok(!CLEAR_ROLES.has('member'), 'a member must NOT write the board');
  assert.ok(!CLEAR_ROLES.has('lieutenant'), 'a lieutenant must NOT write the board');
  assert.ok(!CLEAR_ROLES.has('officer'), 'an officer must NOT write the board');
  assert.ok(!CLEAR_ROLES.has('unit'), 'an in-cab rig terminal must NOT write the board');
});

test('0.2 — the PUT schema accepts the shape the client actually sends', () => {
  assert.ok(boardPutSchema, 'the router must export boardPutSchema for this fence');

  const wire = {
    type: 'Structure Fire',
    address: '742 Evergreen Terrace, Maplewood, NJ',
    dispatched_at: '2026-07-14T13:05:00.000Z',
    personnel_count: 0,
    units_count: 3,
  };
  const parsed = boardPutSchema.safeParse(wire);
  assert.ok(parsed.success, 'the real client payload must validate');

  // The regression that matters: dispatched_at must SURVIVE. It is the PAR
  // countdown basis. Before this fix the server read `dispatchedAt` (camel),
  // found undefined, and stamped NOW() — starting the PAR clock at board
  // activation instead of at dispatch.
  assert.equal(parsed.data.dispatched_at, wire.dispatched_at,
    'dispatched_at must round-trip — it is the PAR countdown basis, not a decoration');
  assert.equal(parsed.data.type, 'Structure Fire', 'incident type must round-trip');
  assert.equal(parsed.data.units_count, 3, 'units_count must round-trip');
});

test('0.2 — the PUT schema REJECTS a malformed shape instead of coercing it', () => {
  // The old handler passed req.body straight to the upsert, which destructured
  // keys that were never there and quietly wrote defaults. Silent coercion on a
  // life-safety surface is the bug. Now it must fail loudly.
  assert.ok(!boardPutSchema.safeParse({ dispatched_at: 'not-a-date' }).success,
    'a non-ISO dispatched_at must be rejected, not coerced to NOW()');
  assert.ok(!boardPutSchema.safeParse({ personnel_count: -1 }).success,
    'a negative personnel count must be rejected');
  assert.ok(!boardPutSchema.safeParse({ units_count: 1.5 }).success,
    'a fractional unit count must be rejected');
});

test('0.2 — validParCounts still holds the PAR arithmetic invariant', () => {
  const { validParCounts } = activeBoard;
  assert.deepEqual(validParCounts({ accounted: 12, missing: 2, total: 14 }),
    { accounted: 12, missing: 2, total: 14 });
  // accounted + missing must equal total. A PAR that does not add up is not a PAR.
  assert.equal(validParCounts({ accounted: 12, missing: 2, total: 99 }), null,
    'a PAR whose counts do not reconcile must be refused');
  assert.equal(validParCounts({ accounted: -1, missing: 0, total: -1 }), null,
    'negative counts must be refused');
});
