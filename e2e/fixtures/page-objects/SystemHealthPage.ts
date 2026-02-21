import { type Page, type Locator } from '@playwright/test';

export class SystemHealthPage {
  readonly heading: Locator;
  readonly healthChecks: Locator;
  readonly overallStatus: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /health/i }).first();
    this.healthChecks = page.getByRole('table').first();
    this.overallStatus = page.locator('[data-testid="overall-status"]').or(
      page.getByText(/grade/i).first()
    );
  }

  async goto() { await this.page.goto('/system-health'); }
}
