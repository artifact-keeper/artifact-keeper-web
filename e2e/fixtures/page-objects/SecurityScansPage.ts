import { type Page, type Locator } from '@playwright/test';

export class SecurityScansPage {
  readonly heading: Locator;
  readonly scansTable: Locator;
  readonly triggerScanButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /scan result/i }).first();
    this.scansTable = page.getByRole('table').first();
    this.triggerScanButton = page.getByRole('button', { name: /trigger scan/i });
  }

  async goto() { await this.page.goto('/security/scans'); }
}
