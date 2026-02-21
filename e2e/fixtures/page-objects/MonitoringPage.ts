import { type Page, type Locator } from '@playwright/test';

export class MonitoringPage {
  readonly heading: Locator;
  readonly statusCards: Locator;
  readonly servicesTable: Locator;
  readonly refreshButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /monitoring/i }).first();
    this.statusCards = page.locator('[data-testid="status-card"]').or(
      page.locator('.grid > .border').first()
    );
    this.servicesTable = page.getByRole('table').first();
    this.refreshButton = page.getByRole('button', { name: /run health check/i });
  }

  async goto() { await this.page.goto('/monitoring'); }
}
