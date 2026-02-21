import { type Page, type Locator } from '@playwright/test';

export class PackagesPage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly packageList: Locator;
  readonly gridViewButton: Locator;
  readonly listViewButton: Locator;
  readonly formatFilter: Locator;
  readonly repoFilter: Locator;
  readonly sortSelect: Locator;
  readonly pagination: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /package/i }).first();
    this.searchInput = page.getByPlaceholder(/search/i);
    this.packageList = page.locator('[data-testid="package-list"]').or(
      page.getByRole('list').first()
    );
    this.gridViewButton = page.getByRole('button', { name: /grid/i });
    this.listViewButton = page.getByRole('button', { name: /list/i });
    this.formatFilter = page.getByRole('combobox', { name: /format/i });
    this.repoFilter = page.getByRole('combobox', { name: /repository/i });
    this.sortSelect = page.getByRole('combobox', { name: /sort/i });
    this.pagination = page.locator('[data-testid="pagination"]').or(
      page.getByRole('navigation', { name: /pagination/i })
    );
  }

  async goto() { await this.page.goto('/packages'); }

  async search(query: string) {
    await this.searchInput.fill(query);
  }
}
