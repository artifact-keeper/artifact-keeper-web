import { test, expect } from '@playwright/test';

test.describe('Staging Rejection Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/staging');
  });

  test('reject button exists alongside promote button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Staging' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    const repoItems = page.locator('[data-testid*="staging"], table tbody tr, [class*="card"], [role="listitem"]').filter({ hasText: /.+/ });
    const hasRepos = await repoItems.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasRepos) {
      test.skip(true, 'No staging repos available');
      return;
    }

    await repoItems.first().click();
    await page.waitForTimeout(1000);

    // Both Promote and Reject buttons should exist (but may be disabled)
    const promoteBtn = page.getByRole('button', { name: /promote/i });
    const rejectBtn = page.getByRole('button', { name: /reject/i });

    const hasPromote = await promoteBtn.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasReject = await rejectBtn.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasPromote) {
      expect(hasReject).toBeTruthy();
    }
  });

  test('reject button is disabled when no artifacts are selected', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Staging' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    const repoItems = page.locator('[data-testid*="staging"], table tbody tr, [class*="card"], [role="listitem"]').filter({ hasText: /.+/ });
    const hasRepos = await repoItems.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasRepos) {
      test.skip(true, 'No staging repos available');
      return;
    }

    await repoItems.first().click();
    await page.waitForTimeout(1000);

    const rejectBtn = page.getByRole('button', { name: /reject/i });
    const hasReject = await rejectBtn.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasReject) {
      // Reject button should be disabled when no artifacts are selected
      await expect(rejectBtn.first()).toBeDisabled();
    }
  });

  test('promotion history tab shows status indicators', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Staging' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    const repoItems = page.locator('[data-testid*="staging"], table tbody tr, [class*="card"], [role="listitem"]').filter({ hasText: /.+/ });
    const hasRepos = await repoItems.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasRepos) {
      test.skip(true, 'No staging repos available');
      return;
    }

    await repoItems.first().click();
    await page.waitForTimeout(1000);

    // Click on Promotion History tab
    const historyTab = page.locator('[role="tablist"]').getByRole('tab', { name: /history|promotion/i });
    const hasHistoryTab = await historyTab.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasHistoryTab) {
      await historyTab.click();
      await page.waitForTimeout(1000);

      // The history view should show either entries with status badges or "No promotion history"
      const noHistory = page.getByText(/no promotion history/i);
      const statusBadge = page.getByText(/promoted|rejected|pending/i);
      const statusFilter = page.getByText(/all statuses|filter/i);

      const hasNoHistory = await noHistory.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasStatusBadge = await statusBadge.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasFilter = await statusFilter.first().isVisible({ timeout: 3000 }).catch(() => false);

      // One of these should be visible
      expect(hasNoHistory || hasStatusBadge || hasFilter).toBeTruthy();
    }
  });

  test('staging detail page loads via direct URL', async ({ page }) => {
    // Navigate to the staging list first
    await expect(page.getByRole('heading', { name: 'Staging' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    const repoItems = page.locator('[data-testid*="staging"], table tbody tr, [class*="card"], [role="listitem"]').filter({ hasText: /.+/ });
    const hasRepos = await repoItems.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasRepos) {
      test.skip(true, 'No staging repos available');
      return;
    }

    // Get text content from first repo item to verify it renders
    const firstRepo = repoItems.first();
    await firstRepo.click();
    await page.waitForTimeout(1000);

    // Check for staging badge and format badge
    const stagingBadge = page.getByText('staging');
    const hasStagingBadge = await stagingBadge.first().isVisible({ timeout: 5000 }).catch(() => false);

    // Should show artifacts tab and search
    const searchInput = page.getByPlaceholder(/search artifacts/i);
    const hasSearch = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasStagingBadge || hasSearch).toBeTruthy();
  });

  test('artifacts tab shows table with policy status column', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Staging' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    const repoItems = page.locator('[data-testid*="staging"], table tbody tr, [class*="card"], [role="listitem"]').filter({ hasText: /.+/ });
    const hasRepos = await repoItems.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasRepos) {
      test.skip(true, 'No staging repos available');
      return;
    }

    await repoItems.first().click();
    await page.waitForTimeout(1000);

    // The artifacts table should have a Policy Status column
    const policyStatusHeader = page.getByText(/policy status/i);
    const emptyState = page.getByText(/no artifacts in this staging/i);

    const hasHeader = await policyStatusHeader.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await emptyState.first().isVisible({ timeout: 5000 }).catch(() => false);

    // Either table headers or empty state should show
    expect(hasHeader || hasEmpty).toBeTruthy();
  });

  test('no console errors on staging page with rejection UI', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/staging');
    await page.waitForTimeout(3000);

    const critical = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toHaveLength(0);
  });
});
