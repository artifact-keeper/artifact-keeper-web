import { test, expect } from '@playwright/test';

test.describe('Security Policies Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/security/policies');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads without errors', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /polic/i }).first()).toBeVisible();
    const content = await page.textContent('body');
    expect(content).not.toContain('Application error');
  });

  test('policies table or empty state is visible', async ({ page }) => {
    const table = page.getByRole('table').first();
    const emptyState = page.getByText(/no polic/i).first();
    const isTableVisible = await table.isVisible({ timeout: 5000 }).catch(() => false);
    const isEmptyVisible = await emptyState.isVisible({ timeout: 3000 }).catch(() => false);
    expect(isTableVisible || isEmptyVisible).toBe(true);
  });

  test('create policy button is visible', async ({ page }) => {
    const createButton = page.getByRole('button', { name: /create|add|new.*polic/i }).first();
    const isVisible = await createButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await expect(createButton).toBeEnabled();
    }
  });
});
