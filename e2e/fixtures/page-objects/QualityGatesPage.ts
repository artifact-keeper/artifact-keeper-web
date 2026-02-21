import { type Page, type Locator } from '@playwright/test';

export class QualityGatesPage {
  readonly heading: Locator;
  readonly gatesTable: Locator;
  readonly createGateButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /quality gate/i }).first();
    this.gatesTable = page.getByRole('table').first();
    this.createGateButton = page.getByRole('button', { name: /new gate/i });
  }

  async goto() { await this.page.goto('/quality-gates'); }
}
