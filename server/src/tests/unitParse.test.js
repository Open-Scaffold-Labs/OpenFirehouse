/**
 * unitParse.test.js — the regression fence for unit resolution.
 *
 * Every test here maps to a way a run report could silently become WRONG:
 *   • false positive  → Engine 1's history shows calls it never ran (ISO/LOSAP inflated)
 *   • false negative  → Engine 1's history MISSES calls logged as "E1" (invisible undercount)
 *   • mis-assignment  → a run credited to the wrong rig (legal-record error)
 *   • dropped unit    → a mutual-aid rig vanishes from the record entirely
 */
const test = require('node:test');
const assert = require('node:assert');
const { parseUnits, resolveToken, normalizeToken, splitUnits } = require('../utils/unitParse');

// A realistic fleet, including the Brush 14 that makes "B14" ambiguous.
const FLEET = [
  { id: 1,  designation: 'Engine 1' },
  { id: 2,  designation: 'Engine 2' },
  { id: 10, designation: 'Engine 10' },
  { id: 100, designation: 'Engine 100' },
  { id: 3,  designation: 'Ladder 1' },
  { id: 4,  designation: 'Rescue 1' },
  { id: 5,  designation: 'Tower Ladder 1' },
  { id: 6,  designation: 'Battalion 14' },
  { id: 7,  designation: 'Brush 14' },          // collides with Battalion 14 on "B14"
  { id: 8,  designation: 'Squad 99' },
];

test('normalizeToken: case + whitespace + punctuation', () => {
  assert.equal(normalizeToken('  engine  1 '), 'ENGINE 1');
  assert.equal(normalizeToken('e1'), 'E1');
  assert.equal(normalizeToken('Engine-1'), 'ENGINE-1');
  assert.equal(normalizeToken(null), '');
});

test('splitUnits: comma/semicolon/slash, and multi-word units survive', () => {
  assert.deepEqual(splitUnits('Engine 1, Ladder 1'), ['Engine 1', 'Ladder 1']);
  assert.deepEqual(splitUnits('E1;R1'), ['E1', 'R1']);
  // A space is NOT a delimiter — "Tower Ladder 1" is ONE unit, not three.
  assert.deepEqual(splitUnits('Tower Ladder 1'), ['Tower Ladder 1']);
  assert.deepEqual(splitUnits(null), []);
  assert.deepEqual(splitUnits(''), []);
});

test('THE FALSE-POSITIVE BUG: Engine 1 must never match Engine 10 / 100', () => {
  assert.equal(resolveToken('Engine 1', FLEET).apparatus_id, 1);
  assert.equal(resolveToken('Engine 10', FLEET).apparatus_id, 10);
  assert.equal(resolveToken('Engine 100', FLEET).apparatus_id, 100);
  // The three are distinct rigs — this is what LIKE '%Engine 1%' got wrong.
  assert.notEqual(resolveToken('Engine 1', FLEET).apparatus_id,
                  resolveToken('Engine 10', FLEET).apparatus_id);
});

test('THE FALSE-NEGATIVE BUG: "E1" resolves to the same rig as "Engine 1"', () => {
  // Our own CAD data contains BOTH forms. If these disagree, Engine 1's run
  // history silently loses every call logged in short form.
  assert.equal(resolveToken('E1', FLEET).apparatus_id, 1);
  assert.equal(resolveToken('E1', FLEET).apparatus_id,
               resolveToken('Engine 1', FLEET).apparatus_id);
  assert.equal(resolveToken('E10', FLEET).apparatus_id, 10);   // and short form respects the digits
  assert.equal(resolveToken('R1', FLEET).apparatus_id, 4);
  assert.equal(resolveToken('TL1', FLEET).apparatus_id, 5);    // multi-word type
});

test('AMBIGUITY: "B14" (Brush 14 vs Battalion 14) must NOT be guessed', () => {
  const r = resolveToken('B14', FLEET);
  assert.equal(r.apparatus_id, null, 'must not pick a rig');
  assert.equal(r.ambiguous, true, 'must be flagged for a human');
  assert.equal(r.unit_raw, 'B14', 'raw token is always preserved');
});

