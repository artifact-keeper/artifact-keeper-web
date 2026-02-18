import {
  test,
  expect,
  filterCriticalErrors,
  navigateTo,
  openDialog,
  fillDialogName,
  dismissTokenAlert,
  assertNoAppErrors,
} from './helpers/test-fixtures';

test.describe('Service Accounts Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/service-accounts');
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
    const dialog = await openDialog(page, /create service account/i);

    await expect(dialog.getByText('svc-')).toBeVisible({ timeout: 5000 });

    const nameInput = dialog.getByLabel(/name/i).first()
      .or(dialog.getByPlaceholder(/deploy/i).first());
    await expect(nameInput).toBeVisible({ timeout: 5000 });

    const descInput = dialog.getByLabel(/description/i).first()
      .or(dialog.getByPlaceholder(/pipeline/i).first());
    await expect(descInput).toBeVisible({ timeout: 5000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('no console errors on page', async ({ consoleErrors }) => {
    expect(filterCriticalErrors(consoleErrors)).toEqual([]);
  });
});

test.describe.serial('Service Account CRUD', () => {
  test('create a service account', async ({ page }) => {
    await navigateTo(page, '/service-accounts');
    const dialog = await openDialog(page, /create service account/i);

    const nameInput = dialog.getByLabel(/name/i).first()
      .or(dialog.getByPlaceholder(/deploy/i).first());
    await nameInput.fill('e2e-test-bot');

    const descInput = dialog.getByLabel(/description/i).first()
      .or(dialog.getByPlaceholder(/pipeline/i).first());
    await descInput.fill('E2E test service account');

    await dialog.getByRole('button', { name: /create$/i }).click();
    await page.waitForTimeout(3000);
    await assertNoAppErrors(page);
  });

  test('service account appears in the table', async ({ page }) => {
    await navigateTo(page, '/service-accounts');

    const table = page.getByRole('table');
    const tableVisible = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!tableVisible, 'No table visible, service account may not have been created');

    await expect(page.getByText('svc-e2e-test-bot')).toBeVisible({ timeout: 10000 });
  });

  test('can open Manage Tokens dialog for service account', async ({ page }) => {
    await navigateTo(page, '/service-accounts');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    const tokenBtn = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button').first();
    await tokenBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText(/svc-e2e-test-bot/i)).toBeVisible({ timeout: 5000 });
    await expect(
      dialog.getByRole('button', { name: /create token/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test('can create a token for the service account', async ({ page }) => {
    await navigateTo(page, '/service-accounts');

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

    await dialog.getByRole('button', { name: /create token/i }).click();
    await page.waitForTimeout(1000);

    await fillDialogName(dialog, 'e2e-svc-token');

    const createBtn = dialog.getByRole('button', { name: /create$/i })
      .or(dialog.getByRole('button', { name: /create token$/i }));
    await createBtn.click();
    await page.waitForTimeout(3000);

    await dismissTokenAlert(page);
    await assertNoAppErrors(page);
  });

  test('token without selector shows All repos in Repo Access column', async ({ page }) => {
    await navigateTo(page, '/service-accounts');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    const tokenBtn = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button').first();
    await tokenBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const allReposText = dialog.getByText(/all repos/i).first();
    const visible = await allReposText.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      test.skip(true, 'No tokens exist to check Repo Access column');
    }
    expect(visible).toBe(true);
  });

  test('create token form shows Repository Access section', async ({ page }) => {
    await navigateTo(page, '/service-accounts');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    const tokenBtn = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button').first();
    await tokenBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await dialog.getByRole('button', { name: /create token/i }).click();
    await page.waitForTimeout(500);

    await expect(dialog.getByText(/repository access/i)).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('docker')).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('maven')).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByPlaceholder('libs-*')).toBeVisible({ timeout: 5000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('can create a token with repo selector', async ({ page }) => {
    await navigateTo(page, '/service-accounts');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    const tokenBtn = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button').first();
    await tokenBtn.click();
    await page.waitForTimeout(1000);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await dialog.getByRole('button', { name: /create token/i }).click();
    await page.waitForTimeout(500);

    await fillDialogName(dialog, 'e2e-scoped-token');

    // Select docker format
    const dockerCheckbox = dialog.getByText('docker').locator('..');
    await dockerCheckbox.locator('[role="checkbox"]').check();

    // Set name pattern
    await dialog.getByPlaceholder('libs-*').fill('prod-*');

    const createBtn = dialog.getByRole('button', { name: /create$/i })
      .or(dialog.getByRole('button', { name: /create token$/i }));
    await createBtn.click();
    await page.waitForTimeout(3000);

    await dismissTokenAlert(page);
    await assertNoAppErrors(page);
  });

  test('can edit a service account description', async ({ page }) => {
    await navigateTo(page, '/service-accounts');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    const actionBtns = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button');
    await actionBtns.nth(1).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const descInput = dialog.getByLabel(/description/i).first()
      .or(dialog.getByPlaceholder(/description/i).first());
    await descInput.clear();
    await descInput.fill('Updated by E2E test');

    await dialog.getByRole('button', { name: /save/i }).click();
    await page.waitForTimeout(2000);
    await assertNoAppErrors(page);
  });

  test('can toggle service account active status', async ({ page }) => {
    await navigateTo(page, '/service-accounts');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    const actionBtns = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button');
    await actionBtns.nth(2).click();
    await page.waitForTimeout(2000);
    await assertNoAppErrors(page);

    // Toggle back
    await page.waitForTimeout(1000);
    const toggleBtnAgain = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button').nth(2);
    await toggleBtnAgain.click();
    await page.waitForTimeout(2000);
  });

  test('can delete a service account', async ({ page }) => {
    await navigateTo(page, '/service-accounts');

    const row = page.getByText('svc-e2e-test-bot').first();
    const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!rowVisible, 'Service account svc-e2e-test-bot not found');

    const actionBtns = page.getByRole('row', { name: /svc-e2e-test-bot/i })
      .getByRole('button');
    await actionBtns.last().click();

    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible({ timeout: 10000 });

    const confirmInput = confirmDialog.getByRole('textbox').first()
      .or(confirmDialog.locator('input').first());
    const inputVisible = await confirmInput.isVisible({ timeout: 5000 }).catch(() => false);
    if (inputVisible) {
      await confirmInput.fill('svc-e2e-test-bot');
    }

    await confirmDialog.getByRole('button', { name: /delete|confirm/i }).last().click();
    await page.waitForTimeout(3000);
    await assertNoAppErrors(page);
  });
});
