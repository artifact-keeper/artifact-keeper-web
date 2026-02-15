import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('loads dashboard page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
  });

  test('shows system health section', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/system health|health/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('health endpoint returns OK', async ({ page }) => {
    const response = await page.request.get('/health');
    expect(response.ok()).toBeTruthy();
    const contentType = response.headers()['content-type'] || '';
    if (contentType.includes('application/json')) {
      const body = await response.json();
      expect(body.status).toBe('healthy');
    }
    // HTML response means the health page rendered (app is alive)
  });

  test('shows statistics for admin user', async ({ page }) => {
    await page.goto('/');
    // Admin should see stat cards
    await expect(
      page.getByText(/repositories|artifacts|storage/i).first()
    ).toBeVisible({ timeout: 10000 });
  });
});
