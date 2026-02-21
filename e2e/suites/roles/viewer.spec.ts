import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Viewer role access', () => {
  test('can view repositories', async ({ page }) => {
    await page.goto('/repositories');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test('can view packages', async ({ page }) => {
    await page.goto('/packages');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test('admin-only pages are denied', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    const url = page.url();
    const content = await page.textContent('body');
    const isBlocked = url.includes('/error/403') || url.includes('/login') ||
      (content?.includes('forbidden') || content?.includes('denied') || false);
    expect(isBlocked).toBe(true);
  });

  test('sidebar hides admin sections', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('[data-slot="sidebar"]').first();
    await expect(sidebar.getByText('Overview')).toBeVisible();
    await expect(sidebar.getByText('Artifacts')).toBeVisible();
    // Admin-only sections should be hidden for non-admin users
    await expect(sidebar.getByText('Security')).not.toBeVisible();
    await expect(sidebar.getByText('Operations')).not.toBeVisible();
    await expect(sidebar.getByText('Administration')).not.toBeVisible();
  });
});
