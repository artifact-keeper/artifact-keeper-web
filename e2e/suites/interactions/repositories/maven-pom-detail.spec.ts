import { test, expect } from '@playwright/test';

/**
 * A Maven POM row opens the artifact detail dialog (#1035 / #1123).
 *
 * In the grouped Maven browser every file row of a component opened the detail
 * dialog except the .pom, which was a bare download link, so the POM could not
 * be inspected or deleted from the UI. It is now an "Open details" button like
 * the others, with a separate download link next to it.
 *
 * The repository and its one component are owned by this test. Files go
 * through the Maven-native deploy endpoint so the catalog records the real GAV
 * the grouped listing is built from (see maven-grouped-browser.spec.ts, #665).
 */
test.describe('Maven POM detail dialog', () => {
  const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const KEY = `e2e-maven-pom-${RUN}`;
  const GROUP_ID = `com.example.pom${RUN}`;
  const ARTIFACT_ID = 'pom-detail';
  const VERSION = '1.0.0';
  const POM = `${ARTIFACT_ID}-${VERSION}.pom`;

  test.beforeEach(async ({ request }) => {
    const resp = await request.post('/api/v1/repositories', {
      data: { key: KEY, name: KEY, format: 'maven', repo_type: 'local', is_public: true },
    });
    expect(resp.ok(), `create ${KEY}: ${resp.status()} ${await resp.text()}`).toBeTruthy();

    const base = `${GROUP_ID.replaceAll('.', '/')}/${ARTIFACT_ID}/${VERSION}/${ARTIFACT_ID}-${VERSION}`;
    for (const [ext, body] of [
      ['pom', '<project><modelVersion>4.0.0</modelVersion></project>'],
      ['jar', 'jar-bytes'],
    ]) {
      const put = await request.put(`/maven/${KEY}/${base}.${ext}`, {
        data: body,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      expect(put.ok(), `deploy .${ext}: ${put.status()}`).toBeTruthy();
    }
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`/api/v1/repositories/${KEY}`).catch(() => {});
  });

  test('#1035: the POM row opens the detail dialog', async ({ page }) => {
    await page.goto(`/repositories/${KEY}?view=grouped`);
    const main = page.getByRole('main');
    const grouped = main.getByTestId('toggle-grouped');
    await expect(grouped).toBeVisible({ timeout: 15000 });
    if ((await grouped.getAttribute('aria-pressed')) !== 'true') await grouped.click();

    const row = main.locator(
      `[data-testid="maven-component-row"][data-gav="${GROUP_ID}:${ARTIFACT_ID}:${VERSION}"]`,
    );
    await expect(row).toBeVisible({ timeout: 15000 });
    const expand = row.locator('button[aria-expanded]');
    await expand.click();
    await expect(expand).toHaveAttribute('aria-expanded', 'true');

    const pomRow = row.getByTestId('maven-component-pom-file');
    await expect(pomRow).toHaveAttribute('data-filename', POM);
    // The one-click download stays, next to the button.
    await expect(pomRow.getByRole('link', { name: `Download ${POM}` })).toBeVisible();

    await pomRow.getByRole('button', { name: `Open details for ${POM}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    // The dialog is the POM's own: its path and its download URL end in the .pom.
    const details = dialog.getByRole('tabpanel', { name: 'Details' });
    await expect(details).toContainText(`${ARTIFACT_ID}/${VERSION}/${POM}`);
    await expect(details).toContainText(/Download URL\s*\S+\.pom/);
  });
});
