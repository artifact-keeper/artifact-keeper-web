import { type Page, type Locator } from '@playwright/test';

export class AccessTokensPage {
  readonly heading: Locator;
  readonly tokensTable: Locator;
  readonly createButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /access token/i }).first();
    this.tokensTable = page.getByRole('table');
    this.createButton = page.getByRole('button', { name: /create/i }).first();
  }

  async goto() { await this.page.goto('/access-tokens'); }
}
