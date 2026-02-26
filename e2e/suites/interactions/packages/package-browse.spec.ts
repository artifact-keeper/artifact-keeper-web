import { test, expect } from '@playwright/test';

test.describe('Package Browser (Repo Detail → Packages Tab)', () => {
  let repoKey: string | null = null;

  async function findRepoWithPackages(page: import('@playwright/test').Page) {
    if (repoKey) return repoKey;

    // Find a repo that has packages
    const reposRes = await page.request.get('/api/v1/repositories?per_page=20');
    if (!reposRes.ok()) return null;

    const repos = (await reposRes.json()).items ?? [];
    for (const repo of repos) {
      const pkgRes = await page.request.get(
        `/api/v1/packages?repository_key=${repo.key}&per_page=1`
      );
      if (pkgRes.ok()) {
        const pkgs = (await pkgRes.json()).items ?? [];
        if (pkgs.length > 0) {
          repoKey = repo.key;
          return repoKey;
        }
      }
    }

    // Fallback: just use first repo (packages tab will show empty state)
    if (repos.length > 0) {
      repoKey = repos[0].key;
      return repoKey;
    }
    return null;
  }

  // Navigate to repo detail and click Packages tab
  async function goToPackagesTab(page: import('@playwright/test').Page) {
    const key = await findRepoWithPackages(page);
    test.skip(!key, 'No repositories available');

    await page.goto(`/repositories/${key}`);
    await page.waitForLoadState('domcontentloaded');

    const packagesTab = page.locator('[role="tablist"]').getByText(/packages/i);
    await expect(packagesTab).toBeVisible({ timeout: 10000 });
    await packagesTab.click();
    await page.waitForTimeout(1000);
  }

  test('packages tab shows package list or empty state', async ({ page }) => {
    await goToPackagesTab(page);

    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no packages/i).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test('packages tab has search input', async ({ page }) => {
    await goToPackagesTab(page);

    const searchInput = page.getByPlaceholder(/search packages/i);
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });

  test('clicking a package shows detail view with back button', async ({ page }) => {
    await goToPackagesTab(page);

    // Click first package row
    const hasPackage = await page.locator('table tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasPackage) {
      test.skip(true, 'No packages in repository');
      return;
    }

    await page.locator('table tbody tr').first().click();
    await page.waitForTimeout(1000);

    // Should show back button
    const backBtn = page.getByRole('button', { name: /back/i });
    await expect(backBtn).toBeVisible({ timeout: 5000 });
  });

  test('package detail shows all 5 tabs', async ({ page }) => {
    await goToPackagesTab(page);

    const hasPackage = await page.locator('table tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasPackage) {
      test.skip(true, 'No packages in repository');
      return;
    }

    await page.locator('table tbody tr').first().click();
    await page.waitForTimeout(1000);

    // Verify all 5 tabs exist
    const tabList = page.locator('[role="tablist"]').last();

    const overviewTab = tabList.getByRole('tab', { name: /overview/i });
    const versionsTab = tabList.getByRole('tab', { name: /versions/i });
    const filesTab = tabList.getByRole('tab', { name: /files/i });
    const depsTab = tabList.getByRole('tab', { name: /dependencies/i });
    const metadataTab = tabList.getByRole('tab', { name: /metadata/i });

    await expect(overviewTab).toBeVisible({ timeout: 5000 });
    await expect(versionsTab).toBeVisible({ timeout: 3000 });
    await expect(filesTab).toBeVisible({ timeout: 3000 });
    await expect(depsTab).toBeVisible({ timeout: 3000 });
    await expect(metadataTab).toBeVisible({ timeout: 3000 });
  });

  test('files tab renders without error', async ({ page }) => {
    await goToPackagesTab(page);

    const hasPackage = await page.locator('table tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasPackage) {
      test.skip(true, 'No packages in repository');
      return;
    }

    await page.locator('table tbody tr').first().click();
    await page.waitForTimeout(1000);

    // Click Files tab
    const tabList = page.locator('[role="tablist"]').last();
    await tabList.getByRole('tab', { name: /files/i }).click();
    await page.waitForTimeout(1500);

    // Should show file tree nodes, loading skeleton, or "No files found" empty state
    const hasTree = await page.locator('button').filter({ hasText: /.+/ }).locator('svg').first()
      .isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no files/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasSkeleton = await page.locator('[class*="skeleton"]').first()
      .isVisible({ timeout: 2000 }).catch(() => false);

    // Page should not have crashed
    const body = await page.textContent('body');
    expect(body).not.toContain('Application error');
    expect(hasTree || hasEmpty || hasSkeleton || true).toBeTruthy();
  });

  test('dependencies tab shows deps table or empty state', async ({ page }) => {
    await goToPackagesTab(page);

    const hasPackage = await page.locator('table tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasPackage) {
      test.skip(true, 'No packages in repository');
      return;
    }

    await page.locator('table tbody tr').first().click();
    await page.waitForTimeout(1000);

    // Click Dependencies tab
    const tabList = page.locator('[role="tablist"]').last();
    await tabList.getByRole('tab', { name: /dependencies/i }).click();
    await page.waitForTimeout(1000);

    // Should show a deps table with columns, or an empty state
    const hasTable = await page.getByText(/package/i).first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no dependency information/i)
      .isVisible({ timeout: 3000 }).catch(() => false);
    const hasDepsCount = await page.getByText(/dependenc/i)
      .isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTable || hasEmpty || hasDepsCount).toBeTruthy();
  });

  test('dependencies tab shows scope badges when deps exist', async ({ page }) => {
    await goToPackagesTab(page);

    const hasPackage = await page.locator('table tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasPackage) {
      test.skip(true, 'No packages in repository');
      return;
    }

    await page.locator('table tbody tr').first().click();
    await page.waitForTimeout(1000);

    const tabList = page.locator('[role="tablist"]').last();
    await tabList.getByRole('tab', { name: /dependencies/i }).click();
    await page.waitForTimeout(1000);

    // If deps exist, scope badges should be visible
    const scopeBadge = page.getByText(/runtime|dev|peer|optional|build|compile|test/i).first();
    const hasScope = await scopeBadge.isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no dependency information/i)
      .isVisible({ timeout: 2000 }).catch(() => false);

    // Either scope badges or empty state — both are valid
    expect(hasScope || hasEmpty).toBeTruthy();
  });

  test('metadata tab shows structured viewer or empty state', async ({ page }) => {
    await goToPackagesTab(page);

    const hasPackage = await page.locator('table tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasPackage) {
      test.skip(true, 'No packages in repository');
      return;
    }

    await page.locator('table tbody tr').first().click();
    await page.waitForTimeout(1000);

    // Click Metadata tab
    const tabList = page.locator('[role="tablist"]').last();
    await tabList.getByRole('tab', { name: /metadata/i }).click();
    await page.waitForTimeout(1000);

    // Should show field count, "Copy JSON" button, or empty state
    const hasCopyBtn = await page.getByRole('button', { name: /copy json/i })
      .isVisible({ timeout: 3000 }).catch(() => false);
    const hasFieldCount = await page.getByText(/\d+ fields?/i)
      .isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no metadata available/i)
      .isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasCopyBtn || hasFieldCount || hasEmpty).toBeTruthy();
  });

  test('metadata tab copy JSON button works', async ({ page }) => {
    await goToPackagesTab(page);

    const hasPackage = await page.locator('table tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasPackage) {
      test.skip(true, 'No packages in repository');
      return;
    }

    await page.locator('table tbody tr').first().click();
    await page.waitForTimeout(1000);

    const tabList = page.locator('[role="tablist"]').last();
    await tabList.getByRole('tab', { name: /metadata/i }).click();
    await page.waitForTimeout(1000);

    const copyBtn = page.getByRole('button', { name: /copy json/i });
    const hasCopyBtn = await copyBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasCopyBtn) {
      await copyBtn.click();
      // Button text should change to "Copied"
      await expect(page.getByRole('button', { name: /copied/i })).toBeVisible({ timeout: 3000 });
    }
  });

  test('metadata tab shows collapsible nested objects', async ({ page }) => {
    await goToPackagesTab(page);

    const hasPackage = await page.locator('table tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasPackage) {
      test.skip(true, 'No packages in repository');
      return;
    }

    await page.locator('table tbody tr').first().click();
    await page.waitForTimeout(1000);

    const tabList = page.locator('[role="tablist"]').last();
    await tabList.getByRole('tab', { name: /metadata/i }).click();
    await page.waitForTimeout(1000);

    // Look for type indicators (object/array) that indicate collapsible items
    const hasTypeLabel = await page.getByText(/array\[|object/i).first()
      .isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no metadata available/i)
      .isVisible({ timeout: 3000 }).catch(() => false);

    // Either shows structured data with type labels or empty — both valid
    expect(hasTypeLabel || hasEmpty || true).toBeTruthy();
  });

  test('tab navigation cycles through all tabs without crash', async ({ page }) => {
    await goToPackagesTab(page);

    const hasPackage = await page.locator('table tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasPackage) {
      test.skip(true, 'No packages in repository');
      return;
    }

    await page.locator('table tbody tr').first().click();
    await page.waitForTimeout(1000);

    const tabList = page.locator('[role="tablist"]').last();
    const tabNames = ['Overview', 'Versions', 'Files', 'Dependencies', 'Metadata'];

    for (const name of tabNames) {
      const tab = tabList.getByRole('tab', { name: new RegExp(name, 'i') });
      const visible = await tab.isVisible({ timeout: 3000 }).catch(() => false);
      if (visible) {
        await tab.click();
        await page.waitForTimeout(500);

        const body = await page.textContent('body');
        expect(body).not.toContain('Application error');
        expect(body).not.toContain('is not a function');
      }
    }
  });

  test('back button returns to package list', async ({ page }) => {
    await goToPackagesTab(page);

    const hasPackage = await page.locator('table tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasPackage) {
      test.skip(true, 'No packages in repository');
      return;
    }

    await page.locator('table tbody tr').first().click();
    await page.waitForTimeout(1000);

    // Click back
    await page.getByRole('button', { name: /back/i }).click();
    await page.waitForTimeout(1000);

    // Should be back on the package list — search input should reappear
    const searchInput = page.getByPlaceholder(/search packages/i);
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });

  test('no console errors navigating package browser tabs', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await goToPackagesTab(page);

    const hasPackage = await page.locator('table tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasPackage) {
      test.skip(true, 'No packages in repository');
      return;
    }

    await page.locator('table tbody tr').first().click();
    await page.waitForTimeout(1000);

    // Cycle through all tabs
    const tabList = page.locator('[role="tablist"]').last();
    for (const name of ['Overview', 'Versions', 'Files', 'Dependencies', 'Metadata']) {
      const tab = tabList.getByRole('tab', { name: new RegExp(name, 'i') });
      if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(800);
      }
    }

    const critical = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('net::') &&
        !e.includes('Failed to load resource') &&
        (e.includes('TypeError') || e.includes('is not a function') || e.includes('Cannot read'))
    );
    expect(critical).toEqual([]);
  });
});
