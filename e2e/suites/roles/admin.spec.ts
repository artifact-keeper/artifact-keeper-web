import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Admin role access', () => {
  test('sidebar shows all sections', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const sidebar = page.locator('[data-slot="sidebar"]').first();

    // Admin should see all sidebar group labels
    await expect(sidebar.getByText('Overview')).toBeVisible();
    await expect(sidebar.getByText('Artifacts')).toBeVisible();
    await expect(sidebar.getByText('Integration')).toBeVisible();
    await expect(sidebar.getByText('Security')).toBeVisible();
    await expect(sidebar.getByText('Operations')).toBeVisible();
    await expect(sidebar.getByText('Administration')).toBeVisible();
  });

  test('admin pages are accessible', async ({ page }) => {
    const adminPages = ['/users', '/groups', '/settings', '/analytics', '/monitoring', '/backups', '/permissions'];
    for (const route of adminPages) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      // Should NOT be redirected to login or 403
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page).not.toHaveURL(/\/error\/403/);
    }
  });

  test('CRUD buttons are visible on admin pages', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /create user/i })).toBeVisible();

    await page.goto('/groups');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /create group/i })).toBeVisible();
  });
});
