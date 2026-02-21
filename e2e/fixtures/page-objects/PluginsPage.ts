import { type Page, type Locator } from '@playwright/test';

export class PluginsPage {
  readonly heading: Locator;
  readonly pluginsList: Locator;
  readonly installButton: Locator;
  readonly searchInput: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /plugin/i }).first();
    this.pluginsList = page.getByRole('table').or(
      page.locator('[data-testid="plugins-list"]')
    );
    this.installButton = page.getByRole('button', { name: /install/i });
    this.searchInput = page.getByPlaceholder(/search/i);
  }

  async goto() { await this.page.goto('/plugins'); }
}
