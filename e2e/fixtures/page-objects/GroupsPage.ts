import { type Page, type Locator } from '@playwright/test';

export class GroupsPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly groupsTable: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /group/i }).first();
    this.createButton = page.getByRole('button', { name: /create group/i });
    this.groupsTable = page.getByRole('table');
  }

  async goto() { await this.page.goto('/groups'); }
}
