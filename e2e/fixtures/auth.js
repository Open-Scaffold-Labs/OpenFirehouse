import { test as base, expect } from '@playwright/test';

/**
 * Auth fixtures.
 *
 * Grounded in the real app:
 *   - Login endpoint: POST /api/auth/login  { username, password }
 *   - Token is stored in localStorage under `fs_token` (user under `fs_user`).
 *   - Demo accounts: chief / officer / member, password `1234`.
 *
 * apiLogin() is the fast path for test SETUP (skip the UI, seed the token).
 * uiLogin() drives the actual login screen — use it in the login journey itself.
 */

export const DEMO_USERS = {
  chief:   { username: 'chief',   password: '1234' },
  officer: { username: 'officer', password: '1234' },
  member:  { username: 'member',  password: '1234' },
};

// Token cache — one real /api/auth/login per username per worker, reused across
// tests. The server's authLimiter is max:30 per 15min per IP, and in CI every
// test is one IP; logging in per test blows that budget and 429s the whole suite.
const _tokenCache = new Map(); // username → { token, user }

/** Fast path: authenticate over the API (cached) and inject the token before the app boots. */
export async function apiLogin(page, who = 'chief', baseURL = '') {
  const creds = DEMO_USERS[who] ?? who; // allow passing a raw {username,password}
  let cached = _tokenCache.get(creds.username);
  if (!cached) {
    const res = await page.request.post(`${baseURL}/api/auth/login`, { data: creds });
    expect(res.ok(), `login for ${creds.username} should succeed (${res.status()})`).toBeTruthy();
    const body = await res.json();
    cached = { token: body.token || body.accessToken, user: body.user ?? null };
    _tokenCache.set(creds.username, cached);
  }
  // Seed localStorage before any app JS runs, so the app restores the session on load.
  // of_dept_setup_complete stops the chief's DepartmentSetupWizard from intercepting the
  // shell in a fresh browser (a client-only flag; a clean CI context always lacks it).
  await page.addInitScript(([t, u]) => {
    localStorage.setItem('fs_token', t);
    if (u) localStorage.setItem('fs_user', JSON.stringify(u));
    localStorage.setItem('of_dept_setup_complete', '1');
  }, [cached.token, cached.user]);
  return cached;
}

/** Real UI login — exercises the LoginScreen the way a user does. */
export async function uiLogin(page, who = 'chief') {
  const creds = DEMO_USERS[who] ?? who;
  // Suppress the chief's setup wizard so it doesn't intercept the shell post-login.
  await page.addInitScript(() => localStorage.setItem('of_dept_setup_complete', '1'));

  // LoginScreen asks the SERVER whether this deployment carries the demo accounts
  // (GET /api/setup-status -> demoMode), because only the server knows its own seed
  // state. Two consequences for driving this screen:
  //
  //   1. The first render is NOT the settled one. It fails closed — plain
  //      username/password form, no mode toggle — and only switches to the
  //      "Quick Demo Login" role-picker once the response says demoMode:true.
  //      Filling the fields before that resolves races the remount. So wait for
  //      the response, registered BEFORE goto() or it can fire first and hang.
  //   2. On a NON-demo deployment the toggle never renders at all — the form is
  //      simply the whole screen. Clicking it unconditionally would time out on
  //      an element that is correctly absent.
  //
  // CI is a demo deployment (e2e.yml sets SEED_DEMO=true), so the toggle is there
  // today; this keeps the fixture honest if the suite is ever pointed elsewhere.
  const settled = page
    .waitForResponse((r) => r.url().includes('/api/setup-status'), { timeout: 15_000 })
    .catch(() => null); // absent/failed request => fail-closed form mode, still drivable
  await page.goto('/');
  await settled;

  const modeToggle = page.getByTestId('login-mode-form');
  if (await modeToggle.count()) await modeToggle.click();
  // Login testids landed with the e2e-hooks commit.
  await page.getByTestId('login-username').fill(creds.username);
  await page.getByTestId('login-password').fill(creds.password);
  await page.getByTestId('login-submit').click();
  // Landed: the app shell is present.
  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10_000 });
}

/** `loginAs` fixture: `test('...', async ({ loginAs, page }) => { await loginAs('chief'); ... })` */
export const test = base.extend({
  loginAs: async ({ page, baseURL }, use) => {
    await use(async (who = 'chief') => {
      await apiLogin(page, who, baseURL || '');
      await page.goto('/');
    });
  },
});

export { expect };
