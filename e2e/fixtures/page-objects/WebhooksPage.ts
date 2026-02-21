import { type Page, type Locator } from '@playwright/test';

export class WebhooksPage {
  readonly heading: Locator;
  readonly webhooksTable: Locator;
  readonly createButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /webhook/i }).first();
    this.webhooksTable = page.getByRole('table');
    this.createButton = page.getByRole('button', { name: /create webhook/i });
  }

  async goto() { await this.page.goto('/webhooks'); }
}
