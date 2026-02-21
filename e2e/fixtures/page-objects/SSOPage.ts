import { type Page, type Locator } from '@playwright/test';

export class SSOPage {
  readonly heading: Locator;
  readonly providerCards: Locator;
  readonly configureButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /sso/i }).first();
    this.providerCards = page.getByRole('table').or(
      page.locator('[data-testid="sso-providers"]')
    );
    this.configureButton = page.getByRole('button', { name: /add provider/i }).first();
  }

  async goto() { await this.page.goto('/settings/sso'); }
}
