import { type Page, type Locator } from '@playwright/test';

export class RepositoriesPage {
  readonly searchInput: Locator;
  readonly createButton: Locator;
  readonly repoList: Locator;

  constructor(private page: Page) {
    this.searchInput = page.getByPlaceholder(/search/i);
    this.createButton = page.getByRole('button', { name: /create/i });
    this.repoList = page.locator('[data-testid="repo-list"]').or(
      page.getByRole('listbox').or(page.getByRole('list'))
    );
  }

  async goto() {
    await this.page.goto('/repositories');
  }
}
