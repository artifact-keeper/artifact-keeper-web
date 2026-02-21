import { test, expect } from '../../../fixtures/test-fixtures';

test.describe('Logout', () => {
  test('logout clears session and redirects to login', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The user menu trigger is a round avatar button in the header
    const userMenu = page.locator('header').getByRole('button').filter({ has: page.locator('[data-slot="avatar"]') }).first();
    await userMenu.click();

    await page.getByRole('menuitem', { name: /logout/i }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
