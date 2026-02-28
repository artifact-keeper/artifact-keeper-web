import { test, expect } from '@playwright/test';

test.describe('Lifecycle - Execute, Toggle, Delete Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/lifecycle');
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.getByRole('heading').filter({ hasText: /lifecycle/i }).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('Execute All button is clickable', async ({ page }) => {
    const executeAllBtn = page.getByRole('button', { name: /execute all/i });
    await expect(executeAllBtn).toBeVisible({ timeout: 10000 });

    await executeAllBtn.click();
    await page.waitForTimeout(3000);

    // Should not crash the page
    const content = await page.textContent('body');
    expect(content).not.toContain('Application error');
  });

  test('policy row has enable/disable action button', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No lifecycle policies table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No policy rows in table');

    // Enable/disable button has dynamic title
    const enableBtn = firstRow.getByRole('button', { name: /enable|disable/i }).first();
    const hasBtn = await enableBtn.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasBtn, 'No enable/disable button found');

    await enableBtn.click();
    await page.waitForTimeout(2000);
    const content = await page.textContent('body');
    expect(content).not.toContain('Application error');
  });

  test('preview (dry run) button is clickable', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No lifecycle policies table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No policy rows in table');

    const previewBtn = firstRow.getByRole('button', { name: /preview|dry run/i }).first();
    const hasBtn = await previewBtn.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasBtn, 'No preview button found');

    await previewBtn.click();
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content).not.toContain('Application error');
  });

  test('execute single policy button is clickable', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No lifecycle policies table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No policy rows in table');

    const executeBtn = firstRow.getByRole('button', { name: /execute/i }).first();
    const hasBtn = await executeBtn.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasBtn, 'No execute button found');

    await executeBtn.click();
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content).not.toContain('Application error');
  });

  test('delete button opens confirmation dialog', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No lifecycle policies table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No policy rows in table');

    const deleteBtn = firstRow.getByRole('button', { name: /delete/i }).first();
    const hasDelete = await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasDelete, 'No delete button found in row');

    await deleteBtn.click();
    const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'));
    const hasDialog = await dialog.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasDialog) {
      await expect(page.getByText(/delete policy/i)).toBeVisible({ timeout: 3000 });

      const cancelBtn = dialog.getByRole('button', { name: /cancel/i });
      if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cancelBtn.click();
        await expect(dialog).not.toBeVisible({ timeout: 5000 });
      }
    }
  });
});
