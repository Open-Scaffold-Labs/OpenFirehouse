/**
 * 09-contrast-sweep.spec.js — mechanical WCAG AA contrast sweep.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * On 2026-08-04 the setup wizard shipped with BLACK text on a #101828 input —
 * 1.18:1, on six fields, on the first screen of onboarding — and it was found by
 * a human looking at it, after three separate automated/manual checks had called
 * the screen clean. The lesson was not "look harder"; it was that eyeballing and
 * ad-hoc probes are not a control. This is the control.
 *
 * It deliberately covers the two things that made the defect invisible:
 *   - form-control text (input values, select display text, ::placeholder) is not
 *     a DOM text node, so any text-node walker skips it entirely;
 *   - native <select> option lists are painted by the OS, so their contrast is
 *     NOT measurable from the DOM. The audit reports that as `unmeasurable` and
 *     asserts the one thing that governs it (`color-scheme` declared on <html>),
 *     rather than counting silence as a pass.
 *
 * Runs in both themes: dark is the shipped default for apparatus-mounted
 * displays, and light is the one no one looks at.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { apiLogin } from '../fixtures/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIT_SRC = join(__dirname, '../../client/src/lib/a11y/contrastAudit.js');

/** Load the auditor as a browser-evaluable IIFE (strip ESM syntax; no bundler here). */
function auditorSource() {
  return readFileSync(AUDIT_SRC, 'utf-8')
    .replace(/^export default .*$/m, '')
    .replace(/\bexport (function|const)\b/g, '$1');
}

/** Surfaces worth guarding. Hash routes, because the app is hash-routed. */
const SURFACES = [
  { name: 'member portal',   hash: '#/portal'   },
  { name: 'dispatch/command', hash: '#/command' },
  { name: 'the board',       hash: '#/board'    },
  // Added 2026-08-05 (design-polish module 2). The operations dashboard is the
  // DENSEST surface in the app — unit-status grid, incident banner, run list,
  // stat cards — and it was the one module-2 screen the ratchet never looked at.
  // A gate that skips the busiest screen is not a gate, it is a gate-shaped
  // reassurance. Same lesson as the CAD page below, found the same day.
  { name: 'dashboard',       hash: '#/dashboard' },
  { name: 'member roster',   hash: '#/members'  },
  { name: 'duty schedule',   hash: '#/schedule' },
  // Added 2026-08-06 (design-polish module 3). Duty Schedule was guarded; the other
  // two surfaces that edit the SAME riding board were not — and the module-3 pass
  // found real defects on both (an inverted severity row, a warning icon on a
  // success verdict, a red primary). Same lesson as #/dashboard: the coverage list
  // IS the gate.
  { name: 'daily staffing',  hash: '#/daily-staffing' },
  { name: 'assignment board', hash: '#/assignboard' },
  // Added 2026-08-05 with 4C.4. The CAD page was not in this list, and a measured sweep of it
  // found ELEVEN failures at 2.6:1 — every one the same class the ratchet had already cleared
  // app-wide (bare `text-gray-400` on a white card), five of them introduced that same day by
  // the new interface-faults panel. A surface outside the sweep is a surface where the ratchet
  // does not hold, and "we fixed them all" is only true of the pages that get measured.
  { name: 'cad integration', hash: '#/cad'      },
  // Added 2026-08-06 with the cron-liveness panel. Measured clean on production BEFORE being
  // added (46 nodes, 0 unmeasurable, 0 failures, both booted themes) — a surface is added to
  // this list because it passes, not in the hope that it does. A gate that cannot go green is
  // not a gate.
  { name: 'database admin', hash: '#/db-admin' },
  // Added 2026-08-06 (design-polish module 4 — the legal record). #/incidents was the
  // ONLY incident surface guarded, and even it was guarded in one state. Measured on
  // production before the fixes: incident intelligence 24 failures light, after action
  // 13 — both clean-by-omission, both now zero. #/nfirs and #/incident-costs are
  // deliberately absent: moduleRegistry marks them 'planned', so a deep link falls back
  // to the portal and this list would be measuring the portal twice under other names.
  { name: 'incident intelligence', hash: '#/incident-intel' },
  { name: 'incident map',          hash: '#/incident-map'  },
  { name: 'after action',          hash: '#/after-action'  },
];

