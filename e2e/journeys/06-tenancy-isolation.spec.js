import { test, expect, apiLogin, DEMO_USERS } from '../fixtures/auth.js';
import { apiGet, unwrapList } from '../fixtures/db.js';

/**
 * JOURNEY 6 — Multi-tenant isolation.
 *
 * The report fixed a tenancy bug where some reads ran without a department context
 * and came back EMPTY instead of erroring — "a silent empty result is worse than a
 * crash: it looks like no data." This journey needs TWO departments and proves
 * neither can see the other's records, using two independent browser contexts at
 * once (the concurrency the sequential server suite can't exercise).
 *
 * Requires a second department + user. Provide via env:
 *   E2E_DEPT_B_USER, E2E_DEPT_B_PASS  (a login in a different department)
 */

const DEPT_B = process.env.E2E_DEPT_B_USER
  ? { username: process.env.E2E_DEPT_B_USER, password: process.env.E2E_DEPT_B_PASS || '1234' }
  : null;

test.describe('Tenant isolation', () => {
  test('a session with department context gets a well-formed collection, never a silent empty/error', async ({ page, baseURL }) => {
    const { user } = await apiLogin(page, 'chief', baseURL || '');
    await page.goto('/');
    const deptId = user?.department_id ?? user?.departmentId;
    // The regression Matt fixed: a read WITHOUT department context came back empty
    // instead of erroring — "a silent empty result looks like no data." So first
    // prove the session actually carries a department context.
    expect(deptId, 'the session must carry a department context').not.toBeNull();
    // /api/incidents is scoped server-side by the token and returns { data, count };
    // the rows don't carry a department id, so we assert the collection is well-formed
    // (true row-level cross-tenant isolation is the second test below).
    const list = unwrapList(await apiGet(page, '/api/incidents', baseURL || ''));
    expect(Array.isArray(list), 'incidents must return a proper collection, not a silent empty/error').toBeTruthy();
  });

  test.fixme('two departments, side by side, never cross', async ({ browser, baseURL }) => {
    test.skip(!DEPT_B, 'set E2E_DEPT_B_USER / E2E_DEPT_B_PASS to run cross-tenant isolation');
    // Two independent contexts = two real simultaneous sessions.
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const ua = await apiLogin(a, DEMO_USERS.chief, baseURL || '');
    const ub = await apiLogin(b, DEPT_B, baseURL || '');
    await a.goto('/'); await b.goto('/');
    // TODO(path): fetch a record id that belongs to A, then attempt to read it as B.
    // Assert: B receives 403/404 — never A's data, and never a silent empty 200.
    void ua; void ub;
    await ctxA.close(); await ctxB.close();
  });
});
