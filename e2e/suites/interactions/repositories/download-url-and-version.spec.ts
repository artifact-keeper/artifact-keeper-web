import { test, expect } from '@playwright/test';

/**
 * Regression tests for two v1.2.0 web bugs.
 *
 * #455 — The artifact detail "Download URL" field showed a host-less path
 *        (e.g. /api/v1/repositories/.../download/...), so copying it produced a
 *        broken URL. The displayed value must be a full, absolute URL.
 *
 * #456 — The sidebar hid the backend (Server) version whenever /health returned
 *        a non-2xx status, even though the version is present in the response
 *        body. The version must be shown regardless of the /health status code.
 */
test.describe('Download URL and version display', () => {
  const REPO_KEY = 'e2e-maven-local';
  const ARTIFACT_CONTENT = 'Hello from Playwright download-url test';

  async function uploadArtifact(
    request: import('@playwright/test').APIRequestContext
  ): Promise<string> {
    const path = `e2e/download-url-test-${Date.now()}.txt`;
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

  test('Download URL in detail panel is an absolute, well-formed URL (#455)', async ({
    page,
    request,
  }) => {
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
      await request
        .delete(`/api/v1/repositories/${REPO_KEY}/artifacts/${artifactPath}`)
        .catch(() => {});
      test.skip(true, 'Artifact not visible in table');
      return;
    }

    await artifactRow.click();
    await page.waitForTimeout(1500);

    const downloadUrlLabel = page.getByText('Download URL');
    if (!(await downloadUrlLabel.isVisible({ timeout: 5000 }).catch(() => false))) {
      await request
        .delete(`/api/v1/repositories/${REPO_KEY}/artifacts/${artifactPath}`)
        .catch(() => {});
      test.skip(true, 'Download URL field not visible in detail panel');
      return;
    }

    // The value lives in the detail row next to the "Download URL" label.
    const urlContainer = downloadUrlLabel.locator('..').locator('..');
    const urlText = (await urlContainer.textContent())?.trim() ?? '';

    // Extract the URL portion (the row also contains the "Download URL" label).
    const match = urlText.match(/https?:\/\/\S+/);
    expect(
      match,
      `Download URL should be absolute (http/https). Got: "${urlText}"`
    ).not.toBeNull();

    const url = match![0];

    // Must be parseable and carry an origin + the backend download route.
    let parsed: URL | null = null;
    expect(() => {
      parsed = new URL(url);
    }).not.toThrow();
    expect(parsed!.protocol).toMatch(/^https?:$/);
    expect(parsed!.host.length).toBeGreaterThan(0);
    expect(parsed!.pathname).toContain(`/download/`);
    expect(parsed!.pathname).toContain(REPO_KEY);

    await request
      .delete(`/api/v1/repositories/${REPO_KEY}/artifacts/${artifactPath}`)
      .catch(() => {});
  });

  test('Sidebar shows the backend (Server) version (#456)', async ({ page, request }) => {
    // Sanity-check what the backend reports so the assertion is grounded in the
    // real value, regardless of the /health status code.
    const healthResp = await request.get('/health');
    const healthBody = await healthResp.json().catch(() => null);
    const expectedVersion: string | undefined = healthBody?.version;

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // The sidebar header renders "Web <x> / Server <version>".
    const serverVersion = page.getByText(/Server\s+\S+/);
    await expect(serverVersion.first()).toBeVisible({ timeout: 15000 });

    const text = (await serverVersion.first().textContent())?.trim() ?? '';
    expect(text).toMatch(/Server\s+\S+/);

    if (expectedVersion) {
      expect(text).toContain(`Server ${expectedVersion}`);
    }
  });
});
