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
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await expect(page).toHaveScreenshot(`${name}-desktop-admin.png`, {
        maxDiffPixelRatio: 0.01,
        fullPage: true,
        stylePath: '../../../visual-mask.css',
      });
    });
  }
});
