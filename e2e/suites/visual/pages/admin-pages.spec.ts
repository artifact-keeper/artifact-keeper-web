import { test, expect } from '@playwright/test';

test.describe('Visual regression: admin pages', () => {
  const pages = [
    { name: 'users', route: '/users' },
    { name: 'groups', route: '/groups' },
    { name: 'settings', route: '/settings' },
    { name: 'security', route: '/security' },
    { name: 'analytics', route: '/analytics' },
    { name: 'monitoring', route: '/monitoring' },
    { name: 'permissions', route: '/permissions' },
    { name: 'quality-gates', route: '/quality-gates' },
    { name: 'backups', route: '/backups' },
    { name: 'lifecycle', route: '/lifecycle' },
    { name: 'telemetry', route: '/telemetry' },
    { name: 'system-health', route: '/system-health' },
  ];

  for (const { name, route } of pages) {
    test(`${name} - desktop`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });

      if (name === 'monitoring') {
        // The monitoring page's alert cards and health log are backed by a
        // backend health-check scheduler (scheduler_service.rs) that starts
        // writing real rows 15-44s after backend boot, then every 60s. The
        // committed baseline captures the page's EMPTY state (no checks run
        // yet) -- which renders TALLER than the populated table, because the
        // empty-state placeholders push fullPage height to 918px while the
        // populated table fits inside the 720px viewport. Depending on how
        // long the backend has been running when this test executes, the
        // real page flips between these two valid-but-different heights,
        // making the screenshot comparison racy. Stub both endpoints the
        // page queries to always return empty results, so the render is
        // deterministic and matches the committed empty-state baseline.
        await page.route('**/api/v1/admin/monitoring/alerts*', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '[]',
          });
        });
        await page.route('**/api/v1/admin/monitoring/health-log*', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '[]',
          });
        });
      }

      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      await expect(page).toHaveScreenshot(`${name}-desktop-admin.png`, {
        maxDiffPixelRatio: 0.01,
        fullPage: true,
        stylePath: './e2e/visual-mask.css',
      });
    });
  }
});
