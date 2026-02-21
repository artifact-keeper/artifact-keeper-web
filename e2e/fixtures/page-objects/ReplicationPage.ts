import { type Page, type Locator } from '@playwright/test';

export class ReplicationPage {
  readonly heading: Locator;
  readonly replicationTable: Locator;
  readonly createButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /replication/i }).first();
    this.replicationTable = page.getByRole('table');
    this.createButton = page.getByRole('button', { name: /create/i });
  }

  async goto() { await this.page.goto('/replication'); }
}
