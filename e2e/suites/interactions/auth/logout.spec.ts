import { test, expect } from '../../../fixtures/test-fixtures';
import { LoginPage } from '../../../fixtures/page-objects/LoginPage';

test.describe('Logout', () => {
  // Since backend artifact-keeper#4948 a logout ends the presenting session's
  // access tokens. Logging out of the shared admin storage state would sign
  // out every later test in this worker, so log in to a session of its own.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('logout clears session and shows sign-in button', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('admin', process.env.ADMIN_PASSWORD || 'TestRunner!2026secure');
    await expect(page).toHaveURL(/\/$|\/dashboard/, { timeout: 10000 });

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
