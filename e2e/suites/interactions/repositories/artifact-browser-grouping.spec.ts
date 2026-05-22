import { test, expect, type Page } from '@playwright/test';

/**
 * E2E coverage for the artifact-browser grouping toggle (issues #254 + #330).
 *
 * Strategy: probe the live API for a repository of the format we want; if
 * none exists in the test environment, skip rather than fail.  Asserts the
 * VISIBLE contract of the toggle and the resulting grouped UI rather than
 * specific data — fixtures vary per environment.
 */

interface RepoSummary {
  key?: string;
  name?: string;
  id?: string;
  format?: string;
}

async function listRepos(page: Page): Promise<RepoSummary[]> {
  const res = await page.request.get('/api/v1/repositories?per_page=50');
  if (!res.ok()) return [];
  const body = await res.json();
  const items: unknown =
    (body as { items?: unknown }).items ??
    (body as { repositories?: unknown }).repositories ??
    body;
  return Array.isArray(items) ? (items as RepoSummary[]) : [];
}

async function findRepoByFormat(
  page: Page,
  formats: string[],
): Promise<string | null> {
  const repos = await listRepos(page);
  for (const r of repos) {
    if (!r.format) continue;
    if (formats.includes(r.format.toLowerCase())) {
      return r.key ?? r.name ?? r.id ?? null;
    }
  }
  return null;
}

async function gotoArtifactsTab(page: Page, repoKey: string): Promise<void> {
  await page.goto(`/repositories/${repoKey}`);
  await page.waitForLoadState('domcontentloaded');
  // The Artifacts tab is the default tab on repo detail
  await expect(
    page.locator('[role="tablist"]').getByText(/artifacts/i).first(),
  ).toBeVisible({ timeout: 10000 });
}

