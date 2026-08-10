#!/usr/bin/env node
/**
 * contrast-report.mjs — run the contrast audit over many surfaces and print a
 * GROUPED report, so a sweep produces a work list instead of a wall of diffs.
 *
 * The spec (journeys/09-contrast-sweep.spec.js) is the gate: it fails the build.
 * This is the companion you actually read while fixing, because the same
 * colour pair usually appears dozens of times and wants ONE fix, not dozens.
 *
 *   node scripts/contrast-report.mjs                          # localhost:5173
 *   BASE=https://app.openfirehouse.openscaffoldlabs.com node scripts/contrast-report.mjs
 *   BASE=... USER_ROLE=officer node scripts/contrast-report.mjs
 *
 * Exit code is 0 always — this is a reporting tool, not a gate. Do not wire it
 * into CI as a pass/fail signal; that is the spec's job.
 *
 * ⚠️ THE WIZARD WALK WRITES, AND IT IS THEREFORE LOCALHOST-ONLY BY DEFAULT.
 *
 * Auditing the setup wizard means advancing through it, and every `Next` runs
 * `persistStep` — PATCH /api/departments/:id, POST /api/stations, POST /api/apparatus.
 * A tool whose own header called itself read-only renamed the PRODUCTION department
 * to "Contrast Audit FD" (2026-08-04) because this file documented the prod URL on
 * one line and the write on another, forty lines apart, and I ran it. The name was
 * restored by hand; nothing else was altered, because every other field is written
 * back as it was hydrated.
 *
 * So the walk now refuses any non-localhost BASE unless ALLOW_WRITES=1 is set
 * explicitly. The read-only surface sweep is unaffected and still runs anywhere —
 * the refusal is scoped to the part that mutates. A comment is not a guard.
 */

import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://localhost:5173';
const USER = process.env.USER_ROLE || 'chief';
const PASSWORD = process.env.USER_PASSWORD || '1234';

const AUDITOR = readFileSync(join(__dirname, '../../client/src/lib/a11y/contrastAudit.js'), 'utf-8')
  .replace(/^export default .*$/m, '')
  .replace(/\bexport (function|const)\b/g, '$1');

const SURFACES = [
  ['member portal', '#/portal'],
  ['dispatch/command', '#/command'],
  ['the board', '#/board'],
  ['member roster', '#/members'],
  ['duty schedule', '#/schedule'],
  ['incident log', '#/incidents'],
  ['apparatus', '#/apparatus'],
  ['training', '#/training'],
  ['settings', '#/settings'],
];

const browser = await chromium.launch();

// One real login, reused — the server's authLimiter is 30/15min per IP.
const bootstrap = await browser.newContext();
const res = await bootstrap.request.post(`${BASE}/api/auth/login`, { data: { username: USER, password: PASSWORD } });
if (!res.ok()) {
  console.error(`login failed for ${USER}: HTTP ${res.status()}. Set USER_ROLE/USER_PASSWORD.`);
  process.exit(0);
}
const { token, user } = await res.json();
await bootstrap.close();

/**
 * A FRESH CONTEXT PER THEME. addInitScript() is cumulative across navigations,
 * so seeding the theme inside the surface loop silently left the first theme's
 * script in place — every "light" pass actually booted dark. One context per
 * theme is the only way the seed is unambiguous.
 */
async function contextFor(theme, { suppressWizard = true } = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(([t, u, th, hide]) => {
    localStorage.setItem('fs_token', t);
    if (u) localStorage.setItem('fs_user', JSON.stringify(u));
    localStorage.setItem('of-theme', th);   // the key utils/theme.js reads at boot
    // `of_dept_setup_complete` suppresses the setup wizard. Setting it is what lets
    // this sweep reach the app shell at all — and it is ALSO why the wizard went
    // unmeasured for an entire session while being the screen a human was pointing
    // at. So it is now a parameter, and the wizard gets its own pass with it cleared.
    if (hide) localStorage.setItem('of_dept_setup_complete', '1');
    else localStorage.removeItem('of_dept_setup_complete');
  }, [token, user, theme, suppressWizard]);
  return c;
}
const groups = new Map();   // "kind fg on bg" -> { ...meta, count, examples:Set, surfaces:Set }
const exemptGroups = new Map();
const uncertainGroups = new Map();
let selfTested = false;
let totalChecked = 0;

