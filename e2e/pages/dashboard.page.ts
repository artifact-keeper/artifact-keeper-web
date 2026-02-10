import { type Page, type Locator } from '@playwright/test';

export class DashboardPage {
  readonly healthCards: Locator;
  readonly statCards: Locator;
  readonly recentReposTable: Locator;

  constructor(private page: Page) {
    this.healthCards = page.locator('[data-testid="health-card"], .health-card, [class*="health"]').or(
      page.getByText(/healthy|unhealthy|degraded/i).first()
    );
    this.statCards = page.locator('[data-testid="stat-card"]').or(
      page.getByText(/repositories|artifacts|users|storage/i).first()
    );
    this.recentReposTable = page.getByRole('table').first();
  }

  async goto() {
    await this.page.goto('/');
  }
}
