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
    // Scoped to <main> (#1062): while a streamed Suspense boundary is being
    // revealed, React's server copy of the page can sit for a moment in a
    // hidden <div id="S:n"> under <body>, next to the client-rendered page,
    // so an unscoped locator briefly matches two inputs (strict mode).
    this.searchInput = page.getByRole('main').getByPlaceholder(/search/i);
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
