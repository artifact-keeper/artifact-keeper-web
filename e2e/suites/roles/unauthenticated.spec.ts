import { test, expect } from '@playwright/test';

// This project has no storageState, so the user is unauthenticated

test.describe('Unauthenticated access', () => {
  const protectedRoutes = [
    '/',
    '/repositories',
    '/packages',
    '/profile',
    '/users',
    '/settings',
    '/security',
    '/analytics',
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects to login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    });
  }

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });
});
