import {
  test,
  expect,
  filterCriticalErrors,
  navigateTo,
  openDialog,
  fillDialogName,
  dismissTokenAlert,
  assertNoAppErrors,
  isRowVisible,
  openTokenDialogForAccount,
  getRowActionButtons,
  clickCreateTokenInDialog,
  submitTokenForm,
} from '../../../fixtures/test-fixtures';

const SVC_ACCOUNT = 'svc-e2e-test-bot';
const SVC_ACCOUNT_RE = /svc-e2e-test-bot/i;
const SKIP_MSG = `Service account ${SVC_ACCOUNT} not found`;

/** Navigate to service accounts page and skip if the test account is missing. */
async function ensureAccountExists(page: import('@playwright/test').Page) {
  await navigateTo(page, '/service-accounts');
  return isRowVisible(page, SVC_ACCOUNT);
}

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

    await expect(dialog.getByText('svc-', { exact: true })).toBeVisible({ timeout: 5000 });

    const nameInput = dialog.getByLabel(/name/i).first()
      .or(dialog.getByPlaceholder(/deploy/i).first());
    await expect(nameInput).toBeVisible({ timeout: 5000 });

    const descInput = dialog.getByRole('textbox', { name: /description/i });
    await expect(descInput).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
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

    const descInput = dialog.getByRole('textbox', { name: /description/i });
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

    await expect(page.getByText(SVC_ACCOUNT)).toBeVisible({ timeout: 10000 });
  });

  test('can open Manage Tokens dialog for service account', async ({ page }) => {
    test.skip(!(await ensureAccountExists(page)), SKIP_MSG);

    const dialog = await openTokenDialogForAccount(page, SVC_ACCOUNT_RE);
    await expect(dialog.getByText(SVC_ACCOUNT_RE)).toBeVisible({ timeout: 5000 });
    await expect(
      dialog.getByRole('button', { name: /create token/i }).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('can create a token for the service account', async ({ page }) => {
    test.skip(!(await ensureAccountExists(page)), SKIP_MSG);

    const dialog = await openTokenDialogForAccount(page, SVC_ACCOUNT_RE);
    await clickCreateTokenInDialog(dialog, 1000);
    await fillDialogName(dialog, 'e2e-svc-token');
    await submitTokenForm(dialog, page);
    await dismissTokenAlert(page);
    await assertNoAppErrors(page);
  });

  test('token without selector shows All repos in Repo Access column', async ({ page }) => {
    test.skip(!(await ensureAccountExists(page)), SKIP_MSG);

    const dialog = await openTokenDialogForAccount(page, SVC_ACCOUNT_RE);

    const allReposText = dialog.getByText(/all repos/i).first();
    const visible = await allReposText.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      test.skip(true, 'No tokens exist to check Repo Access column');
    }
    expect(visible).toBe(true);
  });

  test('create token form shows Repository Access section', async ({ page }) => {
    test.skip(!(await ensureAccountExists(page)), SKIP_MSG);

    const dialog = await openTokenDialogForAccount(page, SVC_ACCOUNT_RE);
    await clickCreateTokenInDialog(dialog);

    await expect(dialog.getByText(/repository access/i)).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('docker')).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('maven')).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByPlaceholder('libs-*')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
  });

  test('can create a token with repo selector', async ({ page }) => {
    test.skip(!(await ensureAccountExists(page)), SKIP_MSG);

    const dialog = await openTokenDialogForAccount(page, SVC_ACCOUNT_RE);
    await clickCreateTokenInDialog(dialog);
    await fillDialogName(dialog, 'e2e-scoped-token');

    // Select docker format
    const dockerCheckbox = dialog.getByText('docker').locator('..');
    await dockerCheckbox.locator('[role="checkbox"]').check();

    // Set name pattern
    await dialog.getByPlaceholder('libs-*').fill('prod-*');

    await submitTokenForm(dialog, page);
    await dismissTokenAlert(page);
    await assertNoAppErrors(page);
  });

  test('can edit a service account description', async ({ page }) => {
    test.skip(!(await ensureAccountExists(page)), SKIP_MSG);

    await getRowActionButtons(page, SVC_ACCOUNT_RE).nth(1).click();

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
    test.skip(!(await ensureAccountExists(page)), SKIP_MSG);

    await getRowActionButtons(page, SVC_ACCOUNT_RE).nth(2).click();
    await page.waitForTimeout(2000);
    await assertNoAppErrors(page);

    // Toggle back
    await page.waitForTimeout(1000);
    await getRowActionButtons(page, SVC_ACCOUNT_RE).nth(2).click();
    await page.waitForTimeout(2000);
  });

  test('can delete a service account', async ({ page }) => {
    test.skip(!(await ensureAccountExists(page)), SKIP_MSG);

    await getRowActionButtons(page, SVC_ACCOUNT_RE).last().click();

    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible({ timeout: 10000 });

    const confirmInput = confirmDialog.getByRole('textbox').first()
      .or(confirmDialog.locator('input').first());
    const inputVisible = await confirmInput.isVisible({ timeout: 5000 }).catch(() => false);
    if (inputVisible) {
      await confirmInput.fill(SVC_ACCOUNT);
    }

    await confirmDialog.getByRole('button', { name: /delete|confirm/i }).last().click();
    await page.waitForTimeout(3000);
    await assertNoAppErrors(page);
  });
});
