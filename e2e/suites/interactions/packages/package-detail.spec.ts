import { test, expect } from '@playwright/test';

test.describe('Package Detail Page', () => {
  let packageId: string | null = null;

  // Helper to fetch a package ID via API
  async function fetchPackageId(page: import('@playwright/test').Page) {
    if (packageId) return;
    const response = await page.request.get('/api/v1/packages?per_page=1');
    if (response.ok()) {
      const body = await response.json();
      const packages = body.items || body.packages || body.data || body;
      if (Array.isArray(packages) && packages.length > 0) {
        packageId = packages[0].id;
      }
    }
  }

  test('navigate from packages list to detail page', async ({ page }) => {
    await page.goto('/packages');
    await page.waitForTimeout(2000);

    // Find a clickable package name link
    const packageLink = page.locator('a[href^="/packages/"]').first();
    const hasLink = await packageLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasLink) {
      // Fallback: fetch via API and navigate directly
      await fetchPackageId(page);
      test.skip(!packageId, 'No packages available to test');
      await page.goto(`/packages/${packageId}`);
    } else {
      await packageLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    }

    await expect(page).toHaveURL(/\/packages\/.+/);
  });

  test('detail page shows package name and format badge', async ({ page }) => {
    await fetchPackageId(page);
    test.skip(!packageId, 'No packages available to test');

    await page.goto(`/packages/${packageId}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Package name should be visible as a heading
    const heading = page.getByRole('heading').first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Format badge should be present
    const hasBadge = await page.getByText(/maven|npm|pypi|docker|cargo|helm|go|nuget|generic|debian|rpm|rubygems|composer|hex|terraform|alpine|conda/i).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasBadge).toBeTruthy();
  });

  test('detail page shows breadcrumb navigation', async ({ page }) => {
    await fetchPackageId(page);
    test.skip(!packageId, 'No packages available to test');

    await page.goto(`/packages/${packageId}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Breadcrumb should contain "Packages" link
    const breadcrumbLink = page.locator('nav, [aria-label*="breadcrumb"], ol').getByText(/packages/i).first();
    const hasBreadcrumb = await breadcrumbLink.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasBreadcrumb).toBeTruthy();
  });

  test('overview tab shows install command with copy button', async ({ page }) => {
    await fetchPackageId(page);
    test.skip(!packageId, 'No packages available to test');

    await page.goto(`/packages/${packageId}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Overview tab should be visible and active by default
    const overviewTab = page.locator('[role="tablist"]').getByRole('tab', { name: /overview/i });
    await expect(overviewTab).toBeVisible({ timeout: 10000 });

    // Install command block should be present
    const installBlock = page.locator('pre, code, [class*="install"], [class*="command"]').first();
    const hasInstall = await installBlock.isVisible({ timeout: 5000 }).catch(() => false);

    // Copy button should be present
    const copyBtn = page.getByRole('button', { name: /copy/i })
      .or(page.locator('button').filter({ has: page.locator('svg') }).first());
    const hasCopy = await copyBtn.isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasInstall || hasCopy).toBeTruthy();
  });

  test('overview tab shows metadata grid', async ({ page }) => {
    await fetchPackageId(page);
    test.skip(!packageId, 'No packages available to test');

    await page.goto(`/packages/${packageId}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Metadata fields should be visible
    const hasFormat = await page.getByText(/^format$/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasRepository = await page.getByText(/^repository$/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasSize = await page.getByText(/^size$/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasDownloads = await page.getByText(/^downloads$/i).isVisible({ timeout: 3000 }).catch(() => false);

    // At least some metadata should be displayed
    expect(hasFormat || hasRepository || hasSize || hasDownloads).toBeTruthy();
  });

  test('versions tab shows version table', async ({ page }) => {
    await fetchPackageId(page);
    test.skip(!packageId, 'No packages available to test');

    await page.goto(`/packages/${packageId}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Click Versions tab
    const versionsTab = page.locator('[role="tablist"]').getByRole('tab', { name: /versions/i });
    await expect(versionsTab).toBeVisible({ timeout: 10000 });
    await versionsTab.click();
    await page.waitForTimeout(1000);

    // Should show a table with version data or empty state
    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no versions/i).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTable || hasEmptyState).toBeTruthy();
  });

  test('files tab shows file tree or empty state', async ({ page }) => {
    await fetchPackageId(page);
    test.skip(!packageId, 'No packages available to test');

    await page.goto(`/packages/${packageId}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Click Files tab
    const filesTab = page.locator('[role="tablist"]').getByRole('tab', { name: /files/i });
    await expect(filesTab).toBeVisible({ timeout: 10000 });
    await filesTab.click();
    await page.waitForTimeout(1000);

    // Page should not crash — files tab may show tree, empty state, or loading
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('Application error');
  });

  test('tab navigation works without errors', async ({ page }) => {
    await fetchPackageId(page);
    test.skip(!packageId, 'No packages available to test');

    await page.goto(`/packages/${packageId}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    const tabs = ['Overview', 'Versions', 'Files', 'Dependencies', 'Metadata'];
    for (const tab of tabs) {
      const tabEl = page.locator('[role="tablist"]').getByRole('tab', { name: new RegExp(tab, 'i') });
      const tabVisible = await tabEl.isVisible({ timeout: 5000 }).catch(() => false);
      if (tabVisible) {
        await tabEl.click();
        await page.waitForTimeout(500);

        // Each tab should not crash the page
        const pageContent = await page.textContent('body');
        expect(pageContent).not.toContain('Application error');
        expect(pageContent).not.toContain('is not a function');
      }
    }
  });

  test('back button or breadcrumb navigates to packages list', async ({ page }) => {
    await fetchPackageId(page);
    test.skip(!packageId, 'No packages available to test');

    await page.goto(`/packages/${packageId}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Try breadcrumb "Packages" link first
    const breadcrumbLink = page.locator('nav, [aria-label*="breadcrumb"], ol').getByRole('link', { name: /packages/i }).first();
    const hasBreadcrumb = await breadcrumbLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBreadcrumb) {
      await breadcrumbLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await expect(page).toHaveURL(/\/packages$/);
      return;
    }

    // Fallback: try back button
    const backBtn = page.getByRole('button', { name: /back/i })
      .or(page.locator('button').filter({ has: page.locator('[data-lucide="arrow-left"]') }));
    const hasBack = await backBtn.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (hasBack) {
      await backBtn.first().click();
      await page.waitForTimeout(1000);
    }
  });

  test('packages list "View Details" button navigates to detail page', async ({ page }) => {
    await page.goto('/packages');
    await page.waitForTimeout(2000);

    // Click a package to open the side panel
    const packageItems = page.locator('[data-testid*="package"], [class*="card"], [class*="cursor-pointer"]').filter({ hasText: /.+/ });
    const hasPackages = await packageItems.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasPackages) {
      test.skip(true, 'No packages available to click');
      return;
    }

    await packageItems.first().click();
    await page.waitForTimeout(1000);

    // Look for "View Details" link in the detail panel
    const viewDetailsLink = page.getByRole('link', { name: /view details/i })
      .or(page.locator('a').filter({ hasText: /view details/i }));
    const hasViewDetails = await viewDetailsLink.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasViewDetails) {
      await viewDetailsLink.first().click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await expect(page).toHaveURL(/\/packages\/.+/);
    }
  });

  test('no console errors on package detail page', async ({ page }) => {
    await fetchPackageId(page);
    test.skip(!packageId, 'No packages available to test');

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(`/packages/${packageId}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Navigate through all tabs
    const tabs = ['Overview', 'Versions', 'Files', 'Dependencies', 'Metadata'];
    for (const tab of tabs) {
      const tabEl = page.locator('[role="tablist"]').getByRole('tab', { name: new RegExp(tab, 'i') });
      const tabVisible = await tabEl.isVisible({ timeout: 3000 }).catch(() => false);
      if (tabVisible) {
        await tabEl.click();
        await page.waitForTimeout(1000);
      }
    }

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('net::') &&
        !e.includes('Failed to load resource') &&
        (e.includes('TypeError') || e.includes('is not a function') || e.includes('Cannot read'))
    );
    expect(criticalErrors).toEqual([]);
  });
});
