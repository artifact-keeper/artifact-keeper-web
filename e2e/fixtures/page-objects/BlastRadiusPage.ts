import { type Page, type Locator } from '@playwright/test';

export class BlastRadiusPage {
  readonly heading: Locator;
  readonly cveTab: Locator;
  readonly artifactTab: Locator;
  readonly targetInput: Locator;
  readonly analyzeButton: Locator;
  readonly inputError: Locator;
  readonly anonymousBadge: Locator;
  readonly summaryTiles: Locator;
  readonly tables: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /blast radius/i }).first();
    this.cveTab = page.getByRole('tab', { name: /by cve/i });
    this.artifactTab = page.getByRole('tab', { name: /by artifact/i });
    this.targetInput = page.locator('#blast-radius-target');
    this.analyzeButton = page.getByRole('button', { name: /analyze/i });
    this.inputError = page.locator('#blast-radius-input-error');
    this.anonymousBadge = page.getByText(/anonymous downloads present/i);
    this.summaryTiles = page.getByText('Affected artifacts', { exact: true });
    this.tables = page.getByRole('table');
  }

  async goto(query = '') { await this.page.goto(`/security/blast-radius${query}`); }

  async analyze(target: string) {
    await this.targetInput.fill(target);
    await this.analyzeButton.click();
  }
}
