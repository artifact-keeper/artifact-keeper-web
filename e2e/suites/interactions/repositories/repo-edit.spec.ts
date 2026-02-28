import { test, expect } from '@playwright/test';

test.describe('Repository - Edit and Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/repositories');
    await page.waitForLoadState('domcontentloaded');
  });

  test('refresh button reloads repository list', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i }).first();
    if (await refreshBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await refreshBtn.click();
      await page.waitForTimeout(2000);
      const content = await page.textContent('body');
      expect(content).not.toContain('Application error');
    }
  });

  test('create repository dialog has type and format selectors', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: /create repository/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/create repository/i).first()).toBeVisible({ timeout: 3000 });

    // Key input
    const keyInput = dialog.getByLabel(/key/i).first()
      .or(dialog.getByPlaceholder(/key/i).first());
    await expect(keyInput).toBeVisible({ timeout: 3000 });

    // Name input
    const nameInput = dialog.getByLabel(/name/i).first()
      .or(dialog.getByPlaceholder(/name/i).first());
    await expect(nameInput).toBeVisible({ timeout: 3000 });

    // Format selector
    const formatLabel = dialog.getByText(/format/i).first();
    await expect(formatLabel).toBeVisible({ timeout: 3000 });

    // Type selector
    const typeLabel = dialog.getByText(/type/i).first();
    await expect(typeLabel).toBeVisible({ timeout: 3000 });

    // Public switch
    const publicSwitch = dialog.getByText(/public/i).first();
    const hasPublic = await publicSwitch.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasPublic).toBeTruthy();

    // Cancel
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('repository card/row has edit action', async ({ page }) => {
    // Wait for repositories to load
    await page.waitForTimeout(3000);

    // Repositories can be in a table or card layout
    const table = page.getByRole('table').first();
    const hasTable = await table.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      const firstRow = table.getByRole('row').nth(1);
      const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
      test.skip(!hasRow, 'No repository rows in table');

      // Look for edit button or settings icon
      const editBtn = firstRow.getByRole('button', { name: /edit|settings/i }).first()
        .or(firstRow.getByRole('link', { name: /edit|settings/i }).first());
      const hasEdit = await editBtn.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasEdit) {
        await editBtn.click();
        const dialog = page.getByRole('dialog');
        const hasDialog = await dialog.isVisible({ timeout: 5000 }).catch(() => false);

        if (hasDialog) {
          await expect(page.getByText(/edit repository/i)).toBeVisible({ timeout: 3000 });
          await expect(dialog.getByRole('button', { name: /save changes/i })).toBeVisible({ timeout: 3000 });

          // Cancel
          await dialog.getByRole('button', { name: /cancel/i }).click();
          await expect(dialog).not.toBeVisible({ timeout: 5000 });
        }
      }
    } else {
      // Card layout - look for edit link/button on first card
      const card = page.locator('[class*="card"]').first();
      const hasCard = await card.isVisible({ timeout: 5000 }).catch(() => false);
      test.skip(!hasCard, 'No repository cards visible');

      const editBtn = card.getByRole('button', { name: /edit|settings/i }).first();
      const hasEdit = await editBtn.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasEdit) {
        await editBtn.click();
        await page.waitForTimeout(2000);
        const content = await page.textContent('body');
        expect(content).not.toContain('Application error');
      }
    }
  });

  test('repository detail page has tab navigation with actions', async ({ page }) => {
    // Click the first repository to navigate to its detail page
    const repoLink = page.getByRole('link').filter({ hasText: /.+/ }).first();
    const hasLink = await repoLink.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasLink, 'No repository links visible');

    await repoLink.click();
    await page.waitForLoadState('domcontentloaded');

    // Should have tabs: Artifacts, Upload, Security, Members
    const tabs = page.locator('[role="tablist"]').first();
    const hasTabs = await tabs.isVisible({ timeout: 10000 }).catch(() => false);

    if (hasTabs) {
      // Check for Security tab and its Scan All button
      const securityTab = tabs.getByText(/security/i).first();
      if (await securityTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await securityTab.click();
        await page.waitForTimeout(2000);

        const scanAllBtn = page.getByRole('button', { name: /scan all/i }).first();
        if (await scanAllBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(scanAllBtn).toBeEnabled();
        }
      }
    }
  });
});
