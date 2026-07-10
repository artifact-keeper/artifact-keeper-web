import { type Page, type Locator } from '@playwright/test';

/**
 * Page object for the generic-artifact version-history surfaces (#571):
 *   - the per-repo "Enable versioning" toggle on the Settings tab, and
 *   - the "Versions" tab in the artifact detail dialog with its per-revision
 *     download rows.
 *
 * The version-history UI only appears for Generic/Mlmodel repositories that
 * have `versioning_enabled` set, so callers seed that state via the API before
 * driving the UI.
 */
export class ArtifactVersionsPage {
  readonly settingsTab: Locator;
  readonly versioningHeading: Locator;
  readonly versioningToggle: Locator;
  readonly saveButton: Locator;
  readonly artifactsTable: Locator;
  readonly versionsTab: Locator;
  readonly versionsSection: Locator;
  readonly versionRows: Locator;

  constructor(private page: Page) {
    this.settingsTab = page.getByRole('tab', { name: /settings/i });
    this.versioningHeading = page.getByRole('heading', {
      name: /artifact versioning/i,
    });
    this.versioningToggle = page.getByLabel('Enable versioning');
    this.saveButton = page.getByRole('button', { name: /save changes/i });
    this.artifactsTable = page.getByRole('table').first();
    this.versionsTab = page.getByRole('tab', { name: /versions/i });
    this.versionsSection = page.getByTestId('artifact-versions-section');
    this.versionRows = page.getByTestId('artifact-version-row');
  }

  async goto(key: string) {
    await this.page.goto(`/repositories/${key}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Open the artifact detail dialog by clicking the row for `name`. */
  async openArtifactDetail(name: string) {
    const row = this.artifactsTable.getByRole('row').filter({ hasText: name });
    await row.first().click();
  }

  /** Per-revision download button by revision number. */
  downloadRevisionButton(revision: number): Locator {
    return this.page.getByRole('button', {
      name: new RegExp(`download revision ${revision}`, 'i'),
    });
  }
}
