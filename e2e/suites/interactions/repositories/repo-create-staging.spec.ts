import { test, expect } from '@playwright/test';

test.describe.serial('Staging Repository Creation', () => {
  test('create dialog shows staging in type dropdown', async ({ page }) => {
    await page.goto('/repositories');
    await page.waitForLoadState('domcontentloaded');

    const createBtn = page.getByRole('button', { name: /create repository/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click the Type select trigger (second select in the grid, after Format)
    const typeSelect = dialog.locator('button[role="combobox"]').nth(1);
    await expect(typeSelect).toBeVisible({ timeout: 5000 });
    await typeSelect.click();

    // Verify "Staging" option is visible in the dropdown
    const stagingOption = page.getByRole('option', { name: /staging/i });
    await expect(stagingOption).toBeVisible({ timeout: 5000 });

    // Close by pressing Escape
    await page.keyboard.press('Escape');
    // Close dialog
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('selecting staging type shows inline hint', async ({ page }) => {
    await page.goto('/repositories');
    await page.waitForLoadState('domcontentloaded');

    const createBtn = page.getByRole('button', { name: /create repository/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click the Type select trigger
    const typeSelect = dialog.locator('button[role="combobox"]').nth(1);
    await typeSelect.click();

    // Select "Staging"
    await page.getByRole('option', { name: /staging/i }).click();

    // Verify hint text is visible
    await expect(dialog.getByText(/staging repos hold artifacts for review/i)).toBeVisible({ timeout: 5000 });

    // Verify upstream URL field is NOT visible
    await expect(dialog.getByLabel(/upstream url/i)).not.toBeVisible({ timeout: 3000 });

    // Close dialog
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('switching from staging to remote hides hint and shows upstream URL', async ({ page }) => {
    await page.goto('/repositories');
    await page.waitForLoadState('domcontentloaded');

    const createBtn = page.getByRole('button', { name: /create repository/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Select "Staging" type
    const typeSelect = dialog.locator('button[role="combobox"]').nth(1);
    await typeSelect.click();
    await page.getByRole('option', { name: /staging/i }).click();

    // Verify hint is visible
    await expect(dialog.getByText(/staging repos hold artifacts for review/i)).toBeVisible({ timeout: 5000 });

    // Switch to "Remote" type
    await typeSelect.click();
    await page.getByRole('option', { name: /remote/i }).click();

    // Verify hint is NOT visible
    await expect(dialog.getByText(/staging repos hold artifacts for review/i)).not.toBeVisible({ timeout: 3000 });

    // Verify upstream URL field IS visible
    await expect(dialog.getByLabel(/upstream url/i)).toBeVisible({ timeout: 5000 });

    // Close dialog
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('can create a staging repository', async ({ page }) => {
    await page.goto('/repositories');
    await page.waitForLoadState('domcontentloaded');

    const createBtn = page.getByRole('button', { name: /create repository/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill key
    const keyInput = dialog.getByLabel(/key/i).first();
    await keyInput.fill('e2e-staging-test');

    // Fill name
    const nameInput = dialog.getByLabel(/name/i).first();
    await nameInput.fill('E2E Staging Test');

    // Select format: Maven
    const formatSelect = dialog.locator('button[role="combobox"]').nth(0);
    await formatSelect.click();
    const mavenOption = page.getByRole('option', { name: /^maven$/i });
    const hasMaven = await mavenOption.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasMaven) {
      await mavenOption.click();
    } else {
      // Close format dropdown and proceed with default
      await page.keyboard.press('Escape');
    }

    // Select type: Staging
    const typeSelect = dialog.locator('button[role="combobox"]').nth(1);
    await typeSelect.click();
    await page.getByRole('option', { name: /staging/i }).click();

    // Click Create button
    const submitBtn = dialog.getByRole('button', { name: /^create$/i });
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await submitBtn.click();

    // Wait for the toast to appear
    const toast = page.locator('[data-sonner-toast]').first();
    await expect(toast).toBeVisible({ timeout: 10000 });

    // Verify toast contains promotion rules text
    await expect(toast.getByText(/configure promotion rules/i)).toBeVisible({ timeout: 5000 });

    // Verify toast has "Go to Staging" action button
    await expect(toast.getByRole('button', { name: /go to staging/i })).toBeVisible({ timeout: 5000 });
  });

  test('staging repo appears in repository list with staging type', async ({ page }) => {
    await page.goto('/repositories');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the list to load
    await page.waitForTimeout(3000);

    // Look for the staging repo we created
    const repoEntry = page.getByText('e2e-staging-test').first();
    await expect(repoEntry).toBeVisible({ timeout: 10000 });

    // Verify "staging" type label is visible near it
    const stagingLabel = page.getByText('staging', { exact: true }).first();
    const hasStagingLabel = await stagingLabel.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasStagingLabel).toBeTruthy();
  });

  test('staging repo type filter works', async ({ page }) => {
    await page.goto('/repositories');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Find the type filter select (the second small select in the filter bar)
    // The type filter trigger has "All types" or a type name and width w-[100px]
    const typeFilterTrigger = page.locator('button[role="combobox"]').filter({ hasText: /all types|local|remote|virtual|staging/i }).first();
    const hasTypeFilter = await typeFilterTrigger.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTypeFilter) {
      await typeFilterTrigger.click();

      // Select "Staging" from the filter options
      const stagingFilterOption = page.getByRole('option', { name: /staging/i });
      await expect(stagingFilterOption).toBeVisible({ timeout: 5000 });
      await stagingFilterOption.click();

      // Wait for the filtered list to load
      await page.waitForTimeout(2000);

      // Verify our staging repo is visible
      await expect(page.getByText('e2e-staging-test').first()).toBeVisible({ timeout: 10000 });
    }
  });

  test.afterAll(async ({ request }) => {
    // Clean up the test repo
    await request.delete('/api/v1/repositories/e2e-staging-test').catch(() => {});
  });
});
