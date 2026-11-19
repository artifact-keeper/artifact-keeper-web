import { type Page, type Locator } from '@playwright/test';

export class RepositoriesPage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly createButton: Locator;
  readonly repoList: Locator;
  readonly detailPanel: Locator;
  readonly formatFilter: Locator;
  readonly typeFilter: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /repositor/i }).first();
    // Scoped to <main> (#1062): while a streamed Suspense boundary is being
    // revealed, React's server copy of the page can sit for a moment in a
    // hidden <div id="S:n"> under <body>, next to the client-rendered page,
    // so an unscoped locator briefly matches two inputs (strict mode).
    this.searchInput = page.getByRole('main').getByPlaceholder(/search/i);
    this.createButton = page.getByRole('button', { name: /create/i });
    this.repoList = page.locator('[data-testid="repo-list"]').or(
      page.getByRole('listbox').or(page.getByRole('list'))
    );
    this.detailPanel = page.locator('[data-testid="repo-detail-panel"]');
    this.formatFilter = page.getByRole('combobox', { name: /format/i });
    this.typeFilter = page.getByRole('combobox', { name: /type/i });
  }

  async goto() { await this.page.goto('/repositories'); }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async selectRepo(name: string) {
    await this.repoList.getByText(name).click();
  }
}
