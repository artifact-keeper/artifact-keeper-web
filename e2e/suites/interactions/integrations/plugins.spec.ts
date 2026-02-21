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

  test('clicking Install Plugin opens dialog with Git and ZIP tabs', async ({ page }) => {
    const installButton = page.getByRole('button', { name: /install plugin/i }).first();
    await expect(installButton).toBeVisible({ timeout: 10000 });
    await installButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Should have Git Repository and ZIP Upload tabs
    await expect(dialog.getByRole('tab', { name: /git repository/i })).toBeVisible();
    await expect(dialog.getByRole('tab', { name: /zip upload/i })).toBeVisible();

    // Git tab should be active by default with URL and Ref fields
    await expect(dialog.getByLabel(/repository url/i)).toBeVisible();
    await expect(dialog.getByLabel(/git ref/i)).toBeVisible();

    // Install and Cancel buttons should be present
    await expect(dialog.getByRole('button', { name: /cancel/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /install/i })).toBeVisible();
  });

  test('Cancel closes Install Plugin dialog', async ({ page }) => {
    const installButton = page.getByRole('button', { name: /install plugin/i }).first();
    await expect(installButton).toBeVisible({ timeout: 10000 });
    await installButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const cancelButton = dialog.getByRole('button', { name: /cancel/i });
    await expect(cancelButton).toBeVisible({ timeout: 5000 });
    await cancelButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('ZIP tab shows file upload input', async ({ page }) => {
    await page.getByRole('button', { name: /install plugin/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Switch to ZIP tab
    await dialog.getByRole('tab', { name: /zip upload/i }).click();

    // File input and Upload & Install button should be visible
    await expect(dialog.getByLabel(/plugin zip file/i)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /upload & install/i })).toBeVisible();
  });

  test('Git Install button is disabled when URL is empty', async ({ page }) => {
    await page.getByRole('button', { name: /install plugin/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Install button should be disabled when URL is empty
    const installBtn = dialog.getByRole('button', { name: /^install$/i });
    await expect(installBtn).toBeDisabled();

    // Typing a URL should enable it
    await dialog.getByLabel(/repository url/i).fill('https://github.com/org/repo.git');
    await expect(installBtn).toBeEnabled();
  });

  test('switching tabs preserves Git URL input', async ({ page }) => {
    await page.getByRole('button', { name: /install plugin/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill in Git URL
    const urlInput = dialog.getByLabel(/repository url/i);
    await urlInput.fill('https://github.com/example/plugin.git');

    // Switch to ZIP tab and back
    await dialog.getByRole('tab', { name: /zip upload/i }).click();
    await dialog.getByRole('tab', { name: /git repository/i }).click();

    // URL should still be there
    await expect(urlInput).toHaveValue('https://github.com/example/plugin.git');
  });

  test('Git install sends request to backend', async ({ page }) => {
    let interceptedBody: Record<string, unknown> | null = null;

    await page.route('**/api/v1/plugins/install/git', async (route) => {
      const request = route.request();
      interceptedBody = request.postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-plugin-id',
          name: 'test-plugin',
          version: '1.0.0',
          status: 'active',
          plugin_type: 'format_handler',
        }),
      });
    });

    await page.getByRole('button', { name: /install plugin/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.getByLabel(/repository url/i).fill('https://github.com/example/plugin.git');
    await dialog.getByLabel(/git ref/i).fill('v1.0.0');
    await dialog.getByRole('button', { name: /^install$/i }).click();

    // Wait for dialog to close (success path closes the dialog)
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Verify the request was made with correct body
    expect(interceptedBody).toEqual({
      url: 'https://github.com/example/plugin.git',
      ref: 'v1.0.0',
    });
  });

  test('Git install keeps dialog open on failure', async ({ page }) => {
    await page.route('**/api/v1/plugins/install/git', async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Failed to clone repository: authentication required',
        }),
      });
    });

    await page.getByRole('button', { name: /install plugin/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.getByLabel(/repository url/i).fill('https://github.com/private/repo.git');
    const installBtn = dialog.getByRole('button', { name: /^install$/i });
    await installBtn.click();

    // Wait for the mutation to settle (button text returns from "Installing..." to "Install")
    await expect(installBtn).toHaveText('Install', { timeout: 10000 });

    // Dialog should remain open on error
    await expect(dialog).toBeVisible();
  });

  test('ZIP install sends request to backend', async ({ page }) => {
    let interceptedRequest = false;

    await page.route('**/api/v1/plugins/install/zip', async (route) => {
      interceptedRequest = true;
      const request = route.request();
      // Verify it's a multipart form upload
      const contentType = request.headers()['content-type'] ?? '';
      expect(contentType).toContain('multipart/form-data');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'zip-plugin-id',
          name: 'zip-plugin',
          version: '0.1.0',
          status: 'active',
          plugin_type: 'format_handler',
        }),
      });
    });

    await page.getByRole('button', { name: /install plugin/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Switch to ZIP tab
    await dialog.getByRole('tab', { name: /zip upload/i }).click();

    // Upload a dummy ZIP file
    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-plugin.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('PK\x03\x04fake-zip-content'),
    });

    // File name should be displayed
    await expect(dialog.getByText('test-plugin.zip')).toBeVisible({ timeout: 3000 });

    await dialog.getByRole('button', { name: /upload & install/i }).click();

    // Wait for dialog to close (success path closes the dialog)
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Verify the API route was called
    expect(interceptedRequest).toBe(true);
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

    // Look for Configure button (gear icon) in the first row's actions
    const configureButton = tableRows.first().getByRole('button', { name: /configure/i }).or(
      tableRows.first().locator('button').filter({ hasText: /configure/i })
    );

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

    // Config dialog should appear with Information and Configuration tabs
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

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
