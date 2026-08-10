import { defineConfig, devices } from '@playwright/test';

/**
 * OpenFirehouse E2E configuration.
 *
 * baseURL defaults to the local dev client (vite :5173, which proxies /api and
 * /ws to the server on :3005). Override with E2E_BASE_URL to run against a
 * built preview, a Docker deploy (:3005), or the live demo.
 *
 * Device projects exist because "phone column stranded on a tablet" and
 * "print not verified on a real iPad" were real defects — the field device is
 * an iPad, so the iPad IS a first-class test target here, in both orientations.
 * (These emulate viewport + touch; real-hardware-only checks — Safari print,
 * install-to-home, a genuine dead zone — live in the manual iPad checklist.)
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173';

// Custom iPad viewports (Playwright's device list doesn't cover every size we ship on).
const IPAD_13_LANDSCAPE = { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const IPAD_11_PORTRAIT  = { viewport: { width: 834, height: 1194 },  deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const IPAD_MINI         = { viewport: { width: 744, height: 1133 },  deviceScaleFactor: 2, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: './journeys',
  fullyParallel: true,           // opposite of the server suite's --test-concurrency=1: we WANT concurrency
  forbidOnly: !!process.env.CI,  // a stray test.only fails CI
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',     // full trace (DOM, network, console) when a test flakes
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'desktop',            use: { ...devices['Desktop Chrome'] } },
    { name: 'ipad-13-landscape',  use: { ...IPAD_13_LANDSCAPE } },
    { name: 'ipad-11-portrait',   use: { ...IPAD_11_PORTRAIT } },
    { name: 'ipad-mini',          use: { ...IPAD_MINI } },
    { name: 'iphone',             use: { ...devices['iPhone 14'] } },
  ],

  /**
   * Uncomment to have Playwright boot the app itself. Left off by default so the
   * harness can run against an already-running dev server or a remote environment.
   *
   * webServer: {
   *   command: 'npm --prefix .. run dev',
   *   url: BASE_URL,
   *   reuseExistingServer: !process.env.CI,
   *   timeout: 120_000,
   * },
   */
});
