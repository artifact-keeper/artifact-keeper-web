import { type Page, type Locator } from '@playwright/test';

export class PermissionsPage {
  readonly heading: Locator;
  readonly permissionsTable: Locator;
  readonly createRuleButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /permission/i }).first();
    this.permissionsTable = page.getByRole('table');
    this.createRuleButton = page.getByRole('button', { name: /create permission/i });
  }

  async goto() { await this.page.goto('/permissions'); }
}
