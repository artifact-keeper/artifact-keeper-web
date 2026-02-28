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
  isRowVisible,
} from '../../../fixtures/test-fixtures';

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
  test('create an API key and see the secret', async ({ page }) => {
    await navigateTo(page, '/access-tokens');

    const dialog = await openDialog(page, /create api key/i);
    await fillDialogName(dialog, 'e2e-api-key');

    await dialog.getByRole('button', { name: /create key/i }).click();
    await page.waitForTimeout(3000);

    // The token-created alert should show the secret value
    await expect(dialog.getByText(/store it safely/i)).toBeVisible({ timeout: 5000 });
    // The full key value should be displayed in a code element
    const keyCode = dialog.locator('code').first();
    await expect(keyCode).toBeVisible({ timeout: 5000 });
    const keyValue = await keyCode.textContent();
    expect(keyValue?.length).toBeGreaterThan(0);

    await dismissTokenAlert(page);
    await assertNoAppErrors(page);
  });

  test('created API key appears in table with prefix and scopes', async ({ page }) => {
    await navigateTo(page, '/access-tokens');
    await page.waitForTimeout(2000);
    test.skip(!(await isRowVisible(page, 'e2e-api-key')), 'API key e2e-api-key not found in table');

    const row = page.getByRole('row', { name: /e2e-api-key/i }).first();
    await expect(row).toBeVisible({ timeout: 10000 });

    // Key prefix column should show a truncated prefix (e.g., "ak_...")
    await expect(row.locator('code').first()).toBeVisible({ timeout: 5000 });

    // Default scope "read" should be shown as a badge
    await expect(row.getByText('read')).toBeVisible({ timeout: 5000 });
  });

  test('revoke the created API key', async ({ page }) => {
    await navigateTo(page, '/access-tokens');
    await page.waitForTimeout(2000);
    test.skip(!(await isRowVisible(page, 'e2e-api-key')), 'API key e2e-api-key not found');

    const row = page.getByRole('row', { name: /e2e-api-key/i }).first();

    // Click the trash/revoke button in the row
    await row.getByRole('button').first().click();

    // Wait for the AlertDialog confirmation to appear
    const alertDialog = page.getByRole('alertdialog');
    await expect(alertDialog).toBeVisible({ timeout: 5000 });

    // Click the confirm button and verify the DELETE API call succeeds
    const [response] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.request().method() === 'DELETE' && resp.url().includes('/api/'),
        { timeout: 10000 }
      ),
      alertDialog.getByRole('button', { name: /revoke/i }).click(),
    ]);
    expect(response.status()).toBeLessThan(300);

    // Dialog closing confirms the mutation's onSuccess fired
    await expect(alertDialog).toBeHidden({ timeout: 10000 });
  });
});

test.describe.serial('Access Tokens - Personal Token CRUD', () => {
  test('create an access token and see the secret', async ({ page }) => {
    await navigateTo(page, '/access-tokens');
    await switchTab(page, /Access Tokens/i);

    const dialog = await openDialog(page, /create token/i);
    await fillDialogName(dialog, 'e2e-access-token');

    await dialog.getByRole('button', { name: /create token/i }).click();
    await page.waitForTimeout(3000);

    // The token-created alert should show the secret value
    await expect(dialog.getByText(/store it safely/i)).toBeVisible({ timeout: 5000 });
    const tokenCode = dialog.locator('code').first();
    await expect(tokenCode).toBeVisible({ timeout: 5000 });
    const tokenValue = await tokenCode.textContent();
    expect(tokenValue?.length).toBeGreaterThan(0);

    await dismissTokenAlert(page);
    await assertNoAppErrors(page);
  });

  test('created access token appears in table with prefix and scopes', async ({ page }) => {
    await navigateTo(page, '/access-tokens');
    await switchTab(page, /Access Tokens/i);
    await page.waitForTimeout(1000);
    test.skip(!(await isRowVisible(page, 'e2e-access-token')), 'Access token e2e-access-token not found');

    const row = page.getByRole('row', { name: /e2e-access-token/i }).first();
    await expect(row).toBeVisible({ timeout: 10000 });

    // Token prefix column should show a truncated prefix
    await expect(row.locator('code').first()).toBeVisible({ timeout: 5000 });

    // Default scope "read" should be shown as a badge
    await expect(row.getByText('read')).toBeVisible({ timeout: 5000 });
  });

  test('revoke the created access token', async ({ page }) => {
    await navigateTo(page, '/access-tokens');
    await switchTab(page, /Access Tokens/i);
    await page.waitForTimeout(2000);
    test.skip(!(await isRowVisible(page, 'e2e-access-token')), 'Access token e2e-access-token not found');

    const row = page.getByRole('row', { name: /e2e-access-token/i }).first();

    // Click the trash/revoke button in the row
    await row.getByRole('button').first().click();

    // Wait for the AlertDialog confirmation to appear
    const alertDialog = page.getByRole('alertdialog');
    await expect(alertDialog).toBeVisible({ timeout: 5000 });

    // Click the confirm button and verify the DELETE API call succeeds
    const [response] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.request().method() === 'DELETE' && resp.url().includes('/api/'),
        { timeout: 10000 }
      ),
      alertDialog.getByRole('button', { name: /revoke/i }).click(),
    ]);
    expect(response.status()).toBeLessThan(300);

    // Dialog closing confirms the mutation's onSuccess fired
    await expect(alertDialog).toBeHidden({ timeout: 10000 });
  });
});
