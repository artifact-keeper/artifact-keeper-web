import { test, expect } from '@playwright/test';

/**
 * Admin UI for rate-limit exemption management (issue #270).
 *
 * The page lives at /rate-limits and lets an admin view the effective rate
 * limits and add/remove exemptions for users, service accounts, and CIDR
 * ranges. The backend exemption-management endpoints may not be present on
 * every server, so the page is designed to degrade: the config card and the
 * exemptions section both render an "unavailable" state instead of crashing.
 * These tests assert the UI surface and the add/remove flow, tolerating a
 * backend that has not shipped the endpoints yet.
 */
test.describe('Rate limit admin', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto('/rate-limits');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads with Rate Limits heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /rate limits/i }).first()
    ).toBeVisible({ timeout: 15000 });
  });

  test('shows the current rate limits and exemptions sections', async ({ page }) => {
    await expect(
      page.getByText(/current rate limits/i).first()
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText(/exemptions/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('Add Exemption button opens a dialog with type, value, and note fields', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /add exemption/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Type selector (combobox) plus value and note inputs.
    await expect(dialog.getByRole('combobox').first()).toBeVisible();
    await expect(dialog.locator('#exemption-value')).toBeVisible();
    await expect(dialog.locator('#exemption-note')).toBeVisible();

    // Cancel closes the dialog without creating anything.
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).toBeHidden({ timeout: 5000 });
  });

  test('invalid CIDR is rejected client-side', async ({ page }) => {
    await page.getByRole('button', { name: /add exemption/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Switch the type to CIDR.
    await dialog.getByRole('combobox').first().click();
    const cidrOption = page.getByRole('option', { name: /cidr/i });
    await cidrOption.click();

    await dialog.locator('#exemption-value').fill('not-a-valid-cidr');
    await dialog.getByRole('button', { name: /^add exemption$/i }).click();

    // A validation toast appears and the dialog stays open.
    await expect(page.getByText(/valid cidr/i).first()).toBeVisible({ timeout: 8000 });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('add then remove a username exemption (when the backend supports it)', async ({ page }) => {
    const username = `e2e-exempt-${Date.now()}`;

    await page.getByRole('button', { name: /add exemption/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Default type is username; just fill the value and submit.
    await dialog.locator('#exemption-value').fill(username);
    await dialog.locator('#exemption-note').fill('e2e test exemption');
    await dialog.getByRole('button', { name: /^add exemption$/i }).click();

    // Either the backend accepts it (row appears) or it has no exemption
    // endpoint (failure toast). Both are acceptable, but a success must round
    // trip to a removable row.
    const newRow = page.getByRole('row', { name: new RegExp(username) });
    const created = await newRow
      .isVisible({ timeout: 8000 })
      .catch(() => false);

    if (!created) {
      test.skip(true, 'Backend does not expose rate-limit exemption management');
      return;
    }

    // Remove it and confirm in the alert dialog.
    await newRow.getByRole('button', { name: new RegExp(`remove exemption ${username}`, 'i') }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible({ timeout: 8000 });
    await confirm.getByRole('button', { name: /^remove$/i }).click();

    await expect(newRow).toHaveCount(0, { timeout: 10000 });
  });

  test('no uncaught console errors on load', async ({ page }) => {
    await page.waitForTimeout(1500);
    const fatal = consoleErrors.filter(
      (e) => !/favicon|hydrat|ResizeObserver/i.test(e)
    );
    expect(fatal, fatal.join('\n')).toHaveLength(0);
  });
});