const key = (f) => `${f.kind}|${f.fg}|${f.bg}|${f.px}|${f.bold}|${f.el}`;
function collect(map, list, surface, theme) {
  for (const f of list) {
    const k = key(f);
    if (!map.has(k)) map.set(k, { ...f, count: 0, examples: new Set(), surfaces: new Set() });
    const g = map.get(k);
    g.count++;
    if (g.examples.size < 3) g.examples.add(f.label);
    g.surfaces.add(`${surface}/${theme}`);
  }
}

for (const theme of ['dark', 'light']) {
  // BOOT in the target theme; never toggle mid-session. Toggling the `dark` class
  // after load produced a systematic inversion — text resolved to the new theme
  // while the ancestor background still reported the old one, so one element read
  // "#101828 on #101828" in light and "#f3f4f6 on #ffffff" in dark. Both nonsense,
  // and together they inflated one sweep from 59 real occurrences to 482.
  const ctx = await contextFor(theme);
  const page = await ctx.newPage();

  for (const [name, hash] of SURFACES) {
    try {
      await page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1800);           // let data-driven panels paint
      await page.addScriptTag({ content: AUDITOR });

      if (!selfTested) {
        const st = await page.evaluate(() => selfTest());
        if (!st.pass) {
          console.error('AUDITOR SELF-TEST FAILED — numbers below would be meaningless:');
          console.error(JSON.stringify(st.results, null, 2));
          process.exit(0);
        }
        console.log('auditor self-test: PASS (OKLCH conversion reproduces the Tailwind v4 ramp)\n');
        selfTested = true;
      }

      // Confirm the app actually booted in the theme we asked for. Auditing the
      // wrong theme silently is worse than not auditing.
      const actual = await page.evaluate(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
      if (actual !== theme) {
        console.log(`-- ${name}/${theme}: app booted in ${actual}, skipping rather than reporting the wrong theme`);
        continue;
      }
      const r = await page.evaluate(() => auditContrast());

      totalChecked += r.checked;
      collect(groups, r.failures, name, theme);
      collect(exemptGroups, r.exempt, name, theme);
      collect(uncertainGroups, r.uncertain, name, theme);
      const ungoverned = r.unmeasurable.filter((u) => u.severity === 'error');
      if (ungoverned.length) {
        console.log(`!! ${name}/${theme}: ${ungoverned.map((u) => `${u.what} ungoverned (${u.governedBy})`).join(', ')}`);
      }
    } catch (err) {
      console.log(`-- ${name}/${theme}: could not audit (${String(err).split('\n')[0]})`);
    }
  }
  await ctx.close();
}

