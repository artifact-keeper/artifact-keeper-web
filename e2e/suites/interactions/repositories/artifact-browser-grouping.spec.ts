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
  // Package-oriented formats (Maven/Gradle) now default to the Packages tab
  // (#2793), so select the Artifacts tab explicitly rather than assuming it is
  // the default. Clicking it is a no-op when it is already active.
  const artifactsTab = page
    .locator('[role="tablist"]')
    .getByText(/artifacts/i)
    .first();
  await expect(artifactsTab).toBeVisible({ timeout: 10000 });
  await artifactsTab.click();
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

  test('Docker grouped view keeps sizes and tag names on one line (#957)', async ({
    page,
  }) => {
    const key = await findRepoByFormat(page, ['docker']);
    test.skip(!key, 'No docker repository available');

    // The seeded repositories hold no images, so stub the grouped rollup with
    // the two rows #957 reported: a size that wrapped ("365.93" / "MB") and a
    // 71-character cosign signature tag that wrapped mid-token.
    const digest = `sha256:${'b'.repeat(64)}`;
    const sigTag = `sha256-${'a'.repeat(64)}.sig`;
    const row = (id: string, tag: string) => ({
      id,
      repository_key: key,
      image: 'edge/site-config',
      tag,
      manifest_digest: digest,
      total_size_bytes: 383_707_054,
      layer_count: 0,
      is_index: false,
      last_pushed_at: new Date().toISOString(),
    });
    await page.route(/\/api\/v1\/repositories\/[^/]+\/artifacts\?.*group_by=docker_tag/, (route) =>
      route.fulfill({
        json: {
          items: [],
          pagination: { page: 1, per_page: 20, total: 2, total_pages: 1 },
          docker_tags: [row('t1', '1.0.0'), row('t2', sigTag)],
          has_more: false,
        },
      }),
    );
    await gotoArtifactsTab(page, key!);

    const groupedBtn = page.getByTestId('toggle-grouped');
    if ((await groupedBtn.getAttribute('aria-pressed')) !== 'true') {
      await groupedBtn.click();
    }
    await expect(page.getByTestId('docker-tag-list')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('docker-tag-name')).toHaveCount(2);

    // Number of line boxes the element's text occupies: 1 when it fits on
    // one line, 2+ when it wraps ("365.93" / "MB").
    const lineCount = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set(
        Array.from(range.getClientRects()).map((r) => Math.round(r.top)),
      );
      return tops.size;
    };

    const sizes = page.getByTestId('docker-tag-size');
    const names = page.getByTestId('docker-tag-name');
    await expect(sizes.first()).toHaveText(/MB/);
    for (const cell of await sizes.all()) {
      expect(await cell.evaluate(lineCount)).toBe(1);
    }
    for (const name of await names.all()) {
      expect(await name.evaluate(lineCount)).toBe(1);
      // The full tag stays available on hover.
      expect(await name.getAttribute('title')).toBe(await name.textContent());
    }
    const header = page.getByRole('columnheader', { name: 'Last pushed' });
    expect(await header.evaluate(lineCount)).toBe(1);
  });

  // (The "Show layers" disclosure test was removed with the client-side
  // grouping: the grouped view now consumes the server's
  // `?group_by=docker_tag` rollup, which returns only tag rows — raw layer
  // blobs are inspected via Flat view.)

  // -------------------------------------------------------------------------
  // Non-groupable formats — toggle hidden
  // -------------------------------------------------------------------------

  test('Non-groupable repos (npm, helm, pypi) do NOT show the grouping toggle', async ({
    page,
  }) => {
    // `generic` is intentionally excluded: RAW/Generic repos now render the
    // browser toggle for the Flat/Tree folder view (#2791), so they are no
    // longer toggle-free. npm/helm/pypi remain neither groupable nor
    // tree-capable, so the toggle must still be absent for them.
    const key = await findRepoByFormat(page, ['npm', 'helm', 'pypi']);
    test.skip(!key, 'No non-groupable repository available');
    await gotoArtifactsTab(page, key!);

    const toggle = page.getByTestId('artifact-browser-toggle');
    expect(await toggle.isVisible({ timeout: 2000 }).catch(() => false)).toBe(
      false,
    );
  });

  // -------------------------------------------------------------------------
  // RAW/Generic — Flat/Tree folder-view toggle (#2791)
  // -------------------------------------------------------------------------

  test('Generic (RAW) repos show the Flat/Tree browser toggle (#2791)', async ({
    page,
  }) => {
    const key = await findRepoByFormat(page, ['generic']);
    test.skip(!key, 'No generic repository available');
    await gotoArtifactsTab(page, key!);

    await expect(page.getByTestId('artifact-browser-toggle')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('toggle-flat')).toBeVisible();
    await expect(page.getByTestId('toggle-tree')).toBeVisible();
  });
});
