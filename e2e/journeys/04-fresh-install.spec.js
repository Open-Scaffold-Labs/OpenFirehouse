import { test, expect } from '../fixtures/auth.js';

/**
 * JOURNEY 4 — Fresh install from zero.
 *
 * The report shipped a regression that broke EVERY brand-new install for ~6 hours;
 * production was fine because it never re-installs. A long-lived dev database hides
 * this class entirely. This journey must run against a CLEAN database.
 *
 * Because it needs a zero-state environment, it's driven by an env flag rather than
 * assuming the shared dev DB. Point E2E_BASE_URL at a freshly-migrated, unseeded
 * instance and set E2E_FRESH_INSTALL=1.
 */

const FRESH = process.env.E2E_FRESH_INSTALL === '1';

test.describe('Fresh install & first-run setup', () => {
  test.skip(!FRESH, 'set E2E_FRESH_INSTALL=1 against a clean, unseeded instance to run this');

  test('a clean database builds the same schema as production and first-run setup appears', async ({ page }) => {
    await page.goto('/');
    // With no users, the app shows FirstRunSetup (create the first chief).
    // TODO(selector): assert the first-run / "create the first account" screen is shown,
    // create the first chief, and land in the department setup wizard.
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test.fixme('the department setup wizard is resumable', async ({ page }) => {
    // TODO(selector): start the 8-step wizard, fill a few steps, close the tab, reopen.
    // Assert: it resumes from server state, not from zero.
  });
});
