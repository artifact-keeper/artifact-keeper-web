import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Restricted role access', () => {
  test('can access dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('can access own profile', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test('admin pages are denied', async ({ page }) => {
    const restrictedRoutes = ['/users', '/settings', '/analytics'];
    for (const route of restrictedRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const url = page.url();
      const content = await page.textContent('body');
      const isBlocked = url.includes('/error/403') || url.includes('/login') ||
        (content?.includes('forbidden') || content?.includes('denied') || false);
      expect(isBlocked).toBe(true);
    }
  });

  test('sidebar hides admin sections', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const sidebar = page.locator('[data-slot="sidebar"]').first();
    await expect(sidebar.getByText('Overview')).toBeVisible();
    // Admin-only sections should be hidden
    await expect(sidebar.getByText('Administration')).not.toBeVisible();
  });
});
