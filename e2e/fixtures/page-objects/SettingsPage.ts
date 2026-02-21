import { type Page, type Locator } from '@playwright/test';

export class SettingsPage {
  readonly heading: Locator;
  readonly generalTab: Locator;
  readonly storageTab: Locator;
  readonly authTab: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /settings/i }).first();
    this.generalTab = page.getByRole('tab', { name: /general/i });
    this.storageTab = page.getByRole('tab', { name: /storage/i });
    this.authTab = page.getByRole('tab', { name: /authentication/i });
  }

  async goto() { await this.page.goto('/settings'); }
}