test('LEADING ZEROS: "E01" is the same rig as "E1" (production CAD zero-pads)', () => {
  // A large metro fire CAD publishes E01 / T03 / B02 / E38. If the pad didn't
  // normalize away, EVERY call from a padding department would fail to resolve.
  assert.equal(normalizeToken('E01'), 'E1');
  assert.equal(normalizeToken('ENGINE 007'), 'ENGINE 7');
  assert.equal(resolveToken('E01', FLEET).apparatus_id, 1);
  assert.equal(resolveToken('E010', FLEET).apparatus_id, 10, 'E010 → Engine 10, not Engine 1');
});

test('AMBIGUITY: "T1" is refused when the fleet has BOTH a Truck 1 and a Tanker 1', () => {
  // Most departments mean Truck by "T1"; some mean Tanker. When both rigs exist,
  // guessing would silently credit the run to the wrong apparatus.
  const both = [...FLEET, { id: 20, designation: 'Truck 1' }, { id: 21, designation: 'Tanker 1' }];
  const r = resolveToken('T1', both);
  assert.equal(r.apparatus_id, null);
  assert.equal(r.ambiguous, true);
});

test('"T1" DOES resolve when the fleet has only a Truck 1 (no collision)', () => {
  const truckOnly = [...FLEET, { id: 20, designation: 'Truck 1' }];
  assert.equal(resolveToken('T1', truckOnly).apparatus_id, 20);
});

test('ambiguity disappears when the department maps the alias explicitly', () => {
  const mapped = FLEET.map(a => a.id === 6 ? { ...a, aliases: ['B14'] } : a);
  const r = resolveToken('B14', mapped);
  assert.equal(r.apparatus_id, 6, 'a human said B14 = Battalion 14');
  assert.equal(r.ambiguous, false);
});

test('MUTUAL AID: a unit not in our fleet is kept as text, never dropped', () => {
  const r = resolveToken('Engine 7 (Springfield)', FLEET);
  assert.equal(r.apparatus_id, null);
  assert.equal(r.ambiguous, false, 'unknown ≠ ambiguous');
  assert.ok(r.unit_raw.startsWith('Engine 7'), 'the record survives');
});

test('parseUnits: real strings from our own cad_alerts', () => {
  const a = parseUnits('Engine 1, Ladder 1, Rescue 1', FLEET);
  assert.deepEqual(a.map(r => r.apparatus_id), [1, 3, 4]);
  assert.deepEqual(a.map(r => r.seq), [0, 1, 2], 'dispatch order preserved');

  const b = parseUnits('E1, R1, BC1', FLEET);
  assert.equal(b[0].apparatus_id, 1, 'E1 → Engine 1');
  assert.equal(b[1].apparatus_id, 4, 'R1 → Rescue 1');

  const c = parseUnits('Tower Ladder 1, Engine 1', FLEET);
  assert.deepEqual(c.map(r => r.apparatus_id), [5, 1]);
});

test('the SAME RIG under two names counts ONCE (run-count integrity)', () => {
  // "Engine 1" and "E1" are one apparatus. Two rows here = Engine 1's run count
  // silently DOUBLES. This is the inflation side of the accuracy problem.
  const rows = parseUnits('Engine 1, E1, Engine 1', FLEET);
  const forEngine1 = rows.filter(r => r.apparatus_id === 1);
  assert.equal(forEngine1.length, 1, 'one rig on one call = exactly one row');
  assert.equal(rows.length, 1);
});

test('deduping a resolved rig never swallows a DIFFERENT rig', () => {
  const rows = parseUnits('Engine 1, E10, Engine 100, E1', FLEET);
  assert.deepEqual(rows.map(r => r.apparatus_id).sort((a, b) => a - b), [1, 10, 100]);
});

test('two DIFFERENT unresolved mutual-aid units both survive', () => {
  const rows = parseUnits('Engine 7 (Springfield), Ladder 9 (Union)', FLEET);
  assert.equal(rows.length, 2, 'distinct mutual-aid rigs must not collapse');
  assert.ok(rows.every(r => r.apparatus_id === null));
});

test('empty / null / whitespace units never produce rows', () => {
  assert.deepEqual(parseUnits(null, FLEET), []);
  assert.deepEqual(parseUnits('', FLEET), []);
  assert.deepEqual(parseUnits('   ', FLEET), []);
  assert.deepEqual(parseUnits(',,,', FLEET), []);
});

test('an empty fleet still records the units (ingest must never lose data)', () => {
  const rows = parseUnits('Engine 1, Ladder 1', []);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].apparatus_id, null);
  assert.equal(rows[0].unit_raw, 'Engine 1');
});
