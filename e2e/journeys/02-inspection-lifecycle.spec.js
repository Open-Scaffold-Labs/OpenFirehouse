import { test, expect, apiLogin } from '../fixtures/auth.js';
import { apiGet } from '../fixtures/db.js';
import { failApi } from '../fixtures/faults.js';

/**
 * JOURNEY 2 — The prevention lifecycle, end to end.
 *   inspect → cite violation → generate notice → serve → returned-mail → reinspect
 *
 * Guards the report's biggest cluster: an inspection could "pass" with violations
 * standing; completion wasn't all-or-nothing; a signed/served inspection stayed
 * editable; service wasn't modeled (Jones v. Flowers). The proof is legal-grade:
 * history is never rewritten, and enforcement hard-blocks on returned mail.
 */

test.describe('Prevention lifecycle', () => {
  test('reaches the starting line (login + inspections load)', async ({ page, baseURL }) => {
    await apiLogin(page, 'officer', baseURL || '');
    await page.goto('/');
    await expect(page.getByPlaceholder(/1234/i)).toBeHidden({ timeout: 10_000 });
  });

  test.fixme('an inspection cannot pass while a violation stands', async ({ page, baseURL }) => {
    await apiLogin(page, 'officer', baseURL || '');
    await page.goto('/');
    // TODO(selector): open an inspection with an open violation, attempt a passing result.
    // Assert: the UI does not OFFER "pass", explains why, and the server rejects any
    // passing result while a violation is open. Records completed before the rule keep
    // their old result (history is never rewritten).
  });

  test.fixme('completion is all-or-nothing (reinspection scheduling cannot half-fail)', async ({ page, baseURL }) => {
    await apiLogin(page, 'officer', baseURL || '');
    await page.goto('/');
    // Inject a failure into the reinspection-scheduling call, complete the inspection.
    await failApi(page, '**/api/**reinspect**', { mode: 'status', status: 500 }); // TODO(path)
    // TODO(selector): complete the inspection.
    // Assert: nothing is written — the inspection is NOT marked complete, no orphaned
    // finished record carrying an unabated violation. Retry after clearing the fault succeeds.
  });

  test.fixme('a served, signed inspection is locked', async ({ page, baseURL }) => {
    await apiLogin(page, 'officer', baseURL || '');
    await page.goto('/');
    // TODO(selector): complete → sign → serve an inspection, then attempt to edit it.
    // Assert: it is not editable after signature/service.
  });

  test.fixme('returned mail hard-blocks enforcement (Jones v. Flowers)', async ({ page, baseURL }) => {
    await apiLogin(page, 'officer', baseURL || '');
    await page.goto('/');
    // TODO(selector): record a returned-mail event on a served notice.
    // Assert: the inspection flips to ACTION REQUIRED, enforcement cannot proceed,
    // and it lists the court-blessed cure steps; posting a cure requires a photo + location.
    const _ = apiGet; void _;
  });
});
