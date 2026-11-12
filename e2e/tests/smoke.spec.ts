import { test, expect, type Page } from '@playwright/test';

/**
 * Smoke tests for the public, no-login pages. These are the ones Google's reviewer, a new customer
 * and a compliance auditor all reach without an account, so they must render, say what they are, and
 * throw no console errors. Authenticated operator-console specs go below once a login fixture exists.
 */

// Fail a test if the page logged an error to the console (a broken import, a null deref in render).
function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

const PUBLIC_PAGES = [
  { path: '/privacy', heading: /privacy policy/i },
  { path: '/terms', heading: /terms/i },
  { path: '/account-deletion', heading: /account deletion/i },
];

for (const { path, heading } of PUBLIC_PAGES) {
  test(`public page ${path} renders cleanly`, async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const res = await page.goto(path, { waitUntil: 'networkidle' });
    expect(res?.status(), `HTTP status for ${path}`).toBeLessThan(400);
    // The real policy/terms content must be visible — not just an empty SPA shell.
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    expect(errors, `console errors on ${path}: ${errors.join(' | ')}`).toHaveLength(0);
  });
}

test('privacy page is not horizontally scrollable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/privacy', { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow, 'page overflows horizontally at 375px').toBe(false);
});

// --- Authenticated operator-console flows (enable once a login fixture is wired) -------------------
// test.describe('operator console', () => {
//   test.use({ storageState: 'playwright/.auth/operator.json' });
//   test('dashboard loads orders', async ({ page }) => {
//     await page.goto('/orders');
//     await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible();
//   });
// });
