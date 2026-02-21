import { type Page, type Locator } from '@playwright/test';

export class ApprovalsPage {
  readonly heading: Locator;
  readonly pendingTable: Locator;
  readonly approvedTable: Locator;
  readonly tabs: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /approval/i }).first();
    this.pendingTable = page.getByRole('table').first();
    this.approvedTable = page.getByRole('table').nth(1);
    this.tabs = page.getByRole('tablist').first();
  }

  async goto() { await this.page.goto('/approvals'); }
}
