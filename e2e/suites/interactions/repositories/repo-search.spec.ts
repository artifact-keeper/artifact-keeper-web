import {
  test,
  expect,
  filterCriticalErrors,
  navigateTo,
} from '../../../fixtures/test-fixtures';
import type { Page, Locator } from '@playwright/test';

/**
 * Cross-page repository search (PR #740): the repositories list search is
 * server-side (the list query sends a `q` param and resets to page 1), so a
 * match on any page appears — not just repos loaded on the current page.
 * Uses seeded repos `e2e-docker-virtual` / `e2e-maven-local`.
 */

/** A repository row in the master list (button named "<key> <name> …"). */
function repoListItem(page: Page, key: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^${key} `) });
}

test.describe('Repositories search (#740)', () => {
  test('full-name search queries the server and filters the list', async ({
    page,
  }) => {
    await navigateTo(page, '/repositories');

    const searchInput = page.getByPlaceholder('Search...');
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // The unfiltered list shows the seeded repos.
    await expect(repoListItem(page, 'e2e-maven-local')).toBeVisible({
      timeout: 10000,
    });
    await expect(repoListItem(page, 'e2e-docker-virtual')).toBeVisible();

    // Typing a full repo name issues a server-side search (?q=...).
    const searchRequest = page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/repositories') &&
        req.url().includes('q=e2e-docker-virtual'),
      { timeout: 10000 }
    );
    await searchInput.fill('e2e-docker-virtual');
    await searchRequest;

    // The match is shown; unrelated repos are filtered out.
    await expect(repoListItem(page, 'e2e-docker-virtual')).toBeVisible({
      timeout: 10000,
    });
    await expect(repoListItem(page, 'e2e-maven-local')).toBeHidden({
      timeout: 10000,
    });
  });

  test('clearing the search restores the full list', async ({ page }) => {
    await navigateTo(page, '/repositories');

    const searchInput = page.getByPlaceholder('Search...');
    await expect(repoListItem(page, 'e2e-maven-local')).toBeVisible({
      timeout: 10000,
    });

    await searchInput.fill('e2e-docker-virtual');
    await expect(repoListItem(page, 'e2e-maven-local')).toBeHidden({
      timeout: 10000,
    });

    await searchInput.fill('');
    await expect(repoListItem(page, 'e2e-maven-local')).toBeVisible({
      timeout: 10000,
    });
    await expect(repoListItem(page, 'e2e-docker-virtual')).toBeVisible();
  });

  test('searching repositories loads without console errors', async ({
    page,
    consoleErrors,
  }) => {
    await navigateTo(page, '/repositories');
    const searchInput = page.getByPlaceholder('Search...');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('e2e');
    await expect(repoListItem(page, 'e2e-maven-local')).toBeVisible({
      timeout: 10000,
    });
    await page.waitForTimeout(1000);

    expect(filterCriticalErrors(consoleErrors)).toEqual([]);
  });
});
