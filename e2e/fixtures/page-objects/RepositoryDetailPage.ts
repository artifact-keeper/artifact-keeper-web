import { type Page, type Locator } from '@playwright/test';

export class RepositoryDetailPage {
  readonly heading: Locator;
  readonly packagesList: Locator;
  readonly settingsTab: Locator;
  readonly securityTab: Locator;
  readonly tabs: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { level: 1 });
    this.packagesList = page.getByRole('table').first();
    this.settingsTab = page.getByRole('tab', { name: /upload|members/i }).first();
    this.securityTab = page.getByRole('tab', { name: /security/i });
    this.tabs = page.getByRole('tablist').first();
  }

  async goto(key: string) { await this.page.goto(`/repositories/${key}`); }
}