test.describe('Artifact Browser Grouping (#254 Maven, #330 Docker)', () => {
  // -------------------------------------------------------------------------
  // Maven / Gradle (#254) — server-side group_by=maven_component
  // -------------------------------------------------------------------------

  test('Maven repo shows the grouping toggle', async ({ page }) => {
    const key = await findRepoByFormat(page, ['maven', 'gradle']);
    test.skip(!key, 'No maven/gradle repository available');
    await gotoArtifactsTab(page, key!);

    const toggle = page.getByTestId('artifact-browser-toggle');
    await expect(toggle).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('toggle-flat')).toBeVisible();
    await expect(page.getByTestId('toggle-grouped')).toBeVisible();
  });

  test('Maven grouped view sends ?group_by=maven_component', async ({ page }) => {
    const key = await findRepoByFormat(page, ['maven', 'gradle']);
    test.skip(!key, 'No maven/gradle repository available');

    // Watch for the artifact request that carries the group_by parameter.
    const groupedRequest = page.waitForRequest(
      (req) =>
        req.url().includes(`/api/v1/repositories/${key}/artifacts`) &&
        req.url().includes('group_by=maven_component'),
      { timeout: 10000 },
    );

    await gotoArtifactsTab(page, key!);

    // Grouped is the default for groupable formats; if the toggle starts as
    // flat (e.g. user-overridden via stored state), click into grouped.
    const groupedBtn = page.getByTestId('toggle-grouped');
    if ((await groupedBtn.getAttribute('aria-pressed')) !== 'true') {
      await groupedBtn.click();
    }

    await expect(groupedRequest).resolves.toBeTruthy();
  });

  test('Maven grouped view renders GAV rows (or grouped-empty state)', async ({
    page,
  }) => {
    const key = await findRepoByFormat(page, ['maven', 'gradle']);
    test.skip(!key, 'No maven/gradle repository available');
    await gotoArtifactsTab(page, key!);

    const groupedBtn = page.getByTestId('toggle-grouped');
    if ((await groupedBtn.getAttribute('aria-pressed')) !== 'true') {
      await groupedBtn.click();
    }

    const list = page.getByTestId('maven-component-list');
    const empty = page.getByTestId('maven-component-list-empty');
    const loading = page.getByTestId('maven-component-list-loading');

    await Promise.race([
      list.waitFor({ state: 'visible', timeout: 10000 }),
      empty.waitFor({ state: 'visible', timeout: 10000 }),
      loading.waitFor({ state: 'visible', timeout: 10000 }),
    ]);

    const isList = await list.isVisible().catch(() => false);
    if (!isList) {
      // Empty / loading state is acceptable when the test repo has no artifacts
      return;
    }

    const rows = page.getByTestId('maven-component-row');
    expect(await rows.count()).toBeGreaterThan(0);

    // Expand the first row; its hidden file list should appear
    const first = rows.first();
    await expect(first).toHaveAttribute('data-gav', /.+:.+:.+/);
    const trigger = first.locator('button[aria-expanded]').first();
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(first.getByTestId('maven-component-files')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Docker (#330) — client-side aggregation by manifest tag
  // -------------------------------------------------------------------------

  test('Docker repo shows the "Group by tag" toggle', async ({ page }) => {
    const key = await findRepoByFormat(page, [
      'docker',
      'podman',
      'buildx',
      'oras',
      'helm_oci',
    ]);
    test.skip(!key, 'No docker repository available');
    await gotoArtifactsTab(page, key!);

    const toggle = page.getByTestId('artifact-browser-toggle');
    await expect(toggle).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole('button', { name: /group by tag/i }),
    ).toBeVisible();
  });

  test('Docker grouped view shows one row per tag with truncated digest, no raw blobs', async ({
    page,
  }) => {
    const key = await findRepoByFormat(page, ['docker']);
    test.skip(!key, 'No docker repository available');
    await gotoArtifactsTab(page, key!);

    const groupedBtn = page.getByTestId('toggle-grouped');
    // Docker defaults to grouped, but be defensive:
    if ((await groupedBtn.getAttribute('aria-pressed')) !== 'true') {
      await groupedBtn.click();
    }

    const list = page.getByTestId('docker-tag-list');
    const empty = page.getByTestId('docker-tag-list-empty');
    const loading = page.getByTestId('docker-tag-list-loading');
    await Promise.race([
      list.waitFor({ state: 'visible', timeout: 10000 }),
      empty.waitFor({ state: 'visible', timeout: 10000 }),
      loading.waitFor({ state: 'visible', timeout: 10000 }),
    ]);

    const visible = await list.isVisible().catch(() => false);
    if (!visible) return; // empty registry — nothing to assert

    const rows = page.getByTestId('docker-tag-row');
    expect(await rows.count()).toBeGreaterThan(0);

    // Each row must show a truncated digest (sha256:<≤12 chars>)
    // The full 64-char hex form must NOT be visible.
    const fullDigestRegex = /sha256:[0-9a-f]{64}/;
    const truncatedRegex = /sha256:[0-9a-f]{1,16}(?![0-9a-f])/;
    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(bodyText).not.toMatch(fullDigestRegex);
    expect(bodyText).toMatch(truncatedRegex);

    // Raw blob path "<image>/blobs/sha256:..." must NOT appear in default view.
    expect(bodyText).not.toMatch(/\/blobs\/sha256:[0-9a-f]/);
  });

  test('Docker grouped view: "Show layers" reveals hidden blobs', async ({ page }) => {
    const key = await findRepoByFormat(page, ['docker']);
    test.skip(!key, 'No docker repository available');
    await gotoArtifactsTab(page, key!);

    const groupedBtn = page.getByTestId('toggle-grouped');
    if ((await groupedBtn.getAttribute('aria-pressed')) !== 'true') {
      await groupedBtn.click();
    }

    const layersToggle = page.getByTestId('toggle-layers');
    if (!(await layersToggle.isVisible({ timeout: 3000 }).catch(() => false))) {
      // No hidden artifacts in this fixture — skip gracefully
      return;
    }

    await layersToggle.click();
    await expect(page.getByTestId('docker-layer-list')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Non-groupable formats — toggle hidden
  // -------------------------------------------------------------------------

  test('Non-groupable repos (npm, helm) do NOT show the grouping toggle', async ({
    page,
  }) => {
    const key = await findRepoByFormat(page, ['npm', 'helm', 'pypi', 'generic']);
    test.skip(!key, 'No non-groupable repository available');
    await gotoArtifactsTab(page, key!);

    const toggle = page.getByTestId('artifact-browser-toggle');
    expect(await toggle.isVisible({ timeout: 2000 }).catch(() => false)).toBe(
      false,
    );
  });
});
