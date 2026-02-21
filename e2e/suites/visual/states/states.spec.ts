import { test, expect } from '@playwright/test';

test.describe('Visual regression: UI states', () => {
  test('loading skeleton - repositories', async ({ page }) => {
    // Delay API response to capture loading state
    await page.route('**/api/v1/repositories*', async (route) => {
      await new Promise((r) => setTimeout(r, 5000)); // 5s delay
      await route.continue();
    });
    await page.goto('/repositories');
    // Capture during loading (before API responds)
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('loading-repositories.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test('empty state - packages', async ({ page }) => {
    // Mock empty response
    await page.route('**/api/v1/packages*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });
    await page.goto('/packages');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('empty-packages.png', {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    });
  });

  test('error state - dashboard API failure', async ({ page }) => {
    // Mock 500 error on stats endpoint
    await page.route('**/api/v1/admin/stats*', async (route) => {
      await route.fulfill({ status: 500, body: 'Internal Server Error' });
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('error-dashboard.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test('error state - 403 forbidden page', async ({ page }) => {
    await page.goto('/error/403');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('error-403.png', {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    });
  });

  test('error state - 500 server error page', async ({ page }) => {
    await page.goto('/error/500');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('error-500.png', {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    });
  });
});
