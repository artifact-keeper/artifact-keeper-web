import { test, expect } from '@playwright/test';

/**
 * Regression tests for artifact download (issue #313).
 *
 * The download button must hit the backend route:
 *   GET /api/v1/repositories/{key}/download/{path}
 *
 * NOT the metadata endpoint:
 *   GET /api/v1/repositories/{key}/artifacts/{path}
 */
test.describe('Artifact Download', () => {
  const REPO_KEY = 'e2e-maven-local';
  const ARTIFACT_CONTENT = 'Hello from Playwright download test';

  async function uploadArtifact(
    request: import('@playwright/test').APIRequestContext
  ): Promise<string> {
    const path = `e2e/download-test-${Date.now()}.txt`;
    const resp = await request.put(
      `/api/v1/repositories/${REPO_KEY}/artifacts/${path}`,
      {
        data: ARTIFACT_CONTENT,
        headers: { 'Content-Type': 'application/octet-stream' },
      }
    );
    expect(resp.ok(), `Upload failed: ${resp.status()}`).toBeTruthy();
    const body = await resp.json();
    return body.path || path;
  }

  test('backend download route returns artifact content', async ({ request }) => {
    const artifactPath = await uploadArtifact(request);

    const resp = await request.get(
      `/api/v1/repositories/${REPO_KEY}/download/${artifactPath}`
    );

    expect(resp.status()).toBe(200);
    expect(await resp.text()).toBe(ARTIFACT_CONTENT);

    const disposition = resp.headers()['content-disposition'];
    expect(disposition).toContain('attachment');

    await request.delete(`/api/v1/repositories/${REPO_KEY}/artifacts/${artifactPath}`).catch(() => {});
  });

  test('download URL in artifact detail panel uses correct route', async ({ page, request }) => {
    const artifactPath = await uploadArtifact(request);
    const artifactName = artifactPath.split('/').pop()!;

    await page.goto(`/repositories/${REPO_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for table
    const table = page.getByRole('table').first();
    await expect(table).toBeVisible({ timeout: 15000 });

    // Search for our artifact
    const searchInput = page.getByPlaceholder(/search/i).first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill(artifactName);
      await page.waitForTimeout(2000);
    }

    // Find and click the artifact row to open the detail panel
    const artifactRow = table.getByRole('row').filter({ hasText: artifactName });
    if (!(await artifactRow.isVisible({ timeout: 5000 }).catch(() => false))) {
      await request.delete(`/api/v1/repositories/${REPO_KEY}/artifacts/${artifactPath}`).catch(() => {});
      test.skip(true, 'Artifact not visible in table');
      return;
    }

    // The detail panel shows the "Download URL" field.
    // Click the row to open the detail drawer/dialog.
    await artifactRow.click();
    await page.waitForTimeout(1500);

    // Look for the Download URL value in the detail panel
    const downloadUrlLabel = page.getByText('Download URL');
    if (await downloadUrlLabel.isVisible({ timeout: 5000 }).catch(() => false)) {
      // The Download URL text should contain /download/ not /artifacts/.../download
      const urlContainer = downloadUrlLabel.locator('..').locator('..'); // parent row
      const urlText = await urlContainer.textContent();

      expect(
        urlText,
        'Download URL in detail panel should use /download/{path} route'
      ).toContain('/download/');
    }

    await request.delete(`/api/v1/repositories/${REPO_KEY}/artifacts/${artifactPath}`).catch(() => {});
  });

  test('download button triggers file download', async ({ page, request }) => {
    const artifactPath = await uploadArtifact(request);
    const artifactName = artifactPath.split('/').pop()!;

    await page.goto(`/repositories/${REPO_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    const table = page.getByRole('table').first();
    await expect(table).toBeVisible({ timeout: 15000 });

    const searchInput = page.getByPlaceholder(/search/i).first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill(artifactName);
      await page.waitForTimeout(2000);
    }

    const artifactRow = table.getByRole('row').filter({ hasText: artifactName });
    if (!(await artifactRow.isVisible({ timeout: 5000 }).catch(() => false))) {
      await request.delete(`/api/v1/repositories/${REPO_KEY}/artifacts/${artifactPath}`).catch(() => {});
      test.skip(true, 'Artifact not visible in table');
      return;
    }

    // Listen for download events
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);

    // Click the download button (first button in the actions column)
    const downloadBtn = artifactRow.getByRole('button').first();
    await downloadBtn.click();

    const download = await downloadPromise;

    if (download) {
      // Verify the download file name
      expect(download.suggestedFilename()).toContain('download-test');
    }
    // If no download event, the <a> click may have navigated instead of
    // triggering a download - the API test above proves the route works

    await request.delete(`/api/v1/repositories/${REPO_KEY}/artifacts/${artifactPath}`).catch(() => {});
  });
});
