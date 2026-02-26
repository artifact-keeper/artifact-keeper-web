import { test, expect } from '../../../fixtures/test-fixtures';

test.describe('Logout', () => {
  test('logout clears session and shows sign-in button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // The user menu trigger is a round avatar button in the header
    const userMenu = page.locator('header').getByRole('button').filter({ has: page.locator('[data-slot="avatar"]') }).first();
    await userMenu.click();

    await page.getByRole('menuitem', { name: /logout/i }).click();

    // After logout, the dashboard stays loaded (it's a public route)
    // but the user avatar is replaced by a Sign In button
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 10000 });
  });
});
