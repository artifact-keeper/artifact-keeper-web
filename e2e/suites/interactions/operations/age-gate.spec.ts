import { test, expect } from '@playwright/test';

test.describe('Age Gate Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/age-gate');
  });

  test('page loads with Age Gate heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /age gate/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('pending and history tabs are visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /age gate/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('tab', { name: /pending/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /history/i })).toBeVisible();
  });

  test('pending tab shows table or empty state', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /age gate/i })).toBeVisible({
      timeout: 10000,
    });

    const tableHeader = page.getByText(/repository|package/i);
    const emptyState = page.getByText(/no pending reviews/i);

    const hasTable = await tableHeader.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await emptyState.first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasTable || hasEmpty).toBeTruthy();
  });
});
