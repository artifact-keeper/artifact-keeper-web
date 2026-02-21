import { type Page, type Locator } from '@playwright/test';

export class SecurityPoliciesPage {
  readonly heading: Locator;
  readonly policiesTable: Locator;
  readonly createPolicyButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /security polic/i }).first();
    this.policiesTable = page.getByRole('table').first();
    this.createPolicyButton = page.getByRole('button', { name: /create policy/i });
  }

  async goto() { await this.page.goto('/security/policies'); }
}
