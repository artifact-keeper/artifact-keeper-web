import { test, expect } from '@playwright/test';

test.describe('Admin Pages', () => {
  test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText(/settings|configuration/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('SSO settings page loads', async ({ page }) => {
    await page.goto('/settings/sso');
    await expect(page.getByText(/sso|single sign|authentication/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('security page loads', async ({ page }) => {
    await page.goto('/security');
    await expect(page.getByText(/security|vulnerabilit|scan/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('groups page loads', async ({ page }) => {
    await page.goto('/groups');
    await expect(page.getByText(/group/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('analytics page loads', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page.getByText(/analytics|dashboard|metrics/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('monitoring page loads', async ({ page }) => {
    await page.goto('/monitoring');
    await expect(page.getByText(/monitor|system|status/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('permissions page loads', async ({ page }) => {
    await page.goto('/permissions');
    await expect(page.getByText(/permission|role|access/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('users page loads', async ({ page }) => {
    await page.goto('/users');
    await expect(page.getByText(/user/i).first()).toBeVisible({ timeout: 10000 });
  });
});
