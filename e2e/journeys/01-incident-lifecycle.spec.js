import { test, expect, apiLogin } from '../fixtures/auth.js';
import { apiGet, expectLedgerGrewBy } from '../fixtures/db.js';

/**
 * JOURNEY 1 — The incident lifecycle, end to end.
 *   dispatch → command board takes over → PAR check → clear the call → disposition
 *
 * Guards the classes the report fixed: half-built call-close, PAR that lived in a
 * tab's memory, a rig claiming status with no call. The proof is in the RECORD:
 * the PAR log persisted append-only, the release logged under a dispatcher, the
 * disposition written.
 */

test.describe('Incident lifecycle', () => {
  test('reaches the starting line (login + board loads)', async ({ page, baseURL }) => {
    await apiLogin(page, 'chief', baseURL || '');
    await page.goto('/');
    // App booted past login (no password field visible).
    await expect(page.getByPlaceholder(/1234/i)).toBeHidden({ timeout: 10_000 });
  });

  test.fixme('full lifecycle persists to the record', async ({ page, baseURL }) => {
    await apiLogin(page, 'chief', baseURL || '');
    await page.goto('/');

    await test.step('a call drops → the board takes over automatically', async () => {
      // TODO(selector): trigger/simulate a dispatch (CAD webhook test hook or seeded alert),
      // assert the command board raises without a manual click.
    });

    await test.step('run a PAR check and confirm it persists across a reload', async () => {
      const before = await apiGet(page, '/api/par', baseURL || ''); // TODO(path): confirm PAR endpoint
      // TODO(selector): start PAR, account for units, complete it.
      await page.reload(); // the bug: a reload erased PAR history
      const after = await apiGet(page, '/api/par', baseURL || '');
      expectLedgerGrewBy(before, after, 1);          // history survived the reload
    });

    await test.step('clear the call — every committed unit is released by a human', async () => {
      // TODO(selector): open clear-call, release each unit, set a disposition.
      // Assert: no unit can be left committed; each release is attributed to the dispatcher.
    });

    await test.step('the record is complete and attributable', async () => {
      // TODO(path): GET the incident; assert disposition set, releases logged with actor,
      // and the call can be reopened if closed in error.
    });
  });
});