async function installAuditor(page) {
  await page.addScriptTag({ content: auditorSource() });
  // Never trust the numbers until the colour maths reproduces known values.
  const st = await page.evaluate(() => selfTest());
  expect(st.pass, `contrast auditor self-test must pass first: ${JSON.stringify(st.results)}`).toBeTruthy();
}

/**
 * The theme must be BOOTED, never toggled mid-session.
 *
 * Toggling `.dark` after load inverts the reading: text resolves to the new theme
 * while the ancestor background still reports the old one, so one element read
 * "#101828 on #101828" in light AND "#f3f4f6 on #ffffff" in dark. That inflated one
 * sweep from 59 real occurrences to 482. The diagnosis was made and fixed in
 * scripts/contrast-report.mjs — and left un-applied HERE, in the file that actually
 * gates the build, for a whole session. The reporting tool got better; the gate did not.
 */
async function auditIn(page, theme, hash, width = null) {
  await page.addInitScript((t) => localStorage.setItem('of-theme', t), theme);
  // Narrow CONTAINER width, not a device viewport. Matt's 2026-08-04 ruling drops
  // device passes as QA theater (iPadOS masquerades as desktop Safari; nobody
  // onboards a department on a tablet) while keeping responsive-by-default at
  // container widths as a claimed property — verified once, by hand, at
  // 570/494/380px, and then guarded by nothing. Resizing the viewport is how you
  // reach a narrow container in a headless browser; the CLAIM under test is still
  // "the layout holds when the column gets narrow", not "we support this phone".
  if (width) await page.setViewportSize({ width, height: 900 });
  await page.goto(`/${hash}`);
  // BOUNDED. networkidle's default timeout equals the test timeout, and the
  // dispatch surface never goes idle on a dev stack (20s alert poll + 30s unit
  // poll + map retries interleave), so an unbounded wait ate the entire budget
  // and the test died in page.addScriptTag with "browser has been closed" —
  // which reads like an infra flake, not what it is. 8s settles every surface
  // that settles; the ones that don't are audited mid-traffic, which is fine —
  // the auditor reads computed styles, not the network.
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await installAuditor(page);
  const booted = await page.evaluate(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  expect(booted, `app must boot in ${theme} — auditing the wrong theme silently is worse than not auditing`).toBe(theme);
  return page.evaluate(() => auditContrast());
}

function report(surface, theme, result) {
  const lines = result.failures.map(
    (f) => `  [${f.kind}] ${f.ratio}:1 (needs ${f.need}) ${f.px}px${f.bold ? ' bold' : ''} `
         + `fg ${f.fg} on bg ${f.bg} — "${f.label}"`,
  );
  return `${surface} / ${theme}: ${result.failures.length} failure(s) of ${result.checked} checked\n${lines.join('\n')}`;
}

/**
 * KNOWN DEBT, RATCHETED — not a zero-assertion.
 *
 * This spec was first committed asserting `failures` is empty, in a workflow that
 * gates pushes and PRs to `main`. It failed 10/10 immediately, on a real and
 * still-open defect (`text-gray-400` as muted body text measures 2.49-2.6:1 on light
 * surfaces, tracked as its own decision because retiring a design token app-wide is
 * not a drive-by). A gate that is red the day it lands does not get the debt paid —
 * it teaches everyone to ignore a red E2E, and the nine other journeys in this suite
 * (incident lifecycle, inspection lifecycle, tenancy isolation) lose their signal too.
 *
 * So it is a RATCHET: the count may not grow. Adding a new contrast failure fails the
 * build; the existing ones are written down here, in the open, with an owner. Lower a
 * number when you fix something — the test tells you to. The ratchet reaches zero when
 * the token decision lands, and then this table goes away.
 *
 * Baselines measured 2026-08-04 against prod at 1440x900.
 *
 * ⚠️ MY FIRST BASELINES WERE WRONG, AND THE REASON IS INSTRUCTIVE. I recorded the dark
 * numbers as 0-6 from a run where isFloating() walked to the document root, so anything
 * under a positioned ancestor was filed `uncertain` — a bucket nothing asserts on.
 * Fixing isFloating() to stop at the opaque backdrop moved 16 REAL dark-mode failures
 * back into `failures`, and the ratchet immediately failed on numbers I had written
 * myself. Baselining from a broken classifier bakes its blind spot into the gate; the
 * numbers below come from the corrected one. If a cap ever needs RAISING, that is the
 * signal to check whether the classifier changed, not to raise it.
 */
const MAX_FAILURES = {
  // 2026-08-05: the ratchet reached ZERO. The full walk (contrast-report.mjs,
  // localhost, 10,908 nodes, both themes, all 9 wizard steps + every surface
  // below) measured 0 failures / 0 uncertain after the gray-400-on-light,
  // placeholder, red-banner, segmented-control and unread-tint clusters were
  // closed. Every cap is now 0 — any nonzero count is a NEW regression.
  'member portal':    { dark: 0, light: 0 },
  'dispatch/command': { dark: 0, light: 0 },
  'the board':        { dark: 0, light: 0 },
  // Enters the ratchet at 0 like everything else — deliberately NOT baselined at
  // whatever it happens to measure. A cap set to the current number is a promise
  // not to get worse; a cap of 0 is the standard. If this surface fails on its
  // first guarded run, the answer is to fix the surface.
  'dashboard':        { dark: 0, light: 0 },
  'member roster':    { dark: 0, light: 0 },
  'duty schedule':    { dark: 0, light: 0 },
  // Module-3 surfaces, entering at 0 like every other one.
  'daily staffing':   { dark: 0, light: 0 },
  'assignment board': { dark: 0, light: 0 },
  // Module-4 surfaces, same rule.
  'incident intelligence': { dark: 0, light: 0 },
  'incident map':          { dark: 0, light: 0 },
  'after action':          { dark: 0, light: 0 },
};

test.describe('WCAG AA contrast sweep', () => {
  for (const surface of SURFACES) {
    for (const theme of ['dark', 'light']) {
      test(`${surface.name} — ${theme} mode contrast failures do not grow`, async ({ page, baseURL }) => {
        await apiLogin(page, 'chief', baseURL);
        const result = await auditIn(page, theme, surface.hash);

        // A native control whose painted colour we cannot read must not be silent.
        const blocking = result.unmeasurable.filter((u) => u.severity === 'error');
        expect(blocking, `unmeasurable-but-ungoverned: ${JSON.stringify(blocking, null, 2)}`).toEqual([]);

        const cap = MAX_FAILURES[surface.name]?.[theme] ?? 0;
        const n = result.failures.length;
        expect(n, `${report(surface.name, theme, result)}\n\nRATCHET: allowed ${cap}, found ${n}. `
          + (n > cap ? 'A NEW contrast failure was introduced — fix it, do not raise the cap.'
                     : `Improved — lower MAX_FAILURES['${surface.name}'].${theme} to ${n}.`)).toBeLessThanOrEqual(cap);
      });
    }
  }

  /**
   * NARROW CONTAINER WIDTHS.
   *
   * Every test above runs at the desktop project's width, so until now the ratchet
   * guarded exactly one column width. "Responsive-by-default" was checked once by
   * hand at 570/494/380px (2026-08-04) and then guarded by nothing — which is the
   * same shape as the `#/dashboard` gap: a property we claim, and no control that
   * would notice it breaking.
   *
   * Narrow is where contrast defects hide, because it is where colour-bearing
   * layouts reflow: text that sat on a white card lands on a tinted one, truncated
   * labels drop to a second line over a different background, and badges wrap onto
   * the surface behind them.
   *
   * 768px = the last width before the sidebar's `lg:` breakpoint hands the content
   * column the full page. Scoped to the two module-2 landing surfaces rather than
   * all of them: a control that covers everything shallowly is how the dashboard
   * went unguarded, but a control nobody can keep green is how caps get raised.
   */
  const NARROW = 768;
  for (const surface of [SURFACES[0], SURFACES[3]]) { // member portal, dashboard
    for (const theme of ['dark', 'light']) {
      test(`${surface.name} @${NARROW}px — ${theme} mode contrast failures do not grow`, async ({ page, baseURL }) => {
        await apiLogin(page, 'chief', baseURL);
        const result = await auditIn(page, theme, surface.hash, NARROW);

        // PROVE THE SWEEP SAW SOMETHING. A zero-failure result and a zero-node
        // result are indistinguishable from the assertion below, and this file
        // already records one instance of exactly that: the wizard check measured
        // ZERO all session and read as a pass. A narrow-width run is the most
        // likely place to silently measure nothing — a mis-set viewport, a layout
        // that renders an empty state, a route that redirects. So assert coverage
        // first, with a floor low enough to never flake and high enough that an
        // empty page cannot clear it.
        expect(result.checked, `narrow sweep of ${surface.name} @${NARROW}px checked only ${result.checked} nodes — `
          + 'that is a broken measurement, not a clean surface').toBeGreaterThan(50);

        // And prove the viewport actually narrowed, rather than trusting setViewportSize.
        const w = await page.evaluate(() => window.innerWidth);
        expect(w, `viewport did not narrow (innerWidth=${w})`).toBeLessThanOrEqual(NARROW);

        const blocking = result.unmeasurable.filter((u) => u.severity === 'error');
        expect(blocking, `unmeasurable-but-ungoverned: ${JSON.stringify(blocking, null, 2)}`).toEqual([]);
        const n = result.failures.length;
        expect(n, `${report(`${surface.name} @${NARROW}px`, theme, result)}\n\nRATCHET: allowed 0, found ${n}. `
          + 'Narrow-width contrast failure — fix the surface, do not widen the test.').toBeLessThanOrEqual(0);
      });
    }
  }

  /**
   * THE BILLING SURFACE — added 2026-08-07 with module 3.2 Slice D.
   *
   * Four sub-views (Invoices · Receipts · Fee schedules · Integrity) that mount only on a
   * CLICK, inside a tab that itself mounts only on a click, on a route (`#/prevention-center`)
   * that was not in SURFACES at all. So none of it would ever have been rendered by a route
   * sweep — the same shape as the Incident Log below, whose landing state measured 228 nodes
   * and ZERO failures while its two real screens carried 48 between them.
   *
   * This is the money surface: an invoice register, a receipt ledger, an adopted rate table
   * and two number-integrity reports. It is read by a clerk chasing a balance and by an
   * auditor sampling voided records, which is exactly the reading that a 2.6:1 gray label
   * makes hard.
   *
   * Coverage is asserted BEFORE cleanliness, for the reason the incident-log test gives: a
   * tab click that silently fails yields zero nodes and zero failures, which is
   * indistinguishable from a clean surface.
   */
  for (const theme of ['dark', 'light']) {
    test(`billing — ${theme} mode (all four sub-views)`, async ({ page, baseURL }) => {
      await apiLogin(page, 'chief', baseURL);
      await auditIn(page, theme, '#/prevention-center');

      await page.getByRole('button', { name: /^Billing$/ }).click();
      await page.waitForTimeout(1200);

      for (const view of ['Invoices', 'Receipts', 'Fee schedules', 'Integrity']) {
        // role=tab: the sub-views are a tablist, distinct from the outer section buttons.
        await page.getByRole('tab', { name: view }).click();
        await page.waitForTimeout(900);
        await installAuditor(page);
        const r = await page.evaluate(() => auditContrast());
        expect(r.checked, `billing/${view} checked only ${r.checked} nodes — the sub-view did not `
          + 'mount, so this is UNMEASURED, not clean').toBeGreaterThan(40);
        const blocking = r.unmeasurable.filter((u) => u.severity === 'error');
        expect(blocking, `billing/${view} ungoverned native control: ${JSON.stringify(blocking, null, 2)}`).toEqual([]);
        expect(r.failures.length, report(`billing / ${view}`, theme, r)).toBe(0);
      }
    });
  }

  /**
   * THE INCIDENT LOG'S INTERACTIVE STATES — added 2026-08-06 (design-polish module 4).
   *
   * `#/incidents` sat in SURFACES above and measured 228 nodes / ZERO failures in both
   * themes, which is true and was deeply misleading. The Incident Log renders a
   * collapsed table; its expanded per-incident panel and its **Incident Form** — the
   * screen on which an officer authors a subpoenable legal record — mount only on a
   * click, so no route sweep had ever rendered them.
   *
   * Measured the moment they were: the expanded row carried 16 failures and the form
   * carried 32, on a surface the ratchet had been reporting green for weeks. That is
   * gate-lesson #6 in the gameplan, and this test is the answer to it: a green ratchet
   * means "clean in the states we happened to render", so the states that matter have
   * to be rendered on purpose.
   *
   * Coverage is asserted BEFORE cleanliness, for the same reason the narrow-width tests
   * do it — a click that silently fails to open the form yields zero nodes and zero
   * failures, which is indistinguishable from a clean surface.
   */
  for (const theme of ['dark', 'light']) {
    test(`incident log interactive states — ${theme} mode (expanded row + incident form)`, async ({ page, baseURL }) => {
      await apiLogin(page, 'chief', baseURL);
      await auditIn(page, theme, '#/incidents');

      const rows = page.locator('tbody tr');
      expect(await rows.count(), 'no incident rows rendered — the interactive states are UNMEASURED, not clean').toBeGreaterThan(0);
      await rows.first().click();
      await page.waitForTimeout(1200);
      await installAuditor(page);
      const expanded = await page.evaluate(() => auditContrast());
      expect(expanded.checked, `expanded row checked only ${expanded.checked} nodes — broken measurement`).toBeGreaterThan(230);
      expect(expanded.failures.length, report('incident log (row expanded)', theme, expanded)).toBe(0);

      // The form. 800+ nodes of legal-record authoring that no sweep had ever seen.
      // 2026-08-07: "Log Incident" now opens the report in a SEPARATE BROWSER
      // WINDOW (spec R1), so the form is on a NEW Playwright page — asserting
      // against `page` here would look for a form that is no longer in this
      // document and fail as "did not mount". Follow the popup.
      const [reportPage] = await Promise.all([
        page.context().waitForEvent('page'),
        page.getByRole('button', { name: /log incident/i }).first().click(),
      ]);
      // PIN THE VIEWPORT before measuring geometry. The desktop project runs at
      // 1280x720; the density claim in the spec is stated at 1440x900, and a
      // threshold calibrated at one size asserted at another is just a wrong
      // number. (First run failed here with "35 of 98" against a 45 floor — the
      // gate catching my own overclaim, which is what it is for.)
      await reportPage.setViewportSize({ width: 1440, height: 900 });
      await reportPage.locator('text=Log New Incident').first().waitFor({ state: 'visible', timeout: 20000 });
      // WAIT FOR THE REFLOW, don't sleep at it. A fixed 900ms passed in dark and
      // failed in light with "18 of 98" — the same code, measured before the
      // multi-column layout had settled after the viewport resize. Poll for the
      // condition that has to be true before any of the numbers below mean
      // anything: the columns are actually applied and the sections are laid out.
      await reportPage.waitForFunction(() => {
        const c = document.querySelector('#incident-report-form')?.firstElementChild;
        if (!c) return false;
        return (parseInt(getComputedStyle(c).columnCount, 10) || 1) >= 2 && c.children.length > 5;
      }, null, { timeout: 15000 });
      await reportPage.waitForTimeout(500);
      await installAuditor(reportPage);
      const wsForm = await reportPage.evaluate(() => auditContrast());
      expect(wsForm.checked, `report window checked only ${wsForm.checked} nodes — broken measurement`).toBeGreaterThan(400);
      expect(wsForm.failures.length, report('incident report window', theme, wsForm)).toBe(0);

      // THE DENSITY CLAIM, GATED. The whole point of moving to a window was that
      // the 672px modal showed 17 of 110 fields over 4.5 screens. A layout that
      // silently reverts to one column would still be contrast-clean and still
      // be the defect — so assert the geometry, not just the colours.
      const geom = await reportPage.evaluate(() => {
        const form = document.querySelector('#incident-report-form');
        const fields = [...document.querySelectorAll('input,select,textarea')]
          .filter((e) => e.type !== 'hidden' && (e.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true));
        const inView = fields.filter((e) => {
          const r = e.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
        });
        // DO ANY TWO SECTIONS OCCUPY THE SAME PIXELS? The first version of this
        // layout was a CSS grid, and on production four pairs of sections
        // OVERLAPPED — up to 613x159px, the CAD picker drawn across the NERIS
        // classification. Every density number below was true at the time. A
        // measurement that cannot fail on a visibly broken screen is not a
        // control, so this is the assertion that could have failed.
        // The FORM scrolls; its single child DIV carries the columns and the
        // section cards (they must be separate elements — a column box that
        // cannot grow taller grows sideways). So read geometry from the child.
        const cols = form ? form.firstElementChild : null;
        const kids = cols ? [...cols.children] : [];
        const boxes = kids.map((el) => {
          const r = el.getBoundingClientRect();
          return { r, label: (el.textContent || '').trim().slice(0, 30) };
        });
        const overlaps = [];
        for (let a = 0; a < boxes.length; a += 1) {
          for (let b = a + 1; b < boxes.length; b += 1) {
            const A = boxes[a].r; const B = boxes[b].r;
            const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
            const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
            if (ox > 4 && oy > 4) overlaps.push(`"${boxes[a].label}" ∩ "${boxes[b].label}" ${Math.round(ox)}x${Math.round(oy)}px`);
          }
        }
        const cs = cols ? getComputedStyle(cols) : null;
        return {
          columns: cs ? (parseInt(cs.columnCount, 10) || 1) : 0,
          total: fields.length,
          visible: inView.length,
          screens: form ? form.scrollHeight / form.clientHeight : 99,
          overlaps,
        };
      });
      expect(geom.overlaps, `sections are drawn on top of each other: ${geom.overlaps.join(' · ')}`).toEqual([]);
      expect(geom.columns, 'the report window collapsed back to a single column').toBeGreaterThanOrEqual(2);
      // ⚠️ THIS FLOOR WAS 45 AND 45 WAS A LIE. It was calibrated against the CSS
      // GRID version, which measured 60 visible — while four pairs of sections
      // OVERLAPPED, so an unknown number of those 60 were sitting underneath
      // another card. A threshold derived from a broken layout bakes the breakage
      // into the gate. Re-measured on the corrected column layout: 37 at 1440x900,
      // 43 at 1920x1080, against the 672px modal's 17. The floor is set below the
      // honest number, not above it.
      expect(geom.visible, `only ${geom.visible} of ${geom.total} fields visible without scrolling — `
        + 'the 672px modal this replaced managed 17').toBeGreaterThanOrEqual(30);
      expect(geom.screens, `${geom.screens.toFixed(1)} screens of scrolling — the modal was 4.5`).toBeLessThan(3);

      // NO SIDEWAYS SCROLLING. A CSS column box that cannot grow taller grows
      // WIDER: the first column attempt measured scrollWidth 4256 against a 1440
      // viewport, with 20 fields of a legal record parked off the right edge.
      // It reported "1 screen of scrolling" while doing it.
      const hOver = await reportPage.evaluate(() => {
        const f = document.querySelector('#incident-report-form');
        return f ? f.firstElementChild.scrollWidth - f.clientWidth : 0;
      });
      expect(hOver, `the form overflows ${hOver}px horizontally — fields are off the right edge`).toBeLessThanOrEqual(4);
      await reportPage.close();
    });
  }

  /**
   * THE DATE AND TIME A NEW LEGAL RECORD OPENS WITH.
   *
   * Not a contrast check, but it belongs to the same class of defect: something that
   * is wrong on screen and that every green signal in the pipeline agreed was fine.
   * The form prefilled `new Date().toISOString().slice(0,10)` — the UTC day, which is
   * TOMORROW for the last hours of every local evening — from a `const` evaluated at
   * MODULE LOAD, so the time was whenever the bundle happened to load.
   *
   * localDay.test.mjs pins the pure function. This asserts the value that actually
   * reaches the officer's screen, because that is the thing that was wrong.
   */
  test('incident form prefills the LOCAL day and the CURRENT minute', async ({ page, baseURL }) => {
    await apiLogin(page, 'chief', baseURL);
    await auditIn(page, 'dark', '#/incidents');
    // The report opens in its OWN window (spec R1) — follow it, and wait for the
    // HEADING rather than sleeping at it: the form renders a LOADING panel first
    // while it fetches members + apparatus, and that panel does not contain
    // "Log New Incident", so a fixed timeout raced the fetch and failed as
    // "form did not mount" when the form was merely still loading.
    const [rp] = await Promise.all([
      page.context().waitForEvent('page'),
      page.getByRole('button', { name: /log incident/i }).first().click(),
    ]);
    await rp.locator('text=Log New Incident').first().waitFor({ state: 'visible', timeout: 20000 });

    const seen = await rp.evaluate(() => ({
      date: document.querySelector('input[type="date"]')?.value ?? null,
      time: document.querySelector('input[type="time"]')?.value ?? null,
      localDay: new Date().toLocaleDateString('en-CA'),
      localMinutes: new Date().getHours() * 60 + new Date().getMinutes(),
    }));

    expect(seen.date, 'the form must open on the day the officer is working, not the UTC day').toBe(seen.localDay);
    expect(seen.time, `time prefill malformed: ${seen.time}`).toMatch(/^\d{2}:\d{2}$/);

    // A frozen module-scope clock drifts from the wall clock by however long the page
    // has been open. Two minutes is generous for a page loaded seconds ago and still
    // catches a value captured at import on any session older than that.
    const [h, m] = seen.time.split(':').map(Number);
    expect(Math.abs((h * 60 + m) - seen.localMinutes),
      `time prefill is ${seen.time} but the clock says ${Math.floor(seen.localMinutes / 60)}:${seen.localMinutes % 60} — `
      + 'this is what a clock frozen at module load looks like').toBeLessThanOrEqual(2);
    await rp.close();
  });

  /**
   * THE INCIDENT FORM IS A DIALOG, AND FOCUS LIVES IN IT.
   *
   * Added 2026-08-07 after the production a11y audit found the opposite: no
   * `role="dialog"`, no `aria-modal`, and focus never moved in — pressing Tab
   * after opening the form walked the incident LIST behind it (the first eight
   * stops were the table's sort buttons). 88 components in this app mount a
   * modal root and exactly one declared itself; `hooks/useDialog.js` is the
   * shared fix and this is its fence.
   *
   * ⚠️ THE `expect(found)` BELOW IS LOAD-BEARING, NOT CEREMONY. The first version
   * of this check ran against a build where a temporal-dead-zone error stopped
   * the dialog mounting at all — and cheerfully reported "Tab never left the
   * dialog", because a query for `[role=dialog]` returned null and every
   * subsequent comparison was vacuously true. Assert the thing EXISTS before
   * asserting anything about it.
   *
   * There is deliberately NO Escape-to-close assertion of the "it closes" kind.
   * The opposite is asserted: Escape must leave the form OPEN. An officer
   * mid-narrative on a subpoenable record must not lose it to a stray keypress,
   * and WCAG 2.1.2 is satisfied by the Close button being keyboard-reachable —
   * which the containment check below proves.
   */
  test('incident form FALLBACK modal (blocked popup) is an announced dialog and keeps focus inside it', async ({ page, baseURL }) => {
    await apiLogin(page, 'chief', baseURL);
    // SIMULATE A BLOCKED POPUP. Since 2026-08-07 the happy path opens a separate
    // window, which is NOT a dialog and correctly declares none. The in-page
    // modal is now the fallback for a blocked popup — a locked-down kiosk
    // browser, an embedded webview — and it is still a real path a fire officer
    // can land on, so it still has to be an announced, focus-trapping dialog.
    // Stubbing window.open to return null is exactly what a blocker does.
    await page.addInitScript(() => { window.open = () => null; });
    await auditIn(page, 'dark', '#/incidents');
    await page.getByRole('button', { name: /log incident/i }).first().click();
    await page.locator('text=Log New Incident').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(400);   // let the focus rAFs settle

    const dialog = page.locator('[role="dialog"]');
    expect(await dialog.count(), 'no [role=dialog] mounted — every assertion below would be vacuous').toBeGreaterThan(0);
    await expect(dialog.first()).toHaveAttribute('aria-modal', 'true');

    // It must be NAMED, and the name must resolve to real text.
    const named = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const by = d.getAttribute('aria-labelledby');
      return by ? (document.getElementById(by)?.textContent || '').trim() : (d.getAttribute('aria-label') || '').trim();
    });
    expect(named, 'the dialog has no accessible name').toBeTruthy();

    // Focus must START inside — not on the trigger, not on the page behind.
    const startsInside = await page.evaluate(() =>
      document.querySelector('[role="dialog"]').contains(document.activeElement));
    expect(startsInside, 'focus was not moved into the dialog on open').toBe(true);

    // And must STAY inside. 30 presses is more than the visible control count of
    // the smallest dialog, so a leak has to show.
    const escapes = [];
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab');
      const out = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        const a = document.activeElement;
        return d && a && !d.contains(a)
          ? `${a.tagName} "${(a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 40)}"` : null;
      });
      if (out) escapes.push(`Tab#${i + 1} → ${out}`);
    }
    expect(escapes, `focus escaped the dialog: ${escapes.slice(0, 5).join(' · ')}`).toEqual([]);

    // Backwards too — shift-Tab from the first element must wrap, not fall out.
    for (let i = 0; i < 8; i += 1) await page.keyboard.press('Shift+Tab');
    const stillIn = await page.evaluate(() =>
      document.querySelector('[role="dialog"]').contains(document.activeElement));
    expect(stillIn, 'shift-Tab fell out of the dialog').toBe(true);

    // Escape must NOT discard an in-progress legal record. This is the assertion
    // that stops a future session "fixing" accessibility by adding it.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    expect(await page.locator('text=Log New Incident').count(),
      'Escape closed the incident form — that discards an officer\'s narrative and WCAG does not ask for it')
      .toBeGreaterThan(0);
  });

  test('setup wizard step 1 — every prefilled field is readable', async ({ page, baseURL }) => {
    // The exact regression: values rendered #000000 on #101828 because the inputs
    // carry a dark background utility and no text-colour utility, so they fell back
    // to the UA default `color: fieldtext`. Guarded here because onboarding is the
    // first thing a fire chief ever sees, and because `of_dept_setup_complete` is
    // what every other test sets to skip this screen — so nothing else covers it.
    //
    // ⚠️ This assertion was VACUOUS when first written. The wizard is `fixed inset-0`,
    // and isFloating() walked to the document root, so every control inside it landed
    // in `uncertain` while this asserted on `failures` — re-introducing the exact
    // #000000-on-#101828 defect would have passed. isFloating() now stops at the
    // opaque backdrop, which the wizard root is. Guard both buckets regardless: the
    // point is that the defect cannot hide in a bucket nobody checks.
    await apiLogin(page, 'chief', baseURL);
    await page.addInitScript(() => localStorage.removeItem('of_dept_setup_complete'));
    await page.addInitScript(() => localStorage.setItem('of-theme', 'dark'));
    await page.goto('/#/portal');
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await installAuditor(page);

    const wizard = page.getByText('OpenFirehouse Setup');
    if (!(await wizard.count())) test.skip(true, 'setup wizard did not mount for this account');

    const result = await page.evaluate(() => auditContrast());
    const isControl = (f) => f.kind.includes('value') || f.kind.includes('placeholder');
    const controls = [...result.failures, ...result.uncertain].filter(isControl);
    expect(controls, `setup wizard control text (failures + uncertain): ${JSON.stringify(controls, null, 2)}`).toEqual([]);
  });
});
