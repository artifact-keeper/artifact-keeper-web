import { type Page, type Locator } from '@playwright/test';

export class StagingPage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly stagingTable: Locator;
  readonly createButton: Locator;
  readonly statusFilter: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /staging/i }).first();
    // Scoped to <main> (#1062): while a streamed Suspense boundary is being
    // revealed, React's server copy of the page can sit for a moment in a
    // hidden <div id="S:n"> under <body>, next to the client-rendered page,
    // so an unscoped locator briefly matches two inputs (strict mode).
    this.searchInput = page.getByRole('main').getByPlaceholder(/search/i);
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
