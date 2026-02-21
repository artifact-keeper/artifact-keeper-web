import { test, expect } from '@playwright/test';

test.describe('Error Pages', () => {
  test('403 forbidden page renders', async ({ page }) => {
    await page.goto('/error/403');
    await page.waitForLoadState('networkidle');
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/forbidden|403|access denied|not authorized/);
  });

  test('500 error page renders', async ({ page }) => {
    await page.goto('/error/500');
    await page.waitForLoadState('networkidle');
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/error|500|something went wrong|server error/);
  });
});
