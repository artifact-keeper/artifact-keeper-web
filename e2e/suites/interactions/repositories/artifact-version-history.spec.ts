import { test, expect } from '@playwright/test';
import { ArtifactVersionsPage } from '../../../fixtures/page-objects';

/**
 * E2E coverage for the generic-artifact version-history UI (#571), backed by
 * artifact-keeper#2367:
 *   GET /api/v1/repositories/{key}/versions/{path}   — list revisions
 *   ?version=<rev|label|latest> on download/metadata — pin a revision
 *   versioning_enabled on the repository model        — per-repo opt-in
 *
 * The feature is opt-in on Generic/Mlmodel repos, so this suite seeds a
 * dedicated generic repo with `versioning_enabled: true`, uploads the same
 * path twice with different bytes to produce a two-revision history, and then
 * exercises both the API contract and the UI. UI assertions are best-effort
 * and skip when the admin-only surfaces aren't reachable; the API assertions
 * are the load-bearing ones.
 */
test.describe.serial('Generic artifact version history (#571)', () => {
  const REPO_KEY = 'e2e-generic-versioned';
  const ARTIFACT_PATH = 'configs/app-config.yaml';
  const V1_BYTES = 'version: 1\nname: config-v1\n';
  const V2_BYTES = 'version: 2\nname: config-v2\n';

  test.beforeAll(async ({ request }) => {
    // Create a generic repo opted into versioning. Ignore 409 on rerun; if the
    // repo already exists from a prior run, PATCH the flag on to be safe.
    await request.post('/api/v1/repositories', {
      data: {
        key: REPO_KEY,
        name: 'E2E Generic Versioned',
        format: 'generic',
        repo_type: 'local',
        versioning_enabled: true,
      },
    });
    await request
      .patch(`/api/v1/repositories/${REPO_KEY}`, {
        data: { versioning_enabled: true },
      })
      .catch(() => {});

    // Two different-bytes uploads of the same path => revisions 1 and 2.
    await request.put(`/api/v1/repositories/${REPO_KEY}/artifacts/${ARTIFACT_PATH}`, {
      data: V1_BYTES,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    await request.put(`/api/v1/repositories/${REPO_KEY}/artifacts/${ARTIFACT_PATH}`, {
      data: V2_BYTES,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/v1/repositories/${REPO_KEY}`).catch(() => {});
  });

  test('versions API lists revisions newest-first', async ({ request }) => {
    const resp = await request.get(
      `/api/v1/repositories/${REPO_KEY}/versions/${ARTIFACT_PATH}`
    );
    // A backend that predates #2367 (or a repo that never recorded history)
    // answers 404 — skip rather than fail so the suite is portable.
    if (resp.status() === 404) {
      test.skip(true, 'Versioning not available on this backend build');
      return;
    }
    expect(resp.ok(), `versions list failed: ${resp.status()}`).toBeTruthy();
    const body = await resp.json();
    expect(body.repository_key).toBe(REPO_KEY);
    expect(body.path).toBe(ARTIFACT_PATH);
    expect(Array.isArray(body.items)).toBeTruthy();
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    // Newest first.
    expect(body.items[0].revision).toBeGreaterThan(body.items[1].revision);
    // Every entry carries the fields the UI renders.
    for (const item of body.items) {
      expect(typeof item.revision).toBe('number');
      expect(typeof item.size_bytes).toBe('number');
      expect(typeof item.checksum_sha256).toBe('string');
      expect(typeof item.created_at).toBe('string');
    }
  });

  test('?version= pins the exact stored bytes of an old revision', async ({
    request,
  }) => {
    const list = await request.get(
      `/api/v1/repositories/${REPO_KEY}/versions/${ARTIFACT_PATH}`
    );
    if (list.status() === 404) {
      test.skip(true, 'Versioning not available on this backend build');
      return;
    }
    const items = (await list.json()).items as Array<{ revision: number }>;
    const oldest = items.reduce((min, v) => (v.revision < min.revision ? v : min));
    const newest = items.reduce((max, v) => (v.revision > max.revision ? v : max));

    const oldResp = await request.get(
      `/api/v1/repositories/${REPO_KEY}/download/${ARTIFACT_PATH}?version=${oldest.revision}`
    );
    expect(oldResp.ok()).toBeTruthy();
    expect(await oldResp.text()).toContain('config-v1');

    // HEAD (no selector) returns the newest bytes.
    const headResp = await request.get(
      `/api/v1/repositories/${REPO_KEY}/download/${ARTIFACT_PATH}`
    );
    expect(headResp.ok()).toBeTruthy();
    expect(await headResp.text()).toContain('config-v2');

    // Explicit newest revision matches HEAD.
    const newResp = await request.get(
      `/api/v1/repositories/${REPO_KEY}/download/${ARTIFACT_PATH}?version=${newest.revision}`
    );
    expect(newResp.ok()).toBeTruthy();
    expect(await newResp.text()).toContain('config-v2');
  });

  test('versioning_enabled round-trips on the repository model', async ({
    request,
  }) => {
    const get = await request.get(`/api/v1/repositories/${REPO_KEY}`);
    expect(get.ok()).toBeTruthy();
    const repo = await get.json();
    // Field is present and set from our seed (skip if the backend predates it).
    if (!('versioning_enabled' in repo)) {
      test.skip(true, 'Backend does not expose versioning_enabled');
      return;
    }
    expect(repo.versioning_enabled).toBe(true);
  });

  test('UI: version history renders in the artifact detail dialog', async ({
    page,
    request,
  }) => {
    const probe = await request.get(
      `/api/v1/repositories/${REPO_KEY}/versions/${ARTIFACT_PATH}`
    );
    if (probe.status() === 404) {
      test.skip(true, 'Versioning not available on this backend build');
      return;
    }

    const vp = new ArtifactVersionsPage(page);
    await vp.goto(`${REPO_KEY}?view=flat`);

    await expect(vp.artifactsTable).toBeVisible({ timeout: 15000 });

    const searchInput = page.getByPlaceholder(/search/i).first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('app-config.yaml');
      await page.waitForTimeout(1500);
    }

    const row = vp.artifactRow('app-config.yaml');
    if (!(await row.first().isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Artifact row not visible in table');
      return;
    }
    await row.first().click();

    // The Versions tab only shows for versioning-enabled generic repos.
    if (!(await vp.versionsTab.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Versions tab not visible (dialog layout changed?)');
      return;
    }
    await vp.versionsTab.click();

    await expect(vp.versionsSection).toBeVisible({ timeout: 5000 });
    const rowCount = await vp.versionRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(2);
    // The per-revision download control is present for the oldest revision.
    await expect(vp.downloadRevisionButton(1)).toBeVisible({ timeout: 5000 });
  });

  test('UI: settings tab exposes the versioning toggle (admin only)', async ({
    page,
  }) => {
    const vp = new ArtifactVersionsPage(page);
    await vp.goto(REPO_KEY);

    // Wait for the repo-detail tabs to hydrate before probing for the
    // admin-only Settings tab. `locator.isVisible()` is a non-retrying instant
    // check that ignores the `timeout` option, so calling it straight after
    // `domcontentloaded` raced the client render and made this test always
    // auto-skip. `waitFor` actually polls, so as admin we proceed and assert,
    // while a non-admin session (no Settings tab) still skips as intended.
    const settingsVisible = await vp.settingsTab
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (!settingsVisible) {
      test.skip(true, 'Settings tab not visible (requires admin); API tests cover the contract');
      return;
    }
    // Wait for the tab to actually become active before asserting on its
    // contents — the settings panel mounts asynchronously and the versioning
    // section only renders once the repository data has hydrated.
    await vp.openSettingsTab();

    await expect(vp.versioningHeading).toBeVisible({ timeout: 8000 });
    await expect(vp.versioningToggle).toBeVisible({ timeout: 5000 });
    // Seeded on, so the switch reflects the enabled state.
    await expect(vp.versioningToggle).toHaveAttribute('aria-checked', 'true', {
      timeout: 5000,
    });
  });
});
