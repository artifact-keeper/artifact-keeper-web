import { test, expect } from '@playwright/test';

test.describe('Plugins Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plugins');
  });

  test('page loads with Plugins heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Plugins', exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('Install Plugin button is visible', async ({ page }) => {
    const installButton = page.getByRole('button', { name: /install plugin/i }).first();
    await expect(installButton).toBeVisible({ timeout: 10000 });
  });

  test('clicking Install Plugin opens dialog with source select', async ({ page }) => {
    const installButton = page.getByRole('button', { name: /install plugin/i }).first();
    await expect(installButton).toBeVisible({ timeout: 10000 });
    await installButton.click();

    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Source select should be present (Registry/URL/Upload File)
    const sourceSelect = dialog.getByRole('combobox').or(
      dialog.locator('select, button').filter({ hasText: /registry|source|url|upload/i })
    );
    const sourceLabel = dialog.getByText(/source/i);

    const hasSourceSelect = await sourceSelect.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasSourceLabel = await sourceLabel.first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasSourceSelect || hasSourceLabel).toBeTruthy();

    // Install and Cancel buttons should be present in dialog
    const installDialogButton = dialog.getByRole('button', { name: /install/i });
    const cancelButton = dialog.getByRole('button', { name: /cancel/i });

    await expect(cancelButton).toBeVisible({ timeout: 5000 });
    const hasInstall = await installDialogButton.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasInstall).toBeTruthy();
  });

  test('Cancel closes Install Plugin dialog', async ({ page }) => {
    const installButton = page.getByRole('button', { name: /install plugin/i }).first();
    await expect(installButton).toBeVisible({ timeout: 10000 });
    await installButton.click();

    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const cancelButton = dialog.getByRole('button', { name: /cancel/i });
    await expect(cancelButton).toBeVisible({ timeout: 5000 });
    await cancelButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('status filter dropdown is visible', async ({ page }) => {
    const statusFilter = page.getByRole('combobox').filter({ hasText: /status|all|active/i }).or(
      page.locator('select, button').filter({ hasText: /status|all|active/i })
    );

    await expect(statusFilter.first()).toBeVisible({ timeout: 10000 });
  });

  test('stats cards are visible', async ({ page }) => {
    const total = page.getByText(/total/i);
    const active = page.getByText(/active/i);
    const errors = page.getByText(/error/i);
    const disabled = page.getByText(/disabled/i);

    await expect(total.first()).toBeVisible({ timeout: 10000 });
    await expect(active.first()).toBeVisible({ timeout: 10000 });

    const hasErrors = await errors.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasDisabled = await disabled.first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasErrors || hasDisabled).toBeTruthy();
  });

  test('plugins table renders or empty state shown', async ({ page }) => {
    await page.waitForTimeout(2000);

    const pluginsTable = page.locator('table');
    const emptyState = page.getByText(/no plugins/i).or(page.getByText(/no results/i)).or(page.getByText(/install your first/i));

    const hasTable = await pluginsTable.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTable || hasEmpty).toBeTruthy();

    // If table exists, check for expected column headers
    if (hasTable) {
      const nameHeader = page.getByText(/name/i);
      const typeHeader = page.getByText(/type/i);
      const statusHeader = page.getByText(/status/i);

      const hasName = await nameHeader.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasType = await typeHeader.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasStatus = await statusHeader.first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasName || hasType || hasStatus).toBeTruthy();
    }
  });

  test('if plugins exist, can open config dialog', async ({ page }) => {
    await page.waitForTimeout(2000);

    const pluginsTable = page.locator('table');
    const hasTable = await pluginsTable.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasTable) {
      test.skip(true, 'No plugins table available');
      return;
    }

    const tableRows = pluginsTable.locator('tbody tr');
    const rowCount = await tableRows.count();

    if (rowCount === 0) {
      test.skip(true, 'No plugins available to configure');
      return;
    }

    // Look for Configure button in the first row's actions
    const configureButton = tableRows.first().getByRole('button', { name: /configure/i }).or(
      tableRows.first().locator('button').filter({ hasText: /configure/i })
    );

    // Some rows may have a dropdown menu for actions
    const actionsButton = tableRows.first().getByRole('button', { name: /actions|more|menu/i }).or(
      tableRows.first().locator('button[aria-haspopup]')
    );

    const hasConfigure = await configureButton.first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasActions = await actionsButton.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (hasConfigure) {
      await configureButton.first().click();
    } else if (hasActions) {
      await actionsButton.first().click();
      await page.waitForTimeout(500);
      const configureMenuItem = page.getByRole('menuitem', { name: /configure/i }).or(
        page.locator('[role="menuitem"]').filter({ hasText: /configure/i })
      );
      const hasMenuItem = await configureMenuItem.first().isVisible({ timeout: 3000 }).catch(() => false);
      if (hasMenuItem) {
        await configureMenuItem.first().click();
      } else {
        test.skip(true, 'No configure option found in actions menu');
        return;
      }
    } else {
      test.skip(true, 'No configure button or actions menu found');
      return;
    }

    // Config dialog should appear
    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Check for Information and Configuration tabs
    const infoTab = dialog.locator('[role="tablist"]').getByRole('tab', { name: /information/i });
    const configTab = dialog.locator('[role="tablist"]').getByRole('tab', { name: /configuration/i });

    const hasInfoTab = await infoTab.isVisible({ timeout: 3000 }).catch(() => false);
    const hasConfigTab = await configTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasInfoTab && hasConfigTab) {
      await configTab.click();
      await page.waitForTimeout(500);
      await infoTab.click();
    }

    // Close the dialog
    const cancelButton = dialog.getByRole('button', { name: /cancel|close/i });
    const hasCancel = await cancelButton.first().isVisible({ timeout: 3000 }).catch(() => false);
    if (hasCancel) {
      await cancelButton.first().click();
      await expect(dialog).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/plugins');
    await page.waitForTimeout(3000);

    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('hydration') && !e.includes('Warning:')
    );
    expect(criticalErrors).toEqual([]);
  });
});
