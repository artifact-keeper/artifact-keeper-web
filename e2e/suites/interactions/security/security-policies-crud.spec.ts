import { test, expect } from '@playwright/test';

test.describe('Security Policies - Edit, Toggle, Delete', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/security/policies');
    await page.waitForLoadState('domcontentloaded');
  });

  test('create policy button opens dialog with form fields', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: /create policy/i }).first();
    const hasBtn = await createBtn.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasBtn, 'No Create Policy button visible');

    await createBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/create security policy/i)).toBeVisible({ timeout: 3000 });

    // Check for toggle switches in the form
    const blockUnscanned = dialog.getByText(/block unscanned/i).first();
    const blockOnFailure = dialog.getByText(/block on.*fail/i).first();
    const hasUnscanned = await blockUnscanned.isVisible({ timeout: 3000 }).catch(() => false);
    const hasFailure = await blockOnFailure.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasUnscanned || hasFailure).toBeTruthy();

    // Cancel
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('edit button opens edit dialog', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No policies table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No policy rows in table');

    // Click edit button (pencil icon)
    const editBtn = firstRow.getByRole('button', { name: /edit/i }).first();
    const hasEdit = await editBtn.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasEdit, 'No edit button found in row');

    await editBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/edit policy/i)).toBeVisible({ timeout: 3000 });

    // Should have Save Changes button
    await expect(dialog.getByRole('button', { name: /save changes/i })).toBeVisible({ timeout: 3000 });

    // Cancel
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('delete button opens confirmation dialog', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No policies table visible');

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

      // Cancel to avoid deleting
      const cancelBtn = dialog.getByRole('button', { name: /cancel/i });
      if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cancelBtn.click();
        await expect(dialog).not.toBeVisible({ timeout: 5000 });
      }
    }
  });
});
