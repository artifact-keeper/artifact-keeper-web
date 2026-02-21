import { type Page, type Locator } from '@playwright/test';

export class DashboardPage {
  readonly healthCards: Locator;
  readonly statCards: Locator;
  readonly recentReposTable: Locator;
  readonly cveChart: Locator;
  readonly heading: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { level: 1 });
    this.healthCards = page.locator('[data-testid="health-card"]').or(
      page.getByText(/healthy|unhealthy|degraded/i).first()
    );
    this.statCards = page.locator('[data-testid="stat-card"]').or(
      page.getByText(/repositories|artifacts|users|storage/i).first()
    );
    this.recentReposTable = page.getByRole('table').first();
    this.cveChart = page.locator('[data-testid="cve-chart"]').or(
      page.getByText(/vulnerabilit|cve/i).first()
    );
  }

  async goto() { await this.page.goto('/'); }
}
