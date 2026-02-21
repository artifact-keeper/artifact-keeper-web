import { test, expect } from '@playwright/test';

// This project has no storageState, so the user is unauthenticated

test.describe('Unauthenticated access', () => {
  test('public pages are accessible without auth', async ({ page }) => {
    // These routes are under (app) directly, not (protected) or (admin)
    const publicRoutes = ['/', '/repositories', '/packages'];
    for (const route of publicRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      // Should NOT redirect to login
      await expect(page).not.toHaveURL(/\/login/);
    }
  });

  test('protected pages redirect to login', async ({ page }) => {
    // Routes under (protected) require authentication
    const protectedRoutes = ['/profile', '/access-tokens', '/webhooks', '/plugins'];
    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    }
  });

  test('admin pages redirect to login', async ({ page }) => {
    // Routes under (admin) require admin role
    const adminRoutes = ['/users', '/settings', '/analytics'];
    for (const route of adminRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login|\/error/, { timeout: 15000 });
    }
  });

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });
});
