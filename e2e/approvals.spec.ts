import { test, expect } from '@playwright/test';

test.describe('Approval Queue Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/approvals');
  });

  test('page loads with Approval Queue heading', async ({ page }) => {
    await expect(page.getByText(/approval queue/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('stat cards are visible', async ({ page }) => {
    await expect(page.getByText(/approval queue/i).first()).toBeVisible({ timeout: 10000 });

    const pendingLabel = page.getByText(/pending requests/i);
    const approvedLabel = page.getByText(/approved/i);
    const rejectedLabel = page.getByText(/rejected/i);

    const hasPending = await pendingLabel.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasApproved = await approvedLabel.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasRejected = await rejectedLabel.first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasPending || hasApproved || hasRejected).toBeTruthy();
  });

  test('pending and history tabs are visible', async ({ page }) => {
    await expect(page.getByText(/approval queue/i).first()).toBeVisible({ timeout: 10000 });

    const pendingTab = page.getByRole('tab', { name: /pending/i });
    const historyTab = page.getByRole('tab', { name: /history/i });

    await expect(pendingTab).toBeVisible({ timeout: 5000 });
    await expect(historyTab).toBeVisible({ timeout: 5000 });
  });

  test('pending tab is active by default', async ({ page }) => {
    await expect(page.getByText(/approval queue/i).first()).toBeVisible({ timeout: 10000 });

    const pendingTab = page.getByRole('tab', { name: /pending/i });
    await expect(pendingTab).toHaveAttribute('data-state', 'active', { timeout: 5000 });
  });

  test('pending tab shows table or empty state', async ({ page }) => {
    await expect(page.getByText(/approval queue/i).first()).toBeVisible({ timeout: 10000 });

    // Either the data table with columns or the empty state message
    const tableHeader = page.getByText(/artifact|promotion path/i);
    const emptyState = page.getByText(/no pending approvals/i);

    const hasTable = await tableHeader.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await emptyState.first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test('switching to history tab works', async ({ page }) => {
    await expect(page.getByText(/approval queue/i).first()).toBeVisible({ timeout: 10000 });

    const historyTab = page.getByRole('tab', { name: /history/i });
    await historyTab.click();

    await expect(historyTab).toHaveAttribute('data-state', 'active', { timeout: 5000 });

    // History tab should show status filter or empty state
    const statusFilter = page.getByText(/filter by status/i);
    const emptyState = page.getByText(/no approval history/i);

    const hasFilter = await statusFilter.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await emptyState.first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasFilter || hasEmpty).toBeTruthy();
  });

  test('history tab has status filter dropdown', async ({ page }) => {
    await expect(page.getByText(/approval queue/i).first()).toBeVisible({ timeout: 10000 });

    const historyTab = page.getByRole('tab', { name: /history/i });
    await historyTab.click();
    await expect(historyTab).toHaveAttribute('data-state', 'active', { timeout: 5000 });

    const filterLabel = page.getByText(/filter by status/i);
    const hasFilter = await filterLabel.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasFilter) {
      // The select trigger should be visible
      const selectTrigger = page.locator('[role="combobox"], button').filter({ hasText: /all|approved|rejected/i });
      const hasTrigger = await selectTrigger.first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasTrigger).toBeTruthy();
    }
  });

  test('refresh button is clickable', async ({ page }) => {
    await expect(page.getByText(/approval queue/i).first()).toBeVisible({ timeout: 10000 });

    // Refresh icon button in header
    const refreshBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
    await expect(refreshBtn).toBeVisible({ timeout: 5000 });
    await refreshBtn.click();
    // Page still visible after refresh
    await expect(page.getByText(/approval queue/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/approvals');
    await page.waitForTimeout(3000);

    const critical = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toHaveLength(0);
  });
});
