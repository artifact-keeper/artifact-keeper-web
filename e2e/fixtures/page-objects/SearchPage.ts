import { type Page, type Locator } from '@playwright/test';

export class SearchPage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly resultsList: Locator;
  readonly formatFilter: Locator;
  readonly repoFilter: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /search/i }).first();
    this.searchInput = page.getByPlaceholder(/e\.g\.,/i).first();
    this.resultsList = page.getByRole('table').or(
      page.locator('[role="button"]').first()
    );
    this.formatFilter = page.getByRole('combobox', { name: /format/i }).or(
      page.locator('select').filter({ hasText: /format/i })
    );
    this.repoFilter = page.getByRole('combobox', { name: /repositor/i }).or(
      page.locator('select').filter({ hasText: /repositor/i })
    );
  }

  async goto() { await this.page.goto('/search'); }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.getByRole('button', { name: /search/i }).click();
  }
}
