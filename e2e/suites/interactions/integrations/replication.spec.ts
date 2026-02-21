import { test, expect } from '@playwright/test';

test.describe('Replication Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/replication');
  });

  test('page loads with Replication heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Replication' })).toBeVisible({ timeout: 10000 });
  });

  test('stats cards are visible', async ({ page }) => {
    const totalPeers = page.getByText(/total peers/i);
    const online = page.getByText(/online/i);
    const syncing = page.getByText(/syncing/i);
    const cacheUsage = page.getByText(/cache usage/i);

    await expect(totalPeers.first()).toBeVisible({ timeout: 10000 });
    await expect(online.first()).toBeVisible({ timeout: 10000 });
    await expect(syncing.first()).toBeVisible({ timeout: 10000 });
    await expect(cacheUsage.first()).toBeVisible({ timeout: 10000 });
  });

  test('page content shows peer info or empty state', async ({ page }) => {
    // Wait for page to fully load (auth may take a moment)
    await expect(page.getByRole('heading', { name: 'Replication' })).toBeVisible({ timeout: 15000 });

    // The page should show peer data, tabs, or an empty state
    const peerCards = page.locator('[data-slot="card"]').filter({ hasText: /.+/ });
    const emptyState = page.getByText(/no peers/i).or(page.getByText(/no replication/i)).or(page.getByText(/empty/i));
    const tabs = page.locator('[role="tablist"]');

    const hasPeers = await peerCards.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasTabs = await tabs.first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasPeers || hasEmpty || hasTabs).toBeTruthy();
  });

  test('Subscriptions tab loads and shows peer selector', async ({ page }) => {
    const subscriptionsTab = page.locator('[role="tablist"]').getByRole('tab', { name: /subscriptions/i });
    await expect(subscriptionsTab).toBeVisible({ timeout: 10000 });
    await subscriptionsTab.click();
    await page.waitForTimeout(1000);

    // Look for peer selector (combobox, select, or button acting as selector)
    const peerSelector = page.getByRole('combobox').or(
      page.locator('select, button').filter({ hasText: /peer|select peer|node/i })
    );
    const emptyState = page.getByText(/no peers/i).or(page.getByText(/no subscriptions/i)).or(page.getByText(/select a peer/i));

    const hasSelector = await peerSelector.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasSelector || hasEmpty).toBeTruthy();

    // If peer selector exists, check for repository table or save button
    if (hasSelector) {
      const repoTable = page.locator('table').or(page.getByText(/repository/i));
      const saveButton = page.getByRole('button', { name: /save/i });

      const hasTable = await repoTable.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasSave = await saveButton.isVisible({ timeout: 3000 }).catch(() => false);

      // At least the structure should be present
      expect(hasTable || hasSave).toBeTruthy();
    }
  });

  test('Topology tab loads and shows connections', async ({ page }) => {
    const topologyTab = page.locator('[role="tablist"]').getByRole('tab', { name: /topology/i });
    await expect(topologyTab).toBeVisible({ timeout: 10000 });
    await topologyTab.click();
    await page.waitForTimeout(1000);

    // Look for peer selector or connections table
    const peerSelector = page.getByRole('combobox').or(
      page.locator('select, button').filter({ hasText: /peer|select peer|node/i })
    );
    const connectionsTable = page.locator('table');
    const emptyState = page.getByText(/no peers/i).or(page.getByText(/no connections/i)).or(page.getByText(/no topology/i));

    const hasSelector = await peerSelector.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTable = await connectionsTable.first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmpty = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasSelector || hasTable || hasEmpty).toBeTruthy();

    // If table exists, check for expected columns
    if (hasTable) {
      const targetPeer = page.getByText(/target peer/i);
      const status = page.getByText(/status/i);
      const latency = page.getByText(/latency/i);
      const bandwidth = page.getByText(/bandwidth/i);

      const hasTargetPeer = await targetPeer.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasStatus = await status.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasLatency = await latency.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasBandwidth = await bandwidth.first().isVisible({ timeout: 3000 }).catch(() => false);

      // At least some columns should be present
      expect(hasTargetPeer || hasStatus || hasLatency || hasBandwidth).toBeTruthy();
    }
  });

  test('page remains stable after interaction', async ({ page }) => {
    // Verify the page is interactive - click on a tab and verify heading persists
    const tabList = page.locator('[role="tablist"]');
    const tabs = tabList.getByRole('tab');
    const tabCount = await tabs.count();
    if (tabCount > 1) {
      await tabs.nth(1).click();
      await page.waitForTimeout(500);
      await tabs.nth(0).click();
    }
    await expect(page.getByRole('heading', { name: 'Replication' })).toBeVisible({ timeout: 10000 });
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/replication');
    await page.waitForTimeout(3000);

    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('hydration') && !e.includes('Warning:')
    );
    expect(criticalErrors).toEqual([]);
  });
});
