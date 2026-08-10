import {
  test,
  expect,
  filterCriticalErrors,
  navigateTo,
} from '../../../fixtures/test-fixtures';
import type { Page, Locator } from '@playwright/test';

/**
 * Dashboard Statistics cards (PR #738):
 * "Storage Used" and "Artifacts" show local + remote (proxy cache) combined
 * totals, with a hover tooltip breaking down Local vs Remote. Proxy values
 * come from admin-stats fields `proxy_artifact_count` / `proxy_storage_bytes`
 * and default to 0 on older backends.
 */

/** The "Statistics" section of the dashboard (admin only). */
function statsSection(page: Page): Locator {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Statistics' }) });
}

/** A stat card within the Statistics section, located by its exact label. */
function statCard(page: Page, label: string): Locator {
  // Cards with a hover tooltip (Artifacts, Storage Used) are wrapped in a
  // Radix TooltipTrigger whose `asChild` Slot overrides the Card's
  // `data-slot="card"` with `data-slot="tooltip-trigger"` — match both.
  return statsSection(page)
    .locator('[data-slot="card"], [data-slot="tooltip-trigger"]')
    .filter({ has: page.getByText(label, { exact: true }) });
}

/** The numeric value paragraph of a stat card. */
function cardValue(card: Locator): Locator {
  return card.locator('p.text-2xl');
}

/** Mirror of src/lib/utils.ts formatBytes for the units we can encounter. */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '--';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.max(
    0,
    Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1)
  );
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

test.describe('Dashboard Statistics cards', () => {
  test('Statistics section renders with combined-total stat cards', async ({
    page,
  }) => {
    await navigateTo(page, '/');

    const section = statsSection(page);
    await expect(
      page.getByRole('heading', { name: 'Statistics' })
    ).toBeVisible({ timeout: 10000 });

    // All four stat cards render once admin-stats loads.
    for (const label of ['Repositories', 'Artifacts', 'Users', 'Storage Used']) {
      await expect(statCard(page, label)).toBeVisible({ timeout: 10000 });
    }

    // Artifacts shows a plain count.
    await expect(cardValue(statCard(page, 'Artifacts'))).toHaveText(/^\d+$/);

    // Storage Used shows a formatted byte size (e.g. "0 B", "1.5 MB").
    await expect(cardValue(statCard(page, 'Storage Used'))).toHaveText(
      /^\d+(\.\d+)?\s(B|KB|MB|GB|TB)$/
    );
    await expect(section).toBeVisible();
  });

  test('cards show combined local + remote totals from admin-stats', async ({
    page,
    adminApi,
  }) => {
    const response = await adminApi.get('/admin/stats');
    expect(response.ok()).toBeTruthy();
    const stats = await response.json();

    // Proxy fields are absent on older backends; the UI defaults them to 0.
    const expectedArtifacts =
      stats.total_artifacts + (stats.proxy_artifact_count ?? 0);
    const expectedStorage = formatBytes(
      stats.total_storage_bytes + (stats.proxy_storage_bytes ?? 0)
    );

    await navigateTo(page, '/');

    await expect(cardValue(statCard(page, 'Artifacts'))).toHaveText(
      String(expectedArtifacts),
      { timeout: 10000 }
    );
    await expect(cardValue(statCard(page, 'Storage Used'))).toHaveText(
      expectedStorage,
      { timeout: 10000 }
    );
  });

  test('hover shows Local/Remote breakdown tooltip on combined cards', async ({
    page,
  }) => {
    await navigateTo(page, '/');

    const tooltip = page.getByRole('tooltip');

    for (const label of ['Artifacts', 'Storage Used']) {
      const card = statCard(page, label);
      await expect(card).toBeVisible({ timeout: 10000 });
      await card.hover();

      // The tooltip always renders for these cards (StatBreakdown is passed
      // unconditionally); on a fresh seeded backend Remote is 0.
      await expect(tooltip).toBeVisible({ timeout: 10000 });
      await expect(tooltip).toContainText('Local');
      await expect(tooltip).toContainText('Remote');

      // Move off the card so the tooltip closes before hovering the next one.
      // (A single-jump mouse.move doesn't trigger Radix's pointer-leave
      // handling reliably — step the pointer out instead.)
      await page.mouse.move(0, 0, { steps: 20 });
      await expect(tooltip).toBeHidden({ timeout: 10000 });
    }
  });

  test('dashboard loads without console errors', async ({
    page,
    consoleErrors,
  }) => {
    await navigateTo(page, '/');
    await expect(
      page.getByRole('heading', { name: 'Statistics' })
    ).toBeVisible({ timeout: 10000 });
    // Give late-loading queries a chance to surface errors.
    await page.waitForTimeout(1000);

    expect(filterCriticalErrors(consoleErrors)).toEqual([]);
  });
});
