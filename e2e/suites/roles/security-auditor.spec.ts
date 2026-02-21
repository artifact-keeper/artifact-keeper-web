import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Security Auditor role access', () => {
  test('can access security dashboard', async ({ page }) => {
    await page.goto('/security');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
    await expect(page.getByText(/security/i).first()).toBeVisible();
  });

  test('can access quality gates', async ({ page }) => {
    await page.goto('/quality-gates');
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
