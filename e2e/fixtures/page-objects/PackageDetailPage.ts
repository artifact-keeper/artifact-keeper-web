import { type Page, type Locator } from '@playwright/test';

export class PackageDetailPage {
  readonly heading: Locator;
  readonly versionsList: Locator;
  readonly metadataPanel: Locator;
  readonly tabs: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { level: 1 });
    this.versionsList = page.getByRole('table').first();
    this.metadataPanel = page.locator('[data-testid="metadata-panel"]').or(
      page.getByText(/details/i).locator('..').locator('..')
    );
    this.tabs = page.getByRole('tablist').first();
  }

  async goto(id: string) { await this.page.goto(`/packages/${id}`); }
}
