import { test, expect } from '@playwright/test';

test.describe('Access Token Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/access-tokens');
    await page.waitForLoadState('domcontentloaded');
  });

  test('can create an API key and see the token value', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /access tokens/i })).toBeVisible({ timeout: 10000 });

    // Click "Create API Key" button (API Keys tab is default)
    const createBtn = page.getByRole('button', { name: /create api key/i });
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.getByLabel(/name/i).fill('e2e-test-key');

    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/auth/tokens') && resp.request().method() === 'POST',
      { timeout: 10000 }
    );

    const submitBtn = dialog.getByRole('button', { name: /create key/i });
    await expect(submitBtn).toBeEnabled({ timeout: 3000 });
    await submitBtn.click();

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    const responseBody = await response.json();
    expect(responseBody.token).toBeTruthy();

    // Dialog should switch to the token created alert
    const tokenAlert = dialog.getByText(/copy your api key/i).or(
      dialog.getByText(/you will not be able to see it again/i)
    );
    await expect(tokenAlert.first()).toBeVisible({ timeout: 5000 });

    // The token value should be displayed in a code element
    const tokenCode = dialog.locator('code, pre, [data-testid="token-value"]');
    await expect(tokenCode.first()).toBeVisible({ timeout: 5000 });

    // Close dialog via Done button
    const doneBtn = dialog.getByRole('button', { name: /done/i });
    await expect(doneBtn).toBeVisible({ timeout: 3000 });
    await doneBtn.click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('can create an access token and see the token value', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /access tokens/i })).toBeVisible({ timeout: 10000 });

    // Switch to Access Tokens tab
    const accessTokensTab = page.getByRole('tab', { name: /access tokens/i });
    await accessTokensTab.click();

    const createBtn = page.getByRole('button', { name: /create token/i });
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.getByLabel(/name/i).fill('e2e-test-token');

    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/auth/tokens') && resp.request().method() === 'POST',
      { timeout: 10000 }
    );

    const submitBtn = dialog.getByRole('button', { name: /create token/i });
    await expect(submitBtn).toBeEnabled({ timeout: 3000 });
    await submitBtn.click();

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    const responseBody = await response.json();
    expect(responseBody.token).toBeTruthy();

    // Dialog should switch to the token created alert
    const tokenAlert = dialog.getByText(/copy your access token/i).or(
      dialog.getByText(/you will not be able to see it again/i)
    );
    await expect(tokenAlert.first()).toBeVisible({ timeout: 5000 });

    // The token value should be displayed
    const tokenCode = dialog.locator('code, pre, [data-testid="token-value"]');
    await expect(tokenCode.first()).toBeVisible({ timeout: 5000 });

    // Close dialog
    const doneBtn = dialog.getByRole('button', { name: /done/i });
    await expect(doneBtn).toBeVisible({ timeout: 3000 });
    await doneBtn.click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('newly created API key appears in the table', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /access tokens/i })).toBeVisible({ timeout: 10000 });

    const createBtn = page.getByRole('button', { name: /create api key/i });
    await createBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const keyName = `e2e-table-key-${Date.now()}`;
    await dialog.getByLabel(/name/i).fill(keyName);

    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/auth/tokens') && resp.request().method() === 'POST',
      { timeout: 10000 }
    );

    await dialog.getByRole('button', { name: /create key/i }).click();
    await responsePromise;

    // Close the token alert dialog
    await dialog.getByRole('button', { name: /done/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // The key should appear in the table
    await expect(page.getByText(keyName)).toBeVisible({ timeout: 5000 });
  });
});
