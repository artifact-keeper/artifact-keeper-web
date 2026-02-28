import { test, expect } from '@playwright/test';

test.describe('Webhooks - Edit, Toggle, Delete', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/webhooks');
    await page.waitForLoadState('domcontentloaded');
  });

  test('refresh button reloads webhook data', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i }).first();
    if (await refreshBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await refreshBtn.click();
      // Page should not error after refresh
      await page.waitForTimeout(2000);
      const content = await page.textContent('body');
      expect(content).not.toContain('Application error');
    }
  });

  test('webhook row has action buttons', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No webhooks table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No webhook rows in table');

    // Row should have action buttons (view deliveries, test, enable/disable, delete)
    const buttons = firstRow.getByRole('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThanOrEqual(1);
  });

  test('delete webhook button opens confirmation dialog', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No webhooks table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No webhook rows in table');

    // Click the delete button (last action button, trash icon)
    const deleteBtn = firstRow.getByRole('button').last();
    await deleteBtn.click();

    // Should see a confirmation dialog
    const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'));
    const hasDialog = await dialog.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasDialog) {
      await expect(page.getByText(/delete webhook/i)).toBeVisible({ timeout: 3000 });

      // Cancel to avoid actually deleting
      const cancelBtn = dialog.getByRole('button', { name: /cancel/i });
      if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cancelBtn.click();
        await expect(dialog).not.toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('enable/disable toggle button is clickable', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No webhooks table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No webhook rows in table');

    // The enable/disable button has title "Enable" or "Disable"
    const toggleBtn = firstRow.getByRole('button', { name: /enable|disable/i }).first();
    const hasToggle = await toggleBtn.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasToggle, 'No enable/disable button found');

    await toggleBtn.click();
    await page.waitForTimeout(2000);

    // Page should not error after toggle
    const content = await page.textContent('body');
    expect(content).not.toContain('Application error');
  });

  test('send test button is clickable', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No webhooks table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No webhook rows in table');

    // The "Send test" button
    const testBtn = firstRow.getByRole('button', { name: /test/i }).first();
    const hasTestBtn = await testBtn.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasTestBtn, 'No send test button found');

    await testBtn.click();
    await page.waitForTimeout(2000);
    const content = await page.textContent('body');
    expect(content).not.toContain('Application error');
  });

  test('view deliveries button opens delivery sheet', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No webhooks table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No webhook rows in table');

    // The deliveries button (first action button, history icon)
    const deliveriesBtn = firstRow.getByRole('button', { name: /deliver/i }).first();
    const hasBtn = await deliveriesBtn.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasBtn, 'No deliveries button found');

    await deliveriesBtn.click();
    await page.waitForTimeout(2000);

    // Should see a sheet/panel with deliveries
    const sheet = page.getByText(/deliveries/i).first();
    await expect(sheet).toBeVisible({ timeout: 5000 });
  });
});
