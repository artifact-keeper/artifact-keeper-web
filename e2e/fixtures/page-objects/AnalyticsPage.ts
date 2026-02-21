import { type Page, type Locator } from '@playwright/test';

export class AnalyticsPage {
  readonly heading: Locator;
  readonly dateRangeSelector: Locator;
  readonly charts: Locator;
  readonly downloadStatsTable: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /analytics/i }).first();
    this.dateRangeSelector = page.getByRole('tablist').first();
    this.charts = page.locator('[data-testid="analytics-chart"]').or(
      page.locator('.recharts-wrapper').or(page.getByRole('table'))
    );
    this.downloadStatsTable = page.getByRole('table').first();
  }

  async goto() { await this.page.goto('/analytics'); }
}
