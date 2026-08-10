import {
  test,
  expect,
  filterCriticalErrors,
  navigateTo,
} from '../../../fixtures/test-fixtures';

/**
 * Per-repo "Setup" tab (PR #744, issue #560): the repository detail page has a
 * Setup tab (Rocket icon) rendering the format-aware RepoSetupGuide — client
 * variants (Maven/Gradle/SBT) for JVM repos, flat steps for e.g. Docker — with
 * the repo key embedded in every snippet and a CopyButton per code block.
 */

/** Open the Setup tab on a repo detail page and return the active panel. */
async function openSetupTab(page: import('@playwright/test').Page, repoKey: string) {
  await navigateTo(page, `/repositories/${repoKey}`);
  const setupTab = page.getByRole('tab', { name: 'Setup' });
  await expect(setupTab).toBeVisible({ timeout: 10000 });
  await setupTab.click();
  const panel = page.getByRole('tabpanel', { name: 'Setup' });
  await expect(
    panel.getByText(/Configure your tools to publish to and install from/)
  ).toBeVisible({ timeout: 10000 });
  return panel;
}

test.describe('Repository Setup tab', () => {
  test('maven repo shows client-variant guide with repo key in snippets', async ({
    page,
  }) => {
    const panel = await openSetupTab(page, 'e2e-maven-local');

    // Intro line names the repository.
    await expect(panel).toContainText('e2e-maven-local');

    // JVM formats render one tab per client tool, defaulting to Maven.
    for (const label of ['Maven', 'Gradle (Groovy)', 'Gradle (Kotlin)', 'SBT']) {
      await expect(panel.getByRole('tab', { name: label })).toBeVisible();
    }

    // Default (Maven) variant: settings.xml snippet uses the repo key as the
    // server id and the pom snippet points at /maven/<key>/.
    await expect(
      panel.getByRole('heading', { name: 'Configure settings.xml' })
    ).toBeVisible();
    await expect(panel).toContainText('<id>e2e-maven-local</id>');
    await expect(panel).toContainText('/maven/e2e-maven-local/');

    // Switching to another client swaps the snippet content.
    await panel.getByRole('tab', { name: 'Gradle (Groovy)' }).click();
    await expect(
      panel.getByRole('heading', { name: 'Add repository to build.gradle' })
    ).toBeVisible({ timeout: 10000 });
    await expect(panel).toContainText('/maven/e2e-maven-local/');

    // Every code block carries a Copy button (sr-only label "Copy").
    const copyButtons = panel.getByRole('button', { name: 'Copy' });
    expect(await copyButtons.count()).toBeGreaterThan(0);
    await expect(copyButtons.first()).toBeAttached();
  });

  test('docker repo shows flat step list with repo key in snippets', async ({
    page,
  }) => {
    const panel = await openSetupTab(page, 'e2e-docker-virtual');

    // Docker renders a flat step list — no client-variant tabs.
    await expect(panel.getByRole('tab')).toHaveCount(0);
    await expect(
      panel.getByRole('heading', { name: 'Login to registry' })
    ).toBeVisible();

    await expect(panel).toContainText('docker login');
    await expect(panel).toContainText('/e2e-docker-virtual/my-image:latest');

    const copyButtons = panel.getByRole('button', { name: 'Copy' });
    expect(await copyButtons.count()).toBeGreaterThan(0);
  });

  test('setup tab loads without console errors', async ({
    page,
    consoleErrors,
  }) => {
    await openSetupTab(page, 'e2e-maven-local');
    // Give late-loading queries a chance to surface errors.
    await page.waitForTimeout(1000);

    expect(filterCriticalErrors(consoleErrors)).toEqual([]);
  });
});
