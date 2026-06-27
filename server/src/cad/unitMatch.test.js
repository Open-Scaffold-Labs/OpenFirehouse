'use strict';
/**
 * Deterministic tests for CAD unit -> apparatus matching (unitMatch.js).
 * Run: `node server/src/cad/unitMatch.test.js` (no DB, no test runner needed).
 * Exits non-zero on failure.
 */
const { matchApparatus } = require('./unitMatch');

const names = [
  'Battalion 1', 'Brush 14', 'Command 14', 'EMS 14',
  'Engine 1', 'Engine 14', 'Engine 142', 'Engine 2', 'Engine 3', 'Engine 4', 'Engine 5', 'Engine 6',
  'Ladder 1', 'Ladder 14', 'Medic 1', 'Medic 2', 'Rescue 1', 'Rescue 14',
  'Tanker 1', 'Tanker 14', 'Truck 1', 'Truck 2', 'Truck 3', 'Utility 1',
];
const fleet = names.map((designation, i) => ({ id: i + 1, designation }));

const cases = [
  // exact + case/space/separator variants
  ['Engine 6', 'Engine 6'], ['E6', 'Engine 6'], ['E-6', 'Engine 6'], ['ENG6', 'Engine 6'],
  ['eng 6', 'Engine 6'], ['e 6', 'Engine 6'], ['E142', 'Engine 142'], ['E14', 'Engine 14'],
  ['L1', 'Ladder 1'], ['LAD14', 'Ladder 14'], ['Ladder 1', 'Ladder 1'],
  // fleet-disambiguated abbreviations
  ['BC', 'Battalion 1'], ['B1', 'Battalion 1'], ['B14', 'Brush 14'], ['BR14', 'Brush 14'],
  ['R1', 'Rescue 1'], ['RES14', 'Rescue 14'], ['M1', 'Medic 1'], ['MED2', 'Medic 2'],
  ['TK1', 'Tanker 1'], ['TANK14', 'Tanker 14'], ['TRK1', 'Truck 1'], ['Truck 2', 'Truck 2'],
  ['C14', 'Command 14'], ['U1', 'Utility 1'], ['EMS14', 'EMS 14'], ['ems 14', 'EMS 14'],
  // FAIL-SAFE: ambiguous or unknown -> null (never guess)
  ['T1', null],          // Truck 1 AND Tanker 1 both exist
  ['Squad 99', null], ['Engine 99', null], ['SQ1', null], ['XYZ', null], ['', null], ['S', null],
];

let pass = 0, fail = 0;
for (const [tok, exp] of cases) {
  const m = matchApparatus(tok, fleet);
  const got = m ? m.designation : null;
  if (got === exp) pass++;
  else { fail++; console.error(`FAIL  "${tok}"  expected=${exp}  got=${got}`); }
}
console.log(`${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILURES` : ''}`);
process.exit(fail ? 1 : 0);
