import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Viewer role access', () => {
  test('can view repositories (read-only)', async ({ page }) => {
    await page.goto('/repositories');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
    // Create button should NOT be visible for viewers
    await expect(page.getByRole('button', { name: /create/i })).not.toBeVisible();
  });

  test('can view packages (read-only)', async ({ page }) => {
    await page.goto('/packages');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test('admin pages are denied', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    const url = page.url();
    const content = await page.textContent('body');
    const isBlocked = url.includes('/error/403') || url.includes('/login') ||
      (content?.includes('forbidden') || content?.includes('denied') || false);
    expect(isBlocked).toBe(true);
  });
});
