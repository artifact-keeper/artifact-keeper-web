import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Security Auditor role access', () => {
  test('can access dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('can access repositories', async ({ page }) => {
    await page.goto('/repositories');
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
    // Security, Operations, Administration are admin-only
    await expect(sidebar.getByText('Administration')).not.toBeVisible();
  });
});
