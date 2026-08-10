/**
 * 10-permits-register-layout.spec.js — the permits register fits its pane, and its
 * controls are reachable.
 *
 * WHY THIS TEST EXISTS
 * ────────────────────
 * On 2026-08-04 this one table shipped three layout defects to production in a
 * single evening, each found by a human looking at it after the previous "fix":
 *
 *   1. Rows were 149–165px tall because the property cell stacked a name over a
 *      full address in a narrow column.
 *   2. Fixing that with a min-width made the table 1225px wide inside a 1006px
 *      scroller — 219px of columns, including Expires (the documented sort key)
 *      and the Fee, sat behind a horizontal scroll nobody would think to use.
 *   3. Fixing THAT with table-fixed clipped the Issue button by 3px, because the
 *      Actions column was budgeted against the seed data rather than against the
 *      widest state a permit can reach.
 *
 * Every one of them is a NUMBER, and every one was found by eye. That is the gap
 * this closes. The assertions below are the measurements — hidden overflow,
 * per-row control hit-testing against the app's floating rail, row height, and
 * the wide/narrow column tiers — so a regression fails a check instead of
 * reaching an operator.
 *
 * It runs across the configured device projects, because the field device is an
 * iPad and "verified on desktop" is how a stranded column ships.
 */

import { test, expect } from '@playwright/test';
import { apiLogin } from '../fixtures/auth.js';

/** Reach the register: Prevention Center → Permits → Register. */
async function openRegister(page, baseURL) {
  await apiLogin(page, 'chief', baseURL || '');
  await page.goto('/#/prevention-center');
  await page.getByRole('button', { name: 'Permits', exact: true }).click();
  // The table only exists once permits load; an empty register renders EmptyState
  // instead, and that is a legitimate state, not a failure.
  const table = page.locator('table').first();
  await table.waitFor({ state: 'visible', timeout: 15_000 });
  return table;
}

