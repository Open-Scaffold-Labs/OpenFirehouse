import { test, expect, apiLogin, uiLogin } from '../fixtures/auth.js';

/**
 * JOURNEY 0 — the shell and the router.
 *
 * Exercises the hooks that just landed: the login testids, the `app-shell`
 * landmark, and the hash router (screens are deep-linkable at #/<page>). These
 * run for real — they're the proof that the testid + router prerequisite works.
 */

test.describe('Shell & router', () => {
  test('UI login lands in the app shell', async ({ page }) => {
    await uiLogin(page, 'chief');                 // uses login-username / login-password / login-submit
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10_000 });
  });

  test('a page is deep-linkable via the hash router', async ({ page, baseURL }) => {
    await apiLogin(page, 'chief', baseURL || '');
    await page.goto('/#/incidents');
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10_000 });
    // The router keeps the hash it was given (deep-link honored).
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#\/incidents/);
  });

  test('nav is reachable by its stable hook (data-nav-id)', async ({ page, baseURL }) => {
    await apiLogin(page, 'chief', baseURL || '');
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10_000 });
    // Matt already exposes data-nav-id on every nav item — assert at least one is present.
    await expect(page.locator('[data-nav-id]').first()).toBeAttached();
  });
});
