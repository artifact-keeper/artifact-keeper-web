import { test, expect, navigateTo, assertNoAppErrors } from '../../../fixtures/test-fixtures';

// Repository key/value Labels tab. Built in artifact-keeper-web#512.
const REPO_KEY = 'e2e-maven-local';

test.describe('Repository Labels tab', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, `/repositories/${REPO_KEY}`);
  });

  test('Labels tab is present for admins and opens the labels panel', async ({ page }) => {
    const labelsTab = page.getByRole('tab', { name: /^labels$/i }).first();
    await expect(labelsTab).toBeVisible({ timeout: 10000 });
    await labelsTab.click();

    // Add form (key + value inputs + Add button)
    await expect(page.getByLabel(/label key/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(/label value/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /^add$/i })).toBeVisible({ timeout: 5000 });
  });

  test('Add is disabled until a label key is entered', async ({ page }) => {
    await page.getByRole('tab', { name: /^labels$/i }).first().click();
    const add = page.getByRole('button', { name: /^add$/i });
    await expect(add).toBeDisabled();
    await page.getByLabel(/label key/i).fill('team');
    await expect(add).toBeEnabled();
  });

  test('labels panel shows a list or the empty state (never blank)', async ({ page }) => {
    await page.getByRole('tab', { name: /^labels$/i }).first().click();
    const settled = page
      .getByText(/no labels yet/i)
      .or(page.getByRole('button', { name: /remove label/i }).first());
    await expect(settled.first()).toBeVisible({ timeout: 10000 });
  });

  test.afterEach(async ({ page }) => {
    await assertNoAppErrors(page);
  });
});
