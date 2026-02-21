import { type Page, type Locator } from '@playwright/test';

export class BackupsPage {
  readonly heading: Locator;
  readonly backupsTable: Locator;
  readonly createBackupButton: Locator;
  readonly restoreButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /backup/i }).first();
    this.backupsTable = page.getByRole('table');
    this.createBackupButton = page.getByRole('button', { name: /create backup/i });
    this.restoreButton = page.getByRole('button', { name: /restore/i }).first();
  }

  async goto() { await this.page.goto('/backups'); }
}
