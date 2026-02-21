import { type Page, type Locator } from '@playwright/test';

export class StagingPage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly stagingTable: Locator;
  readonly createButton: Locator;
  readonly statusFilter: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /staging/i }).first();
    this.searchInput = page.getByPlaceholder(/search/i);
    this.stagingTable = page.locator('[data-testid="staging-list"]').or(
      page.getByRole('list').first()
    );
    this.createButton = page.getByRole('button', { name: /create/i });
    this.statusFilter = page.getByRole('combobox').first();
  }

  async goto() { await this.page.goto('/staging'); }

  async search(query: string) {
    await this.searchInput.fill(query);
  }
}
