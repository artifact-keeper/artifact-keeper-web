import { test, expect, type Page } from '@playwright/test';

/**
 * #2793 — the repository-detail page chooses its default primary tab by format:
 * package-oriented formats (Maven/npm/PyPI/…) open on the Packages tab, where
 * their catalog lives, while RAW/Generic and container formats keep Artifacts.
 * An explicit `?tab=` deep-link overrides the format default.
 *
 * These assert the initially-active tab via Radix's `aria-selected` marker.
 * Each test skips gracefully when its seed repository is not present so the
 * suite is safe on constrained environments.
 */
test.describe('Repository detail default tab (#2793)', () => {
  async function repoExists(page: Page, key: string): Promise<boolean> {
    const res = await page.request.get(`/api/v1/repositories/${key}`);
    return res.ok();
  }

  /** Text label of the initially-selected primary tab. */
  async function activeTabLabel(page: Page): Promise<string> {
    const active = page
      .locator('[role="tablist"]')
      .first()
      .locator('[role="tab"][aria-selected="true"]')
      .first();
    await expect(active).toBeVisible({ timeout: 10000 });
    return ((await active.textContent()) || '').trim();
  }

  test('Maven (package-oriented) repo opens on the Packages tab', async ({ page }) => {
    const key = 'e2e-maven-local';
    test.skip(!(await repoExists(page, key)), `${key} not seeded`);

    await page.goto(`/repositories/${key}`);
    await page.waitForLoadState('domcontentloaded');

    expect(await activeTabLabel(page)).toMatch(/packages/i);
  });

  test('Generic (RAW) repo opens on the Artifacts tab', async ({ page }) => {
    const key = 'e2e-generic-versioned';
    test.skip(!(await repoExists(page, key)), `${key} not seeded`);

    await page.goto(`/repositories/${key}`);
    await page.waitForLoadState('domcontentloaded');

    expect(await activeTabLabel(page)).toMatch(/artifacts/i);
  });

  test('explicit ?tab=artifacts overrides the per-format default', async ({ page }) => {
    const key = 'e2e-maven-local';
    test.skip(!(await repoExists(page, key)), `${key} not seeded`);

    await page.goto(`/repositories/${key}?tab=artifacts`);
    await page.waitForLoadState('domcontentloaded');

    expect(await activeTabLabel(page)).toMatch(/artifacts/i);
  });
});
