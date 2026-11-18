import { test, expect } from '@playwright/test';

/**
 * The upload size limit on admin Settings -> Storage (issue #1132).
 *
 * The backend reports the limit in force on GET /api/v1/admin/settings and
 * refuses to change it there (artifact-keeper#5751): MAX_UPLOAD_SIZE sets it,
 * so the page shows it read-only.
 */
test.describe('Admin - Upload Size Limit', () => {
  test('admin settings report the upload limit and refuse to change it', async ({ request }) => {
    const getResp = await request.get('/api/v1/admin/settings');
    expect(getResp.ok(), `GET settings failed: ${getResp.status()}`).toBeTruthy();

    const settings = await getResp.json();
    expect(typeof settings.max_upload_size_bytes).toBe('number');
    const inForce = settings.max_upload_size_bytes;

    const postResp = await request.post('/api/v1/admin/settings', {
      data: { max_upload_size_bytes: inForce + 1024 * 1024 },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(postResp.status()).toBe(400);
    expect(await postResp.text()).toContain('MAX_UPLOAD_SIZE');

    const after = await (await request.get('/api/v1/admin/settings')).json();
    expect(after.max_upload_size_bytes).toBe(inForce);
  });

  test('Storage tab shows Max Upload Size read-only', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('tab', { name: /storage/i }).first().click({ timeout: 15000 });

    const uploadLimit = page.getByTestId('max-upload-size');
    await expect(uploadLimit).toBeVisible({ timeout: 10000 });
    await expect(uploadLimit).toBeDisabled();
    await expect(uploadLimit).not.toHaveValue(/^(Loading\.\.\.|Unavailable)?$/);
    await expect(page.getByText(/MAX_UPLOAD_SIZE environment variable/)).toBeVisible();
    await expect(page.getByLabel('Upload size unit')).toHaveCount(0);

    const body = await page.textContent('body');
    expect(body).not.toContain('Application error');
  });
});