test.describe('permits register layout', () => {
  test('no column is hidden behind a horizontal scroll', async ({ page, baseURL }) => {
    const table = await openRegister(page, baseURL);

    const m = await table.evaluate((t) => {
      const sc = t.closest('[class*=overflow]') || t.parentElement;
      return { hidden: sc.scrollWidth - sc.clientWidth, layout: getComputedStyle(t).tableLayout };
    });

    // table-fixed is what makes the guarantee structural rather than incidental:
    // percentages that sum to 100 cannot exceed the container at any width.
    expect(m.layout).toBe('fixed');
    // 1px of tolerance for subpixel rounding on a fractional device pixel ratio.
    expect(m.hidden, 'columns hidden behind a horizontal scroll').toBeLessThanOrEqual(1);
  });

  test('every row control is reachable — nothing sits under the floating rail', async ({ page, baseURL }) => {
    const table = await openRegister(page, baseURL);

    // The app's assistant / dictation / voice / feedback widgets are position:fixed.
    // Laid out as a horizontal row they claimed a 216px band up the right edge and
    // covered the Retire control on 2 of 6 rows — destructive, on a legal record,
    // both unreachable and mis-aimable. This hit-tests the real geometry rather
    // than trusting the rail's declared width.
    const probe = await page.evaluate(() => {
      const t = document.querySelector('table');
      // VISIBILITY MUST NOT BE TESTED WITH offsetParent HERE. For position:fixed the spec
      // says offsetParent is null, so `b.offsetParent !== null` excludes every floating
      // widget — the exact filter this test shipped with, which made it vacuous: it found
      // zero widgets and reported zero collisions on a page that had three. Caught by
      // running the same probe against production and noticing the widget list was empty.
      const visible = (e) => {
        const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01;
      };
      const fixed = [...document.querySelectorAll('button')]
        .filter((b) => getComputedStyle(b).position === 'fixed' && visible(b));
      const rowBtns = [...t.querySelectorAll('tbody button')];
      const hits = [];
      for (const f of fixed) {
        const a = f.getBoundingClientRect();
        for (const r of rowBtns) {
          const b = r.getBoundingClientRect();
          if (a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom) continue;
          hits.push({
            floating: f.getAttribute('aria-label') || f.title || 'unlabelled',
            covers: (r.getAttribute('aria-label') || r.title || r.textContent || 'unlabelled').trim().slice(0, 48),
          });
        }
      }
      return { hits, fixedCount: fixed.length, rowControlCount: rowBtns.length };
    });

    // A collision test that found no widgets and no controls cannot fail, and a check that
    // cannot fail verifies nothing. Assert the probe actually had something to look at
    // BEFORE trusting its verdict.
    expect(probe.fixedCount, 'probe found no floating widgets — the check would be vacuous')
      .toBeGreaterThan(0);
    expect(probe.rowControlCount, 'probe found no row controls — the check would be vacuous')
      .toBeGreaterThan(0);
    expect(probe.hits, 'a floating widget is covering a row control').toEqual([]);
  });

  test('rows stay dense — no row balloons past two lines of content', async ({ page, baseURL }) => {
    const table = await openRegister(page, baseURL);
    const heights = await table.evaluate((t) =>
      [...t.querySelectorAll('tbody tr')].map((tr) => Math.round(tr.getBoundingClientRect().height)));

    expect(heights.length).toBeGreaterThan(0);
    // The regression was 149–165px per row from a wrapped address. 130 leaves room
    // for the legitimately taller states (a primary verb wrapping under the kebab,
    // a supersession chain under the status) without re-admitting a wrapped cell.
    expect(Math.max(...heights), `tallest row: ${heights.join(', ')}`).toBeLessThanOrEqual(130);
  });

  test('column tier matches the pane: Expires is never dropped, and nothing is lost when Fee is', async ({ page, baseURL }) => {
    const table = await openRegister(page, baseURL);

    const seen = await table.evaluate((t) => ({
      headers: [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim()),
      paneW: Math.round((t.closest('[class*=overflow]') || t.parentElement).clientWidth),
      // In the narrow tier the issued date and fee fold into the Expires cell rather
      // than disappearing — this register has no row-detail view, so a dropped value
      // would be unreachable for an already-issued permit.
      foldedLines: [...t.querySelectorAll('tbody tr')]
        .map((tr) => tr.textContent)
        .filter((x) => /issued\s/i.test(x)).length,
      rowCount: t.querySelectorAll('tbody tr').length,
    }));

    // Expires is the sort key the register's own caption advertises. It is never a
    // candidate for dropping, in either tier, at any width.
    expect(seen.headers, 'Expires must always be present').toContain('Expires');
    expect(seen.headers).toContain('Type');
    expect(seen.headers).toContain('Property');

    const wide = seen.headers.includes('Fee');

    // THE TIER MUST MATCH THE PANE — and this assertion is here because its absence
    // let a real bug through. The first version of this test only checked that the
    // tier was self-CONSISTENT (Fee implies Issued), so it passed on production while
    // a 986px pane rendered all eight columns: the ResizeObserver was attached from a
    // `useEffect([], …)` that ran before the table existed, so it never attached at
    // all and the component sat in the wide tier forever. Self-consistency was true
    // the whole time. Assert the DECISION, not just its internal agreement.
    expect(wide, `pane is ${seen.paneW}px — tier should be ${seen.paneW >= 1180 ? 'wide' : 'narrow'}`)
      .toBe(seen.paneW >= 1180);

    if (wide) {
      expect(seen.headers, 'the wide tier shows Issued alongside Fee').toContain('Issued');
    } else {
      // Narrow tier: Fee and Issued gave up their columns, so every row must still
      // show them folded into the Expires cell.
      expect(seen.headers).not.toContain('Issued');
      expect(seen.foldedLines,
        'narrow tier dropped Fee/Issued without folding them into the row').toBe(seen.rowCount);
    }
  });

  test('the row overflow menu is operable, and opens above the floating rail', async ({ page, baseURL }) => {
    const table = await openRegister(page, baseURL);

    const trigger = table.locator('tbody button[aria-haspopup="menu"]').first();
    const n = await trigger.count();
    test.skip(n === 0, 'no row offers secondary actions for this account');

    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Portaled on purpose: the register's scroller is overflow-x-auto, so a popover
    // rendered inside the cell opens and is invisible. Assert it escaped the
    // scroller AND is fully on screen.
    const box = await menu.boundingBox();
    const vp = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);

    // A menu the floating rail covers is the defect this replaced.
    const covered = await page.evaluate(() => {
      const m = document.querySelector('[role="menu"]').getBoundingClientRect();
      return [...document.querySelectorAll('button')]
        .filter((b) => getComputedStyle(b).position === 'fixed'
                       && b.getBoundingClientRect().width > 0)   // NOT offsetParent — null for fixed
        .filter((b) => {
          const r = b.getBoundingClientRect();
          if (r.right < m.left || r.left > m.right || r.bottom < m.top || r.top > m.bottom) return false;
          // Overlapping geometry is only a defect if the widget paints ON TOP.
          return Number(getComputedStyle(b).zIndex || 0) > 10050;
        })
        .map((b) => b.getAttribute('aria-label') || b.title || 'unlabelled');
    });
    expect(covered, 'a floating widget paints over the open menu').toEqual([]);

    // Keyboard: the menu must be operable, not merely reachable.
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();          // focus returns to the trigger
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
