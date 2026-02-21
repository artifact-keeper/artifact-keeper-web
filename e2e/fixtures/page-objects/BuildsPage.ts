import { type Page, type Locator } from '@playwright/test';

export class BuildsPage {
  readonly heading: Locator;
  readonly buildsTable: Locator;
  readonly statusFilter: Locator;
  readonly searchInput: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /builds/i }).first();
    this.buildsTable = page.getByRole('table');
    this.statusFilter = page.getByRole('combobox').first();
    this.searchInput = page.getByPlaceholder(/search/i);
  }

  async goto() { await this.page.goto('/builds'); }
}
