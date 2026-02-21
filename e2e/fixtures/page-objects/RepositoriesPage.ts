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
    this.searchInput = page.getByPlaceholder(/search/i);
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
