import { type Page, type Locator } from '@playwright/test';

export class ServiceAccountsPage {
  readonly heading: Locator;
  readonly accountsTable: Locator;
  readonly createButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /service account/i }).first();
    this.accountsTable = page.getByRole('table');
    this.createButton = page.getByRole('button', { name: /create service account/i });
  }

  async goto() { await this.page.goto('/service-accounts'); }
}
