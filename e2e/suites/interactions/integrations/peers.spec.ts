import { test, expect } from '@playwright/test';

test.describe('Peers Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/peers');
  });

  test('page loads with Peers heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Peers' })).toBeVisible({ timeout: 10000 });
  });

  test('Register Peer button is visible', async ({ page }) => {
    const registerButton = page.getByRole('button', { name: /register peer/i });
    await expect(registerButton).toBeVisible({ timeout: 10000 });
  });

  test('clicking Register Peer opens dialog with form', async ({ page }) => {
    const registerButton = page.getByRole('button', { name: /register peer/i });
    await expect(registerButton).toBeVisible({ timeout: 10000 });
    await registerButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Verify form fields exist
    const nameInput = dialog.getByLabel(/name/i).or(dialog.getByPlaceholder(/name/i));
    await expect(nameInput.first()).toBeVisible({ timeout: 5000 });
  });

  test('Register Peer dialog has Name, Endpoint URL, Region, and API Key inputs', async ({ page }) => {
    const registerButton = page.getByRole('button', { name: /register peer/i });
    await registerButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const nameInput = dialog.getByLabel(/name/i).or(dialog.getByPlaceholder(/name/i));
    const endpointInput = dialog.getByLabel(/endpoint/i).or(dialog.getByPlaceholder(/endpoint|url/i));
    const regionInput = dialog.getByLabel(/region/i).or(dialog.getByPlaceholder(/region/i));
    const apiKeyInput = dialog.getByLabel(/api key/i).or(dialog.getByPlaceholder(/api key/i));

    await expect(nameInput.first()).toBeVisible({ timeout: 5000 });
    await expect(endpointInput.first()).toBeVisible({ timeout: 5000 });
    await expect(regionInput.first()).toBeVisible({ timeout: 5000 });
    await expect(apiKeyInput.first()).toBeVisible({ timeout: 5000 });
  });

  test('Cancel closes the Register Peer dialog', async ({ page }) => {
    const registerButton = page.getByRole('button', { name: /register peer/i });
    await registerButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const cancelButton = dialog.getByRole('button', { name: /cancel/i }).or(
      dialog.locator('button[aria-label="Close"]')
    );
    await cancelButton.first().click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('status filter dropdown is visible', async ({ page }) => {
    const statusFilter = page.getByRole('combobox').filter({ hasText: /status|all|online|offline/i }).or(
      page.locator('select, button').filter({ hasText: /status|all|online|offline/i })
    );
    await expect(statusFilter.first()).toBeVisible({ timeout: 10000 });
  });

  test('stats cards display', async ({ page }) => {
    await page.waitForTimeout(2000);

    const totalPeers = page.getByText(/total peers/i);
    const onlineStat = page.getByText(/online/i);
    const syncingStat = page.getByText(/syncing/i);

    const hasTotal = await totalPeers.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasOnline = await onlineStat.first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasSyncing = await syncingStat.first().isVisible({ timeout: 3000 }).catch(() => false);

    // At minimum the stats section should render
    expect(hasTotal || hasOnline || hasSyncing).toBeTruthy();
  });

  test('peers table renders or empty state shown', async ({ page }) => {
    await page.waitForTimeout(2000);

    const tableHeaders = page.locator('th, [role="columnheader"]');
    const emptyState = page.getByText(/no peers/i)
      .or(page.getByText(/no results/i))
      .or(page.getByText(/empty/i))
      .or(page.getByText(/no registered/i));
    const tableRows = page.locator('table tbody tr, [role="row"]').filter({ hasText: /.+/ });

    const hasTable = await tableHeaders.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasRows = await tableRows.first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmptyState = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTable || hasRows || hasEmptyState).toBeTruthy();
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/peers');
    await page.waitForTimeout(3000);

    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(criticalErrors).toEqual([]);
  });
});
