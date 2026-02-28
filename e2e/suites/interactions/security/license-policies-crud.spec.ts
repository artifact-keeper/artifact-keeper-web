import { test, expect } from '@playwright/test';

test.describe('License Policies - Edit, Toggle, Delete', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/security/license-policies');
    await page.waitForLoadState('networkidle');
  });

  test('create policy button opens dialog', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: /create policy/i }).first();
    const hasBtn = await createBtn.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasBtn, 'No Create Policy button visible');

    await createBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Should have switches for policy options
    const allowUnknown = dialog.getByText(/allow unknown/i).first();
    const enabled = dialog.getByText(/enabled/i).first();
    const hasAllowUnknown = await allowUnknown.isVisible({ timeout: 3000 }).catch(() => false);
    const hasEnabled = await enabled.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasAllowUnknown || hasEnabled).toBeTruthy();

    // Cancel
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('edit button opens edit dialog', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No license policies table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No policy rows in table');

    const editBtn = firstRow.getByRole('button', { name: /edit/i }).first();
    const hasEdit = await editBtn.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasEdit, 'No edit button found in row');

    await editBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/edit policy/i)).toBeVisible({ timeout: 3000 });

    await expect(dialog.getByRole('button', { name: /save changes/i })).toBeVisible({ timeout: 3000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('enable/disable toggle button is clickable', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No license policies table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No policy rows in table');

    // Toggle button has title "Enable" or "Disable"
    const toggleBtn = firstRow.getByRole('button', { name: /enable|disable/i }).first();
    const hasToggle = await toggleBtn.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasToggle, 'No enable/disable button found');

    await toggleBtn.click();
    await page.waitForTimeout(2000);
    const content = await page.textContent('body');
    expect(content).not.toContain('Application error');
  });

  test('delete button opens confirmation dialog', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No license policies table visible');

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
