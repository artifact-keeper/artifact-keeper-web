import { type Page, type Locator } from '@playwright/test';

export class DependencyTrackPage {
  readonly heading: Locator;
  readonly projectsTable: Locator;
  readonly searchInput: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /dt projects/i }).first();
    this.projectsTable = page.getByRole('table').first();
    this.searchInput = page.getByPlaceholder(/search project/i);
  }

  async goto() { await this.page.goto('/security/dt-projects'); }
}
