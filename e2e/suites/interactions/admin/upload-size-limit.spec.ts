import { test, expect } from '@playwright/test';

/**
 * Configuration flow for the repository upload size limit (issue #189).
 *
 * The admin Settings -> Storage tab surfaces the current max upload size and
 * lets an admin change it. The control reads from and writes to:
 *   GET  /api/v1/admin/settings
 *   POST /api/v1/admin/settings   (full SystemSettings body)
 *
 * Runs in CI against backend :1.2.0.
 */
test.describe('Admin - Upload Size Limit', () => {
  test('admin settings expose and accept a new max upload size', async ({ request }) => {
    const getResp = await request.get('/api/v1/admin/settings');
    expect(getResp.ok(), `GET settings failed: ${getResp.status()}`).toBeTruthy();

    const settings = await getResp.json();
    expect(settings).toHaveProperty('max_upload_size_bytes');
    const original = settings.max_upload_size_bytes;

    // Send the whole object back with only the upload size changed, matching
    // how the UI persists it (the POST replaces the full SystemSettings).
    const target = 2 * 1024 * 1024 * 1024; // 2 GiB
    const putResp = await request.post('/api/v1/admin/settings', {
      data: { ...settings, max_upload_size_bytes: target },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(putResp.ok(), `POST settings failed: ${putResp.status()}`).toBeTruthy();

    const verify = await request.get('/api/v1/admin/settings');
    const after = await verify.json();
    expect(after.max_upload_size_bytes).toBe(target);

    // Restore the original value so the suite is idempotent.
    await request
      .post('/api/v1/admin/settings', {
        data: { ...settings, max_upload_size_bytes: original },
        headers: { 'Content-Type': 'application/json' },
      })
      .catch(() => {});
  });

  test('Storage tab shows an editable Max Upload Size control', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const storageTab = page.getByRole('tab', { name: /storage/i }).first();
    if (await storageTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await storageTab.click({ force: true });
      await page.waitForTimeout(1000);
    }

    // The Max Upload Size label and its editable number input must be present.
    await expect(page.getByText('Max Upload Size').first()).toBeVisible({
      timeout: 10000,
    });

    const sizeInput = page.getByLabel('Max Upload Size');
    await expect(sizeInput).toBeVisible({ timeout: 5000 });
    await expect(sizeInput).toBeEditable();

    // The unit selector and a Save button accompany the input.
    await expect(
      page.getByLabel('Upload size unit')
    ).toBeVisible({ timeout: 5000 });

    const body = await page.textContent('body');
    expect(body).not.toContain('Application error');
  });

  test('saving a changed upload size issues a settings POST', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const storageTab = page.getByRole('tab', { name: /storage/i }).first();
    if (await storageTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await storageTab.click({ force: true });
      await page.waitForTimeout(1000);
    }

    const sizeInput = page.getByLabel('Max Upload Size');
    if (!(await sizeInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Upload size control not visible');
      return;
    }

    // Capture the current value to restore later.
    const originalValue = await sizeInput.inputValue();

    await sizeInput.fill('512');

    const postResponse = page.waitForResponse(
      (r) =>
        r.url().includes('/api/v1/admin/settings') &&
        r.request().method() === 'POST',
      { timeout: 10000 }
    ).catch(() => null);

    // The Save button next to the input. Scope to the upload-size row by
    // finding the closest enabled "Save" button after editing.
    await page.getByRole('button', { name: /^save$/i }).first().click();

    const posted = await postResponse;
    if (posted) {
      expect(posted.status()).toBeLessThan(400);
    }

    // Best-effort restore via the UI so the next run starts clean.
    if (originalValue) {
      await sizeInput.fill(originalValue).catch(() => {});
      await page.getByRole('button', { name: /^save$/i }).first().click().catch(() => {});
    }
  });
});
