import { type Page, type Locator } from '@playwright/test';

export class UsersPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly usersTable: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /user/i }).first();
    this.createButton = page.getByRole('button', { name: /create user/i });
    this.usersTable = page.getByRole('table');
  }

  async goto() { await this.page.goto('/users'); }

  async openCreateDialog() {
    await this.createButton.click();
    return this.page.getByRole('dialog');
  }
}
