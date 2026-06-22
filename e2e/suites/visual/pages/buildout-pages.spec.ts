import { test, expect } from '@playwright/test';

// Visual regression + review screenshots for the 1.2.1 endpoint build-out pages.
test.describe('Visual regression: build-out admin pages', () => {
  const pages = [
    { name: 'signing', route: '/signing' },
    { name: 'curation', route: '/curation' },
    { name: 'sync-policies', route: '/sync-policies' },
    { name: 'promotion-rules', route: '/promotion-rules' },
    { name: 'format-handlers', route: '/format-handlers' },
    { name: 'quality-checks', route: '/quality-checks' },
  ];

  for (const { name, route } of pages) {
    test(`${name} - desktop`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
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
