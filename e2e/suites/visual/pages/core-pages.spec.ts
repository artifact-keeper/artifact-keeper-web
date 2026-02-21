import { test, expect } from '@playwright/test';

test.describe('Visual regression: core pages', () => {
  const pages = [
    { name: 'dashboard', route: '/' },
    { name: 'repositories', route: '/repositories' },
    { name: 'packages', route: '/packages' },
    { name: 'search', route: '/search' },
    { name: 'login', route: '/login' },
  ];

  for (const { name, route } of pages) {
    test(`${name} - desktop`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000); // let animations settle
      await expect(page).toHaveScreenshot(`${name}-desktop-admin.png`, {
        maxDiffPixelRatio: 0.01,
        fullPage: true,
        stylePath: './e2e/visual-mask.css',
      });
    });

    test(`${name} - mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await expect(page).toHaveScreenshot(`${name}-mobile-admin.png`, {
        maxDiffPixelRatio: 0.01,
        fullPage: true,
        stylePath: './e2e/visual-mask.css',
      });
    });
  }
});
