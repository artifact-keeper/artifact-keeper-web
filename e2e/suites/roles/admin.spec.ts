import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Admin role access', () => {
  test('sidebar shows all sections', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('[data-testid="app-sidebar"]').or(page.getByRole('navigation'));

    // Admin should see all sidebar sections
    await expect(sidebar.getByText(/dashboard/i).first()).toBeVisible();
    await expect(sidebar.getByText(/repositor/i).first()).toBeVisible();
    await expect(sidebar.getByText(/package/i).first()).toBeVisible();
    await expect(sidebar.getByText(/security/i).first()).toBeVisible();
    await expect(sidebar.getByText(/user/i).first()).toBeVisible();
    await expect(sidebar.getByText(/setting/i).first()).toBeVisible();
    await expect(sidebar.getByText(/analytic/i).first()).toBeVisible();
    await expect(sidebar.getByText(/monitor/i).first()).toBeVisible();
  });

  test('admin pages are accessible', async ({ page }) => {
    const adminPages = ['/users', '/groups', '/settings', '/analytics', '/monitoring', '/backups', '/permissions'];
    for (const route of adminPages) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      // Should NOT be redirected to login or 403
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page).not.toHaveURL(/\/error\/403/);
    }
  });

  test('CRUD buttons are visible on admin pages', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /create user/i })).toBeVisible();

    await page.goto('/groups');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /create group/i })).toBeVisible();
  });
});
