import { test, expect, navigateTo, assertNoAppErrors } from '../../../fixtures/test-fixtures';

// Package Curation review queue (/curation). Built in artifact-keeper-web#507.
test.describe('Package Curation Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/curation');
  });

  test('page loads with Package Curation heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /package curation/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/approve or block packages/i)).toBeVisible({ timeout: 10000 });
  });

  test('exposes the staging-repo selector, status filter, and re-evaluate', async ({ page }) => {
    await expect(page.getByLabel(/staging repository/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/status filter/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /re-evaluate/i })).toBeVisible({ timeout: 10000 });
  });

  test('prompts to select a staging repository before a queue is shown', async ({ page }) => {
    await expect(page.getByText(/select a staging repository/i)).toBeVisible({ timeout: 10000 });
  });

  test.afterEach(async ({ page }) => {
    await assertNoAppErrors(page);
  });
});
