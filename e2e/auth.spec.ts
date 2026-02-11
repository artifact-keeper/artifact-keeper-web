import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';

test.describe('Authentication', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // No pre-auth

  test('shows login page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(loginPage.usernameInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
  });

  test('rejects invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('admin', 'wrongpassword');
    await expect(page.getByText(/invalid|incorrect|failed|error/i)).toBeVisible({ timeout: 5000 });
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('admin', 'admin');
    await expect(page).toHaveURL(/\/$|\/dashboard|\/change-password/, { timeout: 10000 });
  });

  test('unauthenticated user redirected to login', async ({ page }) => {
    await page.goto('/profile');
    // Should redirect to login page or show login form
    await expect(
      page.getByRole('button', { name: /sign in|log in|login/i }).first()
    ).toBeVisible({ timeout: 10000 });
  });
});
