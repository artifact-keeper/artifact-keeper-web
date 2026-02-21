import { type Page, type Locator } from '@playwright/test';

export class TelemetryPage {
  readonly heading: Locator;
  readonly optInToggle: Locator;
  readonly telemetryData: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /telemetry/i }).first();
    this.optInToggle = page.getByRole('switch', { name: /enable telemetry/i }).or(
      page.getByRole('switch').first()
    );
    this.telemetryData = page.getByRole('table').first();
  }

  async goto() { await this.page.goto('/telemetry'); }
}
