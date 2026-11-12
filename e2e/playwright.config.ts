import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright drives a real Chromium through the live pages and fails on broken layouts, dead links
 * and console errors. It is deliberately NOT pointed at production by default — set E2E_BASE_URL to
 * a staging deploy for a full run, or leave it on the public marketing/policy pages, which are safe
 * to hit anywhere because they are read-only and require no login.
 *
 * Authenticated operator-console flows need a signed-in session; add a storageState fixture with a
 * reviewer/test login before enabling those specs (see tests/smoke.spec.ts for where they'd go).
 */
const baseURL = process.env.E2E_BASE_URL || 'https://fooducia.in';

export default defineConfig({
  testDir: './tests',
  // CI is where this matters; locally it's opt-in.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
