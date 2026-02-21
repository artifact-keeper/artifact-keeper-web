import { type Page, type Locator } from '@playwright/test';

export class MigrationPage {
  readonly heading: Locator;
  readonly migrationForm: Locator;
  readonly sourceTypeSelect: Locator;
  readonly startButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /migration/i }).first();
    this.migrationForm = page.getByRole('table').or(
      page.locator('[data-testid="migration-form"]')
    );
    this.sourceTypeSelect = page.getByRole('combobox').first();
    this.startButton = page.getByRole('button', { name: /create migration|add connection/i }).first();
  }

  async goto() { await this.page.goto('/migration'); }
}
