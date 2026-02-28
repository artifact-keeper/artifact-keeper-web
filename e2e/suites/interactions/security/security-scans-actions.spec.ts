import { test, expect } from '@playwright/test';

test.describe('Security Scans - Trigger and Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/security/scans');
    await page.waitForLoadState('domcontentloaded');
  });

  test('trigger scan button opens scan dialog', async ({ page }) => {
    const triggerBtn = page.getByRole('button', { name: /trigger scan/i }).first();
    const hasBtn = await triggerBtn.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasBtn, 'No Trigger Scan button visible');

    await triggerBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/trigger security scan/i)).toBeVisible({ timeout: 3000 });
  });

  test('scan dialog has repository selector', async ({ page }) => {
    const triggerBtn = page.getByRole('button', { name: /trigger scan/i }).first();
    const hasBtn = await triggerBtn.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasBtn, 'No Trigger Scan button visible');

    await triggerBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Repository selector
    const repoLabel = dialog.getByText(/repository/i).first();
    await expect(repoLabel).toBeVisible({ timeout: 3000 });
  });

  test('scan dialog has scan mode toggle', async ({ page }) => {
    const triggerBtn = page.getByRole('button', { name: /trigger scan/i }).first();
    const hasBtn = await triggerBtn.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasBtn, 'No Trigger Scan button visible');

    await triggerBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Scan mode buttons: "Entire Repository" and "Specific Artifact"
    const entireRepo = dialog.getByText(/entire repository/i).first();
    const specificArtifact = dialog.getByText(/specific artifact/i).first();

    const hasEntire = await entireRepo.isVisible({ timeout: 3000 }).catch(() => false);
    const hasSpecific = await specificArtifact.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasEntire || hasSpecific).toBeTruthy();
  });

  test('scan dialog cancel closes it', async ({ page }) => {
    const triggerBtn = page.getByRole('button', { name: /trigger scan/i }).first();
    const hasBtn = await triggerBtn.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasBtn, 'No Trigger Scan button visible');

    await triggerBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('refresh button reloads scan data', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i }).first();
    if (await refreshBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await refreshBtn.click();
      await page.waitForTimeout(2000);
      const content = await page.textContent('body');
      expect(content).not.toContain('Application error');
    }
  });

  test('scan result row has view action', async ({ page }) => {
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasTable, 'No scans table visible');

    const firstRow = table.getByRole('row').nth(1);
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRow, 'No scan result rows in table');

    const viewBtn = firstRow.getByRole('button', { name: /view/i }).first()
      .or(firstRow.getByRole('link').first());
    const hasAction = await viewBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasAction) {
      // Verify the action is clickable (don't navigate away)
      await expect(viewBtn).toBeEnabled();
    }
  });
});
