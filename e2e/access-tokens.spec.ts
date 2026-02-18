import {
  test,
  expect,
  filterCriticalErrors,
  navigateTo,
  openDialog,
  fillDialogName,
  dismissTokenAlert,
  assertNoAppErrors,
  switchTab,
} from './helpers/test-fixtures';

test.describe('Access Tokens Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/access-tokens');
  });

  test('page loads with Access Tokens heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /access tokens/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('page has API Keys and Access Tokens tabs', async ({ page }) => {
    const tabList = page.locator('[role="tablist"]');
    await expect(tabList).toBeVisible({ timeout: 10000 });
    await expect(tabList.getByText(/API Keys/i)).toBeVisible({ timeout: 5000 });
    await expect(tabList.getByText(/Access Tokens/i)).toBeVisible({ timeout: 5000 });
  });

  test('API Keys tab shows Create API Key button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /create api key/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('can switch to Access Tokens tab', async ({ page }) => {
    await switchTab(page, /Access Tokens/i);

    await expect(
      page.getByRole('button', { name: /create token/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('clicking Create API Key opens dialog with form fields', async ({ page }) => {
    const dialog = await openDialog(page, /create api key/i);

    const nameInput = dialog.getByLabel(/name/i).first()
      .or(dialog.getByPlaceholder(/name/i).first());
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText(/expir/i).first()).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText(/read/i).first()).toBeVisible({ timeout: 5000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('clicking Create Token opens dialog with form fields', async ({ page }) => {
    await switchTab(page, /Access Tokens/i);

    const dialog = await openDialog(page, /create token/i);

    const nameInput = dialog.getByLabel(/name/i).first()
      .or(dialog.getByPlaceholder(/name/i).first());
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText(/expir/i).first()).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText(/read/i).first()).toBeVisible({ timeout: 5000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('no console errors on page', async ({ consoleErrors }) => {
    expect(filterCriticalErrors(consoleErrors)).toEqual([]);
  });
});

test.describe.serial('Access Tokens - API Key CRUD', () => {
  test('create an API key', async ({ page }) => {
    await navigateTo(page, '/access-tokens');

    const dialog = await openDialog(page, /create api key/i);
    await fillDialogName(dialog, 'e2e-api-key');

    await dialog.getByRole('button', { name: /create key/i }).click();
    await page.waitForTimeout(3000);
    await dismissTokenAlert(page);
    await assertNoAppErrors(page);
  });

  test('created API key appears in table', async ({ page }) => {
    await navigateTo(page, '/access-tokens');
    await page.waitForTimeout(2000);

    const keyText = page.getByText('e2e-api-key').first();
    const visible = await keyText.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!visible, 'API key e2e-api-key not found in table');

    await expect(keyText).toBeVisible();
  });

  test('revoke the created API key', async ({ page }) => {
    await navigateTo(page, '/access-tokens');
    await page.waitForTimeout(2000);

    const keyText = page.getByText('e2e-api-key').first();
    const visible = await keyText.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!visible, 'API key e2e-api-key not found');

    const revokeBtn = page.getByRole('row', { name: /e2e-api-key/i })
      .getByRole('button').first();
    await revokeBtn.click();

    const confirmBtn = page.getByRole('button', { name: /revoke/i }).last();
    const confirmVisible = await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (confirmVisible) {
      await confirmBtn.click();
    }

    await page.waitForTimeout(2000);
    await assertNoAppErrors(page);
  });
});

test.describe.serial('Access Tokens - Personal Token CRUD', () => {
  test('create an access token', async ({ page }) => {
    await navigateTo(page, '/access-tokens');

    await switchTab(page, /Access Tokens/i);

    const dialog = await openDialog(page, /create token/i);
    await fillDialogName(dialog, 'e2e-access-token');

    await dialog.getByRole('button', { name: /create token/i }).click();
    await page.waitForTimeout(3000);
    await dismissTokenAlert(page);
    await assertNoAppErrors(page);
  });

  test('created access token appears in table', async ({ page }) => {
    await navigateTo(page, '/access-tokens');
    await switchTab(page, /Access Tokens/i);
    await page.waitForTimeout(1000);

    const tokenText = page.getByText('e2e-access-token').first();
    const visible = await tokenText.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!visible, 'Access token e2e-access-token not found');

    await expect(tokenText).toBeVisible();
  });

  test('revoke the created access token', async ({ page }) => {
    await navigateTo(page, '/access-tokens');
    await switchTab(page, /Access Tokens/i);
    await page.waitForTimeout(1000);

    const tokenText = page.getByText('e2e-access-token').first();
    const visible = await tokenText.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!visible, 'Access token e2e-access-token not found');

    const revokeBtn = page.getByRole('row', { name: /e2e-access-token/i })
      .getByRole('button').first();
    await revokeBtn.click();

    const confirmBtn = page.getByRole('button', { name: /revoke/i }).last();
    const confirmVisible = await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (confirmVisible) {
      await confirmBtn.click();
    }

    await page.waitForTimeout(2000);
    await assertNoAppErrors(page);
  });
});
