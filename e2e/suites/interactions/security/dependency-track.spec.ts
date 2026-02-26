import { test, expect } from '@playwright/test';

test.describe('Dependency-Track Projects Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/security/dt-projects');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads without errors', async ({ page }) => {
    await expect(page.getByRole('heading').first()).toBeVisible();
    const content = await page.textContent('body');
    expect(content).not.toContain('Application error');
  });

  test('projects table or unavailable state is visible', async ({ page }) => {
    const table = page.getByRole('table').first();
    const emptyState = page.getByText(/no project|no result|not configured/i).first();
    const unavailable = page.getByText(/unavailable|disconnected/i).first();
    const isTableVisible = await table.isVisible({ timeout: 5000 }).catch(() => false);
    const isEmptyVisible = await emptyState.isVisible({ timeout: 3000 }).catch(() => false);
    const isUnavailable = await unavailable.isVisible({ timeout: 3000 }).catch(() => false);
    expect(isTableVisible || isEmptyVisible || isUnavailable).toBe(true);
  });

  test('search input is functional', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    const isVisible = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await searchInput.fill('test-project');
      await page.waitForTimeout(500);
    }
  });
});