/**
 * The setup wizard, audited on purpose.
 *
 * It is NOT in SURFACES because it is not a route — it is a conditional
 * `fixed inset-0 z-50` overlay that mounts only when `of_dept_setup_complete` is
 * absent. Every other pass sets that flag to get past it. The result was that the
 * first screen of onboarding, containing controls measured at 1.18:1, reported ZERO
 * findings all session — indistinguishable from clean. It gets its own context with
 * the flag cleared, and it ASSERTS the overlay actually mounted, because "0 findings
 * because nothing rendered" must never be reportable as "0 findings".
 */
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(BASE);
const MAY_WRITE = IS_LOCAL || process.env.ALLOW_WRITES === '1';
if (!MAY_WRITE) {
  console.log(`\n!! setup wizard: SKIPPED — walking it WRITES (each Next persists), and BASE is not localhost.`);
  console.log(`   This is a refusal, not a pass: the wizard is UNMEASURED in this run.`);
  console.log(`   Re-run against a local server, or set ALLOW_WRITES=1 if you accept writing to ${BASE}.`);
}
for (const theme of MAY_WRITE ? ['dark', 'light'] : []) {
  const ctx = await contextFor(theme, { suppressWizard: false });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/#/portal`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const mounted = await page.locator('text=OpenFirehouse Setup').count();
    if (!mounted) {
      console.log(`!! setup wizard/${theme}: overlay did NOT mount — UNMEASURED, not clean. `
        + '(Server-side setup state may already be complete for this account.)');
      continue;
    }
    const actual = await page.evaluate(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    if (actual !== theme) { console.log(`-- setup wizard/${theme}: booted ${actual}, skipping`); continue; }

    // WALK ALL NINE STEPS. Auditing only whatever step 1 renders and calling the
    // wizard covered is the same error as auditing the shell and calling the wizard
    // covered — one screen out of nine, reported as the whole flow. Department Name is
    // the one required field, so fill it, then advance until Next stops existing.
    await page.fill('#dept-name', 'Contrast Audit FD').catch(() => {});
    for (let stepNo = 1; stepNo <= 9; stepNo += 1) {
      await page.addScriptTag({ content: AUDITOR });
      const label = await page.evaluate(() => {
        const h = document.querySelector('h1 + p, header p');
        return (h && h.textContent.trim()) || '';
      });
      const r = await page.evaluate(() => auditContrast());
      const surface = `wizard step ${stepNo}${label ? ` (${label.replace(/^Step \d+ of \d+ — /, '')})` : ''}`;
      totalChecked += r.checked;
      collect(groups, r.failures, surface, theme);
      collect(exemptGroups, r.exempt, surface, theme);
      collect(uncertainGroups, r.uncertain, surface, theme);
      console.log(`   ${surface}/${theme}: ${r.checked} nodes, ${r.failures.length} failure(s), ${r.uncertain.length} uncertain`);

      const next = page.getByRole('button', { name: /^Next/ });
      if (!(await next.count()) || !(await next.isEnabled().catch(() => false))) {
        console.log(`   (stopped at step ${stepNo} — no enabled Next; ${stepNo === 9 ? 'expected, this is Launch' : 'INVESTIGATE'})`);
        break;
      }
      await next.click();
      await page.waitForTimeout(1200);   // the step PATCHes before it swaps
    }
  } catch (err) {
    console.log(`-- setup wizard/${theme}: could not audit (${String(err).split('\n')[0]})`);
  }
  await ctx.close();
}

function print(title, map) {
  const rows = [...map.values()].sort((a, b) => a.ratio - b.ratio || b.count - a.count);
  console.log(`\n${title} — ${rows.length} distinct colour pair(s), ${rows.reduce((n, r) => n + r.count, 0)} occurrence(s)`);
  if (!rows.length) return;
  console.log('-'.repeat(100));
  for (const r of rows) {
    console.log(`${String(r.ratio).padStart(5)}:1  need ${r.need}  ${String(r.px).padStart(4)}px${r.bold ? ' bold' : '     '}  `
      + `fg ${r.fg} on ${r.bg}  x${String(r.count).padStart(3)}  [${r.kind}]`);
    console.log(`         el:   ${r.el}`);
    console.log(`         bg:   ${r.bgFrom}`);
    console.log(`         e.g. ${[...r.examples].map((e) => JSON.stringify(e)).join(', ')}`);
    console.log(`         on: ${[...r.surfaces].join(', ')}`);
  }
}

console.log(`base: ${BASE}   as: ${USER}   text/control nodes checked: ${totalChecked}`);
print('AA FAILURES — in normal flow, DOM backdrop is the painted backdrop. TRUSTWORTHY.', groups);
print('UNCERTAIN — fixed/sticky/absolute: painted backdrop may differ from DOM ancestor. GO LOOK.', uncertainGroups);
print('EXEMPT — disabled controls, WCAG 1.4.3 (read, but not build-failing)', exemptGroups);

await browser.close();
