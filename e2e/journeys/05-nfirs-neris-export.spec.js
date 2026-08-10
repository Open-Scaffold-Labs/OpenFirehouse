import { test, expect, apiLogin } from '../fixtures/auth.js';
import { apiGet } from '../fixtures/db.js';

/**
 * JOURNEY 5 — Federal reporting export produces a VALID file.
 *
 * "NERIS-ready" is a reporting-standard compliance claim (see the FAQ). A test
 * that only checks the button works is not enough — the FILE has to be well-formed
 * and accepted. This journey exports and validates the payload shape.
 */

test.describe('NFIRS / NERIS export', () => {
  test('reaches the export surface', async ({ page, baseURL }) => {
    await apiLogin(page, 'chief', baseURL || '');
    await page.goto('/');
    await expect(page.getByPlaceholder(/1234/i)).toBeHidden({ timeout: 10_000 });
  });

  test.fixme('NFIRS 5.0 export validates against the schema', async ({ page, baseURL }) => {
    await apiLogin(page, 'chief', baseURL || '');
    await page.goto('/');
    // TODO(path): GET the export (e.g. /api/reports/nfirs?...), or trigger the UI export
    // and capture the download.
    const payload = await apiGet(page, '/api/reports/nfirs/export', baseURL || ''); // TODO(path)
    // Assert: required NFIRS 5.0 fields present and well-formed; no null incident_address_2
    // regressions; the flat-file/validation the app claims actually passes.
    expect(payload).toBeTruthy();
  });
});
