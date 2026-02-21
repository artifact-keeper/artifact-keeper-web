import { type Page, type Locator } from '@playwright/test';

export class LifecyclePage {
  readonly heading: Locator;
  readonly policiesTable: Locator;
  readonly createPolicyButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /lifecycle/i }).first();
    this.policiesTable = page.getByRole('table').first();
    this.createPolicyButton = page.getByRole('button', { name: /new policy/i });
  }

  async goto() { await this.page.goto('/lifecycle'); }
}
