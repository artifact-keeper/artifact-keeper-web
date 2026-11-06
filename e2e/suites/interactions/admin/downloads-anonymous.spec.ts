import { test, expect } from '@playwright/test';
import { backendAtLeast, DOWNLOADER_FILTER_MIN } from '../../../../src/lib/backend-version';

/**
 * Downloads page filter on anonymous downloads (#1036, backend
 * artifact-keeper#4935). One artifact is downloaded once anonymously and once
 * as the admin, and the anonymous filter must list only the first.
 */
test.describe('Downloads: anonymous downloader filter', () => {
  const REPO_KEY = 'e2e-downloads-anon-local';

  test.beforeAll(async ({ request }) => {
    await request.post('/api/v1/repositories', {
      data: {
        key: REPO_KEY,
        name: 'E2E Downloads Anonymous',
        format: 'generic',
        repo_type: 'local',
        is_public: true,
      },
    });
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/v1/repositories/${REPO_KEY}`).catch(() => {});
  });

  test('picking Anonymous lists only the anonymous download', async ({ page, request, playwright, baseURL }) => {
    const health = await (await request.get('/health')).json();
    test.skip(
      !backendAtLeast(health.version, DOWNLOADER_FILTER_MIN),
      `Backend ${health.version} has no downloader filter (needs ${DOWNLOADER_FILTER_MIN})`
    );

    const path = `e2e/anon-${Date.now()}.txt`;
    const put = await request.put(`/api/v1/repositories/${REPO_KEY}/artifacts/${path}`, {
      data: 'anonymous downloader filter',
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    expect(put.ok(), `Upload failed: ${put.status()}`).toBeTruthy();
    const artifactId = (await put.json()).id as string;

    const downloadUrl = `/api/v1/repositories/${REPO_KEY}/download/${path}`;
    expect((await request.get(downloadUrl)).ok()).toBeTruthy();
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    try {
      expect((await anon.get(downloadUrl)).ok()).toBeTruthy();
    } finally {
      await anon.dispose();
    }

    await page.goto(`/downloads?artifact_id=${artifactId}`);
    const sent = page.waitForResponse((r) =>
      /\/api\/v1\/admin\/downloads\?.*downloader=anonymous/.test(r.url()),
    );
    await page.getByLabel('Downloader').click();
    await page.getByRole('option', { name: 'Anonymous only' }).click();
    await sent;

    await expect(page).toHaveURL(/downloader=anonymous/);
    await expect(page.getByLabel('User ID')).toBeDisabled();
    const rows = page.getByRole('table').getByRole('row');
    await expect(rows).toHaveCount(2, { timeout: 10000 });
    await expect(rows.nth(1)).toContainText('anonymous');
  });
});
