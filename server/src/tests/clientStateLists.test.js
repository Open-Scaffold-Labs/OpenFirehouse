'use strict';
/**
 * clientStateLists.test.js — every state list the CLIENT offers must contain every US
 * jurisdiction that has a fire department.
 *
 * ⚠️ WHY A CLIENT INVARIANT IS TESTED FROM THE SERVER SUITE: the client has no test runner and
 * no `test` script — CI runs the server suite plus a client BUILD, nothing more. A test placed
 * under client/ would never execute, and a check that cannot run is worth less than no check at
 * all because it looks like coverage. Same reasoning, same location, as
 * clientRenderablePages.test.js. If the client ever gains a runner, move it.
 *
 * 🔴 THE DEFECT THIS EXISTS FOR, and it shipped: three divergent fifty-state arrays lived in the
 * client, and the copy inside NFIRSForm.jsx had NO 'DC'. A District of Columbia department could
 * not record its own state on an incident address — the list simply did not offer it. DC has its
 * own fire department. Nothing failed loudly; the option was just absent, which is the failure
 * mode a copied list produces: the product works for the states somebody happened to test.
 *
 * WHY THE ASSERTION IS "CONTAINS EVERY JURISDICTION" AND NOT "THERE IS ONLY ONE LIST":
 * a one-list rule is a style preference and would need an allowlist the moment a list legitimately
 * differs. This encodes the HARM instead — a jurisdiction a user cannot select — so it is
 * style-agnostic, needs no allowlist, and would have caught the original bug on the commit that
 * introduced it. A fourth copy is fine by this test as long as it is complete; an incomplete one
 * fails wherever it lives.
 *
 * PR is deliberately NOT required. It is present in the shared list because removing it would
 * strip a working option from anyone using it, but a list that omits it is not a defect of the
 * same kind — no state is unreachable. See client/src/constants/usStates.js.
 *
 * Parses source text on purpose: importing a .jsx component would drag React into a node test.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CLIENT_SRC = path.join(__dirname, '..', '..', '..', 'client', 'src');

/** The 50 states + DC. Every client-side state list must offer all 51. */
const REQUIRED = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
  'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

// A server-only checkout has no client tree. Skip LOUDLY — a silently-skipped test is
// invisible rot.
const HAVE_CLIENT = fs.existsSync(CLIENT_SRC);
if (!HAVE_CLIENT) {
  console.log(`[clientStateLists] client/src not found at ${CLIENT_SRC} — skipping.`);
  test('client state lists', { skip: 'client tree not present' }, () => {});
} else {
  /** Every .js/.jsx file under client/src. */
  function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'dist') continue;
        walk(p, out);
      } else if (/\.(js|jsx)$/.test(e.name)) {
        out.push(p);
      }
    }
    return out;
  }

  /**
   * A "state list" is any array literal holding >= 20 two-letter uppercase strings. The
   * threshold is deliberately low enough to catch a partial list and high enough that an
   * array of, say, timezone or rank codes cannot trip it.
   *
   * Matches both shapes we use: bare codes ('AL', 'AK', …) and objects
   * ({ code: 'AL', name: 'Alabama' }, …).
   */
  function stateListsIn(src) {
    const lists = [];
    for (const m of src.matchAll(/\[[\s\S]{0,6000}?\]/g)) {
      const codes = [...m[0].matchAll(/['"]([A-Z]{2})['"]/g)].map((x) => x[1]);
      const uniq = [...new Set(codes)];
      if (uniq.length >= 20) lists.push(uniq);
    }
    return lists;
  }

  const files = walk(CLIENT_SRC);

  test('client/src contains at least one state list (the detector still works)', () => {
    const total = files.reduce(
      (n, f) => n + stateListsIn(fs.readFileSync(f, 'utf8')).length, 0);
    // Guards the test itself: if a refactor changes how these lists are written and the
    // detector silently stops matching, this suite would pass while checking nothing.
    // That is the 'vacuous test' failure mode, so it is asserted rather than assumed.
    assert.ok(total >= 1,
      'No state list was detected anywhere in client/src. Either every list was removed '
      + '(unlikely) or this test\'s detector no longer matches how they are written — in which '
      + 'case it is passing without checking anything. Fix the detector.');
  });

  test('every client-side state list offers all 50 states plus DC', () => {
    const failures = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const list of stateListsIn(src)) {
        const missing = REQUIRED.filter((c) => !list.includes(c));
        if (missing.length) {
          failures.push(`${path.relative(CLIENT_SRC, f)} omits ${missing.join(', ')}`);
        }
      }
    }
    assert.deepEqual(failures, [],
      'A state list in the client does not offer every US jurisdiction, so a department in the '
      + 'missing one cannot select its own state:\n  ' + failures.join('\n  '));
  });
}
