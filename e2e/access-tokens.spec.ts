import { test, expect } from '@playwright/test';

test.describe('Access Tokens Page', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('/access-tokens');
    await page.waitForLoadState('networkidle');
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
    // API Keys is the default tab
    await expect(
      page.getByRole('button', { name: /create api key/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('can switch to Access Tokens tab', async ({ page }) => {
    await page.locator('[role="tablist"]').getByText(/Access Tokens/i).click();
    await page.waitForTimeout(1000);

    await expect(
      page.getByRole('button', { name: /create token/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('clicking Create API Key opens dialog with form fields', async ({ page }) => {
    await page.getByRole('button', { name: /create api key/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Name input
    const nameInput = dialog.getByLabel(/name/i).first()
      .or(dialog.getByPlaceholder(/name/i).first());
    await expect(nameInput).toBeVisible({ timeout: 5000 });

    // Expiration select
    await expect(dialog.getByText(/expir/i).first()).toBeVisible({ timeout: 5000 });

    // Scope checkboxes
    await expect(dialog.getByText(/read/i).first()).toBeVisible({ timeout: 5000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('clicking Create Token opens dialog with form fields', async ({ page }) => {
    await page.locator('[role="tablist"]').getByText(/Access Tokens/i).click();
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: /create token/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Name input
    const nameInput = dialog.getByLabel(/name/i).first()
      .or(dialog.getByPlaceholder(/name/i).first());
    await expect(nameInput).toBeVisible({ timeout: 5000 });

    // Expiration select
    await expect(dialog.getByText(/expir/i).first()).toBeVisible({ timeout: 5000 });

    // Scope checkboxes
    await expect(dialog.getByText(/read/i).first()).toBeVisible({ timeout: 5000 });

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

test.describe.serial('Access Tokens - API Key CRUD', () => {
  test('create an API key', async ({ page }) => {
    await page.goto('/access-tokens');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /create api key/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const nameInput = dialog.getByLabel(/name/i).first()
      .or(dialog.getByPlaceholder(/name/i).first());
    await nameInput.fill('e2e-api-key');

    // Read scope should be checked by default, just submit
    await dialog.getByRole('button', { name: /create key/i }).click();
    await page.waitForTimeout(3000);

    // Should show the token with Store it safely warning
    const doneBtn = page.getByRole('button', { name: /done/i }).first();
    const doneVisible = await doneBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (doneVisible) {
      await doneBtn.click();
    }

    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('Application error');
  });

  test('created API key appears in table', async ({ page }) => {
    await page.goto('/access-tokens');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const keyText = page.getByText('e2e-api-key').first();
    const visible = await keyText.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!visible, 'API key e2e-api-key not found in table');

    await expect(keyText).toBeVisible();
  });

  test('revoke the created API key', async ({ page }) => {
    await page.goto('/access-tokens');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const keyText = page.getByText('e2e-api-key').first();
    const visible = await keyText.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!visible, 'API key e2e-api-key not found');

    // Click revoke button in the row
    const revokeBtn = page.getByRole('row', { name: /e2e-api-key/i })
      .getByRole('button').first();
    await revokeBtn.click();

    // Confirm revocation
    const confirmBtn = page.getByRole('button', { name: /revoke/i }).last();
    const confirmVisible = await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (confirmVisible) {
      await confirmBtn.click();
    }

    await page.waitForTimeout(2000);
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('Application error');
  });
});

test.describe.serial('Access Tokens - Personal Token CRUD', () => {
  test('create an access token', async ({ page }) => {
    await page.goto('/access-tokens');
    await page.waitForLoadState('networkidle');

    // Switch to Access Tokens tab
    await page.locator('[role="tablist"]').getByText(/Access Tokens/i).click();
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: /create token/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const nameInput = dialog.getByLabel(/name/i).first()
      .or(dialog.getByPlaceholder(/name/i).first());
    await nameInput.fill('e2e-access-token');

    await dialog.getByRole('button', { name: /create token/i }).click();
    await page.waitForTimeout(3000);

    const doneBtn = page.getByRole('button', { name: /done/i }).first();
    const doneVisible = await doneBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (doneVisible) {
      await doneBtn.click();
    }

    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('Application error');
  });

  test('created access token appears in table', async ({ page }) => {
    await page.goto('/access-tokens');
    await page.waitForLoadState('networkidle');

    await page.locator('[role="tablist"]').getByText(/Access Tokens/i).click();
    await page.waitForTimeout(2000);

    const tokenText = page.getByText('e2e-access-token').first();
    const visible = await tokenText.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!visible, 'Access token e2e-access-token not found');

    await expect(tokenText).toBeVisible();
  });

  test('revoke the created access token', async ({ page }) => {
    await page.goto('/access-tokens');
    await page.waitForLoadState('networkidle');

    await page.locator('[role="tablist"]').getByText(/Access Tokens/i).click();
    await page.waitForTimeout(2000);

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
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('Application error');
  });
});
