import {
  test,
  expect,
  filterCriticalErrors,
  navigateTo,
} from '../../../fixtures/test-fixtures';
import type { Page, Locator } from '@playwright/test';

/**
 * Pub (Dart) setup-guide snippets (PR #748): Pub-format repositories get
 * Dart-specific steps in the repo detail Setup tab (PUB_HOSTED_URL,
 * `dart pub token add`, pubspec.yaml hosted block, `dart pub get`,
 * `dart pub publish`) instead of the generic curl upload/download fallback.
 * Uses the seeded `e2e-pub-local` repository.
 */

/** Open the Setup tab on a repo detail page and return the active panel. */
async function openSetupTab(page: Page, repoKey: string): Promise<Locator> {
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

test.describe('Pub repository Setup tab (#748)', () => {
  test('shows Dart tooling snippets with the repo key', async ({ page }) => {
    const panel = await openSetupTab(page, 'e2e-pub-local');

    // PUB_HOSTED_URL points the Dart client at /pub/<key>.
    await expect(
      panel.getByRole('heading', {
        name: 'Point the Dart client at this repository',
      })
    ).toBeVisible();
    await expect(panel).toContainText('PUB_HOSTED_URL');
    await expect(panel).toContainText('/pub/e2e-pub-local');

    // Token auth, pubspec hosted block, resolve, and publish steps.
    await expect(panel).toContainText('dart pub token add');
    await expect(panel).toContainText('hosted:');
    await expect(panel).toContainText('dart pub get');
    await expect(panel).toContainText('dart pub publish');
  });

  test('does not show the generic curl upload fallback', async ({ page }) => {
    const panel = await openSetupTab(page, 'e2e-pub-local');
    await expect(panel).toContainText('dart pub get');

    // The generic-format fallback (curl PUT to /api/v1/repositories/…) must
    // not render for a Pub repository.
    await expect(panel).not.toContainText('curl -X PUT');
    await expect(panel).not.toContainText('/api/v1/repositories/');
  });

  test('pub setup tab loads without console errors', async ({
    page,
    consoleErrors,
  }) => {
    await openSetupTab(page, 'e2e-pub-local');
    // Give late-loading queries a chance to surface errors.
    await page.waitForTimeout(1000);

    expect(filterCriticalErrors(consoleErrors)).toEqual([]);
  });
});
