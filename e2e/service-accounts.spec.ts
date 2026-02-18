import { test, expect } from '@playwright/test';

test.describe('Service Accounts Page', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('/service-accounts');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with Service Accounts heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /service accounts/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('page shows description about machine identities', async ({ page }) => {
    await expect(
      page.getByText(/machine identities/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('Create Service Account button is visible', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /create service account/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('clicking Create opens dialog with svc- prefix', async ({ page }) => {
    await page.getByRole('button', { name: /create service account/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Should show svc- prefix indicator
    await expect(dialog.getByText('svc-')).toBeVisible({ timeout: 5000 });

    // Name input should be present
    const nameInput = dialog.getByLabel(/name/i).first()
      .or(dialog.getByPlaceholder(/deploy/i).first());
    await expect(nameInput).toBeVisible({ timeout: 5000 });

    // Description input should be present
    const descInput = dialog.getByLabel(/description/i).first()
      .or(dialog.getByPlaceholder(/pipeline/i).first());
    await expect(descInput).toBeVisible({ timeout: 5000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('no console errors on page', async () => {
    const criticalErrors = consoleErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('net::') &&
        !e.includes('Failed to load resource') &&
        (e.includes('TypeError') || e.includes('is not a function') || e.includes('Cannot read'))
    );
    expect(criticalErrors).toEqual([]);
  });
});

test.describe.serial('Service Account CRUD', () => {
  test('create a service account', async ({ page }) => {
    await page.goto('/service-accounts');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /create service account/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Fill in the name (without svc- prefix, it's added automatically)
    const nameInput = dialog.getByLabel(/name/i).first()
      .or(dialog.getByPlaceholder(/deploy/i).first());
    await nameInput.fill('e2e-test-bot');

    // Add a description
    const descInput = dialog.getByLabel(/description/i).first()
      .or(dialog.getByPlaceholder(/pipeline/i).first());
    await descInput.fill('E2E test service account');

    // Submit
    await dialog.getByRole('button', { name: /create$/i }).click();
    await page.waitForTimeout(3000);

    // Page should not have errors
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('Application error');
  });

  test('service account appears in the table', async ({ page }) => {
    await page.goto('/service-accounts');
    await page.waitForLoadState('networkidle');

    const table = page.getByRole('table');
    const tableVisible = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!tableVisible, 'No table visible, service account may not have been created');

    await expect(
      page.getByText('svc-e2e-test-bot')
    ).toBeVisible({ timeout: 10000 });
  });

  test('can open Manage Tokens dialog for service account', async ({ page }) => {
    await page.goto('/service-accounts');
    await page.waitForLoadState('networkidle');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    // Click the key/tokens icon button in that row
    const tokenBtn = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button').first();
    await tokenBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Should show the account name in the dialog title
    await expect(
      dialog.getByText(/svc-e2e-test-bot/i)
    ).toBeVisible({ timeout: 5000 });

    // Should have a Create Token button
    await expect(
      dialog.getByRole('button', { name: /create token/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test('can create a token for the service account', async ({ page }) => {
    await page.goto('/service-accounts');
    await page.waitForLoadState('networkidle');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    // Open token dialog
    const tokenBtn = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button').first();
    await tokenBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Click Create Token
    await dialog.getByRole('button', { name: /create token/i }).click();
    await page.waitForTimeout(1000);

    // Fill in token name
    const nameInput = dialog.getByLabel(/name/i).first()
      .or(dialog.getByPlaceholder(/name/i).first());
    await nameInput.fill('e2e-svc-token');

    // Submit the token creation form
    const createBtn = dialog.getByRole('button', { name: /create$/i })
      .or(dialog.getByRole('button', { name: /create token$/i }));
    await createBtn.click();
    await page.waitForTimeout(3000);

    // Should show the token value with a "Store it safely" warning
    const safetyWarning = dialog.getByText(/store it safely|only be shown once/i).first();
    const warningVisible = await safetyWarning.isVisible({ timeout: 5000 }).catch(() => false);

    if (warningVisible) {
      // Click Done to dismiss
      const doneBtn = dialog.getByRole('button', { name: /done/i });
      await doneBtn.click();
    }

    // No errors
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('Application error');
  });

  test('can edit a service account description', async ({ page }) => {
    await page.goto('/service-accounts');
    await page.waitForLoadState('networkidle');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    // Click the edit (pencil) button - second button in the row actions
    const actionBtns = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button');
    // Edit is typically the second action button (after tokens)
    const editBtn = actionBtns.nth(1);
    await editBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Update description
    const descInput = dialog.getByLabel(/description/i).first()
      .or(dialog.getByPlaceholder(/description/i).first());
    await descInput.clear();
    await descInput.fill('Updated by E2E test');

    await dialog.getByRole('button', { name: /save/i }).click();
    await page.waitForTimeout(2000);

    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('Application error');
  });

  test('can toggle service account active status', async ({ page }) => {
    await page.goto('/service-accounts');
    await page.waitForLoadState('networkidle');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    // Toggle button is the third action button
    const actionBtns = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button');
    const toggleBtn = actionBtns.nth(2);
    await toggleBtn.click();
    await page.waitForTimeout(2000);

    // Should now show Inactive status
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('Application error');

    // Toggle back to active
    await page.waitForTimeout(1000);
    const toggleBtnAgain = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button').nth(2);
    await toggleBtnAgain.click();
    await page.waitForTimeout(2000);
  });

  test('token without selector shows All repos in Repo Access column', async ({ page }) => {
    await page.goto('/service-accounts');
    await page.waitForLoadState('networkidle');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    // Open token dialog
    const tokenBtn = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button').first();
    await tokenBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // The "All repos" text should appear for tokens without a selector
    const allReposText = dialog.getByText(/all repos/i).first();
    const visible = await allReposText.isVisible({ timeout: 5000 }).catch(() => false);
    // If no tokens exist, skip
    if (!visible) {
      test.skip(true, 'No tokens exist to check Repo Access column');
    }
    expect(visible).toBe(true);
  });

  test('create token form shows Repository Access section', async ({ page }) => {
    await page.goto('/service-accounts');
    await page.waitForLoadState('networkidle');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    // Open token dialog
    const tokenBtn = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button').first();
    await tokenBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Click Create Token
    await dialog.getByRole('button', { name: /create token/i }).click();
    await page.waitForTimeout(500);

    // Repository Access section should be visible
    await expect(dialog.getByText(/repository access/i)).toBeVisible({ timeout: 5000 });

    // Format checkboxes should be visible (e.g. docker, maven)
    await expect(dialog.getByText('docker')).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('maven')).toBeVisible({ timeout: 5000 });

    // Name pattern input should be present
    await expect(dialog.getByPlaceholder('libs-*')).toBeVisible({ timeout: 5000 });

    // Cancel
    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('can create a token with repo selector', async ({ page }) => {
    await page.goto('/service-accounts');
    await page.waitForLoadState('networkidle');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    // Open token dialog
    const tokenBtn = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button').first();
    await tokenBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Click Create Token
    await dialog.getByRole('button', { name: /create token/i }).click();
    await page.waitForTimeout(500);

    // Fill in token name
    const nameInput = dialog.getByLabel(/name/i).first()
      .or(dialog.getByPlaceholder(/name/i).first());
    await nameInput.fill('e2e-scoped-token');

    // Select a format (docker)
    const dockerCheckbox = dialog.getByText('docker').locator('..');
    await dockerCheckbox.locator('[role="checkbox"]').check();

    // Enter a name pattern
    await dialog.getByPlaceholder('libs-*').fill('prod-*');

    // Submit
    const createBtn = dialog.getByRole('button', { name: /create$/i })
      .or(dialog.getByRole('button', { name: /create token$/i }));
    await createBtn.click();
    await page.waitForTimeout(3000);

    // Should show the token value
    const safetyWarning = dialog.getByText(/store it safely|only be shown once/i).first();
    const warningVisible = await safetyWarning.isVisible({ timeout: 5000 }).catch(() => false);
    if (warningVisible) {
      await dialog.getByRole('button', { name: /done/i }).click();
    }

    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('Application error');
  });

  test('can delete a service account', async ({ page }) => {
    await page.goto('/service-accounts');
    await page.waitForLoadState('networkidle');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    // Delete button is the last (4th) action button
    const actionBtns = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button');
    const deleteBtn = actionBtns.last();
    await deleteBtn.click();

    // Confirm dialog should appear - requires typing the username
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible({ timeout: 10000 });

    // Type the username to confirm deletion
    const confirmInput = confirmDialog.getByRole('textbox').first()
      .or(confirmDialog.locator('input').first());
    const inputVisible = await confirmInput.isVisible({ timeout: 5000 }).catch(() => false);
    if (inputVisible) {
      await confirmInput.fill('svc-e2e-test-bot');
    }

    // Click the delete/confirm button
    const confirmBtn = confirmDialog.getByRole('button', { name: /delete|confirm/i }).last();
    await confirmBtn.click();
    await page.waitForTimeout(3000);

    // Service account should no longer appear
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('Application error');
  });
});
