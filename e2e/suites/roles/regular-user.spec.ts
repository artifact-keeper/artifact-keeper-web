import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Developer role access', () => {
  test('can access repositories', async ({ page }) => {
    await page.goto('/repositories');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
    await expect(page.getByText(/repositor/i).first()).toBeVisible();
  });

  test('can access packages', async ({ page }) => {
    await page.goto('/packages');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test('can access profile', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test('admin pages redirect or show 403', async ({ page }) => {
    const adminRoutes = ['/users', '/groups', '/settings', '/backups'];
    for (const route of adminRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      // Should be redirected to 403 or show forbidden message
      const url = page.url();
      const content = await page.textContent('body');
      const isBlocked = url.includes('/error/403') || url.includes('/login') ||
        (content?.includes('forbidden') || content?.includes('Forbidden') || content?.includes('denied') || false);
      expect(isBlocked).toBe(true);
    }
  });

  test('sidebar hides admin section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const sidebar = page.locator('[data-testid="app-sidebar"]').or(page.getByRole('navigation'));

    // Should NOT see admin-only items
    await expect(sidebar.getByText(/^Users$/)).not.toBeVisible();
    await expect(sidebar.getByText(/^Settings$/)).not.toBeVisible();
  });
});
