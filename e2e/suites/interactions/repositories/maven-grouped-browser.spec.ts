import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Regression tests for the Maven repository browser in GROUPED mode
 * (issues #443, #444, #445).
 *
 * #443 — pagination must render in grouped mode so users can reach page 2+
 *        instead of being stuck on the first 20 components.
 * #444 — clicking a file inside a GAV group must open the artifact detail
 *        dialog (this already worked in flat mode).
 * #445 — every file deployed for a GAV must be listed, including non-jar
 *        files such as .zip and the checksum sidecars.
 *
 * Strategy mirrors artifact-download.spec.ts: seed artifacts through the API,
 * then drive the real UI.  The repository `e2e-maven-local` is created by the
 * E2E seed step.
 */
test.describe('Maven Grouped Browser (#443, #444, #445)', () => {
  const REPO_KEY = 'e2e-maven-local';
  // Unique groupId per run so parallel/retried runs don't collide and so the
  // assertions are deterministic regardless of what else lives in the repo.
  const RUN = `g${Date.now()}`;
  const GROUP_PATH = `com/example/${RUN}`;
  const GROUP_ID = `com.example.${RUN}`;

  /** PUT one file at a full Maven coordinate path. */
  async function put(
    request: APIRequestContext,
    relPath: string,
    body: string,
  ): Promise<void> {
    const resp = await request.put(
      `/api/v1/repositories/${REPO_KEY}/artifacts/${relPath}`,
      { data: body, headers: { 'Content-Type': 'application/octet-stream' } },
    );
    expect(resp.ok(), `PUT ${relPath} failed: ${resp.status()}`).toBeTruthy();
  }

  /**
   * Deploy `count` distinct GAV components (one artifact + pom each) so the
   * grouped listing has more than one page at the default page size of 20.
   * Returns the list of artifactIds created.
   */
  async function seedManyComponents(
    request: APIRequestContext,
    count: number,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const artifactId = `lib-${i}`;
      const version = '1.0.0';
      const base = `${GROUP_PATH}/${artifactId}/${version}/${artifactId}-${version}`;
      await put(request, `${base}.jar`, `jar-${i}`);
      await put(request, `${base}.pom`, `<project>${i}</project>`);
      ids.push(artifactId);
    }
    return ids;
  }

  /**
   * Deploy a single GAV with a POM, a JAR, and a ZIP plus a checksum sidecar
   * so #445 can assert that non-jar files are listed.
   */
  async function seedGavWithZip(request: APIRequestContext): Promise<{
    artifactId: string;
    files: string[];
  }> {
    const artifactId = 'with-zip';
    const version = '2.0.0';
    const base = `${GROUP_PATH}/${artifactId}/${version}/${artifactId}-${version}`;
    const files = [
      `${artifactId}-${version}.pom`,
      `${artifactId}-${version}.jar`,
      `${artifactId}-${version}.zip`,
      `${artifactId}-${version}.jar.sha1`,
    ];
    await put(request, `${base}.pom`, '<project>zip</project>');
    await put(request, `${base}.jar`, 'jar-bytes');
    await put(request, `${base}.zip`, 'zip-bytes');
    await put(request, `${base}.jar.sha1`, 'abc123');
    return { artifactId, files };
  }

  async function gotoGrouped(
    page: import('@playwright/test').Page,
  ): Promise<void> {
    // `?view=grouped` forces grouped mode regardless of stored preference.
    await page.goto(`/repositories/${REPO_KEY}?view=grouped`);
    await page.waitForLoadState('domcontentloaded');
    const groupedBtn = page.getByTestId('toggle-grouped');
    await expect(groupedBtn).toBeVisible({ timeout: 10000 });
    if ((await groupedBtn.getAttribute('aria-pressed')) !== 'true') {
      await groupedBtn.click();
    }
  }

  test('#443: grouped mode renders pagination when there are many components', async ({
    page,
    request,
  }) => {
    // 25 components > default page size of 20, so a second page must exist.
    await seedManyComponents(request, 25);

    await gotoGrouped(page);

    const list = page.getByTestId('maven-component-list');
    await expect(list).toBeVisible({ timeout: 15000 });

    // The pagination control must be present (the bug: it was never rendered).
    const pagination = page.getByTestId('data-table-pagination');
    await expect(pagination).toBeVisible();

    // "Page 1 of N" with N >= 2 proves more than one page exists.
    await expect(pagination).toContainText(/page 1 of [2-9]\d*/i);

    // Navigating to the next page must update the indicator.
    const nextBtn = pagination.getByRole('button', { name: /next page/i });
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();
    await expect(pagination).toContainText(/page 2 of/i);
  });

  test('#444: clicking a file inside a grouped GAV opens artifact details', async ({
    page,
    request,
  }) => {
    const { artifactId } = await seedGavWithZip(request);

    await gotoGrouped(page);

    // The data-gav attribute lives on the <li> row itself; locate it directly.
    const gavRow = page.locator(
      `[data-testid="maven-component-row"][data-gav="${GROUP_ID}:${artifactId}:2.0.0"]`,
    );
    await expect(gavRow).toBeVisible({ timeout: 15000 });

    const trigger = gavRow.locator('button[aria-expanded]').first();
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const files = gavRow.getByTestId('maven-component-files');
    await expect(files).toBeVisible();

    // Click the .jar file row — this must open the detail dialog.
    const jarRow = files.getByText(`${artifactId}-2.0.0.jar`, { exact: true });
    await jarRow.click();

    // The detail dialog shows a "Download URL" field (see flat-mode detail).
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText(/download url/i)).toBeVisible();
  });

  test('#445: grouped mode lists all GAV files including the .zip and checksums', async ({
    page,
    request,
  }) => {
    const { artifactId, files } = await seedGavWithZip(request);

    await gotoGrouped(page);

    const gavRow = page.locator(
      `[data-testid="maven-component-row"][data-gav="${GROUP_ID}:${artifactId}:2.0.0"]`,
    );
    await expect(gavRow).toBeVisible({ timeout: 15000 });

    const trigger = gavRow.locator('button[aria-expanded]').first();
    await trigger.click();

    const fileList = gavRow.getByTestId('maven-component-files');
    await expect(fileList).toBeVisible();

    // Every deployed file must appear, crucially the non-jar .zip and the
    // checksum sidecar that the bug report said were missing.
    for (const f of files) {
      await expect(
        fileList.getByText(f, { exact: true }),
        `file ${f} should be listed in the GAV group`,
      ).toBeVisible();
    }

    // The file-count badge on the collapsed summary must reflect all 4 files.
    await expect(gavRow).toContainText('4 files');
  });
});
