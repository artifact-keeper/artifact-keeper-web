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

  test('most pages are denied', async ({ page }) => {
    const restrictedRoutes = ['/repositories', '/packages', '/users', '/settings', '/security', '/analytics'];
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

  test('sidebar shows minimal items', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const sidebar = page.locator('[data-testid="app-sidebar"]').or(page.getByRole('navigation'));
    await expect(sidebar.getByText(/dashboard/i).first()).toBeVisible();
    // Most sections should be hidden
    await expect(sidebar.getByText(/^Users$/)).not.toBeVisible();
    await expect(sidebar.getByText(/^Analytics$/)).not.toBeVisible();
  });
});
