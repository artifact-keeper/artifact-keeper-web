import { type Page, type Locator } from '@playwright/test';

export class PeersPage {
  readonly heading: Locator;
  readonly peersTable: Locator;
  readonly addPeerButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /peers/i }).first();
    this.peersTable = page.getByRole('table');
    this.addPeerButton = page.getByRole('button', { name: /register peer/i });
  }

  async goto() { await this.page.goto('/peers'); }
}
