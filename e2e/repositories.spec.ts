import { test, expect } from '@playwright/test';

test.describe('Repositories', () => {
  test('loads repositories page', async ({ page }) => {
    await page.goto('/repositories');
    await expect(page.getByText(/repositories/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('shows search input', async ({ page }) => {
    await page.goto('/repositories');
    await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 10000 });
  });

  test('shows create repository button', async ({ page }) => {
    await page.goto('/repositories');
    await expect(page.getByRole('button', { name: /create repository/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('can open create repository dialog', async ({ page }) => {
    await page.goto('/repositories');
    await page.getByRole('button', { name: /create repository/i }).first().click();
    // Dialog should appear
    await expect(page.getByRole('dialog').or(page.locator('[role="dialog"]'))).toBeVisible({ timeout: 5000 });
  });
});
