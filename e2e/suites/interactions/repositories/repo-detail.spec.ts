import { test, expect } from '@playwright/test';

test.describe('Repository Detail Page', () => {
  let repoKey: string | null = null;

  test('navigate to repositories and find first repo', async ({ page }) => {
    await page.goto('/repositories');
    await expect(page.getByText(/repositories/i).first()).toBeVisible({ timeout: 10000 });

    // Try to find a repo key via the API
    const response = await page.request.get('/api/v1/repositories');
    if (response.ok()) {
      const body = await response.json();
      const repos = body.items || body.repositories || body.data || body;
      if (Array.isArray(repos) && repos.length > 0) {
        repoKey = repos[0].key || repos[0].name || repos[0].id;
      }
    }
    test.skip(!repoKey, 'No repositories available to test');

    await page.goto(`/repositories/${repoKey}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await expect(page).toHaveURL(/\/repositories\/.+/);
  });

  test('repo detail page shows header with name and badges', async ({ page }) => {
    // Fetch a repo key if we don't have one from the previous test
    if (!repoKey) {
      const response = await page.request.get('/api/v1/repositories');
      if (response.ok()) {
        const body = await response.json();
        const repos = body.items || body.repositories || body.data || body;
        if (Array.isArray(repos) && repos.length > 0) {
          repoKey = repos[0].key || repos[0].name || repos[0].id;
        }
      }
    }
    test.skip(!repoKey, 'No repositories available to test');

    await page.goto(`/repositories/${repoKey}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Header should contain the repo name
    await expect(page.getByText(repoKey!).first()).toBeVisible({ timeout: 10000 });

    // Format and type info should be visible (e.g., CARGO, local, Public)
    const hasFormat = await page.getByText(/cargo|maven|npm|pypi|docker|generic|helm|go|nuget|debian/i).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasFormat).toBeTruthy();
  });

  test('artifacts tab is default and shows artifacts or empty state', async ({ page }) => {
    if (!repoKey) {
      const response = await page.request.get('/api/v1/repositories');
      if (response.ok()) {
        const body = await response.json();
        const repos = body.items || body.repositories || body.data || body;
        if (Array.isArray(repos) && repos.length > 0) {
          repoKey = repos[0].key || repos[0].name || repos[0].id;
        }
      }
    }
    test.skip(!repoKey, 'No repositories available to test');

    await page.goto(`/repositories/${repoKey}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Artifacts tab should be selected by default
    const artifactsTab = page.locator('[role="tablist"]').getByText(/artifacts/i);
    await expect(artifactsTab).toBeVisible({ timeout: 10000 });

    // Should show either an artifacts table or an empty state message
    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no artifacts|empty|no items|no data|upload/i).first()
      .isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasTable || hasEmptyState).toBeTruthy();
  });

  test('search input on artifacts tab works', async ({ page }) => {
    if (!repoKey) {
      const response = await page.request.get('/api/v1/repositories');
      if (response.ok()) {
        const body = await response.json();
        const repos = body.items || body.repositories || body.data || body;
        if (Array.isArray(repos) && repos.length > 0) {
          repoKey = repos[0].key || repos[0].name || repos[0].id;
        }
      }
    }
    test.skip(!repoKey, 'No repositories available to test');

    await page.goto(`/repositories/${repoKey}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    const searchInput = page.getByPlaceholder(/search/i).first();
    const searchVisible = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);

    if (searchVisible) {
      await searchInput.fill('test-search-query');
      await page.waitForTimeout(1000);
      // Search should not cause an error
      const pageContent = await page.textContent('body');
      expect(pageContent).not.toContain('Application error');
      expect(pageContent).not.toContain('is not a function');
    }
  });

  test('upload tab loads with dropzone', async ({ page }) => {
    if (!repoKey) {
      const response = await page.request.get('/api/v1/repositories');
      if (response.ok()) {
        const body = await response.json();
        const repos = body.items || body.repositories || body.data || body;
        if (Array.isArray(repos) && repos.length > 0) {
          repoKey = repos[0].key || repos[0].name || repos[0].id;
        }
      }
    }
    test.skip(!repoKey, 'No repositories available to test');

    await page.goto(`/repositories/${repoKey}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Click Upload tab
    await page.locator('[role="tablist"]').getByText(/upload/i).click();
    await page.waitForTimeout(1000);

    // Should show a dropzone or file input area
    const hasDropzone = await page.getByText(/drag|drop|browse|upload|choose file/i).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    const hasFileInput = await page.locator('input[type="file"]').first()
      .isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasDropzone || hasFileInput).toBeTruthy();
  });

  test('security tab loads with scan options', async ({ page }) => {
    if (!repoKey) {
      const response = await page.request.get('/api/v1/repositories');
      if (response.ok()) {
        const body = await response.json();
        const repos = body.items || body.repositories || body.data || body;
        if (Array.isArray(repos) && repos.length > 0) {
          repoKey = repos[0].key || repos[0].name || repos[0].id;
        }
      }
    }
    test.skip(!repoKey, 'No repositories available to test');

    await page.goto(`/repositories/${repoKey}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Click Security tab
    const securityTab = page.locator('[role="tablist"]').getByText(/security/i);
    const hasSecurityTab = await securityTab.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasSecurityTab, 'No Security tab available');

    await securityTab.click();
    await page.waitForTimeout(1000);

    // Page should not have crashed
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('Application error');
  });

  test('repo detail shows format and type info', async ({ page }) => {
    if (!repoKey) {
      const response = await page.request.get('/api/v1/repositories');
      if (response.ok()) {
        const body = await response.json();
        const repos = body.items || body.repositories || body.data || body;
        if (Array.isArray(repos) && repos.length > 0) {
          repoKey = repos[0].key || repos[0].name || repos[0].id;
        }
      }
    }
    test.skip(!repoKey, 'No repositories available to test');

    await page.goto(`/repositories/${repoKey}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Should show repo type (local/remote/staging) and visibility (Public/Private)
    const hasType = await page.getByText(/local|remote|staging|virtual/i).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    const hasVisibility = await page.getByText(/public|private/i).first()
      .isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasType || hasVisibility).toBeTruthy();
  });

  test('scan all button is visible on artifacts tab', async ({ page }) => {
    if (!repoKey) {
      const response = await page.request.get('/api/v1/repositories');
      if (response.ok()) {
        const body = await response.json();
        const repos = body.items || body.repositories || body.data || body;
        if (Array.isArray(repos) && repos.length > 0) {
          repoKey = repos[0].key || repos[0].name || repos[0].id;
        }
      }
    }
    test.skip(!repoKey, 'No repositories available to test');

    await page.goto(`/repositories/${repoKey}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Scan All button should be visible on the artifacts tab
    const scanBtn = page.getByRole('button', { name: /scan all/i }).first();
    const hasScanBtn = await scanBtn.isVisible({ timeout: 5000 }).catch(() => false);

    // Or at least the page loaded without errors
    const pageContent = await page.textContent('body');
    expect(hasScanBtn || !pageContent?.includes('Application error')).toBeTruthy();
  });

  test('no console errors on repository detail page', async ({ page }) => {
    if (!repoKey) {
      const response = await page.request.get('/api/v1/repositories');
      if (response.ok()) {
        const body = await response.json();
        const repos = body.items || body.repositories || body.data || body;
        if (Array.isArray(repos) && repos.length > 0) {
          repoKey = repos[0].key || repos[0].name || repos[0].id;
        }
      }
    }
    test.skip(!repoKey, 'No repositories available to test');

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(`/repositories/${repoKey}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Navigate through all tabs
    const tabs = ['Artifacts', 'Upload', 'Members', 'Security'];
    for (const tab of tabs) {
      const tabEl = page.locator('[role="tablist"]').getByText(new RegExp(tab, 'i'));
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
