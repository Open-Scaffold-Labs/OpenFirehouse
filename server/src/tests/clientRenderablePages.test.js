'use strict';
/**
 * clientRenderablePages.test.js — keeps the CLIENT's App.jsx RENDERABLE_PAGES set honest.
 *
 * ⚠️ WHY A CLIENT INVARIANT IS TESTED FROM THE SERVER SUITE: the client has no test runner and
 * no `test` script — CI runs the server suite plus a client BUILD, nothing more. A test placed
 * in client/src/tests/ would never execute, and a check that cannot run is worth less than no
 * check at all because it looks like coverage. This suite runs on every push, so the invariant
 * lives here and reads the client file off disk. If the client ever gains a runner, move it.
 *
 * THE GUARD IT PROTECTS: an unrecognised hash used to become the ACTIVE page and render a blank
 * panel. Both router checks legitimately fail open for an unknown id — isModuleEnabled() treats
 * an id absent from MODULE_STATUS as ready (that map is a sparse HIDDEN-set by design, so making
 * it fail closed would hide every working module), and canAccess() defaults to `PAGE_ACCESS[id]
 * ?? 3`, which a chief satisfies. RENDERABLE_PAGES is the fence that was missing.
 *
 * 🔴 AND THE RISK THE FENCE ITSELF CREATES, which is the real reason this file exists: a
 * hand-kept list drifts. Add a page to the render chain, forget the Set, and the router starts
 * telling users a WORKING screen doesn't exist — worse than the blank panel, because it reads as
 * a deliberate product statement. Both directions are compared here and either drift fails.
 *
 * Parses source text deliberately: importing App.jsx would drag React and ~90 lazy chunks into a
 * node test for no benefit.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..', '..', '..', 'client', 'src', 'App.jsx');

// If the client tree isn't present (a server-only checkout), skip loudly rather than fail — but
// never skip silently, because a permanently-skipped test is invisible rot.
const HAVE_CLIENT = fs.existsSync(APP);
if (!HAVE_CLIENT) {
  console.log(`[clientRenderablePages] client/src/App.jsx not found at ${APP} — skipping.`);
  test('client RENDERABLE_PAGES', { skip: 'client tree not present' }, () => {});
} else {
  const src = fs.readFileSync(APP, 'utf8');

  /** Every `page === 'x'` branch in the render chain. */
  const branchIds = () =>
    new Set([...src.matchAll(/page === '([a-z0-9-]+)'/g)].map((m) => m[1]));

  /** The ids inside the RENDERABLE_PAGES Set literal. */
  function declaredIds() {
    const start = src.indexOf('export const RENDERABLE_PAGES = new Set([');
    assert.notEqual(start, -1, 'RENDERABLE_PAGES declaration not found in client/src/App.jsx');
    const end = src.indexOf(']);', start);
    assert.notEqual(end, -1, 'RENDERABLE_PAGES literal is unterminated');
    return new Set([...src.slice(start, end).matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));
  }

  test('every renderable page is declared in RENDERABLE_PAGES', () => {
    const missing = [...branchIds()].filter((id) => !declaredIds().has(id)).sort();
    assert.deepEqual(missing, [],
      'These pages HAVE a render branch but are NOT in RENDERABLE_PAGES, so the router will tell '
      + `users a working screen does not exist: ${missing.join(', ')}`);
  });

  test('RENDERABLE_PAGES declares nothing that cannot render', () => {
    const branches = branchIds();
    const extra = [...declaredIds()].filter((id) => !branches.has(id)).sort();
    assert.deepEqual(extra, [],
      'These ids are in RENDERABLE_PAGES but have NO render branch, so navigating to them gives a '
      + `blank panel — exactly the bug the Set exists to prevent: ${extra.join(', ')}`);
  });

  test('the parse is non-trivial — a regex that matched nothing would pass everything above', () => {
    // Anti-pattern #54: both assertions above are vacuously true if these regexes stop matching
    // (a refactor of the render chain to a lookup map, a rename). 80 is well under the ~98 real
    // pages and well over zero.
    const n = branchIds().size;
    assert.ok(n > 80,
      `only ${n} render branches found — the parser has probably stopped matching the render `
      + 'chain (refactored to a map?). Fix this test before trusting the two above.');
    assert.ok(declaredIds().size > 80, 'RENDERABLE_PAGES parsed as suspiciously small');
  });

  test('the router guards actually consult RENDERABLE_PAGES', () => {
    // A correct Set is useless if nothing reads it. Pin every call site.
    const uses = (src.match(/RENDERABLE_PAGES\.has\(/g) || []).length;
    assert.ok(uses >= 3,
      `RENDERABLE_PAGES.has() referenced ${uses} time(s); expected >= 3 (the hashchange handler `
      + 'plus both deep-link paths in getInitialPage). A guard nothing calls is not a guard.');
  });

  /**
   * 🔴 THIS TEST REPLACES ONE THAT ENCODED THE WRONG ANSWER, and the swap is the point.
   *
   * It used to assert `setUnknownRoute(` and the literal string "That screen doesn" — i.e. it
   * REQUIRED a banner reading *"That screen doesn't exist. The link pointed at `prevention`,
   * which isn't a page in OpenFirehouse — most likely an old bookmark or a mistyped address."*
   * That banner put an internal route slug in a monospace box, plus a theory about the user's
   * browser, in front of a fire chief. Matt's call, and he was right: an unknown route should
   * land you somewhere real, quietly.
   *
   * So the invariant is no longer "explain it" — it is "land somewhere real, and if the id was
   * RETIRED, land on its successor." That is the stronger requirement, and it is the one the old
   * redirect tried and failed to meet.
   */
  /**
   * THE GENERAL DETECTOR for the class, not just for the one instance of it we found.
   *
   * The R6 redirect was a branch in the render chain testing `page` against a list of ids, where
   * NONE of those ids could ever be `page` — because they are absent from RENDERABLE_PAGES and
   * both routers filter against it first. Dead by construction, from the commit that wrote it.
   *
   * This asserts the invariant that makes that impossible to reintroduce: **any render-chain
   * branch that tests `page` against a list of ids must contain at least one id that can
   * actually BE `page`.** A list where none can is unreachable code wearing a guard's clothes.
   *
   * Deliberately "at least one" and not "all": a list may legitimately mix a live id with ids
   * being retired in the same commit, and requiring all of them would fail a correct migration.
   * The harm is a branch that can NEVER run; that is what is encoded.
   */
  test('no render-chain branch tests `page` against ids that can never be `page`', () => {
    const declared = declaredIds();
    // Match `['a', 'b', …].includes(page)` — the shape the dead redirect used.
    const branches = [...src.matchAll(/\[([^\]]*?)\]\s*\.includes\(page\)/gs)];
    const dead = [];
    for (const b of branches) {
      const ids = [...b[1].matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
      if (ids.length && !ids.some((id) => declared.has(id))) dead.push(ids);
    }
    assert.deepEqual(dead, [],
      'render-chain branch(es) test `page` against ids that are all absent from RENDERABLE_PAGES, '
      + 'so `page` can never equal one and the branch can never run: '
      + `${JSON.stringify(dead)}. Resolve retired ids at the router entry points (see `
      + 'RETIRED_ROUTES / resolveRoute in App.jsx), not in the render tree.');
  });

  test('a retired route resolves to its successor, BEFORE the renderable gate', () => {
    // Every retired id must resolve to a page that can actually render — a redirect to a
    // non-renderable id is just the blank panel with extra steps.
    const map = src.match(/RETIRED_ROUTES = Object\.freeze\(\{([\s\S]*?)\}\)/);
    assert.ok(map, 'RETIRED_ROUTES not found in client/src/App.jsx');
    const pairs = [...map[1].matchAll(/'?([\w-]+)'?\s*:\s*'([\w-]+)'/g)].map((m) => [m[1], m[2]]);
    assert.ok(pairs.length >= 9, `RETIRED_ROUTES parsed ${pairs.length} entries; expected >= 9`);

    const declared = declaredIds();
    for (const [from, to] of pairs) {
      assert.ok(declared.has(to),
        `RETIRED_ROUTES['${from}'] points at '${to}', which is not in RENDERABLE_PAGES — that is a `
        + 'redirect to a blank panel.');
      assert.ok(!declared.has(from),
        `'${from}' is BOTH retired and renderable; the alias would shadow a working page.`);
    }
  });

  test('the eight ids retired by the R6 fold are all covered', () => {
    // From `git show 986b624` — the commit that deleted these page ids and their nav entries.
    // A bookmark, a saved landing page or a ?page= push notification aimed at any of them
    // predates the fold and is still out there.
    const retiredByR6 = ['permits', 'violations', 'complaints', 'registrations',
      'registration-search', 'registration-entry', 'inspection-checklist', 'inspector-status'];
    const map = src.match(/RETIRED_ROUTES = Object\.freeze\(\{([\s\S]*?)\}\)/)[1];
    const uncovered = retiredByR6.filter((id) => !new RegExp(`'?${id}'?\\s*:`).test(map));
    assert.deepEqual(uncovered, [],
      `retired by 986b624 but not in RETIRED_ROUTES: ${uncovered.join(', ')} — these land on the `
      + 'portal instead of where the capability went.');
  });

  test('resolution happens BEFORE the RENDERABLE_PAGES gate — the bug that made the old redirect dead code', () => {
    // 🔴 The regression this pins. The R6 redirect lived in the RENDER CHAIN and tested `page`:
    //      {[...retiredIds].includes(page) && setTimeout(() => setPage('prevention-center'))}
    //    But none of those ids is in RENDERABLE_PAGES, so getInitialPage and the hashchange
    //    handler both rejected them and `page` was NEVER set to one. The guard against stale
    //    links was unreachable BY a stale link, on every cold load and every push-notification
    //    click, from the day it shipped. Resolution must therefore be applied to the RAW id at
    //    each entry point, before the gate.
    assert.ok(/resolveRoute\(/.test(src), 'resolveRoute is never called — retired ids are not resolved');
    const calls = (src.match(/resolveRoute\(/g) || []).length;
    // The definition plus three entry points: hash in getInitialPage, ?page= in getInitialPage,
    // and the hashchange handler.
    assert.ok(calls >= 3,
      `resolveRoute() called ${calls} time(s); expected >= 3 (hash + ?page= + hashchange). `
      + 'A resolver that one entry point skips is the same dead-code bug in a new place.');

    // And the render-chain version must be GONE, not left alongside as a second answer.
    //
    // Checked against CODE with comments stripped, not the raw file. The first version of this
    // assertion failed on the comment DOCUMENTING the removed redirect — the write-up quotes the
    // old line verbatim, which is exactly what you want in a comment and exactly what a raw
    // regex cannot tell apart from live code. Same trap the tracker artifact hit with a literal
    // script tag inside a comment. A test that cannot distinguish an explanation from the thing
    // it explains will fire on every future mention of the bug.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments, including the JSX {/* … */} bodies
      .replace(/^[ \t]*\/\/.*$/gm, '');   // whole-line // comments
    assert.ok(!/setTimeout\(\(\) => setPage\('prevention-center'\)/.test(code),
      'the unreachable render-chain redirect is still present in CODE; it also set state during render.');
    // Prove the stripper did not simply empty the file, or the assertion above is vacuous.
    assert.ok(code.includes('RENDERABLE_PAGES.has('),
      'comment-stripping removed real code — the assertion above would pass on anything');
  });
}
