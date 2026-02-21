import { test, expect } from '../../../fixtures/test-fixtures';

test.describe('Logout', () => {
  test('logout clears session and redirects to login', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find and click logout (usually in user menu dropdown)
    const userMenu = page.getByRole('button', { name: /account|user|profile|admin/i }).first();
    await userMenu.click();
    await page.getByRole('menuitem', { name: /log out|sign out/i }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
