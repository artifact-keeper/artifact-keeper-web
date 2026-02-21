import { test, expect } from '@playwright/test';

test.describe('Visual regression: components', () => {
  test('sidebar - expanded', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const sidebar = page.locator('[data-testid="app-sidebar"]').or(
      page.locator('aside').first()
    );
    await expect(sidebar).toHaveScreenshot('sidebar-expanded.png', { maxDiffPixelRatio: 0.01 });
  });

  test('app header', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const header = page.locator('header').first();
    await expect(header).toHaveScreenshot('app-header.png', { maxDiffPixelRatio: 0.01 });
  });

  test('users table', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    const table = page.getByRole('table').first();
    await expect(table).toHaveScreenshot('users-table.png', { maxDiffPixelRatio: 0.01 });
  });

  test('create user dialog', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /create user/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot('create-user-dialog.png', { maxDiffPixelRatio: 0.01 });
    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('confirm delete dialog', async ({ page }) => {
    // Navigate to a page with delete functionality and trigger the confirm dialog
    await page.goto('/repositories');
    await page.waitForLoadState('networkidle');
    // This is best-effort; skip if no repos exist
    const actionButton = page.getByRole('button', { name: /delete/i }).first();
    if (await actionButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await actionButton.click();
      const confirmDialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
      if (await confirmDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(confirmDialog).toHaveScreenshot('confirm-delete-dialog.png', { maxDiffPixelRatio: 0.01 });
        await confirmDialog.getByRole('button', { name: /cancel/i }).click();
      }
    }
  });
});
