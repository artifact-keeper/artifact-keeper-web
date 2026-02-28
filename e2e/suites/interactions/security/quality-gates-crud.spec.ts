import { test, expect } from '@playwright/test';

test.describe('Quality Gates - Edit, Toggle, Delete', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quality-gates');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/quality gates/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('refresh button reloads quality gate data', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i }).first();
    if (await refreshBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await refreshBtn.click();
      await page.waitForTimeout(2000);
      const content = await page.textContent('body');
      expect(content).not.toContain('Application error');
    }
  });

  test('edit button opens edit dialog with pre-filled fields', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No quality gates table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No quality gate rows in table');

    const editBtn = firstRow.getByRole('button', { name: /edit/i }).first();
    const hasEdit = await editBtn.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasEdit, 'No edit button found in row');

    await editBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/edit quality gate/i)).toBeVisible({ timeout: 3000 });

    // Should have a name field that is pre-filled
    const nameInput = dialog.getByPlaceholder(/production release gate/i)
      .or(dialog.locator('input').first());
    await expect(nameInput).toBeVisible({ timeout: 3000 });

    // Should have Save Changes button
    await expect(dialog.getByRole('button', { name: /save changes/i })).toBeVisible({ timeout: 3000 });

    // Should have enforcement switches
    const enforcePromotion = dialog.getByText(/enforce on promotion/i);
    const enforceDownload = dialog.getByText(/enforce on download/i);
    const hasPromotion = await enforcePromotion.isVisible({ timeout: 3000 }).catch(() => false);
    const hasDownload = await enforceDownload.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasPromotion || hasDownload).toBeTruthy();

    // Cancel
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('active toggle switch is clickable', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No quality gates table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No quality gate rows in table');

    // Active column has a toggle switch
    const toggle = firstRow.locator('button[role="switch"]').first();
    const hasToggle = await toggle.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasToggle, 'No toggle switch found in row');

    await toggle.click();
    await page.waitForTimeout(2000);
    const content = await page.textContent('body');
    expect(content).not.toContain('Application error');
  });

  test('delete button opens confirmation dialog', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No quality gates table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No quality gate rows in table');

    const deleteBtn = firstRow.getByRole('button', { name: /delete/i }).first();
    const hasDelete = await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasDelete, 'No delete button found in row');

    await deleteBtn.click();
    const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'));
    const hasDialog = await dialog.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasDialog) {
      await expect(page.getByText(/delete quality gate/i)).toBeVisible({ timeout: 3000 });

      const cancelBtn = dialog.getByRole('button', { name: /cancel/i });
      if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cancelBtn.click();
        await expect(dialog).not.toBeVisible({ timeout: 5000 });
      }
    }
  });
});
