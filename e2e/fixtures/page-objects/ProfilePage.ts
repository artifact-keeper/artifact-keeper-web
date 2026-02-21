import { type Page, type Locator } from '@playwright/test';

export class ProfilePage {
  readonly heading: Locator;
  readonly displayNameInput: Locator;
  readonly emailInput: Locator;
  readonly generalTab: Locator;
  readonly apiKeysTab: Locator;
  readonly accessTokensTab: Locator;
  readonly securityTab: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /profile/i }).first();
    this.displayNameInput = page.getByLabel(/display name/i);
    this.emailInput = page.getByLabel(/email/i);
    this.generalTab = page.getByRole('tab', { name: /general/i });
    this.apiKeysTab = page.getByRole('tab', { name: /api key/i });
    this.accessTokensTab = page.getByRole('tab', { name: /access token/i });
    this.securityTab = page.getByRole('tab', { name: /security/i });
  }

  async goto() { await this.page.goto('/profile'); }

  async switchToTab(tab: 'general' | 'api-keys' | 'access-tokens' | 'security') {
    switch (tab) {
      case 'general':
        await this.generalTab.click();
        break;
      case 'api-keys':
        await this.apiKeysTab.click();
        break;
      case 'access-tokens':
        await this.accessTokensTab.click();
        break;
      case 'security':
        await this.securityTab.click();
        break;
    }
  }
}
