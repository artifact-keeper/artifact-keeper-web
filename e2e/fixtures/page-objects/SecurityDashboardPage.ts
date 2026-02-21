import { type Page, type Locator } from '@playwright/test';

export class SecurityDashboardPage {
  readonly heading: Locator;
  readonly vulnerabilityChart: Locator;
  readonly scanResultsTable: Locator;
  readonly severityCards: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /security/i }).first();
    this.vulnerabilityChart = page.locator('[data-testid="vulnerability-chart"]').or(
      page.locator('.recharts-wrapper').first()
    );
    this.scanResultsTable = page.getByRole('table').first();
    this.severityCards = page.locator('[data-testid="severity-card"]').or(
      page.locator('[data-testid="stat-card"]').or(
        page.getByText(/critical|high|medium|low/i).first()
      )
    );
  }

  async goto() { await this.page.goto('/security'); }
}
